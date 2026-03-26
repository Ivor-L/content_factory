import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';

export async function GET(request: Request) {
  const ctx = await getRequestUserContext(request);
  if (!ctx.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get('limit') ?? '20');
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitParam) ? limitParam : 20));
  const before = searchParams.get('before');
  const modelId = searchParams.get('model');
  const route = searchParams.get('route');

  const where: any = { user_id: ctx.userId };
  if (modelId) where.model_id = modelId;
  if (route) where.route = route;
  if (before) {
    const beforeDate = new Date(before);
    if (!isNaN(beforeDate.getTime())) {
      where.created_at = { lt: beforeDate };
    }
  }

  const usage = await prisma.usage_logs.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: limit + 1,
  });

  const items = usage.slice(0, limit).map((log) => ({
    id: log.id,
    modelId: log.model_id,
    route: log.route,
    promptTokens: log.prompt_tokens,
    completionTokens: log.completion_tokens,
    chargedCredits: log.charged_credits.toString(),
    priceCny: Number(log.price_cny),
    responseMs: log.response_ms,
    createdAt: log.created_at,
  }));

  const nextCursor = usage.length > limit ? usage[limit].created_at.toISOString() : null;

  return NextResponse.json({
    ok: true,
    items,
    nextCursor,
  });
}
