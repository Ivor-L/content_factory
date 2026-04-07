import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { createDigitalHumanJob, type DigitalHumanMode } from '@/lib/digitalHumanJob';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing task id' }, { status: 400 });
  }

  const original = await prisma.digitalHumanVideo.findFirst({
    where: { id, userId },
  });

  if (!original) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (original.status !== 'FAILED') {
    return NextResponse.json(
      { error: 'Only FAILED tasks can be retried' },
      { status: 409 },
    );
  }

  try {
    await createDigitalHumanJob({
      type: original.type as DigitalHumanMode,
      imageUrl: original.imageUrl,
      audioUrl: original.audioUrl,
      script: original.scriptContent || undefined,
      durationSeconds: original.durationSeconds ?? undefined,
      userId,
      sourceTaskId: original.sourceTaskId ?? undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to retry digital human job', { id, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Retry failed' },
      { status: 500 },
    );
  }
}
