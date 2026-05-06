import prisma from '@/lib/prisma';
import type { AgentCapabilityRunResult, AgentCapabilityRunStatus } from '@/lib/agent-capabilities/types';
import { updateAgentCapabilityRunFromResult } from './store';

interface ResolveInput {
  runId: string;
  capabilityId: string;
  mode: 'wait' | 'submit';
  createdAt: Date;
  businessType?: string | null;
  businessId?: string | null;
  businessTaskId?: string | null;
  result?: unknown;
  artifacts?: unknown;
  usage?: unknown;
  error?: unknown;
}

function mapStatus(raw: unknown): AgentCapabilityRunStatus {
  const status = String(raw || '').toUpperCase();
  if (['COMPLETED', 'COMPLETE', 'SUCCEEDED', 'SUCCESS', 'DONE', 'FINISHED'].includes(status)) return 'succeeded';
  if (['FAILED', 'ERROR', 'CANCELLED'].includes(status)) return status === 'CANCELLED' ? 'cancelled' : 'failed';
  if (['TIMEOUT', 'TIMED_OUT'].includes(status)) return 'timeout';
  return 'waiting_callback';
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function videoArtifact(url: unknown, name: string) {
  return typeof url === 'string' && url ? [{ type: 'video', url, name }] : [];
}

function imageArtifacts(urls: unknown): Array<{ type: string; url: string; name: string }> {
  if (!Array.isArray(urls)) return [];
  return urls
    .map((item) => {
      if (typeof item === 'string') return item;
      const record = asRecord(item);
      return typeof record.url === 'string' ? record.url : '';
    })
    .filter((url): url is string => Boolean(url))
    .map((url, index) => ({ type: 'image', url, name: `image-${index + 1}.png` }));
}

function styleProcessingStatus(style: { metadata?: unknown }): string {
  const metadata = asRecord(style.metadata);
  return String(metadata.processingStatus || asRecord(metadata.workflow).status || 'UNKNOWN');
}

export async function resolveBusinessStatus(input: ResolveInput): Promise<AgentCapabilityRunResult> {
  if (!input.businessType || !input.businessId) {
    return {
      runId: input.runId,
      capabilityId: input.capabilityId,
      mode: input.mode,
      status: 'waiting_callback',
      createdAt: input.createdAt.toISOString(),
      result: input.result,
      artifacts: Array.isArray(input.artifacts) ? input.artifacts as AgentCapabilityRunResult['artifacts'] : [],
      usage: asRecord(input.usage) as AgentCapabilityRunResult['usage'],
      error: asRecord(input.error) as AgentCapabilityRunResult['error'] || null,
      statusCommand: `nextide run status ${input.runId}`,
      resultCommand: `nextide run result ${input.runId} --output result.json`,
    };
  }

  if (input.businessType === 'digitalHumanVideo') {
    const video = await prisma.digitalHumanVideo.findUnique({ where: { id: input.businessId } });
    if (!video) return missingBusiness(input);
    const status = mapStatus(video.status);
    const result = { data: video, business: { type: input.businessType, id: input.businessId, status: video.status } };
    const run = buildResolvedRun(input, status, result, videoArtifact(video.resultUrl, 'digital-human.mp4'));
    await updateAgentCapabilityRunFromResult(run, { businessType: input.businessType, businessId: input.businessId, businessStatus: video.status });
    return run;
  }

  if (input.businessType === 'creativeTask') {
    const task = await prisma.creativeTask.findUnique({ where: { id: input.businessId } });
    if (!task) return missingBusiness(input);
    const metadata = asRecord(task.metadata);
    const custom = asRecord(metadata.custom);
    const generatedImages = task.generatedImagesJson;
    const t2vStoryboardId = typeof custom.t2v_storyboard_id === 'string' ? custom.t2v_storyboard_id : '';
    const rawStatus = custom.t2v_status || task.status || task.stage;
    const status = task.errorMessage ? 'failed' : mapStatus(rawStatus);
    const result = { data: task, business: { type: input.businessType, id: input.businessId, status: rawStatus, storyboardTaskId: t2vStoryboardId || undefined } };
    const artifacts = imageArtifacts(generatedImages);
    const run = buildResolvedRun(input, status, result, artifacts);
    await updateAgentCapabilityRunFromResult(run, { businessType: input.businessType, businessId: input.businessId, businessStatus: String(rawStatus || '') });
    return run;
  }

  if (input.businessType === 'storyboardTask') {
    const task = await prisma.storyboardTask.findUnique({ where: { id: input.businessId }, include: { segments: true } });
    if (!task) return missingBusiness(input);
    const status = task.finalVideoUrl ? 'succeeded' : mapStatus(task.status);
    const result = { data: task, business: { type: input.businessType, id: input.businessId, status: task.status } };
    const run = buildResolvedRun(input, status, result, videoArtifact(task.finalVideoUrl, 'storyboard-video.mp4'));
    await updateAgentCapabilityRunFromResult(run, { businessType: input.businessType, businessId: input.businessId, businessStatus: task.status });
    return run;
  }

  if (input.businessType === 'taskSummary') {
    const summary = await prisma.taskSummary.findUnique({ where: { taskType_taskId: { taskType: input.capabilityId, taskId: input.businessId } } }).catch(() => null);
    if (!summary) return missingBusiness(input);
    const status = mapStatus(summary.status);
    const result = { data: summary, business: { type: input.businessType, id: input.businessId, status: summary.status } };
    const run = buildResolvedRun(input, status, result, []);
    await updateAgentCapabilityRunFromResult(run, { businessType: input.businessType, businessId: input.businessId, businessStatus: summary.status });
    return run;
  }

  if (input.businessType === 'stylePreset') {
    const style = await prisma.stylePreset.findUnique({ where: { id: input.businessId } });
    if (!style) return missingBusiness(input);
    const rawStatus = styleProcessingStatus(style);
    const status = mapStatus(rawStatus);
    const result = { data: style, business: { type: input.businessType, id: input.businessId, status: rawStatus } };
    const artifacts = style.previewUrl ? [{ type: 'image', url: style.previewUrl, name: 'style-reference.png' }] : [];
    const run = buildResolvedRun(input, status, result, artifacts);
    await updateAgentCapabilityRunFromResult(run, { businessType: input.businessType, businessId: input.businessId, businessStatus: rawStatus });
    return run;
  }

  if (input.businessType === 'socialCollection') {
    const since = input.createdAt;
    const imported = await prisma.viralReferenceItem.findMany({
      where: {
        platform: input.businessId || undefined,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const stillWaiting = imported.length === 0 && Date.now() - since.getTime() < 1000 * 60 * 60;
    const status: AgentCapabilityRunStatus = stillWaiting ? 'waiting_callback' : 'succeeded';
    const result = {
      data: {
        importedCount: imported.length,
        items: imported,
      },
      business: {
        type: input.businessType,
        id: input.businessId,
        taskId: input.businessTaskId,
        status: status === 'succeeded' ? 'imported_or_timeout_no_data' : 'waiting_callback',
      },
    };
    const run = buildResolvedRun(input, status, result, []);
    await updateAgentCapabilityRunFromResult(run, {
      businessType: input.businessType,
      businessId: input.businessId || undefined,
      businessTaskId: input.businessTaskId || undefined,
      businessStatus: status,
    });
    return run;
  }

  if (input.businessType === 'imageTextReplicationTask') {
    const task = await prisma.imageTextReplicationTask.findUnique({ where: { id: input.businessId } });
    if (!task) return missingBusiness(input);
    const status = task.errorMessage ? 'failed' : mapStatus(task.status);
    const result = { data: task, business: { type: input.businessType, id: input.businessId, status: task.status } };
    const run = buildResolvedRun(input, status, result, imageArtifacts(task.generatedImages));
    await updateAgentCapabilityRunFromResult(run, { businessType: input.businessType, businessId: input.businessId, businessStatus: task.status });
    return run;
  }

  return buildResolvedRun(input, 'waiting_callback', {
    data: input.result,
    business: { type: input.businessType, id: input.businessId, status: 'unknown_business_type' },
  }, []);
}

function buildResolvedRun(
  input: ResolveInput,
  status: AgentCapabilityRunStatus,
  result: unknown,
  artifacts: AgentCapabilityRunResult['artifacts'],
): AgentCapabilityRunResult {
  return {
    runId: input.runId,
    capabilityId: input.capabilityId,
    mode: input.mode,
    status,
    createdAt: input.createdAt.toISOString(),
    finishedAt: ['succeeded', 'failed', 'cancelled', 'timeout'].includes(status) ? new Date().toISOString() : undefined,
    result,
    artifacts,
    usage: asRecord(input.usage) as AgentCapabilityRunResult['usage'],
    error: null,
    statusCommand: status === 'waiting_callback' || status === 'running' || status === 'queued'
      ? `nextide run status ${input.runId}`
      : undefined,
    resultCommand: status === 'waiting_callback' || status === 'running' || status === 'queued'
      ? `nextide run result ${input.runId} --output result.json`
      : undefined,
  };
}

function missingBusiness(input: ResolveInput): AgentCapabilityRunResult {
  return buildResolvedRun(input, 'failed', {
    error: {
      code: 'business_record_not_found',
      message: `Business record ${input.businessType}:${input.businessId} was not found`,
    },
  }, []);
}
