import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { ensureWallet } from '@/lib/nexapi/wallet';
import prisma from '@/lib/prisma';
import { listRouteConfigs, checkRouteHealth } from '@/lib/nexapi/routes';

export async function GET(request: Request) {
  const ctx = await getRequestUserContext(request);
  if (!ctx.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [wallet, recentTransactions, recentUsage] = await Promise.all([
    ensureWallet(ctx.userId),
    prisma.transaction.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.usageLog.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const routeConfigs = listRouteConfigs();
  const routeHealth = await Promise.all(routeConfigs.map((route) => checkRouteHealth(route)));

  return NextResponse.json({
    ok: true,
    wallet: {
      balanceCredits: wallet.balanceCredits.toString(),
      currency: wallet.currency,
      updatedAt: wallet.updatedAt,
    },
    transactions: recentTransactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amountCredits: tx.amountCredits.toString(),
      amountCny: tx.amountCny ? Number(tx.amountCny) : null,
      channel: tx.channel,
      createdAt: tx.createdAt,
    })),
    usage: recentUsage.map((usage) => ({
      id: usage.id,
      modelId: usage.modelId,
      route: usage.route,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      chargedCredits: usage.chargedCredits.toString(),
      priceCny: Number(usage.priceCny),
      createdAt: usage.createdAt,
    })),
    routes: routeHealth,
  });
}
