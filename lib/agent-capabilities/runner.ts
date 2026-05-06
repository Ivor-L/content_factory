import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeProduct } from '@/lib/n8n';
import { getRequestUserContext } from '@/lib/authServer';
import { renderXhsCardLayout } from '@/lib/xhs-card-layout-service';
import { createCreativeTaskWithAssets } from '@/lib/creativeTaskCreation';
import prisma from '@/lib/prisma';
import { createAgentCapabilityCreditHold } from '@/lib/agent-capabilities/quota-preflight';
import {
  createAgentCapabilityRunRecord,
  markAgentCapabilityRunFailed,
  serializeAgentRunRecord,
  updateAgentCapabilityRunFromResult,
  type AgentRunBusinessLink,
} from '@/lib/agent-runs/store';
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

async function persistAgentCapabilityResult(result: AgentCapabilityRunResult): Promise<AgentCapabilityRunResult> {
  await updateAgentCapabilityRunFromResult(result, inferBusinessLink(result));
  return result;
}

function inferBusinessLink(result: AgentCapabilityRunResult): AgentRunBusinessLink | undefined {
  const data = (result.result as { data?: Record<string, unknown> } | null)?.data;
  const root = typeof result.result === 'object' && result.result !== null ? result.result as Record<string, unknown> : {};
  const record = data && typeof data === 'object' ? data : root;
  const id = pickString(record.id || record.taskId || root.taskId);

  if (result.capabilityId === 'digital-human.video.generate' || result.capabilityId === 'motion.replication.image_to_video') {
    return id ? { businessType: 'digitalHumanVideo', businessId: id, businessStatus: pickString(record.status) } : undefined;
  }
  if (result.capabilityId === 'xhs.infographic.generate' || result.capabilityId === 'viral.midform.video.generate') {
    const taskId = pickString(root.taskId || record.id || record.taskId);
    return taskId ? { businessType: 'creativeTask', businessId: taskId, businessStatus: pickString(record.status || root.status) } : undefined;
  }
  if (result.capabilityId === 'xhs.infographic.style.extract') {
    return id ? { businessType: 'stylePreset', businessId: id, businessStatus: pickString(record.status || root.status) } : undefined;
  }
  if (['social.tiktok.collect', 'social.instagram.collect', 'social.facebook.collect'].includes(result.capabilityId)) {
    const platform = pickString(root.platform || record.platform) || platformFromCapabilityId(result.capabilityId);
    const taskId = pickString(record.taskId || record.task_id || root.taskId || root.task_id);
    return platform ? { businessType: 'socialCollection', businessId: platform, businessTaskId: taskId, businessStatus: pickString(root.status || record.status) || result.status } : undefined;
  }
  if (result.capabilityId === 'viral.breakdown.video_prompts') {
    const imageTextId = pickString(record.id || root.taskId || root.id);
    return imageTextId ? { businessType: 'imageTextReplicationTask', businessId: imageTextId, businessStatus: pickString(record.status || root.status) } : undefined;
  }
  return undefined;
}

export async function runAgentCapability(input: {
  capability: AgentCapabilityDefinition;
  request: AgentCapabilityRunInput;
  authHeaders?: Headers;
  userId?: string;
  userApiKey?: string | null;
  creditHold?: {
    estimatedCredits: number;
    featureKey: string;
    source?: string;
  };
}): Promise<AgentCapabilityRunResult> {
  const mode = normalizeRunMode(input.capability, input.request.mode);
  const runId = input.request.idempotencyKey ? `run_${input.request.idempotencyKey}` : `run_${randomUUID()}`;
  const createdAt = nowIso();

  const persisted = await createAgentCapabilityRunRecord({
    runId,
    capabilityId: input.capability.id,
    mode,
    request: input.request,
    userId: input.userId,
  });

  if (input.userId && input.creditHold && input.creditHold.estimatedCredits > 0) {
    await createAgentCapabilityCreditHold({
      runId,
      userId: input.userId,
      capability: input.capability,
      estimatedCredits: input.creditHold.estimatedCredits,
      featureKey: input.creditHold.featureKey,
      metadata: { source: input.creditHold.source, mode },
    });
  }
  if (persisted.id !== runId || persisted.status !== 'running') {
    const existing = serializeAgentRunRecord(persisted);
    if (existing) return existing;
  }

  if (input.capability.status !== 'available') {
    const result = failedResult({
      runId,
      capabilityId: input.capability.id,
      mode,
      code: 'capability_unavailable',
      message: `Capability ${input.capability.id} is ${input.capability.status}; it is registered but not wired to production execution yet.`,
    });
    await updateAgentCapabilityRunFromResult(result);
    return result;
  }

  try {
    let result: AgentCapabilityRunResult;
    if (input.capability.id === 'product.selling_point.analysis') {
      result = await runProductSellingPointAnalysis({ runId, mode, createdAt, payload: input.request.input || {}, userApiKey: input.userApiKey });
    } else if (input.capability.id === 'xhs.card.layout') {
      result = await runXhsCardLayout({ runId, mode, createdAt, payload: input.request.input || {}, authHeaders: input.authHeaders });
    } else if (input.capability.id === 'xhs.note.collect') {
      result = await runXhsNoteCollect({ runId, mode, createdAt, capability: input.capability, payload: input.request.input || {}, authHeaders: input.authHeaders });
    } else if (input.capability.id === 'xhs.infographic.generate') {
      result = await runXhsInfographicGenerate({ runId, mode, createdAt, capability: input.capability, payload: input.request.input || {}, authHeaders: input.authHeaders });
    } else if (input.capability.id === 'xhs.infographic.style.extract') {
      result = await runXhsStyleExtract({ runId, mode, createdAt, capability: input.capability, payload: input.request.input || {}, authHeaders: input.authHeaders });
    } else if (input.capability.id === 'digital-human.video.generate') {
      result = await runDigitalHumanVideoGenerate({ runId, mode, createdAt, capability: input.capability, payload: input.request.input || {}, authHeaders: input.authHeaders });
    } else if (input.capability.id === 'motion.replication.image_to_video') {
      result = await runMotionReplication({ runId, mode, createdAt, capability: input.capability, payload: input.request.input || {}, authHeaders: input.authHeaders });
    } else if (input.capability.id === 'viral.midform.video.generate') {
      result = await runViralMidformVideoGenerate({ runId, mode, createdAt, capability: input.capability, payload: input.request.input || {}, authHeaders: input.authHeaders });
    } else if (['social.tiktok.collect', 'social.instagram.collect', 'social.facebook.collect'].includes(input.capability.id)) {
      result = await runSocialCollect({ runId, mode, createdAt, capability: input.capability, payload: input.request.input || {}, authHeaders: input.authHeaders });
    } else if (input.capability.id === 'viral.breakdown.video_prompts') {
      result = await runViralBreakdownVideoPrompts({ runId, mode, createdAt, capability: input.capability, payload: input.request.input || {}, authHeaders: input.authHeaders });
    } else if (input.capability.id === 'social.comments.collect') {
      result = await runSocialCommentsCollect({ runId, mode, createdAt, capability: input.capability, payload: input.request.input || {}, authHeaders: input.authHeaders });
    } else if (input.capability.executionType === 'local_agent') {
      result = runLocalAgentGuidance({ runId, mode, createdAt, capability: input.capability, payload: input.request.input || {} });
    } else {
      result = failedResult({
        runId,
        capabilityId: input.capability.id,
        mode,
        code: 'capability_unavailable',
        message: `Capability ${input.capability.id} has no runner implementation yet.`,
      });
    }
    return await persistAgentCapabilityResult(result);
  } catch (error) {
    const result = failedResult({
      runId,
      capabilityId: input.capability.id,
      mode,
      code: 'workflow_failed',
      message: error instanceof Error ? error.message : 'Capability execution failed',
    });
    await markAgentCapabilityRunFailed({ runId, capabilityId: input.capability.id, mode, error: result.error! });
    return result;
  }
}

function runLocalAgentGuidance(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  capability: AgentCapabilityDefinition;
  payload: Record<string, unknown>;
}): AgentCapabilityRunResult {
  const skillPath = `.claude/skills/${input.capability.skillName}/SKILL.md`;
  return {
    runId: input.runId,
    capabilityId: input.capability.id,
    mode: input.mode,
    status: 'succeeded',
    createdAt: input.createdAt,
    finishedAt: nowIso(),
    result: {
      type: 'local_agent_guidance',
      capabilityId: input.capability.id,
      skillName: input.capability.skillName,
      title: input.capability.title,
      input: input.payload,
      instructions: `Use the local NexTide skill at ${skillPath}. This capability is a free local-agent guidance skill; it does not call cloud providers or consume credits.`,
      skillPath,
    },
    artifacts: [
      {
        type: 'text',
        name: 'local-agent-skill-instructions',
        data: `Read ${skillPath} and apply it to the provided input.`,
        metadata: {
          skillName: input.capability.skillName,
          capabilityId: input.capability.id,
        },
      },
    ],
    usage: { credits: 0, provider: 'local_agent' },
    error: null,
  };
}

async function runProductSellingPointAnalysis(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  payload: Record<string, unknown>;
  userApiKey?: string | null;
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
    input.userApiKey ||
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
      message: 'A valid NexTide API Key is required for product analysis.',
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

function toAgentStatusFromRecord(record: { status?: unknown; resultUrl?: unknown }): AgentCapabilityRunResult['status'] {
  const status = pickString(record.status).toUpperCase();
  if (typeof record.resultUrl === 'string' && record.resultUrl.trim()) return 'succeeded';
  if (['COMPLETED', 'SUCCESS', 'SUCCEEDED', 'DONE'].includes(status)) return 'succeeded';
  if (['FAILED', 'ERROR', 'CANCELED', 'CANCELLED'].includes(status)) return 'failed';
  return 'waiting_callback';
}

async function runSocialCommentsCollect(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  capability: AgentCapabilityDefinition;
  payload: Record<string, unknown>;
  authHeaders?: Headers;
}): Promise<AgentCapabilityRunResult> {
  const webhookUrl = process.env.N8N_TIKTOK_COMMENTS_WEBHOOK || process.env.N8N_SOCIAL_COMMENTS_WEBHOOK || process.env.SOCIAL_COMMENTS_WEBHOOK_URL || '';
  if (!webhookUrl) {
    return failedResult({
      runId: input.runId,
      capabilityId: input.capability.id,
      mode: input.mode,
      code: 'capability_unavailable',
      message: 'social.comments.collect requires N8N_TIKTOK_COMMENTS_WEBHOOK or N8N_SOCIAL_COMMENTS_WEBHOOK to be configured.',
    });
  }
  const platform = pickString(input.payload.platform || 'tiktok') || 'tiktok';
  const urls = pickStringArray(input.payload.urls || input.payload.videoUrls || input.payload.targets);
  const singleUrl = pickString(input.payload.url || input.payload.videoUrl || input.payload.target);
  const urlList = urls.length > 0 ? urls : singleUrl ? [singleUrl] : [];
  if (urlList.length === 0) {
    return failedResult({ runId: input.runId, capabilityId: input.capability.id, mode: input.mode, code: 'invalid_input', message: 'urls[] or url is required' });
  }
  const limit = typeof input.payload.limit === 'number' ? input.payload.limit : 100;
  const started = Date.now();
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task_id: input.runId,
      platform,
      urls: urlList,
      video_urls: urlList,
      limit,
      callback_url: input.payload.callbackUrl || input.payload.callback_url || null,
    }),
  });
  let data: unknown = null;
  try { data = await response.json(); } catch { data = await response.text().catch(() => null); }
  if (!response.ok) {
    return failedResult({
      runId: input.runId,
      capabilityId: input.capability.id,
      mode: input.mode,
      code: 'workflow_failed',
      message: `Comments workflow returned ${response.status}`,
      details: data,
    });
  }
  return {
    runId: input.runId,
    capabilityId: input.capability.id,
    mode: input.mode,
    status: 'waiting_callback',
    createdAt: input.createdAt,
    finishedAt: nowIso(),
    result: {
      data,
      platform,
      urls: urlList,
      limit,
      note: 'Comments collection workflow triggered. If the workflow responds synchronously, raw response is included; otherwise wait for configured callback/storage.',
    },
    artifacts: [],
    usage: { provider: 'n8n_workflow', durationMs: Date.now() - started },
    error: null,
    statusCommand: buildCommand(input.runId, 'status'),
    resultCommand: buildCommand(input.runId, 'result'),
  };
}

async function runViralBreakdownVideoPrompts(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  capability: AgentCapabilityDefinition;
  payload: Record<string, unknown>;
  authHeaders?: Headers;
}): Promise<AgentCapabilityRunResult> {
  const referenceVideo = pickString(input.payload.referenceVideo || input.payload.videoUrl || input.payload.video_url);
  const referenceUrl = pickString(input.payload.referenceUrl || input.payload.sourceUrl || input.payload.url);
  const sourceTitle = pickString(input.payload.sourceTitle || input.payload.title || input.payload.topic) || '爆款拆解';
  const sourceText = pickString(input.payload.sourceText || input.payload.description || input.payload.caption || input.payload.text);
  const sourceImages = pickStringArray(input.payload.sourceImages || input.payload.images || input.payload.imageUrls);
  const platform = pickString(input.payload.sourcePlatform || input.payload.platform) || 'unknown';

  if (referenceVideo) {
    const one = await runInternalApiCapability({
      runId: input.runId,
      mode: input.mode,
      createdAt: input.createdAt,
      capability: {
        ...input.capability,
        internalApiPath: '/api/replication/copy/extract',
        method: 'POST',
      },
      payload: {
        videoUrl: referenceVideo,
        referenceItemId: input.payload.referenceItemId,
        sourcePlatform: platform,
        noteDescription: sourceText,
        language: input.payload.language || 'zh-CN',
      },
      authHeaders: input.authHeaders,
    });
    if (one.status === 'failed') return one;
    const pending = (one.result as { data?: { status?: unknown } } | null)?.data?.status === 'pending';
    return {
      ...one,
      status: pending ? 'waiting_callback' : 'succeeded',
      result: {
        ...(typeof one.result === 'object' && one.result !== null ? one.result : { data: one.result }),
        referenceVideo,
        note: pending
          ? 'Video copy extraction is running asynchronously. Callback persists transcript to script/reference item when configured.'
          : 'Video transcript/copy extraction completed synchronously. Use downstream prompt skills to convert it into video prompts.',
      },
      statusCommand: pending ? buildCommand(input.runId, 'status') : undefined,
      resultCommand: pending ? buildCommand(input.runId, 'result') : undefined,
    };
  }

  const one = await runInternalApiCapability({
    runId: input.runId,
    mode: input.mode,
    createdAt: input.createdAt,
    capability: {
      ...input.capability,
      internalApiPath: '/api/image-text-replication/start',
      method: 'POST',
    },
    payload: {
      sourceTitle,
      sourceText,
      sourceImages,
      sourcePlatform: platform,
      sourceId: input.payload.sourceId || input.payload.referenceId,
      sourceUrl: referenceUrl,
    },
    authHeaders: input.authHeaders,
  });
  if (one.status === 'failed') return one;
  return {
    ...one,
    status: 'succeeded',
    result: {
      ...(typeof one.result === 'object' && one.result !== null ? one.result : { data: one.result }),
      note: 'Image-text viral reference task created. It starts from BREAKDOWN_COMPLETED when source text/images are already available; use generation/card skills for downstream prompts/cards.',
    },
  };
}

function platformFromCapabilityId(id: string): 'tiktok' | 'instagram' | 'facebook' | '' {
  if (id.includes('tiktok')) return 'tiktok';
  if (id.includes('instagram')) return 'instagram';
  if (id.includes('facebook')) return 'facebook';
  return '';
}

function normalizeSocialMode(platform: string, payload: Record<string, unknown>): string {
  const explicit = pickString(payload.mode).toLowerCase();
  if (explicit === 'keyword' || explicit === 'creator' || explicit === 'video') return explicit;
  if (platform === 'tiktok' && pickStringArray(payload.queries || payload.keywords).length > 0) return 'keyword';
  return 'video';
}

async function runSocialCollect(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  capability: AgentCapabilityDefinition;
  payload: Record<string, unknown>;
  authHeaders?: Headers;
}): Promise<AgentCapabilityRunResult> {
  const platform = platformFromCapabilityId(input.capability.id) || pickString(input.payload.platform).toLowerCase();
  if (!platform) {
    return failedResult({ runId: input.runId, capabilityId: input.capability.id, mode: input.mode, code: 'invalid_input', message: 'platform is required' });
  }

  const mode = normalizeSocialMode(platform, input.payload);
  const entries = [
    ...pickStringArray(input.payload.entries),
    ...pickStringArray(input.payload.targets),
    ...pickStringArray(input.payload.creators),
    ...pickStringArray(input.payload.urls),
    ...pickStringArray(input.payload.queries),
    ...pickStringArray(input.payload.keywords),
  ];
  const single = pickString(input.payload.url || input.payload.query || input.payload.keyword || input.payload.target);
  if (entries.length === 0 && single) entries.push(single);

  if (entries.length === 0) {
    return failedResult({
      runId: input.runId,
      capabilityId: input.capability.id,
      mode: input.mode,
      code: 'invalid_input',
      message: mode === 'keyword' ? 'queries/keywords are required' : 'urls/targets are required',
    });
  }

  const one = await runInternalApiCapability({
    runId: input.runId,
    mode: input.mode,
    createdAt: input.createdAt,
    capability: input.capability,
    payload: {
      ...input.payload,
      platform,
      mode,
      entries,
      limit: input.payload.limit,
    },
    authHeaders: input.authHeaders,
  });

  if (one.status === 'failed') return one;

  const immediate = platform === 'instagram';
  return {
    ...one,
    status: immediate ? 'succeeded' : 'waiting_callback',
    result: {
      ...(typeof one.result === 'object' && one.result !== null ? one.result : { data: one.result }),
      platform,
      mode,
      entries,
      note: immediate
        ? 'Instagram URL collection imports results synchronously when workflow returns post_data.'
        : 'Social collection task has been submitted. Results are imported into viral references after n8n callback completes.',
    },
    statusCommand: immediate ? undefined : buildCommand(input.runId, 'status'),
    resultCommand: immediate ? undefined : buildCommand(input.runId, 'result'),
  };
}

async function runViralMidformVideoGenerate(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  capability: AgentCapabilityDefinition;
  payload: Record<string, unknown>;
  authHeaders?: Headers;
}): Promise<AgentCapabilityRunResult> {
  let taskId = pickString(input.payload.taskId || input.payload.creativeTaskId || input.payload.creative_task_id);
  const title = pickString(input.payload.title || input.payload.topic) || 'Agent 中视频任务';
  const scriptText = pickString(input.payload.scriptText || input.payload.script || input.payload.content || input.payload.text);
  const theme = pickString(input.payload.theme || input.payload.category || '3d-skeleton') || '3d-skeleton';

  if (!scriptText) {
    return failedResult({
      runId: input.runId,
      capabilityId: input.capability.id,
      mode: input.mode,
      code: 'invalid_input',
      message: 'scriptText/script/content is required',
    });
  }

  if (!taskId) {
    const context = await getRequestUserContext(makeSyntheticRequest(input.authHeaders));
    const userId = context.userId || process.env.NEXTIDE_AGENT_USER_ID || process.env.DEFAULT_AGENT_USER_ID || '';
    if (!userId) {
      return failedResult({
        runId: input.runId,
        capabilityId: input.capability.id,
        mode: input.mode,
        code: 'unauthorized',
        message: 'viral.midform.video.generate standalone mode requires user identity. Use nextide auth login or pass a NexTide API Key.',
      });
    }
    const task = await createCreativeTaskWithAssets({
      userId,
      payload: {
        title,
        ideaText: scriptText,
        channel: 'video',
        targetOutput: 'midform_video',
        goal: {
          source: 'agent_capability',
          capabilityId: input.capability.id,
          theme,
        },
      },
    });
    taskId = task.id;
    await prisma.taskSummary.upsert({
      where: { taskType_taskId: { taskType: 'creative_task', taskId } },
      create: {
        userId,
        taskType: 'creative_task',
        taskId,
        title,
        status: 'PROCESSING',
        preview: scriptText.slice(0, 140),
        metadata: { source: 'agent_capability', capabilityId: input.capability.id, theme },
      },
      update: {
        status: 'PROCESSING',
        preview: scriptText.slice(0, 140),
        metadata: { source: 'agent_capability', capabilityId: input.capability.id, theme },
      },
    });
  }

  const one = await runInternalApiCapability({
    runId: input.runId,
    mode: input.mode,
    createdAt: input.createdAt,
    capability: input.capability,
    payload: {
      ...input.payload,
      taskId,
      title,
      scriptText,
      creativeStyleRaw: input.payload.creativeStyleRaw || theme,
      creativeStyleNorm: input.payload.creativeStyleNorm || (theme === '3d-skeleton' ? '3D骨骼' : theme),
      allowText: input.payload.allowText === true,
    },
    authHeaders: input.authHeaders,
  });

  if (one.status === 'failed') return one;
  return {
    ...one,
    status: 'waiting_callback',
    result: {
      ...(typeof one.result === 'object' && one.result !== null ? one.result : { data: one.result }),
      taskId,
      theme,
      note: 'Midform video generation currently triggers T2V storyboard planning for an existing creative task. Callback writes t2v_status/t2v_storyboard_id into creativeTask metadata.',
    },
    statusCommand: buildCommand(input.runId, 'status'),
    resultCommand: buildCommand(input.runId, 'result'),
  };
}

async function runDigitalHumanVideoGenerate(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  capability: AgentCapabilityDefinition;
  payload: Record<string, unknown>;
  authHeaders?: Headers;
}): Promise<AgentCapabilityRunResult> {
  const sourceType = pickString(input.payload.sourceType || (input.payload.videoUrl ? 'VIDEO' : 'IMAGE')).toUpperCase() === 'VIDEO' ? 'VIDEO' : 'IMAGE';
  const imageUrl = pickString(input.payload.imageUrl || input.payload.personImage || input.payload.sourceImage);
  const videoUrl = pickString(input.payload.videoUrl || input.payload.personVideo || input.payload.sourceVideo);
  const resolvedSourceUrl = sourceType === 'VIDEO' ? (videoUrl || imageUrl) : (imageUrl || videoUrl);
  const audioUrl = pickString(input.payload.audioUrl || input.payload.voiceUrl || input.payload.emoAudioUrl);
  const scriptContent = pickString(input.payload.scriptContent || input.payload.script || input.payload.text);
  const type = pickString(input.payload.type || input.payload.mode || (scriptContent ? 'VOICE_CLONE' : 'LIP_SYNC')).toUpperCase();

  if (!resolvedSourceUrl) {
    return failedResult({ runId: input.runId, capabilityId: input.capability.id, mode: input.mode, code: 'invalid_input', message: sourceType === 'VIDEO' ? 'videoUrl is required' : 'imageUrl/personImage is required' });
  }
  if (!audioUrl) {
    return failedResult({ runId: input.runId, capabilityId: input.capability.id, mode: input.mode, code: 'invalid_input', message: 'audioUrl or voiceUrl is required. TTS generation is not part of this MVP runner yet.' });
  }
  if (type === 'VOICE_CLONE' && !scriptContent) {
    return failedResult({ runId: input.runId, capabilityId: input.capability.id, mode: input.mode, code: 'invalid_input', message: 'VOICE_CLONE requires scriptContent/script' });
  }

  const payload = {
    ...input.payload,
    type: type === 'VOICE_CLONE' ? 'VOICE_CLONE' : 'LIP_SYNC',
    sourceType,
    imageUrl: sourceType === 'IMAGE' ? resolvedSourceUrl : undefined,
    videoUrl: sourceType === 'VIDEO' ? resolvedSourceUrl : undefined,
    audioUrl,
    scriptContent,
  };

  const one = await runInternalApiCapability({
    runId: input.runId,
    mode: input.mode,
    createdAt: input.createdAt,
    capability: input.capability,
    payload,
    authHeaders: input.authHeaders,
  });
  if (one.status === 'failed') return one;
  const data = (one.result as { data?: Record<string, unknown> } | null)?.data || {};
  const agentStatus = toAgentStatusFromRecord(data);
  return {
    ...one,
    status: agentStatus,
    result: {
      ...(typeof one.result === 'object' && one.result !== null ? one.result : { data: one.result }),
      note: agentStatus === 'waiting_callback' ? 'Digital human generation is a long-running task and can take up to 60 minutes. Use the returned video id with /api/digital-human/videos/[id] or NexTide UI to inspect progress.' : undefined,
    },
    artifacts: typeof data.resultUrl === 'string' && data.resultUrl ? [{
      type: 'video',
      url: data.resultUrl,
      name: 'digital-human.mp4',
      mimeType: 'video/mp4',
      metadata: {
        capabilityId: input.capability.id,
        taskId: pickString(data.id),
        status: pickString(data.status),
        sourceType,
        mode: type,
      },
    }] : [],
    statusCommand: agentStatus === 'waiting_callback' ? buildCommand(input.runId, 'status') : undefined,
    resultCommand: agentStatus === 'waiting_callback' ? buildCommand(input.runId, 'result') : undefined,
  };
}

async function runMotionReplication(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  capability: AgentCapabilityDefinition;
  payload: Record<string, unknown>;
  authHeaders?: Headers;
}): Promise<AgentCapabilityRunResult> {
  const imageUrl = pickString(input.payload.imageUrl || input.payload.personImage || input.payload.sourceImage);
  const videoUrl = pickString(input.payload.videoUrl || input.payload.referenceVideoUrl || input.payload.motionReferenceVideo);
  if (!imageUrl) {
    return failedResult({ runId: input.runId, capabilityId: input.capability.id, mode: input.mode, code: 'invalid_input', message: 'imageUrl/personImage is required' });
  }
  if (!videoUrl) {
    return failedResult({ runId: input.runId, capabilityId: input.capability.id, mode: input.mode, code: 'invalid_input', message: 'videoUrl/referenceVideoUrl/motionReferenceVideo is required' });
  }

  const one = await runInternalApiCapability({
    runId: input.runId,
    mode: input.mode,
    createdAt: input.createdAt,
    capability: input.capability,
    payload: {
      ...input.payload,
      imageUrl,
      videoUrl,
      referenceVideoUrl: videoUrl,
    },
    authHeaders: input.authHeaders,
  });
  if (one.status === 'failed') return one;
  const data = (one.result as { data?: Record<string, unknown> } | null)?.data || {};
  const agentStatus = toAgentStatusFromRecord(data);
  return {
    ...one,
    status: agentStatus,
    result: {
      ...(typeof one.result === 'object' && one.result !== null ? one.result : { data: one.result }),
      note: agentStatus === 'waiting_callback' ? 'Motion replication is a long-running task. The returned id is a digitalHumanVideo record with type ACTION_TRANSFER.' : undefined,
    },
    artifacts: typeof data.resultUrl === 'string' && data.resultUrl ? [{
      type: 'video',
      url: data.resultUrl,
      name: 'motion-replication.mp4',
      mimeType: 'video/mp4',
      metadata: {
        capabilityId: input.capability.id,
        taskId: pickString(data.id),
        status: pickString(data.status),
        sourceImageUrl: imageUrl,
        referenceVideoUrl: videoUrl,
      },
    }] : [],
    statusCommand: agentStatus === 'waiting_callback' ? buildCommand(input.runId, 'status') : undefined,
    resultCommand: agentStatus === 'waiting_callback' ? buildCommand(input.runId, 'result') : undefined,
  };
}

async function runXhsInfographicGenerate(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  capability: AgentCapabilityDefinition;
  payload: Record<string, unknown>;
  authHeaders?: Headers;
}): Promise<AgentCapabilityRunResult> {
  const title = pickString(input.payload.title || input.payload.topic);
  const text = pickString(input.payload.text || input.payload.content || input.payload.markdown);
  const styleId = pickString(input.payload.styleId || input.payload.stylePresetId || input.payload.style_preset_id);
  const imageCount = typeof input.payload.imageCount === 'number'
    ? input.payload.imageCount
    : typeof input.payload.pageCount === 'number'
      ? input.payload.pageCount
      : 3;

  if (!title) {
    return failedResult({ runId: input.runId, capabilityId: input.capability.id, mode: input.mode, code: 'invalid_input', message: 'title or topic is required' });
  }
  if (!text) {
    return failedResult({ runId: input.runId, capabilityId: input.capability.id, mode: input.mode, code: 'invalid_input', message: 'text or content is required' });
  }
  if (!styleId) {
    return failedResult({ runId: input.runId, capabilityId: input.capability.id, mode: input.mode, code: 'invalid_input', message: 'styleId or stylePresetId is required' });
  }

  const one = await runInternalApiCapability({
    runId: input.runId,
    mode: input.mode,
    createdAt: input.createdAt,
    capability: input.capability,
    payload: {
      ...input.payload,
      title,
      text,
      styleId,
      imageCount,
    },
    authHeaders: input.authHeaders,
  });

  if (one.status === 'failed') return one;

  return {
    ...one,
    status: 'waiting_callback',
    result: {
      ...(typeof one.result === 'object' && one.result !== null ? one.result : { data: one.result }),
      note: 'XHS infographic generation is async. Use the returned taskId in NexTide UI/API to inspect generated cards when callback completes.',
    },
    statusCommand: buildCommand(input.runId, 'status'),
    resultCommand: buildCommand(input.runId, 'result'),
  };
}

async function runXhsStyleExtract(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  capability: AgentCapabilityDefinition;
  payload: Record<string, unknown>;
  authHeaders?: Headers;
}): Promise<AgentCapabilityRunResult> {
  const referenceImages = pickStringArray(input.payload.referenceImages || input.payload.images || input.payload.imageUrls);
  const firstImage = referenceImages[0] || pickString(input.payload.referenceImage || input.payload.image || input.payload.imageUrl);
  if (!firstImage) {
    return failedResult({
      runId: input.runId,
      capabilityId: input.capability.id,
      mode: input.mode,
      code: 'invalid_input',
      message: 'referenceImages[0] or image is required',
    });
  }

  let fileBlob: Blob;
  let filename = pickString(input.payload.filename) || 'style-reference.png';
  try {
    const loaded = await loadImageAsBlob(firstImage);
    fileBlob = loaded.blob;
    filename = pickString(input.payload.filename) || loaded.filename || filename;
  } catch (error) {
    return failedResult({
      runId: input.runId,
      capabilityId: input.capability.id,
      mode: input.mode,
      code: 'invalid_input',
      message: error instanceof Error ? error.message : 'Failed to load reference image',
    });
  }

  const formData = new FormData();
  formData.set('file', fileBlob, filename);
  formData.set('name', pickString(input.payload.styleName || input.payload.name) || path.parse(filename).name || 'Agent 风格');
  formData.set('type', pickString(input.payload.type) || 'xhs-visual');
  const description = pickString(input.payload.description || input.payload.styleGoal);
  if (description) formData.set('description', description);
  const sceneType = pickString(input.payload.sceneType);
  if (sceneType) formData.set('sceneType', sceneType);
  const styleGoal = pickString(input.payload.styleGoal);
  if (styleGoal) formData.set('styleGoal', styleGoal);
  if (input.payload.spec && typeof input.payload.spec === 'object') {
    formData.set('spec', JSON.stringify(input.payload.spec));
  }

  const baseUrl = process.env.NEXTIDE_INTERNAL_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const url = new URL(input.capability.internalApiPath || '/api/assets/styles/upload', baseUrl);
  const headers = new Headers();
  const forwardHeaders = ['authorization', 'cookie', 'x-user-api-key', 'x-nexapi-key'];
  for (const key of forwardHeaders) {
    const value = input.authHeaders?.get(key);
    if (value) headers.set(key, value);
  }

  const started = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
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
        : `Style upload API returned ${response.status}`,
      details: data,
    });
  }

  return {
    runId: input.runId,
    capabilityId: input.capability.id,
    mode: input.mode,
    status: 'waiting_callback',
    createdAt: input.createdAt,
    finishedAt: nowIso(),
    result: {
      ...(typeof data === 'object' && data !== null ? data : { data }),
      note: 'Style extraction is async. The style preset is created immediately; Style DNA is written back after the n8n callback completes.',
    },
    artifacts: extractStyleArtifacts(data),
    usage: {
      provider: 'internal_api',
      durationMs: Date.now() - started,
    },
    error: null,
    statusCommand: buildCommand(input.runId, 'status'),
    resultCommand: buildCommand(input.runId, 'result'),
  };
}

async function runXhsNoteCollect(input: {
  runId: string;
  mode: AgentCapabilityRunMode;
  createdAt: string;
  capability: AgentCapabilityDefinition;
  payload: Record<string, unknown>;
  authHeaders?: Headers;
}): Promise<AgentCapabilityRunResult> {
  const source = pickString(input.payload.source || 'url') || 'url';
  if (source !== 'url') {
    return failedResult({
      runId: input.runId,
      capabilityId: input.capability.id,
      mode: input.mode,
      code: 'capability_unavailable',
      message: 'xhs.note.collect MVP currently supports source=url only. Keyword search collection is registered but not wired yet.',
    });
  }

  const urls = pickStringArray(input.payload.urls);
  const singleUrl = pickString(input.payload.url || input.payload.sourceUrl || input.payload.source_url);
  const urlList = urls.length > 0 ? urls : singleUrl ? [singleUrl] : [];

  if (urlList.length === 0) {
    return failedResult({
      runId: input.runId,
      capabilityId: input.capability.id,
      mode: input.mode,
      code: 'invalid_input',
      message: 'xhs.note.collect requires url or urls[] in MVP.',
    });
  }

  const maxUrls = Math.min(urlList.length, 10);
  const started = Date.now();
  const results = [];
  const errors = [];

  for (const url of urlList.slice(0, maxUrls)) {
    const one = await runInternalApiCapability({
      runId: `${input.runId}_${results.length + errors.length + 1}`,
      mode: input.mode,
      createdAt: input.createdAt,
      capability: input.capability,
      payload: { url },
      authHeaders: input.authHeaders,
    });

    if (one.status === 'failed') {
      errors.push({ url, error: one.error });
    } else {
      results.push({ url, result: one.result });
    }
  }

  const succeeded = results.length > 0;
  return {
    runId: input.runId,
    capabilityId: input.capability.id,
    mode: input.mode,
    status: succeeded ? (errors.length > 0 ? 'succeeded' : 'succeeded') : 'failed',
    createdAt: input.createdAt,
    finishedAt: nowIso(),
    result: {
      source: 'url',
      requested: urlList.length,
      processed: maxUrls,
      items: results,
      errors,
      note: urlList.length > maxUrls ? `MVP processed first ${maxUrls} URLs only.` : undefined,
    },
    artifacts: [],
    usage: {
      provider: 'internal_api',
      durationMs: Date.now() - started,
    },
    error: succeeded ? null : {
      code: 'workflow_failed',
      message: 'All XHS URL collection attempts failed.',
      details: errors,
    },
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

async function loadImageAsBlob(source: string): Promise<{ blob: Blob; filename: string }> {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to download reference image (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    const url = new URL(source);
    const basename = path.basename(url.pathname) || 'style-reference.png';
    return {
      blob: new Blob([arrayBuffer], { type: contentType }),
      filename: basename.includes('.') ? basename : `${basename}.png`,
    };
  }

  const absolutePath = path.resolve(source);
  if (!existsSync(absolutePath)) {
    throw new Error(`Reference image not found: ${absolutePath}`);
  }

  const buffer = await readFile(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const contentType = extension === '.jpg' || extension === '.jpeg'
    ? 'image/jpeg'
    : extension === '.webp'
      ? 'image/webp'
      : extension === '.gif'
        ? 'image/gif'
        : 'image/png';
  return {
    blob: new Blob([buffer], { type: contentType }),
    filename: path.basename(absolutePath),
  };
}

function extractStyleArtifacts(data: unknown): AgentCapabilityRunResult['artifacts'] {
  const payload = (data as { data?: { previewUpload?: unknown; previewUrl?: unknown; thumbnailUrl?: unknown; id?: unknown; name?: unknown } } | null)?.data;
  if (!payload) return [];
  const artifacts: NonNullable<AgentCapabilityRunResult['artifacts']> = [];
  if (typeof payload.previewUpload === 'string') {
    artifacts.push({ type: 'image', url: payload.previewUpload, name: 'style-reference-upload' });
  }
  if (typeof payload.previewUrl === 'string' && payload.previewUrl !== payload.previewUpload) {
    artifacts.push({ type: 'image', url: payload.previewUrl, name: 'style-preview' });
  }
  if (typeof payload.thumbnailUrl === 'string') {
    artifacts.push({ type: 'image', url: payload.thumbnailUrl, name: 'style-thumbnail' });
  }
  return artifacts;
}

function extractArtifacts(capabilityId: string, data: unknown): AgentCapabilityRunResult['artifacts'] {
  if (capabilityId !== 'xhs.card.layout') return [];
  const payload = (data as { data?: { images?: unknown; title?: unknown; templateId?: unknown; taskId?: unknown } } | null)?.data;
  const images = payload?.images;
  if (!Array.isArray(images)) return [];
  const title = pickString(payload?.title);
  const templateId = pickString(payload?.templateId);
  const taskId = pickString(payload?.taskId);
  return images
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
    .map((url, index) => ({
      type: 'image',
      url,
      name: `xhs-card-${index + 1}.png`,
      mimeType: 'image/png',
      metadata: {
        page: index + 1,
        pageCount: images.length,
        title: title || undefined,
        templateId: templateId || undefined,
        taskId: taskId || undefined,
        capabilityId,
      },
    }));
}
