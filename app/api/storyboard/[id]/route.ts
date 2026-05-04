import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { emitStoryboardTaskUpsert } from '@/lib/storyboardEvents';
import { deleteStoryboardTaskForRequest, findStoryboardTaskForUser } from '../_taskRoute';

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

  const trimmedTitle = typeof payload.title === 'string' ? payload.title.trim() : undefined;
  if (trimmedTitle == null) {
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
      scenePrompt: trimmedTitle || null,
    },
  });

  emitStoryboardTaskUpsert(updated);

  return NextResponse.json({ success: true, task: { id: updated.id, scenePrompt: updated.scenePrompt } });
}

export const DELETE = deleteStoryboardTaskForRequest;
