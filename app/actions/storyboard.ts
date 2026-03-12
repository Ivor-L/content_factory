'use server'

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

const STORYBOARD_WORKFLOW_ID = 'flow_storyboard';
const STORYBOARD_WORKFLOW_NAME = 'Storyboard Video';
const DEFAULT_REFERENCE_IMAGE = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop';

export async function createStoryboardTask(formData: FormData) {
  const productId = formData.get('productId') as string;
  const videoUrl = (formData.get('videoUrl') as string) || '';
  const characterId = (formData.get('characterId') as string) || null;
  const userId = (formData.get('userId') as string) || null;
  const scriptFromForm =
    ((formData.get('script') as string) || formData.get('scriptContent') || '') as string;
  const referenceImageFromForm =
    ((formData.get('referenceImage') as string) || formData.get('imageUrl') || '') as string;
  const rawContentType = (formData.get('contentType') as string) || (formData.get('videoType') as string) || '';
  const rawCountry = (formData.get('country') as string) || (formData.get('targetCountry') as string) || '';
  const rawLanguage =
    (formData.get('videoLanguage') as string) || (formData.get('language') as string) || '';
  const duration = (formData.get('duration') as string) || (formData.get('videoDuration') as string) || '';

  if (!productId) throw new Error('Product is required');

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) throw new Error('Product not found');

  const sellingPoints = buildSellingPoints(product);

  const scriptContent = buildScriptContent({
    productName: product.name,
    productDescription: product.description,
    sellingPoints,
    script: scriptFromForm,
  });

  const referenceImage =
    referenceImageFromForm || extractPrimaryImage(product.images) || DEFAULT_REFERENCE_IMAGE;

  if (!referenceImage) {
    throw new Error('A reference image is required to start storyboard generation.');
  }

  const webhookUrl =
    process.env.N8N_STORYBOARD_GEN_WEBHOOK ||
    process.env.N8N_STORYBOARD_PLOT_WEBHOOK ||
    'https://n8n.atomx.top/webhook/storyboard_Plot_web';

  const apiKey = await resolveApiKey(userId);

  const task = await prisma.storyboardTask.create({
    data: {
      status: 'GENERATING_GRID',
      videoUrl,
      coverImage: null,
      productId,
      characterId,
      userId,
      scriptContent,
      referenceImage,
    } as any,
  });

  await prisma.storyboardTask.update({
    where: { id: task.id },
    data: { taskId: task.id },
  });

  const payload: Record<string, any> = {
    taskId: task.id,
    record_id: task.id,
    api_key: apiKey,
    workflow_id: STORYBOARD_WORKFLOW_ID,
    workflow_name: STORYBOARD_WORKFLOW_NAME,
    productId,
    productName: product.name,
    productSellingPoints: sellingPoints,
    script: scriptContent,
    scriptContent,
    referenceImage,
    imageUrl: referenceImage,
    videoUrl,
    userId,
    characterId,
    content_type: rawContentType || 'ugc带货',
  };

  if (rawCountry) payload.country = rawCountry;
  if (rawLanguage) payload.videoLanguage = rawLanguage;
  if (duration) payload.videoDuration = duration;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`n8n generation failed: ${response.status} ${errorText}`);
    }
  } catch (error) {
    await prisma.storyboardTask.update({
      where: { id: task.id },
      data: { status: 'FAILED' },
    });
    throw error;
  }

  revalidatePath('/storyboard');
  return { success: true, taskId: task.id };
}

async function resolveApiKey(userId: string | null): Promise<string> {
  if (userId) {
    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      select: { api_key: true },
    });
    if (profile?.api_key) {
      return profile.api_key;
    }
  }

  const fallback = process.env.DEFAULT_USER_API_KEY;
  if (!fallback) {
    throw new Error(
      'No api_key found for this user. Please configure a user API key or set DEFAULT_USER_API_KEY.'
    );
  }
  return fallback;
}

function buildSellingPoints(product: any): string {
  if (product.sellingPointsText) return product.sellingPointsText;
  if (product.description) return product.description;
  if (product.sellingPoints) {
    try {
      const parsed = JSON.parse(product.sellingPoints);
      if (Array.isArray(parsed)) {
        return parsed.map((sp: any) => sp.text || sp.value || JSON.stringify(sp)).join('\n');
      }
      return String(parsed);
    } catch (error) {
      return String(product.sellingPoints);
    }
  }
  return '';
}

function buildScriptContent(params: {
  productName: string;
  productDescription?: string | null;
  sellingPoints: string;
  script?: string;
}): string {
  const { productName, productDescription, sellingPoints, script } = params;
  if (script && script.trim()) return script.trim();

  const sections: string[] = [];
  if (productDescription) {
    sections.push(`Product Description: ${productDescription}`);
  }
  if (sellingPoints) {
    sections.push(`Selling Points:\n${sellingPoints}`);
  }

  if (!sections.length) {
    sections.push('No detailed product copy provided. Focus on showcasing the hero product.');
  }

  return [`Storyboard Script for ${productName}`, ...sections].join('\n\n');
}

function extractPrimaryImage(imagesField?: string | null): string | null {
  if (!imagesField) return null;
  try {
    const parsed = JSON.parse(imagesField);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed[0];
    }
    if (typeof parsed === 'string' && parsed) {
      return parsed;
    }
  } catch (error) {
    const candidates = imagesField
      .split(',')
      .map((img) => img.trim())
      .filter(Boolean);
    if (candidates.length > 0) {
      return candidates[0];
    }
  }
  return null;
}
