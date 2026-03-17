
'use server';

import { createDigitalHumanJob, type DigitalHumanMode } from '@/lib/digitalHumanJob';

export async function createDigitalHumanVideo(formData: FormData) {
  const type = formData.get('type') as DigitalHumanMode | null;
  const imageUrl = formData.get('imageUrl') as string | null;
  const audioUrl = formData.get('audioUrl') as string | null;
  const emoAudioUrl = (formData.get('emoAudioUrl') as string | null) || undefined;
  const script = (formData.get('script') as string | null) || undefined;
  const duration = formData.get('duration');
  const userId = (formData.get('userId') as string | null) || undefined;
  const rawSourceTaskId = (formData.get('sourceTaskId') as string | null)?.trim();
  const sourceTaskId = rawSourceTaskId && rawSourceTaskId.length > 0 ? rawSourceTaskId : undefined;

  if (!type || !imageUrl || !audioUrl) {
    throw new Error('Missing required fields');
  }

  const parsedDuration = duration != null ? Number(duration) : NaN;
  const durationSeconds =
    Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null;

  await createDigitalHumanJob({
    type,
    imageUrl,
    audioUrl,
    script,
    emoAudioUrl,
    durationSeconds,
    userId,
    sourceTaskId,
  });

  return { success: true };
}
