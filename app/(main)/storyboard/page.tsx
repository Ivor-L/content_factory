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

  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' }
  });
  const serializedProducts = JSON.parse(JSON.stringify(products));

  const characters = await prisma.character.findMany({
    orderBy: { createdAt: 'desc' }
  });
  const serializedCharacters = JSON.parse(JSON.stringify(characters));

  return <StoryboardTaskList initialTasks={serializedTasks} products={serializedProducts} characters={serializedCharacters} />;
}
