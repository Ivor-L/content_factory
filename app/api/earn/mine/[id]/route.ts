import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/earn/auth';
import { jsonError, unauthorized } from '@/lib/earn/response';
import { getUserTask } from '@/lib/earn/service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(request);
  if (!auth) return unauthorized();

  try {
    const { id } = await params;
    const userTask = await getUserTask(id, auth.userId!);
    if (!userTask) return NextResponse.json({ error: 'User task not found' }, { status: 404 });
    return NextResponse.json({ data: userTask });
  } catch (error) {
    return jsonError(error);
  }
}
