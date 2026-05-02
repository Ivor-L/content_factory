import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { runBreakdownForMyNote } from '@/lib/imageTextMyNotes';

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

  await prisma.imageTextReplicationTask.update({
    where: { id },
    data: {
      status: 'BREAKDOWN_PENDING',
      analysisResult: Prisma.JsonNull,
      generatedCopy: null,
      generatedImages: Prisma.JsonNull,
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
