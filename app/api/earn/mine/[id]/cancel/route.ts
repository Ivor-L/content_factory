import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/earn/auth';
import { jsonError, unauthorized } from '@/lib/earn/response';
import { badRequest } from '@/lib/earn/service';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(request);
  if (!auth) return unauthorized();

  try {
    const { id } = await params;
    const current = await prisma.earnUserTask.findFirst({
      where: { id, userId: auth.userId! },
    });
    if (!current) return NextResponse.json({ error: 'User task not found' }, { status: 404 });
    if (current.status !== 'doing') throw badRequest('Only doing tasks can be cancelled');

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.earnUserTask.update({
        where: { id },
        data: { status: 'cancelled' },
        include: {
          task: true,
          taskMaterial: true,
        },
      });

      await tx.earnTask.updateMany({
        where: {
          id: current.taskId,
          currentParticipants: { gt: 0 },
        },
        data: {
          currentParticipants: { decrement: 1 },
        },
      });

      return next;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return jsonError(error);
  }
}
