import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { createStoryboardJob } from '@/lib/storyboard/orchestrator';
import {
  attachCharacterContext,
  attachLanguageContext,
  attachProductContext,
  readMetadata,
  safeReadString,
  storyboardJobErrorResponse,
} from '../../_helpers';

function normalizeSkeletonContentType(raw: unknown, hasProduct: boolean): 'commerce' | 'story' {
  const value = safeReadString(raw).toLowerCase();
  if (value === 'story' || value === 'plot' || value === 'narrative' || value === '剧情视频' || value === '剧情') {
    return 'story';
  }
  if (value === 'commerce' || value === 'product' || value === 'shopping' || value === '带货视频' || value === '带货') {
    return 'commerce';
  }
  return hasProduct ? 'commerce' : 'story';
}

export async function POST(request: Request) {
  try {
    const { userId, apiKey } = await getRequestUserContext(request);
    if (!userId || !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = await request.json().catch(() => ({}));
    const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const metadata = readMetadata(body.metadata);
    const characterId = safeReadString(body.character_id || body.characterId);
    if (!characterId) {
      return NextResponse.json({ error: 'character_id is required' }, { status: 400 });
    }

    metadata.entry = metadata.entry || 'generate_page';
    metadata.feature = metadata.feature || 'skeleton_storyboard';

    const taskData: Record<string, unknown> = {};
    const payloadData: Record<string, unknown> = {};
    const productId = safeReadString(body.product_id || body.productId);
    const contentType = normalizeSkeletonContentType(
      body.content_type ||
        body.contentType ||
        body.video_type ||
        body.videoType ||
        metadata.content_type ||
        metadata.contentType ||
        metadata.video_type ||
        metadata.videoType,
      Boolean(productId),
    );
    if (contentType === 'commerce' && !productId) {
      return NextResponse.json({ error: 'product_id is required for commerce video' }, { status: 400 });
    }

    metadata.content_type = contentType;
    metadata.contentType = contentType;
    metadata.video_type = contentType === 'story' ? 'story' : 'commerce';
    metadata.videoType = contentType === 'story' ? 'story' : 'commerce';
    metadata.product_required = contentType === 'commerce';
    payloadData.content_type = contentType;
    payloadData.contentType = contentType;
    payloadData.video_type = contentType === 'story' ? 'story' : 'commerce';
    payloadData.videoType = contentType === 'story' ? 'story' : 'commerce';
    payloadData.product_required = contentType === 'commerce';

    const storySubject =
      safeReadString(body.story_subject || body.storySubject || metadata.story_subject || metadata.storySubject) ||
      safeReadString(body.subject || metadata.subject);
    const storyScene =
      safeReadString(body.story_scene || body.storyScene || metadata.story_scene || metadata.storyScene) ||
      safeReadString(body.scene || metadata.scene);
    const storyType =
      safeReadString(body.story_type || body.storyType || metadata.story_type || metadata.storyType) ||
      safeReadString(body.type || metadata.type);
    const storyTypeLabel =
      safeReadString(body.story_type_label || body.storyTypeLabel || metadata.story_type_label || metadata.storyTypeLabel);

    if (contentType === 'story') {
      metadata.story_subject = storySubject;
      metadata.storySubject = storySubject;
      metadata.story_scene = storyScene;
      metadata.storyScene = storyScene;
      metadata.story_type = storyType;
      metadata.storyType = storyType;
      metadata.story_type_label = storyTypeLabel;
      metadata.storyTypeLabel = storyTypeLabel;
      payloadData.story_subject = storySubject;
      payloadData.storySubject = storySubject;
      payloadData.story_scene = storyScene;
      payloadData.storyScene = storyScene;
      payloadData.story_type = storyType;
      payloadData.storyType = storyType;
      payloadData.story_type_label = storyTypeLabel;
      payloadData.storyTypeLabel = storyTypeLabel;
    } else {
      await attachProductContext({
        userId,
        productId,
        pipelineKey: 'skeleton_video',
        taskData,
        payloadData,
        metadata,
      });
    }
    await attachCharacterContext({
      userId,
      characterId,
      taskData,
      payloadData,
      metadata,
    });
    attachLanguageContext({ metadata, payloadData });

    const durationSeconds = Number(metadata.duration_seconds || metadata.durationSeconds || metadata.duration || 0);
    const title = safeReadString(body.title) || `小程序骷髅分镜视频${Number.isFinite(durationSeconds) && durationSeconds > 0 ? `-${durationSeconds}s` : ''}`;

    const result = await createStoryboardJob({
      pipelineKey: 'skeleton_video',
      userId,
      apiKey,
      title,
      script: safeReadString(body.script || body.script_content || body.scriptContent),
      productId: contentType === 'commerce' ? productId : '',
      characterId,
      metadata,
      source: 'miniapp_generate_page',
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
    return storyboardJobErrorResponse(error, 'skeleton');
  }
}
