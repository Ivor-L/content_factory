
'use server';

import { createDigitalHumanJobs, type DigitalHumanMode } from '@/lib/digitalHumanJob';
import { getServerRequestUserContext } from '@/lib/serverRequestContext';

export async function createDigitalHumanVideo(formData: FormData) {
  const type = formData.get('type') as DigitalHumanMode | null;
  const imageUrl = formData.get('imageUrl') as string | null;
  const audioUrl = formData.get('audioUrl') as string | null;
  const emoAudioUrl = (formData.get('emoAudioUrl') as string | null) || undefined;
  const script = (formData.get('script') as string | null) || undefined;
  const duration = formData.get('duration');
  const rawSourceWidth = formData.get('sourceWidth');
  const rawSourceHeight = formData.get('sourceHeight');
  const clientUserId = (formData.get('userId') as string | null) || undefined;
  const rawSourceTaskId = (formData.get('sourceTaskId') as string | null)?.trim();
  const sourceTaskId = rawSourceTaskId && rawSourceTaskId.length > 0 ? rawSourceTaskId : undefined;

  if (!type || !imageUrl || !audioUrl) {
    throw new Error('Missing required fields');
  }

  // Fallback to server-side session user to avoid client race conditions.
  const { userId: requestUserId } = await getServerRequestUserContext();
  const userId = clientUserId || requestUserId || undefined;

  const parsedDuration = duration != null ? Number(duration) : NaN;
  const durationSeconds =
    Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null;
  const parsedSourceWidth = rawSourceWidth != null ? Number(rawSourceWidth) : NaN;
  const parsedSourceHeight = rawSourceHeight != null ? Number(rawSourceHeight) : NaN;
  const sourceWidth =
    Number.isFinite(parsedSourceWidth) && parsedSourceWidth > 0 ? parsedSourceWidth : null;
  const sourceHeight =
    Number.isFinite(parsedSourceHeight) && parsedSourceHeight > 0 ? parsedSourceHeight : null;

  const result = await createDigitalHumanJobs({
    type,
    imageUrl,
    sourceWidth,
    sourceHeight,
    audioUrl,
    script,
    emoAudioUrl,
    durationSeconds,
    userId,
    sourceTaskId,
  });

  return {
    success: true,
    jobIds: result.jobs.map((job) => job.id),
    jobs: result.jobs.map((job, index) => ({
      id: job.id,
      segmentIndex: result.jobs.length > 1 ? index + 1 : null,
      segmentCount: result.jobs.length > 1 ? result.jobs.length : null,
    })),
    isSplit: result.isSplit,
  };
}
