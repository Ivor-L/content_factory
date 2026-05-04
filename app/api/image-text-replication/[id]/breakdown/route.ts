import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { retryBreakdownImageForMyNote, runBreakdownForMyNote } from '@/lib/imageTextMyNotes';

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

  const body = await request.json().catch(() => ({})) as { imageIndex?: unknown };
  const imageIndex = Math.floor(Number(body?.imageIndex));
  if (Number.isFinite(imageIndex) && imageIndex > 0) {
    try {
      const result = await retryBreakdownImageForMyNote(id, imageIndex);
      return NextResponse.json({
        taskId: id,
        status: result.status,
        imageText: result.imageText,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : '图片重试失败' },
        { status: 400 },
      );
    }
  }

  await prisma.imageTextReplicationTask.update({
    where: { id },
    data: {
      status: 'BREAKDOWN_PENDING',
      analysisResult: Prisma.JsonNull,
      generatedCopy: null,
      imageGuidance: Prisma.JsonNull,
      errorMessage: null,
    },
  });

  void runBreakdownForMyNote(id).catch((error) => {
    console.error('[image-text-replication/breakdown] background breakdown failed', error);
  });

  return NextResponse.json({
    taskId: id,
    status: 'BREAKDOWN_PENDING',
  });
}
