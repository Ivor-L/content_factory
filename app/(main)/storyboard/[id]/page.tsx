export const dynamic = "force-dynamic";


import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { StoryboardTaskDetail } from '../StoryboardTaskDetail';

export default async function StoryboardDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const task = await prisma.storyboardTask.findUnique({
    where: { id: params.id },
    include: {
      product: true,
      character: true,
      segments: {
        orderBy: {
          order: 'asc'
        }
      }
    }
  });

  if (!task) {
    notFound();
  }

  return <StoryboardTaskDetail initialTask={task} />;
}
