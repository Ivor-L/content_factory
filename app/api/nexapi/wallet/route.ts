import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { ensureWallet } from '@/lib/nexapi/wallet';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  const ctx = await getRequestUserContext(request);
  if (!ctx.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const wallet = await ensureWallet(ctx.userId);
  const transactions = await prisma.transaction.findMany({
    where: { userId: ctx.userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
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

  return NextResponse.json({
    ok: true,
    wallet: {
      balanceCredits: wallet.balanceCredits.toString(),
      currency: wallet.currency,
      updatedAt: wallet.updatedAt,
    },
    transactions: transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amountCredits: tx.amountCredits.toString(),
      amountCny: tx.amountCny ? Number(tx.amountCny) : null,
      channel: tx.channel,
      port: tx.type === 'agent_capability_capture' ? 'agent' : tx.channel || 'web',
      source: tx.type === 'agent_capability_capture' ? 'Agent' : tx.channel || 'Web',
      capabilityId: tx.refId ? agentRunMap.get(tx.refId)?.capabilityId ?? null : null,
      refId: tx.refId,
      createdAt: tx.createdAt,
    })),
  });
}
