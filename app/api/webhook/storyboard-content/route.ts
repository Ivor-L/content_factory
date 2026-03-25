import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { emitStoryboardTaskUpsert } from '@/lib/storyboardEvents';
import { normalizeStoryboardSegments } from '@/lib/storyboardTime';
import { syncTaskToSummary } from '@/lib/taskSummary';

type ShotPayload = {
  idx?: unknown;
  order?: unknown;
  time_range?: unknown;
  timeRange?: unknown;
  duration?: unknown;
  estimatedSeconds?: unknown;
  estimated_seconds?: unknown;
  image_prompt?: unknown;
  imagePrompt?: unknown;
  video_prompt?: unknown;
  videoPrompt?: unknown;
  image_url?: unknown;
  imageUrl?: unknown;
  video_url?: unknown;
  videoUrl?: unknown;
  speech?: unknown;
  text?: unknown;
};

const readFloat = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return fallback;
};

const readInt = (value: unknown, fallback: number): number => {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
  return fallback;
};

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const asJsonValue = (
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
};

const pickShots = (body: Record<string, unknown>): ShotPayload[] => {
  if (Array.isArray(body.shots)) return body.shots as ShotPayload[];
  const data = body.data as Record<string, unknown> | undefined;
  if (data && Array.isArray(data.shots)) {
    return data.shots as ShotPayload[];
  }
  if (Array.isArray(body.results)) return body.results as ShotPayload[];
  return [];
};

const pickImages = (body: Record<string, unknown>): unknown[] | undefined => {
  if (Array.isArray(body.storyboard_images)) return body.storyboard_images as unknown[];
  if (Array.isArray((body.data as Record<string, unknown> | undefined)?.storyboard_images)) {
    return ((body.data as Record<string, unknown>).storyboard_images ?? []) as unknown[];
  }
  return undefined;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const taskId =
      readString(payload.task_id) ||
      readString(payload.taskId) ||
      readString(payload.record_id) ||
      readString(payload.recordId);

    if (!taskId) {
      return NextResponse.json({ error: 'Missing task_id' }, { status: 400 });
    }

    const task = await prisma.storyboardTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const shots = pickShots(payload).filter(Boolean);
    const storyboardImages = pickImages(payload);
    let storyboardImageUrl = readString(payload.storyboard_image_url) || readString(payload.storyboardImageUrl);
    if (!storyboardImageUrl && Array.isArray(storyboardImages) && storyboardImages.length > 0) {
      const first = storyboardImages[0];
      if (typeof first === 'string') {
        storyboardImageUrl = readString(first);
      } else if (first && typeof first === 'object') {
        storyboardImageUrl =
          readString((first as Record<string, unknown>).url) ||
          readString((first as Record<string, unknown>).image_url) ||
          readString((first as Record<string, unknown>).imageUrl) ||
          '';
      }
    }

    const statusText = readString(payload.status).toUpperCase();
    const isSuccess =
      statusText === 'SUCCESS' ||
      statusText === 'COMPLETED' ||
      (!statusText && shots.length > 0);

    if (shots.length > 0) {
      type SegmentInput = {
        taskId: string;
        order: number;
        duration: number;
        timeRange?: string;
        imagePrompt?: string;
        videoPrompt?: string;
        generatedImage?: string;
        generatedVideo?: string;
      };

      const segmentInputs: SegmentInput[] = shots.map((shot, index) => ({
        taskId,
        order: readInt(shot.idx ?? shot.order, index + 1),
        duration: readFloat(
          shot.duration ?? shot.estimatedSeconds ?? shot.estimated_seconds,
          8
        ),
        timeRange: readString(shot.time_range ?? shot.timeRange),
        imagePrompt: readString(shot.image_prompt ?? shot.imagePrompt),
        videoPrompt: readString(shot.video_prompt ?? shot.videoPrompt),
        generatedImage: readString(shot.image_url ?? shot.imageUrl),
        generatedVideo: readString(shot.video_url ?? shot.videoUrl),
      }));

      const normalized = normalizeStoryboardSegments(segmentInputs);

      await prisma.$transaction([
        prisma.storyboardSegment.deleteMany({ where: { taskId } }),
        prisma.storyboardSegment.createMany({
          data: normalized.map((segment) => ({
            taskId,
            order: segment.order,
            duration: segment.duration,
            timeRange: segment.timeRange,
            imagePrompt: segment.imagePrompt || null,
            videoPrompt: segment.videoPrompt || null,
            generatedImage: segment.generatedImage || null,
            generatedVideo: segment.generatedVideo || null,
            status: 'COMPLETED',
          })),
        }),
      ]);
    }

    const updatedTask = await prisma.storyboardTask.update({
      where: { id: taskId },
      data: {
        status: isSuccess ? 'COMPLETED' : 'FAILED',
        progress: isSuccess ? 100 : task.progress,
        storyboardStructure: shots.length ? asJsonValue(shots) : asJsonValue(task.storyboardStructure),
        storyboardImages: storyboardImages ? asJsonValue(storyboardImages) : asJsonValue(task.storyboardImages),
        storyboardImageUrl: storyboardImageUrl || task.storyboardImageUrl || undefined,
      },
    });

    await syncTaskToSummary({
      taskType: 'storyboard',
      taskId: taskId,
      operation: 'update',
    });

    emitStoryboardTaskUpsert(updatedTask);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to process storyboard content webhook', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
