export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { getServerRequestUserContext } from '@/lib/serverRequestContext';
import { EarnTaskDetailClient } from './EarnTaskDetailClient';
import { isEarnMarketEnabled } from '@/lib/earnFeatureFlag';

export default async function EarnTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isEarnMarketEnabled) notFound();

  const { userId } = await getServerRequestUserContext();
  if (!userId) return <div className="p-8">Unauthorized</div>;

  const { id } = await params;
  const task = await prisma.earnTask.findFirst({
    where: {
      id,
      status: 'active',
      OR: [
        { deadlineAt: null },
        { deadlineAt: { gt: new Date() } },
      ],
    },
    include: {
      materials: {
        where: { enabled: true },
        orderBy: [{ usedCount: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });

  if (!task) notFound();
  return <EarnTaskDetailClient task={JSON.parse(JSON.stringify(task))} />;
}
