import { randomUUID } from 'node:crypto';
import { analyzeProduct } from '@/lib/n8n';
import { getRequestUserContext } from '@/lib/authServer';
import { renderXhsCardLayout } from '@/lib/xhs-card-layout-service';
import type {
  AgentCapabilityDefinition,
  AgentCapabilityRunInput,
  AgentCapabilityRunMode,
  AgentCapabilityRunResult,
} from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeRunMode(capability: AgentCapabilityDefinition, mode: unknown): AgentCapabilityRunMode {
  if (mode === 'submit') return 'submit';
  if (mode === 'wait') return 'wait';
  return capability.async ? 'submit' : 'wait';
}

function buildCommand(runId: string, kind: 'status' | 'result'): string {
  if (kind === 'status') return `nextide run status ${runId}`;
  return `nextide run result ${runId} --output result.json`;
}

function failedResult(input: {
  runId: string;
  capabilityId: string;
  mode: AgentCapabilityRunMode;
  code: string;
  message: string;
  details?: unknown;
}): AgentCapabilityRunResult {
  return {
    runId: input.runId,
    capabilityId: input.capabilityId,
    mode: input.mode,
    status: 'failed',
    createdAt: nowIso(),
    finishedAt: nowIso(),
    error: {
      code: input.code,
      message: input.message,
      details: input.details,
    },
  };
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pickStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => pickString(item)).filter(Boolean);
}

function makeSyntheticRequest(headers?: Headers): Request {
  return new Request('http://nextide.local/agent-capability', { headers });
}

export async function runAgentCapability(input: {
  capability: AgentCapabilityDefinition;
  request: AgentCapabilityRunInput;
  authHeaders?: Headers;
}): Promise<AgentCapabilityRunResult> {
  const runId = `run_${randomUUID()}`;
  const mode = normalizeRunMode(input.capability, input.request.mode);
  const createdAt = nowIso();

  if (input.capability.status !== 'available') {
    return failedResult({
      runId,
      capabilityId: input.capability.id,
      mode,
      code: 'capability_unavailable',
      message: `Capability ${input.capability.id} is ${input.capability.status}; it is registered but not wired to production execution yet.`,
    });
  }

  try {
    if (input.capability.id === 'product.selling_point.analysis') {
      return await runProductSellingPointAnalysis({
        runId,
        mode,
        createdAt,
        payload: input.request.input || {},
      });
    }

    if (input.capability.id === 'xhs.card.layout') {
      return await runXhsCardLayout({
        runId,
        mode,
        createdAt,
        payload: input.request.input || {},
        authHeaders: input.authHeaders,
      });
    }

    return failedResult({
      runId,
      capabilityId: input.capability.id,
      mode,
      code: 'capability_unavailable',
      message: `Capability ${input.capability.id} has no runner implementation yet.`,
    });
  } catch (error) {
    return failedResult({
      runId,
      capabilityId: input.capability.id,
      mode,
      code: 'workflow_failed',
      message: error instanceof Error ? error.message : 'Capability execution failed',
    });
  }
}

async function runProductSellingPointAnalysis(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  payload: Record<string, unknown>;
}): Promise<AgentCapabilityRunResult> {
  const name = pickString(input.payload.name || input.payload.productName);
  if (!name) {
    return failedResult({
      runId: input.runId,
      capabilityId: 'product.selling_point.analysis',
      mode: input.mode,
      code: 'invalid_input',
      message: 'name is required',
    });
  }

  const description = pickString(input.payload.description);
  const images = pickStringArray(input.payload.images);
  const apiKey = pickString(
    input.payload.apiKey ||
    input.payload.api_key ||
    process.env.NEXTIDE_USER_API_KEY ||
    process.env.N8N_USER_API_KEY
  );
  if (!apiKey) {
    return failedResult({
      runId: input.runId,
      capabilityId: 'product.selling_point.analysis',
      mode: input.mode,
      code: 'unauthorized',
      message: 'apiKey is required for product analysis in the current MVP runner.',
    });
  }

  const started = Date.now();
  const analysis = await analyzeProduct({
    name,
    description,
    images,
    apiKey,
    workflowId: 'flow_product_dna',
    workflowName: '产品分析',
  });

  return {
    runId: input.runId,
    capabilityId: 'product.selling_point.analysis',
    mode: input.mode,
    status: analysis.status === 'COMPLETED' ? 'succeeded' : 'waiting_callback',
    createdAt: input.createdAt,
    finishedAt: analysis.status === 'COMPLETED' ? nowIso() : undefined,
    result: {
      ...analysis,
      success: true,
      processing: analysis.status !== 'COMPLETED',
    },
    artifacts: [],
    usage: {
      provider: 'n8n',
      durationMs: Date.now() - started,
    },
    error: null,
    statusCommand: analysis.status === 'COMPLETED' ? undefined : buildCommand(input.runId, 'status'),
    resultCommand: analysis.status === 'COMPLETED' ? undefined : buildCommand(input.runId, 'result'),
  };
}

async function runXhsCardLayout(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  payload: Record<string, unknown>;
  authHeaders?: Headers;
}): Promise<AgentCapabilityRunResult> {
  const context = await getRequestUserContext(makeSyntheticRequest(input.authHeaders));
  const userId = context.userId || process.env.NEXTIDE_AGENT_USER_ID || process.env.DEFAULT_AGENT_USER_ID || '';
  if (!userId) {
    return failedResult({
      runId: input.runId,
      capabilityId: 'xhs.card.layout',
      mode: input.mode,
      code: 'unauthorized',
      message: 'xhs.card.layout requires a user identity. Pass --auth-token, --user-api-key, --nexapi-key, or configure NEXTIDE_AGENT_USER_ID for service-mode rendering.',
    });
  }

  const started = Date.now();
  const result = await renderXhsCardLayout({
    userId,
    accessToken: context.token,
    body: input.payload,
  });

  return {
    runId: input.runId,
    capabilityId: 'xhs.card.layout',
    mode: input.mode,
    status: 'succeeded',
    createdAt: input.createdAt,
    finishedAt: nowIso(),
    result: { data: result },
    artifacts: result.images.map((url, index) => ({
      type: 'image',
      url,
      name: `xhs-card-${index + 1}.png`,
    })),
    usage: {
      provider: 'internal_service',
      durationMs: Date.now() - started,
    },
    error: null,
  };
}

async function runInternalApiCapability(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  capability: AgentCapabilityDefinition;
  payload: Record<string, unknown>;
  authHeaders?: Headers;
}): Promise<AgentCapabilityRunResult> {
  if (!input.capability.internalApiPath) {
    return failedResult({
      runId: input.runId,
      capabilityId: input.capability.id,
      mode: input.mode,
      code: 'capability_unavailable',
      message: `Capability ${input.capability.id} has no internalApiPath configured.`,
    });
  }

  const baseUrl = process.env.NEXTIDE_INTERNAL_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const url = new URL(input.capability.internalApiPath, baseUrl);
  const headers = new Headers();
  headers.set('content-type', 'application/json');

  const forwardHeaders = ['authorization', 'cookie', 'x-user-api-key', 'x-nexapi-key'];
  for (const key of forwardHeaders) {
    const value = input.authHeaders?.get(key);
    if (value) headers.set(key, value);
  }

  const started = Date.now();
  const response = await fetch(url, {
    method: input.capability.method || 'POST',
    headers,
    body: JSON.stringify(input.payload),
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return failedResult({
      runId: input.runId,
      capabilityId: input.capability.id,
      mode: input.mode,
      code: response.status === 401 ? 'unauthorized' : 'workflow_failed',
      message: typeof (data as { error?: unknown } | null)?.error === 'string'
        ? String((data as { error: string }).error)
        : `Internal API returned ${response.status}`,
      details: data,
    });
  }

  return {
    runId: input.runId,
    capabilityId: input.capability.id,
    mode: input.mode,
    status: 'succeeded',
    createdAt: input.createdAt,
    finishedAt: nowIso(),
    result: data,
    artifacts: extractArtifacts(input.capability.id, data),
    usage: {
      provider: 'internal_api',
      durationMs: Date.now() - started,
    },
    error: null,
  };
}

function extractArtifacts(capabilityId: string, data: unknown): AgentCapabilityRunResult['artifacts'] {
  if (capabilityId !== 'xhs.card.layout') return [];
  const images = (data as { data?: { images?: unknown } } | null)?.data?.images;
  if (!Array.isArray(images)) return [];
  return images
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
    .map((url, index) => ({
      type: 'image',
      url,
      name: `xhs-card-${index + 1}.png`,
    }));
}
