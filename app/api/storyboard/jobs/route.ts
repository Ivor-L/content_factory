import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { createStoryboardJob, parseStoryboardJobBody } from '@/lib/storyboard/orchestrator';
import prisma from '@/lib/prisma';

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

    const taskData: Record<string, unknown> = {};
    const payloadData: Record<string, unknown> = {};
    const metadata: Record<string, unknown> = { ...(parsed.metadata || {}) };

    if (parsed.productId) {
      const product = await prisma.product.findFirst({
        where: { id: parsed.productId, userId },
        select: {
          id: true,
          name: true,
          description: true,
          sellingPoints: true,
          sellingPointsText: true,
          images: true,
        },
      });

      if (!product) {
        return NextResponse.json({ error: 'Selected product not found' }, { status: 400 });
      }

      const imageList = safeParseImages(product.images);
      const primaryImage = imageList[0] || '';

      taskData.productId = product.id;
      payloadData.product_id = product.id;
      payloadData.productId = product.id;
      payloadData.product_name = product.name || '';
      payloadData.productName = product.name || '';
      payloadData.product_description = product.description || '';
      payloadData.productDescription = product.description || '';
      payloadData.product_selling_points = product.sellingPointsText || product.sellingPoints || '';
      payloadData.productSellingPoints = product.sellingPointsText || product.sellingPoints || '';
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
    return NextResponse.json(
      { error: isWorkflowError ? message : 'Failed to create storyboard job' },
      { status: 500 }
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
