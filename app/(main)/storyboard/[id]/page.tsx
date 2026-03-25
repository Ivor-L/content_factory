export const dynamic = "force-dynamic";


import prisma from '@/lib/prisma';
import { isDatabaseConnectionError } from '@/lib/isDatabaseConnectionError';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StoryboardCreationPage, StoryboardWorkspaceInitialData } from '../StoryboardCreationPage';
import { ViralCloneStoryboardPage } from './components/ViralCloneStoryboardPage';

async function fetchTaskById(id: string) {
  try {
    const task = await prisma.storyboardTask.findUnique({
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
    return { task, dbUnavailable: false as const };
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      console.error('[storyboard] Database connection unavailable on detail page', {
        taskId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { task: null, dbUnavailable: true as const };
    }
    throw error;
  }
}

type StoryboardTaskWithRelations = NonNullable<Awaited<ReturnType<typeof fetchTaskById>>['task']>;

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
  const { task, dbUnavailable } = await fetchTaskById(params.id);

  if (dbUnavailable) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center px-6 py-12">
        <section className="w-full rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">数据库暂时不可用</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            当前无法连接到 PostgreSQL（{`127.0.0.1:54322`}）。请先启动本地 Supabase/数据库或改为可用的云端
            {` DATABASE_URL`}，然后刷新页面。
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/storyboard"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
            >
              返回分镜列表
            </Link>
          </div>
        </section>
      </main>
    );
  }

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

  // For viral-clone mode (or tasks with segments), show the specialized view
  if ((task as any).replicationMode === 'viral-clone' || task.segments.length > 0) {
    return <ViralCloneStoryboardPage task={task as any} />;
  }

  return <StoryboardCreationPage initialData={initialData} timelineLink={timelineLink} />;
}
