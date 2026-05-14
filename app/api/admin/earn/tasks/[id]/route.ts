import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/earn/auth';
import { forbidden, jsonError } from '@/lib/earn/response';
import { badRequest, buildTaskUpdateInput, getAdminTask } from '@/lib/earn/service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return forbidden();

  try {
    const { id } = await params;
    const task = await getAdminTask(id);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json({ data: task });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return forbidden();

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw badRequest('Invalid JSON body');

    const { id } = await params;
    const updated = await prisma.earnTask.update({
      where: { id },
      data: buildTaskUpdateInput(body),
      include: {
        materials: true,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return forbidden();

  try {
    const { id } = await params;
    const updated = await prisma.earnTask.update({
      where: { id },
      data: { status: 'archived' },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return jsonError(error);
  }
}
