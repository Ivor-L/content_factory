export const dynamic = "force-dynamic";


import prisma from '@/lib/prisma';
import { StoryboardTaskList } from './StoryboardTaskList';

export default async function StoryboardPage() {
  const tasks = await prisma.storyboardTask.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      product: true,
      character: true,
      segments: true
    }
  });

  const serializedTasks = JSON.parse(JSON.stringify(tasks));

  return <StoryboardTaskList initialTasks={serializedTasks} />;
}
