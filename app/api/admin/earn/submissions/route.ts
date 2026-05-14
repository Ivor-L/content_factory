import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/earn/auth';
import { forbidden, jsonError } from '@/lib/earn/response';
import { listSubmissions } from '@/lib/earn/service';

export async function GET(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return forbidden();

  try {
    const result = await listSubmissions(new URL(request.url).searchParams);
    return NextResponse.json({ data: result.items, total: result.total, page: result.page, pageSize: result.pageSize });
  } catch (error) {
    return jsonError(error);
  }
}
