import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { normalizeReplicationShotTask } from '@/lib/replicationShots';

const STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING: { label: '等待中', className: 'bg-gray-100 text-gray-600' },
  SCENE_GENERATING: { label: '生成场景图', className: 'bg-blue-100 text-blue-700' },
  SCENE_PENDING_CONFIRM: { label: '等待确认', className: 'bg-amber-100 text-amber-800' },
  SHOTS_GENERATING: { label: '生成分镜', className: 'bg-purple-100 text-purple-700' },
  SHOTS_COMPLETED: { label: '分镜完成', className: 'bg-emerald-100 text-emerald-700' },
  VIDEOS_GENERATING: { label: '生成视频', className: 'bg-indigo-100 text-indigo-700' },
  COMPLETED: { label: '已完成', className: 'bg-green-100 text-green-700' },
  FAILED: { label: '失败', className: 'bg-rose-100 text-rose-700' },
};

const formatDate = (value?: Date) => {
  if (!value) return '';
  return value.toLocaleString();
};

export default async function ReplicationShotDetailPage({
  params,
}: {
  params: { taskId: string };
}) {
  const taskRecord = await prisma.replicationShotTask.findUnique({
    where: { id: params.taskId },
    include: {
      script: { select: { id: true, title: true } },
      product: { select: { id: true, name: true } },
      character: { select: { id: true, name: true, avatar: true } },
    },
  });

  if (!taskRecord) {
    notFound();
  }

  const task = normalizeReplicationShotTask(taskRecord as any);
  const statusMeta = STATUS_META[task.status] || STATUS_META.PENDING;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">
            <Link href="/replication-shots" className="text-black hover:underline">
              ← 返回列表
            </Link>
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-2">
            {task.script?.title || '分镜任务'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            任务 ID：{task.id}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-4 py-1 text-sm font-medium ${statusMeta.className}`}
        >
          {statusMeta.label}
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">基础信息</h2>
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
            <p>脚本：{task.script?.title || '—'}</p>
            <p>人物：{task.character?.name || '—'}</p>
            <p>产品：{task.product?.name || '—'}</p>
            <p>创建时间：{formatDate(taskRecord.createdAt)}</p>
            <p>更新时间：{formatDate(taskRecord.updatedAt)}</p>
          </div>
          {task.sceneImageUrl ? (
            <img
              src={task.sceneImageUrl}
              alt="scene"
              className="rounded-xl border border-gray-200 dark:border-gray-800 mt-2"
            />
          ) : (
            <div className="text-xs text-gray-400 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4">
              场景图尚未生成
            </div>
          )}
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">最终视频</h2>
          {task.finalVideoUrl ? (
            <video
              controls
              src={task.finalVideoUrl}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-800"
            />
          ) : (
            <p className="text-sm text-gray-500">暂无最终视频</p>
          )}
          {task.videos?.length ? (
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
              {task.videos.map((video) => (
                <li key={`${task.id}-video-${video.index}`} className="flex items-center justify-between gap-2">
                  <span>
                    分镜 {video.index + 1} · {video.status}
                  </span>
                  {video.videoUrl && (
                    <a
                      href={video.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-black dark:text-white hover:underline text-xs"
                    >
                      查看
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">等待分镜视频生成</p>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">分镜脚本</h2>
        {task.shotPrompts?.length ? (
          <div className="grid md:grid-cols-2 gap-4">
            {task.shotPrompts.map((shot) => (
              <div
                key={`${task.id}-shot-${shot.index}`}
                className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 text-sm space-y-1"
              >
                <p className="text-gray-900 dark:text-white font-medium">分镜 {shot.index + 1}</p>
                {shot.title && <p className="text-gray-700 dark:text-gray-200">{shot.title}</p>}
                {shot.description && (
                  <p className="text-gray-500 dark:text-gray-400 text-xs">{shot.description}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">尚未生成分镜脚本。</p>
        )}
      </div>
    </div>
  );
}
