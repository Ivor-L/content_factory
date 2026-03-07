
import prisma from '@/lib/prisma';
import { StoryboardGenList } from './StoryboardGenList';

export default async function StoryboardGenPage() {
  const tasks = await prisma.storyboardTask.findMany({
    where: {
      status: {
        in: ['GENERATING_GRID', 'GRID_COMPLETED']
      }
    },
    orderBy: {
      createdAt: 'desc',
    }
  });

  const serializedTasks = JSON.parse(JSON.stringify(tasks));

  return <StoryboardGenList initialTasks={serializedTasks} />;
}
