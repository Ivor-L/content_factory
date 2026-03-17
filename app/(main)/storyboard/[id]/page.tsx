export const dynamic = "force-dynamic";


import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { StoryboardCreationPage, StoryboardWorkspaceInitialData } from '../StoryboardCreationPage';

async function fetchTaskById(id: string) {
  return prisma.storyboardTask.findUnique({
    where: { id },
    include: {
      product: true,
      character: true,
      segments: {
        orderBy: {
          order: 'asc',
        },
      },
    },
  });
}

type StoryboardTaskWithRelations = NonNullable<Awaited<ReturnType<typeof fetchTaskById>>>;

const parseJsonValue = (value: unknown) => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
};

const extractImageUrls = (value: unknown): string[] => {
  const parsed = parseJsonValue(value) ?? value;
  if (typeof parsed === 'string') {
    return parsed ? [parsed] : [];
  }
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => {
        if (!item) return null;
        if (typeof item === 'string') return item;
        if (typeof item === 'object') {
          return (item as any).url || (item as any).image_url || (item as any).imageUrl || null;
        }
        return null;
      })
      .filter((url): url is string => typeof url === 'string' && url.length > 0);
  }
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).images)) {
    return extractImageUrls((parsed as any).images);
  }
  return [];
};

const buildWorkspaceData = (task: StoryboardTaskWithRelations): StoryboardWorkspaceInitialData => {
  const rows = task.segments.map((segment) => ({
    id: segment.id,
    prompt: segment.imagePrompt || segment.videoPrompt || '',
    timeRange: segment.timeRange || '',
    firstFrameUrl: segment.generatedImage || undefined,
    lastFrameUrl: segment.generatedVideo || undefined,
  }));

  if (!rows.length) {
    const structure = parseJsonValue(task.storyboardStructure);
    const shots = Array.isArray(structure?.shots) ? structure.shots : [];
    if (shots.length) {
      shots.forEach((shot: any, index: number) => {
        rows.push({
          id: `shot-${shot?.shot_index ?? index + 1}`,
          prompt:
            [shot?.story_beat, shot?.prompt_text].filter(Boolean).join('\n').trim() ||
            shot?.title ||
            '',
          timeRange: shot?.time_range || '',
          firstFrameUrl: shot?.image_url || shot?.imageUrl || undefined,
          lastFrameUrl: shot?.video_url || shot?.videoUrl || undefined,
        });
      });
    } else {
      const imageUrls = extractImageUrls(task.storyboardImages || task.storyboardImageUrl || []);
      imageUrls.forEach((url, index) => {
        rows.push({
          id: `image-${index + 1}`,
          prompt: '',
          timeRange: '',
          firstFrameUrl: url,
          lastFrameUrl: undefined,
        });
      });
    }
  }

  const displayName =
    task.product?.name ||
    task.character?.name ||
    task.scriptContent?.split('\n').find((line) => line.trim().length > 0) ||
    `Storyboard ${task.id.slice(-6).toUpperCase()}`;

  return {
    taskName: displayName,
    rows,
  };
};

export default async function StoryboardDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const task = await fetchTaskById(params.id);

  if (!task) {
    notFound();
  }

  const initialData = buildWorkspaceData(task);
  const timelineLink =
    task.segments.length > 0
      ? {
          href: `/storyboard/${task.id}/timeline`,
        }
      : null;

  return <StoryboardCreationPage initialData={initialData} timelineLink={timelineLink} />;
}
