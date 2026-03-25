export const dynamic = "force-dynamic";

import prisma from '@/lib/prisma';
import { isDatabaseConnectionError } from '@/lib/isDatabaseConnectionError';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StoryboardTimelineView } from '../../StoryboardTimelineView';

async function fetchTimelineTask(id: string) {
  try {
    const task = await prisma.storyboardTask.findUnique({
      where: { id },
      include: {
        product: true,
        segments: {
          orderBy: { order: 'asc' },
        },
      },
    });
    return { task, dbUnavailable: false as const };
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      console.error('[storyboard] Database connection unavailable on timeline page', {
        taskId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { task: null, dbUnavailable: true as const };
    }
    throw error;
  }
}

export default async function StoryboardTimelinePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { task, dbUnavailable } = await fetchTimelineTask(params.id);

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
              href={`/storyboard/${params.id}`}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
            >
              返回分镜详情
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!task || !task.segments.length) {
    notFound();
  }

  return <StoryboardTimelineView initialTask={task} />;
}
