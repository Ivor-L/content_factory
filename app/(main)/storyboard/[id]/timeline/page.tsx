export const dynamic = "force-dynamic";

import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { StoryboardTimelineView } from '../../StoryboardTimelineView';

export default async function StoryboardTimelinePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const task = await prisma.storyboardTask.findUnique({
    where: { id: params.id },
    include: {
      product: true,
      segments: {
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!task || !task.segments.length) {
    notFound();
  }

  return <StoryboardTimelineView initialTask={task} />;
}
