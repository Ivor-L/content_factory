import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { emitStoryboardTaskUpsert } from '@/lib/storyboardEvents';
import { syncTaskToSummary } from '@/lib/taskSummary';
import { deleteStoryboardTaskForRequest, findStoryboardTaskForUser } from '../_taskRoute';

function readPatchString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  const records = [
    payload,
    payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data as Record<string, unknown>
      : null,
    payload.task && typeof payload.task === 'object' && !Array.isArray(payload.task)
      ? payload.task as Record<string, unknown>
      : null,
  ].filter((item): item is Record<string, unknown> => Boolean(item));

  for (const record of records) {
    for (const key of keys) {
      const direct = record[key];
      if (typeof direct === 'string') return direct.trim();
    }
    const lowerEntries = Object.entries(record).map(([key, value]) => [key.toLowerCase(), value] as const);
    for (const key of keys) {
      const match = lowerEntries.find(([entryKey]) => entryKey === key.toLowerCase());
      if (typeof match?.[1] === 'string') return match[1].trim();
    }
  }

  return undefined;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await getRequestUserContext(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const patchPayload = payload as Record<string, unknown>;
  const trimmedTitle = readPatchString(patchPayload, ['title']);
  const storyboardImageUrl = readPatchString(patchPayload, [
    'storyboardImageUrl',
    'storyboard_image_url',
    'storyboardGridUrl',
    'storyboard_grid_url',
    'gridImageUrl',
    'grid_image_url',
  ]);
  const coverImage = readPatchString(patchPayload, [
    'coverImage',
    'cover_image',
    'thumbnailUrl',
    'thumbnail_url',
  ]);

  if (trimmedTitle == null && storyboardImageUrl == null && coverImage == null) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const task = await findStoryboardTaskForUser(id, userId);

  if (!task) {
    return NextResponse.json({ error: 'Storyboard task not found' }, { status: 404 });
  }

  if (task.userId && task.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updated = await prisma.storyboardTask.update({
    where: { id: task.id },
    data: {
      ...(trimmedTitle != null ? { scenePrompt: trimmedTitle || null } : {}),
      ...(storyboardImageUrl != null ? { storyboardImageUrl: storyboardImageUrl || null } : {}),
      ...(coverImage != null ? { coverImage: coverImage || null } : {}),
    },
  });

  emitStoryboardTaskUpsert(updated);
  void syncTaskToSummary({ taskType: 'storyboard', taskId: updated.id, operation: 'update' });

  return NextResponse.json({
    success: true,
    task: {
      id: updated.id,
      scenePrompt: updated.scenePrompt,
      storyboardImageUrl: updated.storyboardImageUrl,
      coverImage: updated.coverImage,
    },
  });
}

export const DELETE = deleteStoryboardTaskForRequest;
