import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/earn/auth';
import { jsonError, unauthorized } from '@/lib/earn/response';
import { listUserTasks } from '@/lib/earn/service';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth) return unauthorized();

  try {
    const result = await listUserTasks(new URL(request.url).searchParams, auth.userId!);
    return NextResponse.json({ data: result.items, total: result.total, page: result.page, pageSize: result.pageSize });
  } catch (error) {
    return jsonError(error);
  }
}
