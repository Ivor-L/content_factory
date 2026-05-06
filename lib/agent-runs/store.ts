import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import type {
  AgentCapabilityRunInput,
  AgentCapabilityRunMode,
  AgentCapabilityRunResult,
  AgentCapabilityRunStatus,
} from '@/lib/agent-capabilities/types';

export interface AgentRunBusinessLink {
  businessType?: string;
  businessId?: string;
  businessTaskId?: string;
  businessStatus?: string;
}

export interface CreateAgentRunInput {
  runId: string;
  capabilityId: string;
  mode: AgentCapabilityRunMode;
  request: AgentCapabilityRunInput;
  userId?: string | null;
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function fromJson<T = unknown>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  return value as T;
}

function finishedAtForStatus(status: AgentCapabilityRunStatus): Date | null {
  if (status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'timeout') {
    return new Date();
  }
  return null;
}

export async function createAgentCapabilityRunRecord(input: CreateAgentRunInput) {
  if (input.request.idempotencyKey) {
    const existing = await prisma.agentCapabilityRun.findUnique({
      where: { idempotencyKey: input.request.idempotencyKey },
    });
    if (existing) return existing;
  }

  return prisma.agentCapabilityRun.create({
    data: {
      id: input.runId,
      capabilityId: input.capabilityId,
      userId: input.userId || undefined,
      status: 'running',
      mode: input.mode,
      inputJson: toJson(input.request.input || {}),
      idempotencyKey: input.request.idempotencyKey || undefined,
      clientJson: toJson(input.request.client || {}),
    },
  });
}

export async function updateAgentCapabilityRunFromResult(
  result: AgentCapabilityRunResult,
  business?: AgentRunBusinessLink,
) {
  return prisma.agentCapabilityRun.upsert({
    where: { id: result.runId },
    create: {
      id: result.runId,
      capabilityId: result.capabilityId,
      status: result.status,
      mode: result.mode,
      resultJson: toJson(result.result),
      errorJson: toJson(result.error || undefined),
      artifactsJson: toJson(result.artifacts || []),
      usageJson: toJson(result.usage || {}),
      businessType: business?.businessType,
      businessId: business?.businessId,
      businessTaskId: business?.businessTaskId,
      businessStatus: business?.businessStatus,
      finishedAt: result.finishedAt ? new Date(result.finishedAt) : finishedAtForStatus(result.status),
    },
    update: {
      status: result.status,
      resultJson: toJson(result.result),
      errorJson: toJson(result.error || undefined),
      artifactsJson: toJson(result.artifacts || []),
      usageJson: toJson(result.usage || {}),
      businessType: business?.businessType,
      businessId: business?.businessId,
      businessTaskId: business?.businessTaskId,
      businessStatus: business?.businessStatus,
      finishedAt: result.finishedAt ? new Date(result.finishedAt) : finishedAtForStatus(result.status),
    },
  });
}

export async function markAgentCapabilityRunFailed(input: {
  runId: string;
  capabilityId: string;
  mode: AgentCapabilityRunMode;
  error: { code: string; message: string; details?: unknown };
}) {
  return prisma.agentCapabilityRun.upsert({
    where: { id: input.runId },
    create: {
      id: input.runId,
      capabilityId: input.capabilityId,
      mode: input.mode,
      status: 'failed',
      errorJson: toJson(input.error),
      finishedAt: new Date(),
    },
    update: {
      status: 'failed',
      errorJson: toJson(input.error),
      finishedAt: new Date(),
    },
  });
}

export async function getAgentCapabilityRunRecord(runId: string) {
  return prisma.agentCapabilityRun.findUnique({ where: { id: runId } });
}

export function serializeAgentRunRecord(record: Awaited<ReturnType<typeof getAgentCapabilityRunRecord>>): AgentCapabilityRunResult | null {
  if (!record) return null;
  const status = record.status as AgentCapabilityRunStatus;
  const mode = record.mode as AgentCapabilityRunMode;
  return {
    runId: record.id,
    capabilityId: record.capabilityId,
    status,
    mode,
    createdAt: record.createdAt.toISOString(),
    finishedAt: record.finishedAt?.toISOString(),
    result: fromJson(record.resultJson),
    artifacts: fromJson(record.artifactsJson) || [],
    usage: fromJson(record.usageJson),
    error: fromJson(record.errorJson) || null,
    statusCommand: status === 'waiting_callback' || status === 'running' || status === 'queued'
      ? `nextide run status ${record.id}`
      : undefined,
    resultCommand: status === 'waiting_callback' || status === 'running' || status === 'queued'
      ? `nextide run result ${record.id} --output result.json`
      : undefined,
  };
}
