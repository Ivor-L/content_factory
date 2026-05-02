import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import {
  createDigitalHumanJob,
  type DigitalHumanMode,
  type DigitalHumanSourceType,
} from '@/lib/digitalHumanJob';

function inferSourceType(url: string | null | undefined): DigitalHumanSourceType {
  const normalized = String(url ?? '').trim().toLowerCase();
  if (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(normalized)) return 'VIDEO';
  return 'IMAGE';
}

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
    const sourceType = inferSourceType(original.imageUrl);
    await createDigitalHumanJob({
      type: original.type as DigitalHumanMode,
      sourceType,
      imageUrl: sourceType === 'IMAGE' ? original.imageUrl : undefined,
      videoUrl: sourceType === 'VIDEO' ? original.imageUrl : undefined,
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
