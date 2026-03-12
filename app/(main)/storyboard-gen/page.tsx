
export const dynamic = "force-dynamic";

import prisma from '@/lib/prisma';
import { StoryboardGenList } from './StoryboardGenList';

export default async function StoryboardGenPage() {
  const tasks = await prisma.storyboardTask.findMany({
    orderBy: {
      createdAt: 'desc',
    }
  });

  const serializedTasks = JSON.parse(JSON.stringify(tasks));

  return <StoryboardGenList initialTasks={serializedTasks} />;
}
