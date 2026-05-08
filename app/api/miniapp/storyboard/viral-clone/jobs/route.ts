import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { createStoryboardJob } from '@/lib/storyboard/orchestrator';
import {
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
    const referenceVideoUrl =
      safeReadString(metadata.reference_video_url) ||
      safeReadString(metadata.referenceVideoUrl) ||
      safeReadString(body.reference_video_url) ||
      safeReadString(body.referenceVideoUrl);

    if (!referenceVideoUrl) {
      return NextResponse.json({ error: 'reference_video_url is required' }, { status: 400 });
    }

    metadata.reference_video_url = referenceVideoUrl;
    metadata.referenceVideoUrl = referenceVideoUrl;
    metadata.entry = metadata.entry || 'remix_generate_page';
    metadata.feature = metadata.feature || 'viral_remix';

    const taskData: Record<string, unknown> = {};
    const payloadData: Record<string, unknown> = {};
    taskData.replicationMode = 'viral-clone';
    await attachProductContext({
      userId,
      productId: safeReadString(body.product_id || body.productId),
      pipelineKey: 'viral_clone',
      taskData,
      payloadData,
      metadata,
    });
    attachLanguageContext({ metadata, payloadData });

    const durationSeconds = Number(metadata.duration_seconds || metadata.durationSeconds || metadata.duration || 0);
    const title = safeReadString(body.title) || `一键复刻${Number.isFinite(durationSeconds) && durationSeconds > 0 ? `-${durationSeconds}s` : ''}`;
    const script =
      safeReadString(body.script || body.script_content || body.scriptContent) ||
      `参考视频爆款复刻。第一阶段拆解参考视频，第二阶段替换产品，第三阶段生成视频。`;

    const result = await createStoryboardJob({
      pipelineKey: 'viral_clone',
      userId,
      apiKey,
      title,
      script,
      productId: safeReadString(body.product_id || body.productId),
      metadata,
      source: 'miniapp_remix_generate_page',
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
    return storyboardJobErrorResponse(error, 'viral-clone');
  }
}
