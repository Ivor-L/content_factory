'use server'

import prisma from '@/lib/prisma';
import { emitStoryboardTaskUpsert } from '@/lib/storyboardEvents';
import { normalizeStoryboardSegments } from '@/lib/storyboardTime';
import { hydrateViralReferenceMedia } from '@/lib/viralReferenceMedia';
import { syncTaskToSummary } from '@/lib/taskSummary';
import { createStoryboardJob } from '@/lib/storyboard/orchestrator';
import { Prisma } from '@prisma/client';

const STORYBOARD_WORKFLOW_ID = 'flow_storyboard';
const STORYBOARD_WORKFLOW_NAME = 'Storyboard Video';
const DEFAULT_REFERENCE_IMAGE = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop';

export interface ManualStoryboardSegmentInput {
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  duration?: number;
  timeRange?: string;
}

export interface ManualStoryboardPayload {
  title?: string;
  description?: string;
  userId?: string | null;
  segments: ManualStoryboardSegmentInput[];
}

type StructuredShot = {
  index: number;
  prompt: string;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
};

export async function createManualStoryboardTask(payload: ManualStoryboardPayload) {
  const sanitizedSegments = (payload.segments || [])
    .map((segment, index) => {
      const prompt = (segment.prompt || '').trim();
      const firstFrameUrl = segment.firstFrameUrl?.trim() || '';
      const lastFrameUrl = segment.lastFrameUrl?.trim() || '';
      return {
        order: index,
        prompt,
        firstFrameUrl: firstFrameUrl || null,
        lastFrameUrl: lastFrameUrl || null,
        duration: segment.duration ?? 8,
        timeRange: segment.timeRange?.trim() || '',
      };
    })
    .filter((segment) => segment.prompt || segment.firstFrameUrl || segment.lastFrameUrl);

  if (!sanitizedSegments.length) {
    throw new Error('至少需要填写 1 条分镜信息。');
  }

  const title = payload.title?.trim();
  const description = payload.description?.trim();
  const coverImage = sanitizedSegments.find((segment) => segment.firstFrameUrl)?.firstFrameUrl || null;
  const storyboardImages = sanitizedSegments
    .map((segment) => segment.firstFrameUrl)
    .filter((url): url is string => Boolean(url));

  const structuredShots: StructuredShot[] = sanitizedSegments.map((segment, index) => ({
    index: index + 1,
    prompt: segment.prompt,
    firstFrameUrl: segment.firstFrameUrl,
    lastFrameUrl: segment.lastFrameUrl,
  }));

  const scriptSections: string[] = [];
  if (title) scriptSections.push(title);
  if (description) scriptSections.push(description);
  scriptSections.push(
    sanitizedSegments
      .map(
        (segment, index) =>
          `Shot ${index + 1}: ${segment.prompt || 'N/A'}`
      )
      .join('\n')
  );

  const task = await prisma.storyboardTask.create({
    data: {
      status: 'COMPLETED',
      coverImage,
      sceneImage: coverImage,
      referenceImage: coverImage,
      scriptContent: scriptSections.filter(Boolean).join('\n\n') || 'Manual storyboard task',
      storyboardStructure: structuredShots as Prisma.InputJsonValue,
      storyboardImages: storyboardImages.length ? (storyboardImages as Prisma.InputJsonValue) : undefined,
      userId: payload.userId || undefined,
      progress: 100,
    } as any,
  });
  emitStoryboardTaskUpsert(task);

  const normalizedSegments = normalizeStoryboardSegments(sanitizedSegments);

  await prisma.storyboardSegment.createMany({
    data: normalizedSegments.map((segment) => ({
      taskId: task.id,
      order: segment.order,
      duration: segment.duration,
      timeRange: segment.timeRange,
      imagePrompt: segment.prompt,
      videoPrompt: segment.prompt,
      generatedImage: segment.firstFrameUrl,
      generatedVideo: segment.lastFrameUrl,
      status: 'COMPLETED',
    })),
  });

  await syncTaskToSummary({
    taskType: 'storyboard',
    taskId: task.id,
    operation: 'create',
  });

  return { success: true, taskId: task.id };
}

export async function createStoryboardTask(formData: FormData) {
  const productId = (formData.get('productId') as string) || null;
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
  const imageModel = (formData.get('imageModel') as string) || 'nanoBananapro';
  const videoModel = (formData.get('videoModel') as string) || 'veo_3_1-fast';
  const replicationMode = (formData.get('replicationMode') as string) || 'manual';
  const referenceId = (formData.get('referenceId') as string) || null;
  const creatorId = (formData.get('creatorId') as string) || null;

  // productId is optional – only look up if provided
  const product = productId
    ? await prisma.product.findUnique({ where: { id: productId } })
    : null;
  if (productId && !product) throw new Error('Product not found');

  const sellingPoints = product ? buildSellingPoints(product) : '';
  let referenceRecord = null;
  if (referenceId) {
    referenceRecord = await prisma.viralReferenceItem.findUnique({
      where: { id: referenceId },
      include: { creator: true },
    });
  }

  const hydratedReferenceRecord = referenceRecord
    ? hydrateViralReferenceMedia(referenceRecord)
    : null;

  let creatorRecord = hydratedReferenceRecord?.creator ?? null;
  if (!creatorRecord && creatorId) {
    creatorRecord = await prisma.viralCreator.findUnique({ where: { id: creatorId } });
  }

  const referenceSnapshot = hydratedReferenceRecord
    ? {
        id: hydratedReferenceRecord.id,
        platform: hydratedReferenceRecord.platform,
        sourceId: hydratedReferenceRecord.sourceId,
        title: hydratedReferenceRecord.title,
        coverUrl: hydratedReferenceRecord.coverUrl,
        videoUrl: hydratedReferenceRecord.videoUrl,
        mediaUrls: hydratedReferenceRecord.mediaUrls,
        sourceUrl: hydratedReferenceRecord.sourceUrl,
        stats: hydratedReferenceRecord.stats,
        category: hydratedReferenceRecord.category,
      }
    : null;

  const creatorSnapshot = creatorRecord
    ? {
        id: creatorRecord.id,
        creatorHandle: creatorRecord.creatorHandle,
        displayName: creatorRecord.displayName,
        avatarUrl: creatorRecord.avatarUrl,
        profileUrl: creatorRecord.profileUrl,
        stats: creatorRecord.stats,
        platform: creatorRecord.platform,
      }
    : null;

  const scriptContent = buildScriptContent({
    productName: product?.name || '',
    productDescription: product?.description,
    sellingPoints,
    script: scriptFromForm,
  });

  const referenceImage =
    referenceImageFromForm || (product ? extractPrimaryImage(product.images) : null) || DEFAULT_REFERENCE_IMAGE;

  if (!referenceImage) {
    throw new Error('A reference image is required to start storyboard generation.');
  }

  const webhookUrl =
    process.env.N8N_STORYBOARD_GEN_WEBHOOK ||
    process.env.N8N_STORYBOARD_PLOT_WEBHOOK ||
    'https://n8n.atomx.top/webhook/storyboard_Plot_web';

  const apiKey = await resolveApiKey(userId);

  if (replicationMode === 'viral-clone') {
    const result = await createStoryboardJob({
      pipelineKey: 'viral_clone',
      userId,
      apiKey,
      script: scriptContent,
      metadata: {
        referenceId: referenceId || undefined,
        creatorId: creatorId || undefined,
        replicationMode,
      },
      source: 'storyboard_action',
      statusOnCreate: 'BREAKDOWN_PENDING',
      progressOnCreate: 5,
      taskData: {
        videoUrl,
        coverImage: null,
        productId: productId || null,
        characterId,
        referenceImage,
        replicationMode,
        imageModel,
        videoModel,
      },
      payloadData: {
        productId: productId || null,
        product_id: productId || null,
        productName: product?.name || '',
        product_name: product?.name || '',
        product_description: product?.description || '',
        productSellingPoints: sellingPoints,
        product_selling_points: sellingPoints,
        referenceImage,
        imageUrl: referenceImage,
        videoUrl,
        video_url: videoUrl,
        userId,
        user_id: userId,
        characterId,
        character_id: characterId,
        replicationMode,
        imageModel,
        videoModel,
        reference: referenceSnapshot || undefined,
        creator: creatorSnapshot || undefined,
        target_country: rawCountry || undefined,
        target_language: rawLanguage || undefined,
      },
    });

    return { success: true, taskId: result.taskId };
  }

  const task = await prisma.storyboardTask.create({
    data: {
      status: 'GENERATING_GRID',
      videoUrl,
      coverImage: null,
      productId: productId || null,
      characterId,
      userId,
      scriptContent,
      referenceImage,
      replicationMode,
      imageModel,
      videoModel,
    } as any,
  });
  emitStoryboardTaskUpsert(task);

  const syncedTask = await prisma.storyboardTask.update({
    where: { id: task.id },
    data: { taskId: task.id },
  });
  emitStoryboardTaskUpsert(syncedTask);

  void syncTaskToSummary({
    taskType: 'storyboard',
    taskId: syncedTask.id,
    operation: 'create',
  });

  const payload: Record<string, any> = {
    taskId: task.id,
    task_id: task.id,
    record_id: task.id,
    api_key: apiKey,
    admin_token: process.env.ADMIN_TOKEN,
    app_url: process.env.N8N_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL,
    productId: productId || null,
    product_id: productId || null,
    productName: product?.name || '',
    product_name: product?.name || '',
    product_description: product?.description || '',
    productSellingPoints: sellingPoints,
    product_selling_points: sellingPoints,
    script: scriptContent,
    scriptContent,
    script_content: scriptContent,
    referenceImage,
    imageUrl: referenceImage,
    videoUrl,
    video_url: videoUrl,
    userId,
    user_id: userId,
    characterId,
    character_id: characterId,
    replicationMode,
    imageModel,
    videoModel,
  };
  if (referenceSnapshot) {
    payload.reference = referenceSnapshot;
  }
  if (creatorSnapshot) {
    payload.creator = creatorSnapshot;
  }

  payload.workflow_id = STORYBOARD_WORKFLOW_ID;
  payload.workflow_name = STORYBOARD_WORKFLOW_NAME;
  payload.content_type = rawContentType || 'ugc带货';
  if (rawCountry) payload.country = rawCountry;
  if (rawLanguage) payload.videoLanguage = rawLanguage;
  if (duration) payload.videoDuration = duration;

  try {
    console.log('[storyboard] Triggering workflow', {
      taskId: task.id,
      replicationMode,
      webhookUrl,
      workflowId: payload.workflow_id,
      hasVideoUrl: Boolean(videoUrl),
      hasScriptContent: Boolean(scriptContent),
    });

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
    const failedTask = await prisma.storyboardTask.update({
      where: { id: task.id },
      data: { status: 'FAILED' },
    });
    emitStoryboardTaskUpsert(failedTask);
    throw error;
  }

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
