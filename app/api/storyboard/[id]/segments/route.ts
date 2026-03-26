import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { emitStoryboardTaskUpsert } from '@/lib/storyboardEvents';

interface SegmentInput {
  videoPrompt?: string | null;
  imagePrompt?: string | null;
  duration?: number | null;
  timeRange?: string | null;
  generatedImage?: string | null;
  generatedVideo?: string | null;
}

type SegmentResponse = {
  id: string;
  order: number;
  duration: number;
  timeRange: string | null;
  imagePrompt: string | null;
  videoPrompt: string | null;
  generatedImage: string | null;
  generatedVideo: string | null;
  status: string;
};

const DEFAULT_DURATION = 8;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await getRequestUserContext(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: taskId } = await params;
  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const rawSegments: SegmentInput[] = Array.isArray(payload.segments) ? payload.segments : [];
  if (!rawSegments.length) {
    return NextResponse.json({ error: 'segments is required' }, { status: 400 });
  }

  const task = await prisma.storyboardTask.findUnique({
    where: { id: taskId },
    select: { id: true, userId: true },
  });

  if (!task) {
    return NextResponse.json({ error: 'Storyboard task not found' }, { status: 404 });
  }

  if (task.userId && task.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const insertAtValue = Number(payload.insertAt);
  const insertAt =
    Number.isFinite(insertAtValue) && !Number.isNaN(insertAtValue)
      ? Math.floor(insertAtValue)
      : undefined;

  const sanitized = rawSegments.map((segment) => {
    const durationValue = Number(segment.duration);
    return {
      videoPrompt: typeof segment.videoPrompt === 'string' ? segment.videoPrompt.trim() || null : null,
      imagePrompt: typeof segment.imagePrompt === 'string' ? segment.imagePrompt.trim() || null : null,
      duration: Number.isFinite(durationValue) && durationValue > 0 ? durationValue : DEFAULT_DURATION,
      timeRange: typeof segment.timeRange === 'string' ? segment.timeRange.trim() || null : null,
      generatedImage:
        typeof segment.generatedImage === 'string' ? segment.generatedImage.trim() || null : null,
      generatedVideo:
        typeof segment.generatedVideo === 'string' ? segment.generatedVideo.trim() || null : null,
    };
  });

  const createdSegments = await prisma.$transaction(async (tx) => {
    const existingSegments = await tx.storyboardSegment.findMany({
      where: { taskId },
      orderBy: { order: 'asc' },
      select: { id: true, order: true },
    });

    const insertionIndex = Math.max(0, Math.min(insertAt ?? existingSegments.length, existingSegments.length));

    if (insertionIndex < existingSegments.length) {
      await tx.storyboardSegment.updateMany({
        where: {
          taskId,
          order: {
            gte: insertionIndex,
          },
        },
        data: {
          order: {
            increment: sanitized.length,
          },
        },
      });
    }

    const inserts: SegmentResponse[] = [];
    for (let i = 0; i < sanitized.length; i += 1) {
      const segment = sanitized[i];
      const created = await tx.storyboardSegment.create({
        data: {
          taskId,
          order: insertionIndex + i,
          duration: segment.duration,
          timeRange: segment.timeRange,
          imagePrompt: segment.imagePrompt,
          videoPrompt: segment.videoPrompt,
          generatedImage: segment.generatedImage,
          generatedVideo: segment.generatedVideo,
          status: 'DRAFT',
        },
        select: {
          id: true,
          order: true,
          duration: true,
          timeRange: true,
          imagePrompt: true,
          videoPrompt: true,
          generatedImage: true,
          generatedVideo: true,
          status: true,
        },
      });
      inserts.push(created);
    }

    return inserts;
  });

  const updatedTask = await prisma.storyboardTask.findUnique({ where: { id: taskId } });
  if (updatedTask) {
    emitStoryboardTaskUpsert(updatedTask);
  }

  return NextResponse.json({ success: true, segments: createdSegments });
}
