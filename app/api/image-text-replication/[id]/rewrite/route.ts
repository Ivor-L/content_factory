import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { rewriteMyNoteAndCreateWork } from '@/lib/imageTextMyNotes';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const task = await prisma.imageTextReplicationTask.findUnique({ where: { id } });
  if (!task || task.userId !== userId) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  try {
    const result = await rewriteMyNoteAndCreateWork(id);
    return NextResponse.json({
      taskId: id,
      status: 'REWRITE_COMPLETED',
      workTaskId: result.workTaskId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '仿写失败' },
      { status: 400 },
    );
  }
}
