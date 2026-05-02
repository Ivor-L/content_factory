import prisma from '@/lib/prisma';
import { emitStoryboardTaskUpsert } from '@/lib/storyboardEvents';
import { syncTaskToSummary } from '@/lib/taskSummary';
import {
  getStoryboardWorkflowProfile,
  isStoryboardPipelineKey,
  type StoryboardPipelineKey,
} from '@/lib/storyboard/workflowProfiles';

const APP_BASE_URL = (
  process.env.N8N_CALLBACK_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  'http://localhost:3000'
).replace(/\/$/, '');

export interface StoryboardJobRequest {
  pipelineKey: StoryboardPipelineKey;
  userId?: string | null;
  apiKey: string;
  title?: string;
  script?: string;
  creativeTaskId?: string;
  metadata?: Record<string, unknown>;
  source?: string;
  statusOnCreate?: string;
  progressOnCreate?: number;
  taskData?: Record<string, unknown>;
  payloadData?: Record<string, unknown>;
}

export interface StoryboardJobResult {
  taskId: string;
  status: string;
  pipelineKey: StoryboardPipelineKey;
  workflowId: string;
}

export function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseStoryboardJobBody(body: unknown): {
  pipelineKey: StoryboardPipelineKey;
  title: string;
  script: string;
  creativeTaskId: string;
  productId: string;
  metadata: Record<string, unknown>;
  source: string;
} | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const input = body as Record<string, unknown>;
  const pipelineRaw = readString(input.pipeline_key || input.pipelineKey || 'script_to_storyboard');
  const pipelineKey = isStoryboardPipelineKey(pipelineRaw) ? pipelineRaw : null;
  if (!pipelineKey) return null;

  const title = readString(input.title);
  const script = readString(input.script || input.script_content || input.scriptContent);
  const creativeTaskId = readString(input.creativeTaskId || input.creative_task_id);
  const productId = readString(input.product_id || input.productId);
  const source = readString(input.source);
  const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
    ? (input.metadata as Record<string, unknown>)
    : {};

  return { pipelineKey, title, script, creativeTaskId, productId, metadata, source };
}

function buildN8nPayload(input: {
  taskId: string;
  request: StoryboardJobRequest;
  callbackUrl: string;
  workflowId: string;
  workflowName: string;
}) {
  const { taskId, request, callbackUrl, workflowId, workflowName } = input;
  const script = readString(request.script);
  const title = readString(request.title);
  const source = readString(request.source);

  return {
    task_id: taskId,
    taskId,
    record_id: taskId,
    recordId: taskId,
    api_key: request.apiKey,
    apiKey: request.apiKey,
    workflow_id: workflowId,
    workflowId: workflowId,
    workflow_name: workflowName,
    workflowName,
    app_url: APP_BASE_URL,
    callback_url: callbackUrl,
    callbackUrl: callbackUrl,
    admin_token: process.env.ADMIN_TOKEN,
    adminToken: process.env.ADMIN_TOKEN,
    script,
    script_content: script,
    scriptContent: script,
    title,
    creative_task_id: readString(request.creativeTaskId) || undefined,
    source: source || undefined,
    metadata: request.metadata || undefined,
    pipeline_key: request.pipelineKey,
    ...(request.payloadData || {}),
  };
}

export async function createStoryboardJob(request: StoryboardJobRequest): Promise<StoryboardJobResult> {
  const profile = getStoryboardWorkflowProfile(request.pipelineKey);

  const task = await prisma.storyboardTask.create({
    data: {
      status: request.statusOnCreate || 'ANALYZING',
      scriptContent: readString(request.script),
      userId: request.userId || undefined,
      progress: Number.isFinite(request.progressOnCreate) ? Number(request.progressOnCreate) : 5,
      detailedBreakdown: {
        pipeline_key: request.pipelineKey,
        source: request.source || profile.defaultSource,
        metadata: request.metadata || {},
      },
      ...(request.taskData || {}),
    } as any,
  });

  await syncTaskToSummary({ taskType: 'storyboard', taskId: task.id, operation: 'create' });
  emitStoryboardTaskUpsert(task);

  const syncedTask = await prisma.storyboardTask.update({
    where: { id: task.id },
    data: { taskId: task.id },
  });
  emitStoryboardTaskUpsert(syncedTask);

  const callbackUrl = `${APP_BASE_URL}${profile.callbackPath}`;
  const payload = buildN8nPayload({
    taskId: task.id,
    request,
    callbackUrl,
    workflowId: profile.workflowId,
    workflowName: profile.workflowName,
  });

  try {
    const response = await fetch(profile.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`n8n webhook failed: ${response.status} ${text}`);
    }
  } catch (error) {
    const failedTask = await prisma.storyboardTask.update({
      where: { id: task.id },
      data: { status: 'FAILED', progress: 0 },
    });
    emitStoryboardTaskUpsert(failedTask);
    throw error;
  }

  return {
    taskId: syncedTask.id,
    status: syncedTask.status,
    pipelineKey: request.pipelineKey,
    workflowId: profile.workflowId,
  };
}
