import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/earn/auth';
import { getPublicTask } from '@/lib/earn/service';
import { jsonError, unauthorized } from '@/lib/earn/response';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(request);
  if (!auth) return unauthorized();

  try {
    const { id } = await params;
    const task = await getPublicTask(id);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json({ data: task });
  } catch (error) {
    return jsonError(error);
  }
}
