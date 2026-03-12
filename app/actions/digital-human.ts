
'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function createDigitalHumanVideo(formData: FormData) {
  const type = formData.get('type') as string;
  const imageUrl = formData.get('imageUrl') as string;
  const audioUrl = formData.get('audioUrl') as string;
  const emoAudioUrl = formData.get('emoAudioUrl') as string | null;
  const script = formData.get('script') as string | null;
  const duration = formData.get('duration');
  const userId = formData.get('userId') as string | null;

  if (!type || !imageUrl || !audioUrl) {
    throw new Error('Missing required fields');
  }

  // Look up the user's API key (the webhook requires api_key for credit billing).
  // Falling back to DEFAULT_USER_API_KEY allows ops to configure a shared key for legacy users.
  let apiKey: string | null =
    userId
      ? (await prisma.profiles.findUnique({
          where: { id: userId },
          select: { api_key: true },
        }))?.api_key ?? null
      : null;
  if (!apiKey) {
    apiKey = process.env.DEFAULT_USER_API_KEY || null;
  }
  if (!apiKey) {
    throw new Error(
      'No api_key found for this user. Please configure an API key in profiles or set DEFAULT_USER_API_KEY.'
    );
  }

  // Create Record
  const digitalHuman = await prisma.digitalHumanVideo.create({
    data: {
      type,
      imageUrl,
      audioUrl,
      scriptContent: script || '',
      status: 'GENERATING',
      userId: userId, // Save user ID
    }
  });

  // Trigger N8N Webhook
  const webhookUrl = process.env.N8N_DIGITAL_HUMAN_WEBHOOK || 'https://hooks.atomx.top/webhook/digital-human-gen';
  
  try {
    // Construct payload
    let payload: any = {
      task_id: digitalHuman.id,
      type,
      image_url: imageUrl,
      timestamp: new Date().toISOString(),
      flow: "flow_Digital_Human",
      api_key: apiKey,
    };

    const audioDuration = duration ? parseFloat(duration.toString()) : 0;

    if (type === 'LIP_SYNC') {
      payload = {
        ...payload,
        audio_url: audioUrl,
        audio_duration: audioDuration,
      };
    } else if (type === 'VOICE_CLONE') {
      payload = {
        ...payload,
        voice_ref_audio_url: audioUrl,
        script_content: script,
        audio_duration: audioDuration,
      };
      
      if (emoAudioUrl) {
          payload.emo_ref_audio_url = emoAudioUrl;
      }
    }

    console.log(`Triggering Digital Human workflow (${webhookUrl}) for task ${digitalHuman.id}`);

    // Fire and forget (async trigger)
    fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).catch(err => {
      console.error('Failed to trigger N8N webhook (async catch):', err);
    });
    
  } catch (error) {
    console.error('Failed to prepare N8N webhook call:', error);
    // Don't fail the action, just log it. The user will see "Generating" but it might get stuck if webhook failed.
    // In production, we might want to update status to FAILED here.
  }

  revalidatePath('/my-videos');
  return { success: true };
}
