import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

const DEFAULT_CURRENCY = 'CNY';

export type WalletSnapshot = {
  userId: string;
  balanceCredits: bigint;
  currency: string;
  updatedAt: Date;
};

export async function getWallet(userId: string): Promise<WalletSnapshot | null> {
  const wallet = await prisma.wallets.findUnique({ where: { user_id: userId } });
  if (!wallet) return null;
  return {
    userId: wallet.user_id,
    balanceCredits: wallet.balance_credits,
    currency: wallet.currency,
    updatedAt: wallet.updated_at ?? new Date(),
  };
}

export async function ensureWallet(userId: string): Promise<WalletSnapshot> {
  const wallet = await prisma.wallets.upsert({
    where: { user_id: userId },
    update: {},
    create: {
      user_id: userId,
      balance_credits: BigInt(0),
      currency: DEFAULT_CURRENCY,
    },
  });

  return {
    userId: wallet.user_id,
    balanceCredits: wallet.balance_credits,
    currency: wallet.currency,
    updatedAt: wallet.updated_at ?? new Date(),
  };
}

interface AdjustOptions {
  reason: 'recharge' | 'deduct' | 'refund' | 'promo';
  amountCny?: number;
  channel?: string;
  refId?: string;
  meta?: Record<string, unknown>;
}

interface AdjustResult extends WalletSnapshot {
  transactionId: string;
}

export async function adjustWalletCredits(
  userId: string,
  deltaCredits: bigint,
  options: AdjustOptions
): Promise<AdjustResult> {
  return prisma.$transaction((tx) =>
    adjustWalletCreditsInTransaction(tx, userId, deltaCredits, options)
  );
}

export async function adjustWalletCreditsInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  deltaCredits: bigint,
  options: AdjustOptions
): Promise<AdjustResult> {
  if (deltaCredits === BigInt(0)) {
    throw new Error('deltaCredits must be non-zero');
  }

  const { reason, amountCny, channel, refId, meta } = options;

  const wallet = await tx.wallets.upsert({
    where: { user_id: userId },
    update: {},
    create: {
      user_id: userId,
      balance_credits: BigInt(0),
      currency: DEFAULT_CURRENCY,
    },
  });

  const updatedBalance = wallet.balance_credits + deltaCredits;
  if (updatedBalance < BigInt(0)) {
    throw new Error('Insufficient credits');
  }

  await tx.wallets.update({
    where: { user_id: userId },
    data: {
      balance_credits: updatedBalance,
    },
  });

  const transaction = await tx.transactions.create({
    data: {
      user_id: userId,
      type: reason,
      amount_credits: deltaCredits,
      amount_cny: typeof amountCny === 'number' ? amountCny : undefined,
      channel,
      ref_id: refId,
      meta: meta ? meta : undefined,
    },
  });

  return {
    userId,
    balanceCredits: updatedBalance,
    currency: wallet.currency,
    updatedAt: transaction.created_at,
    transactionId: transaction.id,
  };
}
