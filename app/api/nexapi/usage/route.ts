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

  const where: any = { userId: ctx.userId };
  if (modelId) where.modelId = modelId;
  if (route) where.route = route;
  if (before) {
    const beforeDate = new Date(before);
    if (!isNaN(beforeDate.getTime())) {
      where.createdAt = { lt: beforeDate };
    }
  }

  const usage = await prisma.usageLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const items = usage.slice(0, limit).map((log) => ({
    id: log.id,
    modelId: log.modelId,
    route: log.route,
    promptTokens: log.promptTokens,
    completionTokens: log.completionTokens,
    chargedCredits: log.chargedCredits.toString(),
    priceCny: Number(log.priceCny),
    responseMs: log.responseMs,
    createdAt: log.createdAt,
  }));

  const nextCursor = usage.length > limit ? usage[limit].createdAt.toISOString() : null;

  return NextResponse.json({
    ok: true,
    items,
    nextCursor,
  });
}
