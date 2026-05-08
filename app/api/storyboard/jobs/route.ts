import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { createStoryboardJob, parseStoryboardJobBody } from '@/lib/storyboard/orchestrator';
import prisma from '@/lib/prisma';
import { deductConfiguredCredits } from '@/lib/creditBilling';

function safeParseImages(images: string | null | undefined): string[] {
  if (!images) return [];
  try {
    const parsed = JSON.parse(images);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    }
    if (typeof parsed === 'string' && parsed.trim()) return [parsed.trim()];
  } catch {
    const list = images.split(',').map((item) => item.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }
  return [];
}

function safeParseJson(value: string | null | undefined): unknown | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeReadString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isMiniappStoryboardJob(parsed: {
  pipelineKey: string;
  source: string;
  metadata: Record<string, unknown>;
}): boolean {
  const source = safeReadString(parsed.source);
  const feature = safeReadString(parsed.metadata.feature);
  const entry = safeReadString(parsed.metadata.entry);
  return (
    source === 'miniapp_generate_page' ||
    source === 'miniapp_remix_generate_page' ||
    (parsed.pipelineKey === 'skeleton_video' && feature === 'skeleton_storyboard') ||
    (parsed.pipelineKey === 'viral_clone' && (feature === 'viral_remix' || entry === 'remix_generate_page'))
  );
}

function stringifyRawProductAnalysis(product: {
  sellingPoints?: string | null;
  analysisResult?: string | null;
}): string {
  const parsedSellingPoints = safeParseJson(product.sellingPoints);
  if (parsedSellingPoints) return JSON.stringify(parsedSellingPoints, null, 2);
  const parsedAnalysis = safeParseJson(product.analysisResult);
  if (parsedAnalysis) return JSON.stringify(parsedAnalysis, null, 2);
  return product.sellingPoints || product.analysisResult || '';
}

export async function POST(request: Request) {
  try {
    const { userId, apiKey } = await getRequestUserContext(request);
    if (!userId || !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = await request.json().catch(() => null);
    const parsed = parseStoryboardJobBody(raw);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            'Invalid body. pipeline_key must be one of script_to_storyboard|viral_clone|skeleton_video',
        },
        { status: 400 }
      );
    }

    if (parsed.pipelineKey === 'script_to_storyboard' && !parsed.script) {
      return NextResponse.json({ error: 'script is required for script_to_storyboard' }, { status: 400 });
    }

    if (!isMiniappStoryboardJob(parsed)) {
      await deductConfiguredCredits({
        apiKey,
        featureKey: 'storyboard_job_create',
        userId,
        defaultAmount: 1,
        modelKey: parsed.pipelineKey,
        workflowId: `storyboard_job:${parsed.pipelineKey}`,
        workflowName: `分镜任务创建:${parsed.pipelineKey}`,
      });
    }

    const taskData: Record<string, unknown> = {};
    const payloadData: Record<string, unknown> = {};
    const metadata: Record<string, unknown> = { ...(parsed.metadata || {}) };
    if (parsed.pipelineKey === 'viral_clone') {
      taskData.replicationMode = 'viral-clone';
    }

    if (parsed.productId) {
      const product = await prisma.product.findFirst({
        where: { id: parsed.productId, userId },
        select: {
          id: true,
          name: true,
          description: true,
          sellingPoints: true,
          sellingPointsText: true,
          analysisResult: true,
          images: true,
        },
      });

      if (!product) {
        return NextResponse.json({ error: 'Selected product not found' }, { status: 400 });
      }

      const imageList = safeParseImages(product.images);
      const primaryImage = imageList[0] || '';
      const productRawAnalysis = stringifyRawProductAnalysis(product);
      const productSellingPointsJson = product.sellingPoints || '[]';
      const productSellingPointsText = product.sellingPointsText || '';
      const productSellingPointsData = safeParseJson(productSellingPointsJson);
      const productSellingPointsForWorkflow = parsed.pipelineKey === 'skeleton_video'
        ? productRawAnalysis
        : productSellingPointsText || productSellingPointsJson;

      taskData.productId = product.id;
      payloadData.product_id = product.id;
      payloadData.productId = product.id;
      payloadData.product_name = product.name || '';
      payloadData.productName = product.name || '';
      payloadData.product_description = product.description || '';
      payloadData.productDescription = product.description || '';
      payloadData.product_selling_points = productSellingPointsForWorkflow;
      payloadData.productSellingPoints = productSellingPointsForWorkflow;
      payloadData.product_selling_points_json = productSellingPointsJson;
      payloadData.productSellingPointsJson = productSellingPointsJson;
      payloadData.product_selling_points_text = productSellingPointsText;
      payloadData.productSellingPointsText = productSellingPointsText;
      payloadData.product_raw_analysis = productRawAnalysis;
      payloadData.productRawAnalysis = productRawAnalysis;
      payloadData.product_analysis_result = product.analysisResult || '';
      payloadData.productAnalysisResult = product.analysisResult || '';
      if (productSellingPointsData !== null) {
        payloadData.product_selling_points_data = productSellingPointsData;
        payloadData.productSellingPointsData = productSellingPointsData;
      }
      payloadData.product_images = imageList;
      payloadData.productImages = imageList;
      payloadData.product_image_url = primaryImage;
      payloadData.productImageUrl = primaryImage;

      metadata.selected_product = {
        id: product.id,
        name: product.name || '',
        image_count: imageList.length,
      };
    }

    const targetLanguage =
      safeReadString(metadata.target_language) ||
      safeReadString(metadata.targetLanguage) ||
      safeReadString(metadata.language);
    const targetLanguageLabel = safeReadString(metadata.target_language_label) || safeReadString(metadata.targetLanguageLabel);
    if (targetLanguage) {
      payloadData.target_language = targetLanguage;
      payloadData.targetLanguage = targetLanguage;
      payloadData.language = targetLanguage;
      payloadData.video_language = targetLanguage;
      payloadData.videoLanguage = targetLanguage;
    }
    if (targetLanguageLabel) {
      payloadData.target_language_label = targetLanguageLabel;
      payloadData.targetLanguageLabel = targetLanguageLabel;
      payloadData.language_label = targetLanguageLabel;
      payloadData.languageLabel = targetLanguageLabel;
    }

    const allowCharacterReference = parsed.pipelineKey !== 'viral_clone';

    if (parsed.characterId && allowCharacterReference) {
      const character = await prisma.character.findFirst({
        where: { id: parsed.characterId, userId },
        select: {
          id: true,
          name: true,
          avatar: true,
        },
      });

      if (!character) {
        return NextResponse.json({ error: 'Selected character not found' }, { status: 400 });
      }

      taskData.characterId = character.id;
      payloadData.character_id = character.id;
      payloadData.characterId = character.id;
      payloadData.character_name = character.name || '';
      payloadData.characterName = character.name || '';
      payloadData.character_avatar = character.avatar || '';
      payloadData.characterAvatar = character.avatar || '';
      payloadData.character_image_url = character.avatar || '';
      payloadData.characterImageUrl = character.avatar || '';
      payloadData.person_image_url = character.avatar || '';
      payloadData.personImageUrl = character.avatar || '';

      metadata.selected_character = {
        id: character.id,
        name: character.name || '',
        has_avatar: Boolean(character.avatar),
      };
    }

    const result = await createStoryboardJob({
      pipelineKey: parsed.pipelineKey,
      userId,
      apiKey,
      title: parsed.title,
      script: parsed.script,
      creativeTaskId: parsed.creativeTaskId,
      characterId: allowCharacterReference ? parsed.characterId : '',
      productId: parsed.productId,
      metadata,
      source: parsed.source || 'storyboard_jobs_api',
      statusOnCreate: 'ANALYZING',
      progressOnCreate: 5,
      taskData,
      payloadData,
    });

    return NextResponse.json({
      success: true,
      data: {
        taskId: result.taskId,
        status: result.status,
        pipelineKey: result.pipelineKey,
        workflowId: result.workflowId,
        workflowTriggered: result.workflowTriggered,
      },
    });
  } catch (error) {
    console.error('[storyboard/jobs] Failed to create storyboard job', error);
    const message = error instanceof Error ? error.message : 'Failed to create storyboard job';
    const isWorkflowError = message.toLowerCase().includes('n8n webhook failed');
    const isCreditError =
      message.includes('积分') ||
      message.toLowerCase().includes('credit') ||
      message.toLowerCase().includes('insufficient');
    return NextResponse.json(
      { error: isWorkflowError || isCreditError ? message : 'Failed to create storyboard job', message },
      { status: isCreditError ? 402 : isWorkflowError ? 502 : 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      endpoint: '/api/storyboard/jobs',
      method: 'POST',
      supported_pipeline_keys: ['script_to_storyboard', 'viral_clone', 'skeleton_video'],
    },
  });
}
