import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { triggerAutoEdit } from '@/lib/n8n';
import prisma from '@/lib/prisma';
import { resolveUserApiKey } from '@/lib/userApiKey';
import { deductConfiguredCredits } from '@/lib/creditBilling';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, apiKey: contextApiKey } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: taskId } = await params;

  const body = await request.json().catch(() => ({})) as {
    voiceId?: string;
    bgmUrl?: string;
    speed?: number;
    wantSubtitles?: boolean;
  };

  const { voiceId, bgmUrl, speed, wantSubtitles } = body;
  const normalizedVoiceId = typeof voiceId === 'string' ? voiceId.trim() : '';
  const normalizedBgmUrl = typeof bgmUrl === 'string' ? bgmUrl.trim() : '';
  const shouldGenerateSubtitles = wantSubtitles ?? true;

  // Load task + segments from DB
  const task = await prisma.storyboardTask.findUnique({
    where: { id: taskId },
    include: { segments: { orderBy: { order: 'asc' } } },
  });

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  if (task.userId && task.userId !== userId) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Collect video URLs and scripts from segments that have generated videos
  const videoUrls: string[] = [];
  const textArray: string[] = [];

  for (const seg of task.segments) {
    const videoUrl = seg.generatedVideo;
    if (videoUrl) {
      videoUrls.push(videoUrl);
      textArray.push(seg.originalScript || seg.rewrittenScript || '');
    }
  }

  if (videoUrls.length === 0) {
    return NextResponse.json({ error: '没有可用的视频素材，请先生成分镜视频' }, { status: 400 });
  }

  const minimaxKey = process.env.MINIMAX_API_KEY ?? '';
  const callbackBase = (process.env.N8N_CALLBACK_BASE_URL ?? '').replace(/\/+$/, '') || request.nextUrl.origin;
  const callbackUrl = `${callbackBase}/api/webhook/auto-edit-callback`;

  const apiKey = await resolveUserApiKey({ userId, explicitApiKey: contextApiKey, allowDefaultFallback: false });
  if (apiKey) {
    try {
      await deductConfiguredCredits({
        apiKey,
        featureKey: 'storyboard_merge',
        userId,
        defaultAmount: 1,
        workflowId: 'storyboard_auto_edit',
        workflowName: '一键剪辑',
      });

      if (shouldGenerateSubtitles) {
        await deductConfiguredCredits({
          apiKey,
          featureKey: 'storyboard_subtitle',
          userId,
          defaultAmount: 1,
          workflowId: 'storyboard_auto_edit',
          workflowName: '成片字幕生成',
        });
      }
    } catch (error) {
      console.error('[auto-edit] deduct credits failed:', error);
      return NextResponse.json({ error: '积分不足或扣费失败' }, { status: 402 });
    }
  }

  // Mark task as editing
  await prisma.storyboardTask.update({
    where: { id: taskId },
    data: {
      status: 'MERGING',
      progress: 95,
      enableSubtitles: shouldGenerateSubtitles,
      subtitleTemplate: shouldGenerateSubtitles ? 'auto-edit' : null,
    },
  });

  await triggerAutoEdit({
    taskId,
    voiceId: normalizedVoiceId,
    minimaxKey,
    videoUrls,
    textArray,
    callbackUrl,
    bgmUrl: normalizedBgmUrl,
    speed,
    wantSubtitles: shouldGenerateSubtitles,
  });

  return NextResponse.json({ ok: true, segmentCount: videoUrls.length });
}
