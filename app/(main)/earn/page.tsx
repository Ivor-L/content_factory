export const dynamic = 'force-dynamic';

import prisma from '@/lib/prisma';
import { getServerRequestUserContext } from '@/lib/serverRequestContext';
import { EarnMarketClient } from './EarnMarketClient';
import { isEarnMarketEnabled } from '@/lib/earnFeatureFlag';
import { notFound } from 'next/navigation';

export default async function EarnPage() {
  if (!isEarnMarketEnabled) notFound();

  const { userId } = await getServerRequestUserContext();
  if (!userId) return <div className="p-8">Unauthorized</div>;

  const now = new Date();
  const where = {
    status: 'active',
    OR: [
      { deadlineAt: null },
      { deadlineAt: { gt: now } },
    ],
  };

  const [tasks, total] = await Promise.all([
    prisma.earnTask.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: 20,
      include: {
        _count: {
          select: { materials: true, userTasks: true },
        },
      },
    }),
    prisma.earnTask.count({ where }),
  ]);

  return <EarnMarketClient initialTasks={JSON.parse(JSON.stringify(tasks))} initialTotal={total} />;
}
