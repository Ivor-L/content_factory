export const dynamic = 'force-dynamic';

import prisma from '@/lib/prisma';
import { getServerRequestUserContext } from '@/lib/serverRequestContext';
import { EarnMineClient } from './EarnMineClient';
import { isEarnMarketEnabled } from '@/lib/earnFeatureFlag';
import { notFound } from 'next/navigation';

export default async function EarnMinePage() {
  if (!isEarnMarketEnabled) notFound();

  const { userId } = await getServerRequestUserContext();
  if (!userId) return <div className="p-8">Unauthorized</div>;

  const items = await prisma.earnUserTask.findMany({
    where: { userId },
    orderBy: [{ updatedAt: 'desc' }],
    take: 30,
    include: {
      task: true,
      taskMaterial: true,
    },
  });

  return <EarnMineClient initialItems={JSON.parse(JSON.stringify(items))} />;
}
