import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/earn/auth';
import { forbidden, jsonError } from '@/lib/earn/response';
import { badRequest, buildMaterialInput } from '@/lib/earn/service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return forbidden();

  try {
    const { id } = await params;
    const materials = await prisma.earnTaskMaterial.findMany({
      where: { taskId: id },
      orderBy: [{ createdAt: 'desc' }],
    });
    return NextResponse.json({ data: materials });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return forbidden();

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw badRequest('Invalid JSON body');

    const { id } = await params;
    const task = await prisma.earnTask.findUnique({ where: { id }, select: { id: true } });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const material = await prisma.earnTaskMaterial.create({
      data: buildMaterialInput(id, body),
    });

    return NextResponse.json({ data: material });
  } catch (error) {
    return jsonError(error);
  }
}
