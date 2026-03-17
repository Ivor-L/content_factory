'use server';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { formatStoryboardRange } from '@/lib/storyboardTime';
import { emitStoryboardTaskUpsert } from '@/lib/storyboardEvents';
import {
  findVideoTrack,
  sanitizeTimelineForSave,
  storyboardTimelineSchema,
} from '@/lib/storyboardTimeline';

const payloadSchema = z.object({
  taskId: z.string().min(1),
  timeline: storyboardTimelineSchema,
});

export type SaveStoryboardTimelinePayload = z.infer<typeof payloadSchema>;

export async function saveStoryboardTimeline(payload: SaveStoryboardTimelinePayload) {
  const data = payloadSchema.parse(payload);
  const { taskId } = data;
  const sanitizedTimeline = sanitizeTimelineForSave(data.timeline);

  const updatedTask = await prisma.$transaction(async (tx) => {
    await tx.storyboardTask.update({
      where: { id: taskId },
      data: {
        timeline: sanitizedTimeline as Prisma.InputJsonValue,
      },
    });

    const videoTrack = findVideoTrack(sanitizedTimeline);
    const sortedClips = [...(videoTrack?.clips ?? [])].sort((a, b) => {
      if (a.start === b.start) return a.id.localeCompare(b.id);
      return a.start - b.start;
    });

    if (sortedClips.length) {
      const existing = await tx.storyboardSegment.findMany({
        where: {
          id: {
            in: sortedClips.map((clip) => clip.segmentId),
          },
          taskId,
        },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((segment) => segment.id));

      await Promise.all(
        sortedClips.map((clip, index) => {
          if (!existingIds.has(clip.segmentId)) {
            return Promise.resolve();
          }
          return tx.storyboardSegment.update({
            where: { id: clip.segmentId },
            data: {
              order: index,
              duration: clip.duration,
              timeRange: formatStoryboardRange(clip.start, clip.start + clip.duration),
            },
          });
        })
      );
    }

    return tx.storyboardTask.findUnique({
      where: { id: taskId },
    });
  });

  if (updatedTask) {
    emitStoryboardTaskUpsert(updatedTask);
  }

  return { success: true };
}
