
'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function createDigitalHumanVideo(formData: FormData) {
  const type = formData.get('type') as string;
  const imageUrl = formData.get('imageUrl') as string;
  const audioUrl = formData.get('audioUrl') as string;
  const script = formData.get('script') as string | null;

  if (!type || !imageUrl || !audioUrl) {
    throw new Error('Missing required fields');
  }

  // Create Record
  await prisma.digitalHumanVideo.create({
    data: {
      type,
      imageUrl,
      audioUrl,
      scriptContent: script || '',
      status: 'GENERATING',
    }
  });

  // Trigger N8N Webhook (TODO: Add real webhook call)
  // await fetch(process.env.N8N_DIGITAL_HUMAN_WEBHOOK!, { ... });

  revalidatePath('/my-videos');
  return { success: true };
}
