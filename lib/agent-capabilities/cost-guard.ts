import prisma from '@/lib/prisma';
import type { AgentCapabilityDefinition, AgentCapabilityCostLevel } from '@/lib/agent-capabilities/types';

export class AgentCostGuardError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 429, details?: unknown) {
    super(message);
    this.name = 'AgentCostGuardError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const HOURLY_LIMIT_BY_COST: Record<AgentCapabilityCostLevel, number | null> = {
  free: null,
  low: null,
  medium: 60,
  high: 20,
  variable: 20,
};

const MINUTE_LIMIT_BY_COST: Record<AgentCapabilityCostLevel, number | null> = {
  free: null,
  low: null,
  medium: 10,
  high: 5,
  variable: 5,
};

const HIGH_COST_ALLOWED_PLANS = new Set(['pro', 'plus', 'premium', 'team', 'enterprise']);

export async function assertAgentCapabilityCostAllowed(input: {
  userId: string;
  capability: AgentCapabilityDefinition;
  profile: { plan?: string | null; role?: string | null; is_admin?: boolean | null };
}) {
  if (input.profile.is_admin) return;

  const costLevel = input.capability.costLevel || 'low';
  if (costLevel === 'high' || costLevel === 'variable') {
    const plan = String(input.profile.plan || input.profile.role || 'free').toLowerCase();
    if (!HIGH_COST_ALLOWED_PLANS.has(plan)) {
      throw new AgentCostGuardError(
        'plan_required',
        `Capability ${input.capability.id} requires a paid NexTide plan. Current plan: ${plan}.`,
        403,
        { capabilityId: input.capability.id, costLevel, plan },
      );
    }
  }

  await assertWindowLimit({
    userId: input.userId,
    capability: input.capability,
    costLevel,
    windowMs: 60 * 1000,
    limit: MINUTE_LIMIT_BY_COST[costLevel],
    windowName: 'minute',
  });

  await assertWindowLimit({
    userId: input.userId,
    capability: input.capability,
    costLevel,
    windowMs: 60 * 60 * 1000,
    limit: HOURLY_LIMIT_BY_COST[costLevel],
    windowName: 'hour',
  });
}

async function assertWindowLimit(input: {
  userId: string;
  capability: AgentCapabilityDefinition;
  costLevel: AgentCapabilityCostLevel;
  windowMs: number;
  limit: number | null;
  windowName: string;
}) {
  if (!input.limit) return;
  const since = new Date(Date.now() - input.windowMs);
  const count = await prisma.agentCapabilityRun.count({
    where: {
      userId: input.userId,
      capabilityId: input.capability.id,
      createdAt: { gte: since },
    },
  });

  if (count >= input.limit) {
    throw new AgentCostGuardError(
      'rate_limited',
      `Capability ${input.capability.id} is rate limited for this ${input.windowName}.`,
      429,
      {
        capabilityId: input.capability.id,
        costLevel: input.costLevel,
        window: input.windowName,
        limit: input.limit,
        used: count,
      },
    );
  }
}

export function agentCostGuardErrorResponse(error: unknown) {
  if (error instanceof AgentCostGuardError) {
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
