import { getCreditCostForModel } from '@/lib/creditCosts';
import prisma from '@/lib/prisma';
import type { AgentCapabilityDefinition, AgentCapabilityCostLevel, AgentCapabilityRunStatus } from '@/lib/agent-capabilities/types';

export class AgentQuotaPreflightError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 402, details?: unknown) {
    super(message);
    this.name = 'AgentQuotaPreflightError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const ESTIMATED_CREDITS_BY_COST: Record<AgentCapabilityCostLevel, number> = {
  free: 0,
  low: 1,
  medium: 5,
  high: 20,
  variable: 20,
};

const FALLBACK_ESTIMATED_CREDITS_BY_ID: Record<string, number> = {
  'xhs.card.layout': 1,
  'xhs.note.collect': 5,
  'xhs.infographic.style.extract': 8,
  'xhs.infographic.generate': 10,
  'product.selling_point.analysis': 2,
  'viral.breakdown.video_prompts': 8,
  'social.tiktok.collect': 5,
  'social.instagram.collect': 5,
  'social.facebook.collect': 5,
  'social.comments.collect': 5,
  'digital-human.video.generate': 30,
  'motion.replication.image_to_video': 30,
  'viral.midform.video.generate': 25,
};

export function featureKeyForCapability(capability: AgentCapabilityDefinition): string {
  return capability.featureKey || `agent.${capability.id}`;
}

export function fallbackEstimateAgentCapabilityCredits(capability: AgentCapabilityDefinition): number {
  return FALLBACK_ESTIMATED_CREDITS_BY_ID[capability.id]
    ?? ESTIMATED_CREDITS_BY_COST[capability.costLevel || 'low']
    ?? 1;
}

export async function resolveAgentCapabilityCreditConfig(capability: AgentCapabilityDefinition, modelKey?: string | null) {
  const featureKey = featureKeyForCapability(capability);
  const fallback = fallbackEstimateAgentCapabilityCredits(capability);
  const estimatedCredits = await getCreditCostForModel(
    featureKey,
    modelKey || capability.creditModelKey || capability.workflowId || capability.workflowName || null,
    fallback,
  );
  return {
    featureKey,
    estimatedCredits,
    source: 'credit_configs' as const,
    config: null,
  };
}

export function estimateAgentCapabilityCredits(capability: AgentCapabilityDefinition): number {
  return fallbackEstimateAgentCapabilityCredits(capability);
}

export async function assertAgentCapabilityQuotaAvailable(input: {
  userId: string;
  capability: AgentCapabilityDefinition;
  profile: { is_admin?: boolean | null };
}) {
  if (input.profile.is_admin) return { estimatedCredits: 0, balanceCredits: null, skipped: 'admin' as const };

  const creditConfig = await resolveAgentCapabilityCreditConfig(input.capability);
  const estimatedCredits = creditConfig.estimatedCredits;
  if (estimatedCredits <= 0) return { estimatedCredits, balanceCredits: null };

  const wallet = await prisma.wallet.findUnique({ where: { userId: input.userId } });
  const balanceCredits = wallet ? Number(wallet.balanceCredits) : 0;

  if (balanceCredits < estimatedCredits) {
    throw new AgentQuotaPreflightError(
      'insufficient_credits',
      `Insufficient NexTide credits for ${input.capability.id}. Required: ${estimatedCredits}, balance: ${balanceCredits}.`,
      402,
      {
        capabilityId: input.capability.id,
        estimatedCredits,
        balanceCredits,
        featureKey: creditConfig.featureKey,
        creditConfigSource: creditConfig.source,
      },
    );
  }

  return { estimatedCredits, balanceCredits, featureKey: creditConfig.featureKey, creditConfigSource: creditConfig.source };
}

export async function createAgentCapabilityCreditHold(input: {
  runId: string;
  userId: string;
  capability: AgentCapabilityDefinition;
  estimatedCredits: number;
  featureKey: string;
  metadata?: unknown;
}) {
  return prisma.agentCapabilityCreditHold.upsert({
    where: { runId: input.runId },
    create: {
      id: `hold_${input.runId.replace(/^run_/, '')}`,
      runId: input.runId,
      userId: input.userId,
      capabilityId: input.capability.id,
      featureKey: input.featureKey,
      estimatedCredits: input.estimatedCredits,
      status: 'held',
      metadataJson: input.metadata === undefined ? undefined : JSON.parse(JSON.stringify(input.metadata)),
    },
    update: {
      estimatedCredits: input.estimatedCredits,
      featureKey: input.featureKey,
      status: 'held',
      metadataJson: input.metadata === undefined ? undefined : JSON.parse(JSON.stringify(input.metadata)),
      finishedAt: null,
    },
  });
}

export async function settleAgentCapabilityCreditHoldForRun(input: {
  runId: string;
  status: AgentCapabilityRunStatus;
  errorMessage?: string | null;
}) {
  if (!['succeeded', 'failed', 'cancelled', 'timeout'].includes(input.status)) return null;

  const hold = await prisma.agentCapabilityCreditHold.findUnique({ where: { runId: input.runId } });
  if (!hold || hold.status !== 'held') return hold;

  if (input.status === 'succeeded') {
    return captureAgentCapabilityCreditHold(hold.runId);
  }

  return releaseAgentCapabilityCreditHold({
    runId: hold.runId,
    reason: input.errorMessage || `run_${input.status}`,
  });
}

async function captureAgentCapabilityCreditHold(runId: string) {
  return prisma.$transaction(async (tx) => {
    const hold = await tx.agentCapabilityCreditHold.findUnique({ where: { runId } });
    if (!hold || hold.status !== 'held') return hold;

    const amount = BigInt(hold.estimatedCredits);
    const walletUpdate = await tx.wallet.updateMany({
      where: {
        userId: hold.userId,
        balanceCredits: { gte: amount },
      },
      data: {
        balanceCredits: { decrement: amount },
      },
    });

    if (walletUpdate.count === 0) {
      return tx.agentCapabilityCreditHold.update({
        where: { runId },
        data: {
          status: 'capture_failed',
          reason: 'insufficient_credits_at_capture',
          finishedAt: new Date(),
        },
      });
    }

    await tx.transaction.create({
      data: {
        userId: hold.userId,
        type: 'agent_capability_capture',
        amountCredits: -amount,
        refId: hold.runId,
        channel: 'agent',
        meta: {
          port: 'agent',
          source: 'Agent',
          capabilityId: hold.capabilityId,
          featureKey: hold.featureKey,
          holdId: hold.id,
        },
      },
    });

    await tx.creditUsageLog.create({
      data: {
        featureKey: hold.featureKey,
        userId: hold.userId,
        amount: hold.estimatedCredits,
        success: true,
      },
    });

    return tx.agentCapabilityCreditHold.update({
      where: { runId },
      data: {
        status: 'captured',
        reason: 'run_succeeded',
        finishedAt: new Date(),
      },
    });
  });
}

async function releaseAgentCapabilityCreditHold(input: { runId: string; reason: string }) {
  return prisma.agentCapabilityCreditHold.update({
    where: { runId: input.runId },
    data: {
      status: 'released',
      reason: input.reason,
      finishedAt: new Date(),
    },
  });
}

export function agentQuotaPreflightErrorResponse(error: unknown) {
  if (error instanceof AgentQuotaPreflightError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }
  throw error;
}
