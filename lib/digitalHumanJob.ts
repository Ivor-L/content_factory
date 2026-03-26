import prisma from '@/lib/prisma';
import { parseMetadata } from '@/lib/creativeTaskService';
import { setTaskActionStatus } from '@/lib/creativeTaskUtils';
import { toInputJson } from '@/lib/jsonUtils';
import { syncTaskToSummary } from '@/lib/taskSummary';

export type DigitalHumanMode = 'LIP_SYNC' | 'VOICE_CLONE';

export interface CreateDigitalHumanJobOptions {
  type: DigitalHumanMode;
  imageUrl: string;
  audioUrl: string;
  script?: string | null;
  emoAudioUrl?: string | null;
  durationSeconds?: number | null;
  userId?: string | null;
  sourceTaskId?: string | null;
}

function estimateCreditsWorkflow(durationSeconds?: number | null) {
  if (durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds <= 15) {
    return 'flow_digital_human16s';
  }
  return 'flow_digital_human';
}

export async function createDigitalHumanJob(options: CreateDigitalHumanJobOptions) {
  const {
    type,
    imageUrl,
    audioUrl,
    script,
    emoAudioUrl,
    durationSeconds,
    userId,
    sourceTaskId,
  } = options;

  if (!type || !imageUrl || !audioUrl) {
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
        imageUrl,
        audioUrl,
        scriptContent: script || '',
        status: 'GENERATING',
        userId: userId ?? undefined,
        durationSeconds: durationSeconds ?? undefined,
        workflowId: workflowIdForCredits,
        sourceTaskId: sourceTask?.id ?? undefined,
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
    const audioDuration = durationSeconds ?? 0;

    let payload: Record<string, any> = {
      task_id: digitalHuman.id,
      type,
      image_url: imageUrl,
      timestamp: new Date().toISOString(),
      api_key: apiKey,
      workflow_id: workflowIdForCredits,
      audio_duration: audioDuration,
    };

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
      fetch(webhookUrl, {
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
