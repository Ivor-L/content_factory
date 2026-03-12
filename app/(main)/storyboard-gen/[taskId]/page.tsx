
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { StoryboardGenDetail } from './StoryboardGenDetail';

interface PageProps {
  params: {
    taskId: string;
  };
}

export default async function StoryboardGenDetailPage({ params }: PageProps) {
  const task = await prisma.storyboardTask.findUnique({
    where: { id: params.taskId },
  });

  if (!task) {
    notFound();
  }

  return <StoryboardGenDetail task={task} />;
}
