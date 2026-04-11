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
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) return null;
  return {
    userId: wallet.userId,
    balanceCredits: wallet.balanceCredits,
    currency: wallet.currency,
    updatedAt: wallet.updatedAt ?? new Date(),
  };
}

export async function ensureWallet(userId: string): Promise<WalletSnapshot> {
  const wallet = await prisma.wallet.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      balanceCredits: BigInt(0),
      currency: DEFAULT_CURRENCY,
    },
  });

  return {
    userId: wallet.userId,
    balanceCredits: wallet.balanceCredits,
    currency: wallet.currency,
    updatedAt: wallet.updatedAt ?? new Date(),
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

  const wallet = await tx.wallet.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      balanceCredits: BigInt(0),
      currency: DEFAULT_CURRENCY,
    },
  });

  const updatedBalance = wallet.balanceCredits + deltaCredits;
  if (updatedBalance < BigInt(0)) {
    throw new Error('Insufficient credits');
  }

  await tx.wallet.update({
    where: { userId },
    data: {
      balanceCredits: updatedBalance,
    },
  });

  const transaction = await tx.transaction.create({
    data: {
      userId,
      type: reason,
      amountCredits: deltaCredits,
      amountCny: typeof amountCny === 'number' ? amountCny : undefined,
      channel,
      refId,
      meta: meta ? (meta as Prisma.InputJsonValue) : undefined,
    },
  });

  return {
    userId,
    balanceCredits: updatedBalance,
    currency: wallet.currency,
    updatedAt: transaction.createdAt,
    transactionId: transaction.id,
  };
}
