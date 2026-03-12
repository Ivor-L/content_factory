'use client';

import { useMemo } from 'react';
import { LayoutGrid, Loader2, RefreshCcw, Trash2, Maximize2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

type StoryboardTask = Record<string, any> | null;

interface StoryboardTaskDetailModalProps {
  isOpen: boolean;
  task: StoryboardTask;
  onClose: () => void;
  onPreviewImage: (url: string) => void;
  onRegenerate: (task: any) => void;
  onSplit: (task: any) => Promise<void> | void;
  onDelete: () => void;
  splitLoading?: boolean;
  disableSplit?: boolean;
}

function parseStructure(value: any): any {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function extractShots(structure: any): any[] {
  const root = parseStructure(structure);
  if (!root) return [];
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.shots)) return root.shots;
  if (Array.isArray(root?.scenes)) return root.scenes;
  if (Array.isArray(root?.panels)) return root.panels;
  if (Array.isArray(root?.data?.shots)) return root.data.shots;
  return [];
}

function getShotImage(shot: any): string | null {
  return (
    shot?.image_url ||
    shot?.imageUrl ||
    shot?.frameUrl ||
    shot?.frame_url ||
    shot?.thumbnail ||
    shot?.preview ||
    shot?.first_frame_url ||
    shot?.firstFrameUrl ||
    shot?.url ||
    null
  );
}

function getShotPrompt(shot: any): string {
  return (
    shot?.prompt ||
    shot?.prompt_text ||
    shot?.description ||
    shot?.text ||
    shot?.caption ||
    ''
  );
}

function getStatusBadge(status?: string) {
  switch (status) {
    case 'SPLIT_COMPLETED':
    case 'GRID_COMPLETED':
      return 'bg-green-100 text-green-700';
    case 'SPLIT_PENDING':
    case 'GENERATING_IMAGE':
    case 'GENERATING_GRID':
      return 'bg-blue-100 text-blue-700';
    case 'FAILED':
    case 'SPLIT_FAILED':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function StoryboardTaskDetailModal({
  isOpen,
  task,
  onClose,
  onPreviewImage,
  onRegenerate,
  onSplit,
  onDelete,
  splitLoading = false,
  disableSplit = false,
}: StoryboardTaskDetailModalProps) {
  const { t } = useLanguage();

  const shots = useMemo(() => extractShots(task?.storyboardStructure), [task]);
  const heroImage =
    task?.storyboardImageUrl || task?.coverImage || task?.sceneImage || task?.referenceImage;
  const canSplit = !!heroImage && !disableSplit;

  if (!isOpen || !task) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-6xl h-[88vh] bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
        <header className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t.storyboard.genList?.detailTitle || 'Storyboard Detail'}
            </p>
            <div className="flex items-center gap-3 mt-1">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                {task.scriptContent?.slice(0, 40) || task.id}
              </h2>
              <span
                className={cn(
                  'text-xs font-semibold px-3 py-1 rounded-full',
                  getStatusBadge(task.status)
                )}
              >
                {task.status}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="relative bg-gray-100 dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 min-h-[320px] flex items-center justify-center overflow-hidden">
              {heroImage ? (
                <button
                  onClick={() => onPreviewImage(heroImage)}
                  className="relative w-full h-full"
                >
                  <img
                    src={heroImage}
                    alt="storyboard grid"
                    className="w-full h-full object-contain"
                  />
                  <span className="absolute bottom-4 right-4 inline-flex items-center gap-2 bg-black/70 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur">
                    <Maximize2 className="w-3.5 h-3.5" />
                    {t.storyboard.genList?.preview || '预览'}
                  </span>
                </button>
              ) : (
                <div className="text-center text-gray-400 flex flex-col items-center gap-2">
                  <LayoutGrid className="w-12 h-12" />
                  <p>{t.storyboard.genList?.noImage || '暂无成片'}</p>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <section className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                  {t.generation.scriptContent}
                </p>
                <div className="text-sm text-gray-800 dark:text-gray-200 max-h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {task.scriptContent || t.storyboard.genList?.noScript || '暂无脚本'}
                </div>
              </section>

              <section className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                  {t.storyboard.genList?.metadata || '任务信息'}
                </p>
                <dl className="text-sm text-gray-700 dark:text-gray-200 space-y-2">
                  <div className="flex justify-between">
                    <dt className="opacity-70">ID</dt>
                    <dd className="font-mono">{task.id}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="opacity-70">{t.storyboard.genList?.videoType || '类型'}</dt>
                    <dd className="uppercase font-semibold">{task.videoType || 'UGC'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="opacity-70">{t.storyboard.genList?.status || '状态'}</dt>
                    <dd>{task.status}</dd>
                  </div>
                </dl>
              </section>
            </div>
          </div>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t.storyboard.genList?.shotsSection || '拆解分镜'}
              </h3>
              <span className="text-xs text-gray-500">
                {shots.length} {t.storyboard.genList?.shots || 'Shots'}
              </span>
            </div>
            {shots.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-500">
                {t.storyboard.genList?.shotsPlaceholder || '等待拆解完成后查看具体分镜。'}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {shots.map((shot, index) => {
                  const imageUrl = getShotImage(shot);
                  const prompt = getShotPrompt(shot);
                  return (
                    <div
                      key={`${shot?.id || index}-${index}`}
                      className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden"
                    >
                      <div className="relative bg-gray-100 dark:bg-gray-800 h-48 flex items-center justify-center">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={`shot-${index + 1}`}
                            className="w-full h-full object-cover cursor-zoom-in"
                            onClick={() => onPreviewImage(imageUrl)}
                          />
                        ) : (
                          <div className="text-gray-400 flex flex-col items-center gap-2">
                            <LayoutGrid className="w-6 h-6" />
                            <span className="text-xs">{t.storyboard.genList?.noImage || '无图片'}</span>
                          </div>
                        )}
                        <span className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold bg-black/70 text-white">
                          #{index + 1}
                        </span>
                      </div>
                      <div className="p-4 space-y-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {shot?.title || shot?.scene || `${t.storyboard.genList?.shot || '镜头'} ${index + 1}`}
                        </p>
                        {prompt && (
                          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                            {prompt}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <footer className="p-6 border-t border-gray-100 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90 backdrop-blur flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {t.common.delete}
          </button>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <button
              onClick={() => onRegenerate(task)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <RefreshCcw className="w-4 h-4" />
              {t.storyboard.genList?.regenerate || '重新生成'}
            </button>
            <button
              onClick={() => onSplit(task)}
              disabled={!canSplit || splitLoading}
              className={cn(
                'inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors',
                canSplit && !splitLoading
                  ? 'bg-black hover:bg-gray-900'
                  : 'bg-gray-500 cursor-not-allowed'
              )}
            >
              {splitLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LayoutGrid className="w-4 h-4" />
              )}
              {t.storyboard.genList?.split || '一键拆解'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
