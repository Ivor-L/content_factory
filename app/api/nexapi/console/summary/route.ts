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
    prisma.transactions.findMany({
      where: { user_id: ctx.userId },
      orderBy: { created_at: 'desc' },
      take: 5,
    }),
    prisma.usage_logs.findMany({
      where: { user_id: ctx.userId },
      orderBy: { created_at: 'desc' },
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
      amountCredits: tx.amount_credits.toString(),
      amountCny: tx.amount_cny ? Number(tx.amount_cny) : null,
      channel: tx.channel,
      createdAt: tx.created_at,
    })),
    usage: recentUsage.map((usage) => ({
      id: usage.id,
      modelId: usage.model_id,
      route: usage.route,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      chargedCredits: usage.charged_credits.toString(),
      priceCny: Number(usage.price_cny),
      createdAt: usage.created_at,
    })),
    routes: routeHealth,
  });
}
