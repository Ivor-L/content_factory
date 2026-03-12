export const dynamic = 'force-dynamic';

import prisma from '@/lib/prisma';
import { ReplicationShotList } from './ReplicationShotList';
import { normalizeReplicationShotTask } from '@/lib/replicationShots';

export default async function ReplicationShotsPage() {
  const [tasks, scripts, products, characters] = await Promise.all([
    prisma.replicationShotTask.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        script: { select: { id: true, title: true } },
        product: { select: { id: true, name: true } },
        character: { select: { id: true, name: true, avatar: true } },
      },
    }),
    prisma.script.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true },
    }),
    prisma.product.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, name: true },
    }),
    prisma.character.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, name: true },
    }),
  ]);

  const normalizedTasks = tasks.map((task) => normalizeReplicationShotTask(task as any));

  return (
    <ReplicationShotList
      initialTasks={JSON.parse(JSON.stringify(normalizedTasks))}
      scripts={scripts.map((script) => ({
        id: script.id,
        label: script.title,
      }))}
      products={products.map((product) => ({
        id: product.id,
        label: product.name || product.id,
      }))}
      characters={characters.map((character) => ({
        id: character.id,
        label: character.name || character.id,
      }))}
    />
  );
}
