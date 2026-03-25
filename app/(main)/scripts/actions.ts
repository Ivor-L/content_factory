'use server'

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { breakdownScript } from '@/lib/n8n';
import { getApiKeyForUser } from '@/lib/authServer';

type ScriptPurpose = 'one-click' | 'storyboard' | 'extract-copy';

function normalizeScriptPurpose(value: FormDataEntryValue | null): ScriptPurpose {
  const purpose = String(value || '').trim();
  if (purpose === 'storyboard' || purpose === 'extract-copy') {
    return purpose;
  }
  return 'one-click';
}

export async function createScript(formData: FormData) {
  const title = formData.get('title') as string;
  const videoUrl = formData.get('videoUrl') as string;
  const description = String(formData.get('description') || '');
  const id = formData.get('id') as string;
  const userId = formData.get('userId') as string | null;
  const scriptPurpose = normalizeScriptPurpose(formData.get('scriptPurpose'));
  const targetLanguage = String(formData.get('targetLanguage') || formData.get('target_language') || '').trim();
  const targetCountry = String(formData.get('targetCountry') || formData.get('target_country') || '').trim();

  if (!title || !videoUrl) {
    throw new Error('Title and Video URL are required');
  }

  // Store description in breakdown as initial data
  const initialBreakdown = {
    description: description || '',
    scriptPurpose,
  };

  let script;
  if (id) {
    // Update
    script = await prisma.script.update({
        where: { id },
        data: {
            title,
            videoUrl,
        }
    });
  } else {
    // Create
    script = await prisma.script.create({
        data: {
            title,
            videoUrl,
            breakdown: JSON.stringify(initialBreakdown),
            userId: userId, // Save user ID
        },
    });
  }

  // Trigger breakdown workflow based on scriptPurpose
  triggerScriptBreakdown({
    scriptId: script.id,
    title: script.title,
    videoUrl: script.videoUrl,
    description,
    userId: userId,
    scriptPurpose,
    targetLanguage,
    targetCountry,
  }).catch((error) => {
    console.error('Failed to trigger script breakdown', { scriptId: script.id, error });
  });

  revalidatePath('/scripts');
  return script;
}

export async function deleteScript(id: string) {
    if (!id) throw new Error('ID is required');
    await prisma.script.delete({
        where: { id }
    });
    revalidatePath('/scripts');
}

async function triggerScriptBreakdown(params: { scriptId: string; title: string; videoUrl: string; description?: string; userId?: string | null; scriptPurpose: ScriptPurpose; targetLanguage?: string; targetCountry?: string }) {
  const { scriptId, title, videoUrl, description, userId, scriptPurpose, targetLanguage, targetCountry } = params;
  let apiKey: string | null = null;

  if (userId) {
    apiKey = await getApiKeyForUser(userId);
  }

  if (!apiKey && process.env.DEFAULT_USER_API_KEY) {
    apiKey = process.env.DEFAULT_USER_API_KEY;
  }

  await breakdownScript({
    scriptId,
    title,
    videoUrl,
    description,
    apiKey: apiKey || undefined,
    scriptPurpose,
    productName: title,
    productDescription: description || '',
    scriptContent: description || '',
    targetLanguage: targetLanguage || undefined,
    targetCountry: targetCountry || undefined,
  });
}
