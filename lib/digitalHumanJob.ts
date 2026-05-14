import prisma from '@/lib/prisma';
import { parseMetadata } from '@/lib/creativeTaskService';
import { setTaskActionStatus } from '@/lib/creativeTaskUtils';
import { toInputJson } from '@/lib/jsonUtils';
import { analyzeScriptDuration } from '@/lib/digitalHumanLimits';
import { planDigitalHumanScript } from '@/lib/digitalHumanScript';
import { syncTaskToSummary } from '@/lib/taskSummary';
import sharp from 'sharp';

export type DigitalHumanMode = 'LIP_SYNC' | 'VOICE_CLONE';
export type DigitalHumanSourceType = 'IMAGE' | 'VIDEO';

export interface CreateDigitalHumanJobOptions {
  type: DigitalHumanMode;
  imageUrl?: string | null;
  videoUrl?: string | null;
  sourceType?: DigitalHumanSourceType;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  audioUrl: string;
  script?: string | null;
  emoAudioUrl?: string | null;
  durationSeconds?: number | null;
  userId?: string | null;
  sourceTaskId?: string | null;
  createdAt?: Date;
}

export interface CreateDigitalHumanScriptJobsOptions extends CreateDigitalHumanJobOptions {
  splitIfNeeded?: boolean;
}

function estimateCreditsWorkflow(durationSeconds?: number | null) {
  if (durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds <= 15) {
    return 'flow_digital_human16s';
  }
  return 'flow_digital_human';
}

function normalizeDimension(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function roundToMultiple(value: number, multiple: number) {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

function computeWan480pSize(sourceWidth: number, sourceHeight: number) {
  const baseArea = 832 * 480;
  const aspectRatio = sourceWidth / sourceHeight;
  const targetWidth = roundToMultiple(Math.sqrt(baseArea * aspectRatio), 16);
  const targetHeight = roundToMultiple(Math.sqrt(baseArea / aspectRatio), 16);

  return {
    aspectRatio,
    targetWidth,
    targetHeight,
  };
}

async function probeImageDimensions(imageUrl: string): Promise<{ width: number; height: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(imageUrl, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.toLowerCase().startsWith('image/')) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    const width = normalizeDimension(metadata.width ?? null);
    const height = normalizeDimension(metadata.height ?? null);
    if (!width || !height) return null;

    return { width, height };
  } catch (error) {
    console.warn('Failed to probe digital human source image dimensions', {
      imageUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveSourceDimensions(options: {
  sourceType: DigitalHumanSourceType;
  sourceUrl: string;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
}) {
  const providedWidth = normalizeDimension(options.sourceWidth);
  const providedHeight = normalizeDimension(options.sourceHeight);
  if (providedWidth && providedHeight) {
    return { width: providedWidth, height: providedHeight, source: 'client' as const };
  }

  if (options.sourceType === 'IMAGE') {
    const probed = await probeImageDimensions(options.sourceUrl);
    if (probed) {
      return { ...probed, source: 'server_probe' as const };
    }
  }

  return null;
}

export async function createDigitalHumanJob(options: CreateDigitalHumanJobOptions) {
  const {
    type,
    imageUrl,
    videoUrl,
    sourceType,
    sourceWidth,
    sourceHeight,
    audioUrl,
    script,
    emoAudioUrl,
    durationSeconds,
    userId,
    sourceTaskId,
    createdAt,
  } = options;
  const resolvedSourceType: DigitalHumanSourceType = sourceType === 'VIDEO' ? 'VIDEO' : 'IMAGE';
  const normalizedImageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  const normalizedVideoUrl = typeof videoUrl === 'string' ? videoUrl.trim() : '';
  const resolvedSourceUrl =
    resolvedSourceType === 'VIDEO'
      ? (normalizedVideoUrl || normalizedImageUrl)
      : (normalizedImageUrl || normalizedVideoUrl);

  if (!type || !audioUrl || !resolvedSourceUrl) {
    throw new Error('Missing required fields for digital human job');
  }
  if (type === 'VOICE_CLONE' && !script) {
    throw new Error('VOICE_CLONE mode requires script content');
  }

  let apiKey: string | null = null;
  if (userId) {
    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      select: { api_key: true },
    });
    apiKey = profile?.api_key ?? null;
  }
  if (!apiKey) {
    apiKey = process.env.DEFAULT_USER_API_KEY || null;
  }
  if (!apiKey) {
    throw new Error('No api_key found for this user. Please configure an API key in profiles or set DEFAULT_USER_API_KEY.');
  }

  const normalizedSourceTaskId =
    typeof sourceTaskId === 'string' && sourceTaskId.trim().length > 0 ? sourceTaskId.trim() : '';
  let sourceTask: { id: string; metadata: any } | null = null;
  if (normalizedSourceTaskId) {
    if (!userId) {
      throw new Error('sourceTaskId requires authenticated user context');
    }
    sourceTask = await prisma.creativeTask.findFirst({
      where: { id: normalizedSourceTaskId, userId },
      select: { id: true, metadata: true },
    });
    if (!sourceTask) {
      throw new Error('Creative task not found for digital human generation');
    }
  }

  let sourceTaskMetadata = sourceTask ? parseMetadata(sourceTask.metadata) : null;
  const updateDigitalHumanStatus = async (
    status: 'pending' | 'ready' | 'error',
    videoId?: string,
    errorMessage?: string
  ) => {
    if (!sourceTask || !sourceTaskMetadata) return;
    try {
      sourceTaskMetadata = setTaskActionStatus(sourceTaskMetadata, 'digitalHuman', {
        status,
        jobId: videoId,
        error: errorMessage,
      });
      await prisma.creativeTask.update({
        where: { id: sourceTask.id },
        data: { metadata: toInputJson(sourceTaskMetadata) ?? undefined },
      });
    } catch (metaError) {
      console.error('Failed to update digital human action status', {
        taskId: sourceTask.id,
        status,
        metaError,
      });
    }
  };

  const workflowIdForCredits = estimateCreditsWorkflow(durationSeconds);

  try {
    const digitalHuman = await prisma.digitalHumanVideo.create({
      data: {
        type,
        imageUrl: resolvedSourceUrl,
        audioUrl,
        scriptContent: script || '',
        status: 'GENERATING',
        userId: userId ?? undefined,
        durationSeconds: durationSeconds ?? undefined,
        workflowId: workflowIdForCredits,
        sourceTaskId: sourceTask?.id ?? undefined,
        createdAt: createdAt ?? undefined,
      },
    });

    await syncTaskToSummary({
      taskType: 'digitalHuman',
      taskId: digitalHuman.id,
      operation: 'create',
    });

    if (sourceTask) {
      await updateDigitalHumanStatus('pending', digitalHuman.id);
    }

    const webhookUrl = process.env.N8N_DIGITAL_HUMAN_WEBHOOK || 'https://hooks.atomx.top/webhook/digital-human-gen';
    const videoWebhookUrl =
      process.env.N8N_DIGITAL_HUMAN_VIDEO_WEBHOOK || 'https://hooks.atomx.top/webhook/digital-human-video-lipsync-gen';
    const targetWebhookUrl = resolvedSourceType === 'VIDEO' ? videoWebhookUrl : webhookUrl;
    const audioDuration = durationSeconds ?? 0;
    const sourceDimensions = await resolveSourceDimensions({
      sourceType: resolvedSourceType,
      sourceUrl: resolvedSourceUrl,
      sourceWidth,
      sourceHeight,
    });
    const outputDimensions = sourceDimensions
      ? computeWan480pSize(sourceDimensions.width, sourceDimensions.height)
      : null;

    let payload: Record<string, any> = {
      task_id: digitalHuman.id,
      type,
      source_type: resolvedSourceType,
      timestamp: new Date().toISOString(),
      api_key: apiKey,
      workflow_id: workflowIdForCredits,
      audio_duration: audioDuration,
    };
    if (sourceDimensions && outputDimensions) {
      payload = {
        ...payload,
        source_width: sourceDimensions.width,
        source_height: sourceDimensions.height,
        source_dimensions_source: sourceDimensions.source,
        aspect_ratio: Number(outputDimensions.aspectRatio.toFixed(6)),
        target_width: outputDimensions.targetWidth,
        target_height: outputDimensions.targetHeight,
        comfy_width_node_id: 327,
        comfy_height_node_id: 326,
      };
    }
    if (resolvedSourceType === 'VIDEO') {
      payload.video_url = resolvedSourceUrl;
    } else {
      payload.image_url = resolvedSourceUrl;
    }

    if (type === 'LIP_SYNC') {
      payload = {
        ...payload,
        audio_url: audioUrl,
      };
    } else if (type === 'VOICE_CLONE') {
      payload = {
        ...payload,
        voice_ref_audio_url: audioUrl,
        script_content: script,
      };
      if (emoAudioUrl) {
        payload.emo_ref_audio_url = emoAudioUrl;
      }
    }

    try {
      fetch(targetWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.error('Failed to trigger N8N webhook (async catch):', err);
      });
    } catch (error) {
      console.error('Failed to dispatch digital human webhook:', error);
    }

    return digitalHuman;
  } catch (error) {
    if (sourceTask) {
      await updateDigitalHumanStatus(
        'error',
        undefined,
        error instanceof Error ? error.message : 'Failed to create digital human job'
      );
    }
    throw error;
  }
}

export async function createDigitalHumanJobs(options: CreateDigitalHumanScriptJobsOptions) {
  const { splitIfNeeded = true, script, type } = options;
  const shouldSplit = splitIfNeeded && type === 'VOICE_CLONE' && typeof script === 'string';
  const plan = shouldSplit
    ? planDigitalHumanScript(script || '')
    : {
        normalizedScript: typeof script === 'string' ? script.trim() : '',
        chunks: [typeof script === 'string' ? script.trim() : ''].filter((chunk) => chunk.length > 0),
        stats: null,
        isSplit: false,
      };

  const splitChunks = type === 'VOICE_CLONE' ? plan.chunks : [];
  const jobChunks = type === 'VOICE_CLONE' ? plan.chunks : [undefined];

  if (type === 'VOICE_CLONE' && splitChunks.length === 0) {
    throw new Error('VOICE_CLONE mode requires script content');
  }

  const jobs: Awaited<ReturnType<typeof createDigitalHumanJob>>[] = [];
  const batchCreatedAt = new Date();
  const totalChunks = jobChunks.length;
  for (const [chunkIndex, chunk] of jobChunks.entries()) {
    const chunkDurationSeconds =
      type === 'VOICE_CLONE' && typeof chunk === 'string'
        ? analyzeScriptDuration(chunk).estimatedSeconds
        : options.durationSeconds ?? null;
    const segmentPrefix =
      type === 'VOICE_CLONE' && totalChunks > 1 && typeof chunk === 'string'
        ? `第 ${chunkIndex + 1}/${totalChunks} 段\n`
        : '';
    const orderedCreatedAt =
      totalChunks > 1
        ? new Date(batchCreatedAt.getTime() - chunkIndex)
        : undefined;
    const job = await createDigitalHumanJob({
      ...options,
      durationSeconds: chunkDurationSeconds,
      script: type === 'VOICE_CLONE' ? chunk : undefined,
      createdAt: orderedCreatedAt,
    });
    if (segmentPrefix && typeof chunk === 'string') {
      const scriptContent = `${segmentPrefix}${chunk}`;
      const updatedJob = await prisma.digitalHumanVideo.update({
        where: { id: job.id },
        data: { scriptContent },
      });
      await syncTaskToSummary({
        taskType: 'digitalHuman',
        taskId: updatedJob.id,
        operation: 'update',
      });
      jobs.push(updatedJob);
      continue;
    }
    jobs.push(job);
  }

  return {
    jobs,
    chunks: splitChunks,
    stats: plan.stats,
    isSplit: type === 'VOICE_CLONE' ? plan.isSplit : false,
  };
}
