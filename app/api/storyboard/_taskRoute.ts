import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { emitStoryboardTaskDelete } from '@/lib/storyboardEvents';
import { syncTaskToSummary } from '@/lib/taskSummary';

export async function findStoryboardTaskForUser(id: string, userId: string) {
  const task = await prisma.storyboardTask.findFirst({
    where: {
      OR: [
        { id },
        { taskId: id },
      ],
      userId,
    },
    select: { id: true, userId: true },
  });
  if (task) return task;

  const summary = await prisma.taskSummary.findFirst({
    where: {
      id,
      userId,
      taskType: { in: ['storyboard', 'grid'] },
    },
    select: { taskId: true },
  });
  if (!summary?.taskId) return null;

  return prisma.storyboardTask.findFirst({
    where: {
      OR: [
        { id: summary.taskId },
        { taskId: summary.taskId },
      ],
      userId,
    },
    select: { id: true, userId: true },
  });
}

export async function deleteStoryboardTaskForRequest(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await getRequestUserContext(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const task = await findStoryboardTaskForUser(id, userId);

  if (!task || task.userId !== userId) {
    return NextResponse.json({ error: 'Storyboard task not found' }, { status: 404 });
  }

  try {
    await prisma.storyboardTask.delete({ where: { id: task.id } });
    await syncTaskToSummary({ taskType: 'storyboard', taskId: task.id, operation: 'delete' });
    await syncTaskToSummary({ taskType: 'grid', taskId: task.id, operation: 'delete' });
    emitStoryboardTaskDelete(task.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[storyboard-delete] Failed to delete storyboard task', error);
    return NextResponse.json({ error: 'Failed to delete storyboard task' }, { status: 500 });
  }
}
