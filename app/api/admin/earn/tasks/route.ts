import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/earn/auth';
import { forbidden, jsonError } from '@/lib/earn/response';
import { badRequest, buildTaskInput, listTasks } from '@/lib/earn/service';

export async function GET(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return forbidden();

  try {
    const result = await listTasks(new URL(request.url).searchParams, true);
    return NextResponse.json({ data: result.items, total: result.total, page: result.page, pageSize: result.pageSize });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return forbidden();

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw badRequest('Invalid JSON body');

    const task = await prisma.earnTask.create({
      data: buildTaskInput(body, adminId),
      include: {
        materials: true,
      },
    });

    return NextResponse.json({ data: task });
  } catch (error) {
    return jsonError(error);
  }
}
