import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { triggerAutoEdit } from '@/lib/n8n';
import prisma from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await getRequestUserContext(request);
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
  if (!voiceId) {
    return NextResponse.json({ error: 'voiceId is required' }, { status: 400 });
  }

  // Load task + segments from DB
  const task = await prisma.storyboardTask.findUnique({
    where: { id: taskId },
    include: { segments: { orderBy: { order: 'asc' } } },
  });

  if (!task) {
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

  // Mark task as editing
  await prisma.storyboardTask.update({
    where: { id: taskId },
    data: { status: 'MERGING' },
  });

  await triggerAutoEdit({
    taskId,
    voiceId,
    minimaxKey,
    videoUrls,
    textArray,
    callbackUrl,
    bgmUrl,
    speed,
    wantSubtitles,
  });

  return NextResponse.json({ ok: true, segmentCount: videoUrls.length });
}
