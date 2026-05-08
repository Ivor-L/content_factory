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
    await attachProductContext({
      userId,
      productId: safeReadString(body.product_id || body.productId),
      pipelineKey: 'skeleton_video',
      taskData,
      payloadData,
      metadata,
    });
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
      productId: safeReadString(body.product_id || body.productId),
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
