import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/earn/auth';
import { forbidden, jsonError } from '@/lib/earn/response';
import { badRequest } from '@/lib/earn/service';
import { safeTrim } from '@/lib/earn/normalize';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return forbidden();

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const { id } = await params;

    const current = await prisma.earnUserTask.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    if (current.status !== 'pending') throw badRequest('Only pending submissions can be rejected');

    const updated = await prisma.earnUserTask.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNote: safeTrim(body.reviewNote) || '未通过审核',
      },
      include: {
        task: true,
        taskMaterial: true,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return jsonError(error);
  }
}
