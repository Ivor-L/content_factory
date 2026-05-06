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
  if (before) {
    const beforeDate = new Date(before);
    if (!isNaN(beforeDate.getTime())) {
      where.createdAt = { lt: beforeDate };
    }
  }
  if (modelId || route) {
    where.meta = {
      path: modelId ? ['model'] : ['route'],
      equals: modelId || route,
    };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const agentRunIds = transactions
    .filter((tx) => tx.type === 'agent_capability_capture' && tx.refId)
    .map((tx) => tx.refId!);
  const agentRuns = agentRunIds.length
    ? await prisma.agentCapabilityRun.findMany({
        where: { id: { in: agentRunIds }, userId: ctx.userId },
        select: { id: true, capabilityId: true, mode: true },
      })
    : [];
  const agentRunMap = new Map(agentRuns.map((run) => [run.id, run]));

  const items = transactions.slice(0, limit).map((tx) => {
    const meta = asRecord(tx.meta);
    const agentRun = tx.refId ? agentRunMap.get(tx.refId) : null;
    const capabilityId = asString(meta.capabilityId) || agentRun?.capabilityId || null;
    const model = asString(meta.model) || capabilityId || tx.refId || tx.type;
    const txRoute = asString(meta.route) || capabilityId || tx.channel || tx.type;
    const port = asString(meta.port) || portFromTransaction(tx.type, tx.channel, txRoute, model);

    return {
      id: tx.id,
      type: tx.type,
      modelId: model,
      route: txRoute,
      port,
      source: asString(meta.source) || sourceFromPort(port),
      capabilityId,
      refId: tx.refId,
      promptTokens: asNumber(meta.promptTokens),
      completionTokens: asNumber(meta.completionTokens),
      chargedCredits: absoluteCredits(tx.amountCredits),
      amountCredits: tx.amountCredits.toString(),
      priceCny: asNumber(meta.priceCny) ?? (tx.amountCny ? Number(tx.amountCny) : 0),
      responseMs: asNumber(meta.responseMs),
      createdAt: tx.createdAt,
    };
  });

  const nextCursor = transactions.length > limit ? transactions[limit].createdAt.toISOString() : null;

  return NextResponse.json({
    ok: true,
    sourceTable: 'transactions',
    items,
    nextCursor,
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function absoluteCredits(value: bigint) {
  const text = value.toString();
  return text.startsWith('-') ? text.slice(1) : text;
}

function portFromTransaction(type: string, channel: string | null, route: string, modelId: string) {
  if (type === 'agent_capability_capture' || channel === 'agent') return 'agent';
  if (channel === 'api' || channel === 'usage' || route.includes('nexapi')) return 'api';
  if (channel === 'miniapp' || route.includes('miniapp') || route.includes('wechat')) return 'miniapp';
  if (modelId.startsWith('agent.') || route.startsWith('agent.') || route.includes('/api/agent')) return 'agent';
  return channel || 'web';
}

function sourceFromPort(port: string) {
  if (port === 'agent') return 'Agent';
  if (port === 'miniapp') return '小程序';
  if (port === 'api' || port === 'usage') return 'API';
  return 'Web';
}
