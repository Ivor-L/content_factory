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
  const transactions = await prisma.transactions.findMany({
    where: { user_id: ctx.userId },
    orderBy: { created_at: 'desc' },
    take: 20,
  });

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
      amountCredits: tx.amount_credits.toString(),
      amountCny: tx.amount_cny ? Number(tx.amount_cny) : null,
      channel: tx.channel,
      createdAt: tx.created_at,
    })),
  });
}
