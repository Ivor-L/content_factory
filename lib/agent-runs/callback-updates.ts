import type { AgentCapabilityRunStatus } from '@/lib/agent-capabilities/types';
import prisma from '@/lib/prisma';

export async function updateAgentRunsForBusiness(input: {
  businessType: string;
  businessId: string;
  businessStatus: string;
  status: AgentCapabilityRunStatus;
  result?: unknown;
  artifacts?: unknown;
  error?: unknown;
}) {
  const data = {
    status: input.status,
    businessStatus: input.businessStatus,
    resultJson: input.result === undefined ? undefined : JSON.parse(JSON.stringify(input.result)),
    artifactsJson: input.artifacts === undefined ? undefined : JSON.parse(JSON.stringify(input.artifacts)),
    errorJson: input.error === undefined ? undefined : JSON.parse(JSON.stringify(input.error)),
    finishedAt: ['succeeded', 'failed', 'cancelled', 'timeout'].includes(input.status) ? new Date() : undefined,
  };
  return prisma.agentCapabilityRun.updateMany({
    where: {
      businessType: input.businessType,
      businessId: input.businessId,
    },
    data,
  });
}

export async function updateAgentRunsForBusinessTask(input: {
  businessType: string;
  businessTaskId: string;
  businessStatus: string;
  status: AgentCapabilityRunStatus;
  businessId?: string;
  result?: unknown;
  artifacts?: unknown;
  error?: unknown;
}) {
  const data = {
    status: input.status,
    businessId: input.businessId,
    businessStatus: input.businessStatus,
    resultJson: input.result === undefined ? undefined : JSON.parse(JSON.stringify(input.result)),
    artifactsJson: input.artifacts === undefined ? undefined : JSON.parse(JSON.stringify(input.artifacts)),
    errorJson: input.error === undefined ? undefined : JSON.parse(JSON.stringify(input.error)),
    finishedAt: ['succeeded', 'failed', 'cancelled', 'timeout'].includes(input.status) ? new Date() : undefined,
  };
  return prisma.agentCapabilityRun.updateMany({
    where: {
      businessType: input.businessType,
      businessTaskId: input.businessTaskId,
    },
    data,
  });
}
