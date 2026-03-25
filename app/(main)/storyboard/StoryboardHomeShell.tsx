'use client';

/* eslint-disable @next/next/no-img-element -- raw storyboard assets need vanilla img/video tags */

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { toast } from 'react-hot-toast';
import { Download, Clock3, Film, Video, Mic, Pencil } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { read, utils } from 'xlsx';
import type { ChangeEvent } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { useTenant } from '@/hooks/useTenant';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSidebarAutoCollapse } from '@/hooks/useSidebarAutoCollapse';
import type {
  StoryboardHomeStats,
  StoryboardHomeTask,
  StoryboardShot,
  StoryboardTimelineSegment,
} from './types';
import { StoryboardTimelineView } from './StoryboardTimelineView';

interface StoryboardHomeShellProps {
  tasks: StoryboardHomeTask[];
  stats: StoryboardHomeStats;
}

export function StoryboardHomeShell({ tasks, stats: _stats }: StoryboardHomeShellProps) {
  const router = useRouter();
  const { basePath } = useTenant();
  const { t: i18nText } = useLanguage();
  const t = i18nText as any;
  useSidebarAutoCollapse(true, true);
  const [taskCollection, setTaskCollection] = useState<StoryboardHomeTask[]>(tasks);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(tasks[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<'board' | 'timeline'>('board');
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>({});
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [lastInsertedShotId, setLastInsertedShotId] = useState<string | null>(null);
  const promptFileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTask = useMemo(
    () => taskCollection.find((task) => task.id === activeTaskId),
    [taskCollection, activeTaskId]
  );

  const timelineViewData = useMemo(() => {
    if (!activeTask) return null;
    const productMeta =
      activeTask.timelineProduct ??
      (activeTask.productName || activeTask.characterName
        ? { name: activeTask.productName ?? activeTask.characterName ?? undefined, images: null }
        : null);
    return {
      id: activeTask.id,
      status: activeTask.status,
      product: productMeta,
      segments: activeTask.timelineSegments ?? [],
      timeline: activeTask.timeline,
    };
  }, [activeTask]);

  const displayTitle = activeTask ? titleOverrides[activeTask.id] ?? activeTask.title : '';

  useEffect(() => {
    setTaskCollection(tasks);
  }, [tasks]);

  useEffect(() => {
    if (!tasks.length) {
      setActiveTaskId(null);
    } else if (!activeTask && tasks[0]) {
      setActiveTaskId(tasks[0].id);
    }
  }, [tasks, activeTask]);

  useEffect(() => {
    setLastInsertedShotId(null);
  }, [activeTaskId]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const handleCreateTask = () => {
    const path = `${basePath}/storyboard/create`;
    router.push(path);
  };

  const handleOpenTimeline = () => {
    if (!activeTask) {
      toast.error('请选择一个分镜任务后再查看时间轴');
      return;
    }
    setActiveTab('timeline');
  };

  const handleBatchDownload = () => {
    toast('批量下载功能即将上线，敬请期待');
  };

  const parseTextLines = (text: string) =>
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  const triggerInsertHighlight = useCallback((newId: string | null) => {
    if (!newId) return;
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    setLastInsertedShotId(newId);
    highlightTimerRef.current = setTimeout(() => {
      setLastInsertedShotId((current) => (current === newId ? null : current));
    }, 800);
  }, []);

  useEffect(() => {
    if (activeTask) {
      const nextTitle = titleOverrides[activeTask.id] ?? activeTask.title;
      setTitleDraft(nextTitle);
      setIsEditingTitle(false);
    } else {
      setTitleDraft('');
      setIsEditingTitle(false);
    }
  }, [activeTask, titleOverrides]);

  const startEditingTitle = () => {
    if (!activeTask) return;
    setTitleDraft(displayTitle);
    setIsEditingTitle(true);
  };

  const handleTitleSave = () => {
    if (!activeTask) return;
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      toast.error('名称不能为空');
      return;
    }
    setTitleOverrides((prev) => ({ ...prev, [activeTask.id]: trimmed }));
    setIsEditingTitle(false);
    toast.success('名称已更新（暂存于当前会话）');
  };

  const handleInsertShot = useCallback(
    (position: number) => {
      if (!activeTaskId) return;
      const insertedId = `temp-${Date.now()}`;
      setTaskCollection((prev) =>
        prev.map((task) => {
          if (task.id !== activeTaskId) return task;

          const baseDuration =
            (task.shots[position - 1]?.duration ?? task.shots[position]?.duration) ?? 8;
          const newShot: StoryboardShot = {
            id: insertedId,
            order: position + 1,
            label: '新增分镜',
            title: '新增分镜',
            description: null,
            videoPrompt: null,
            timeRange: null,
            duration: baseDuration,
            imageUrl: null,
            videoUrl: null,
            referenceThumbs: task.referenceThumbs || [],
            voiceover: null,
            status: 'DRAFT',
            tags: [],
            cameraNotes: null,
            lightingNotes: null,
          };

          const updatedShots = [...task.shots];
          updatedShots.splice(position, 0, newShot);
          const normalizedShots = updatedShots.map((shot, index) => ({
            ...shot,
            order: index + 1,
          }));
          const totalDuration = normalizedShots.reduce(
            (sum, shot) => sum + (shot.duration ?? 0),
            0
          );
          return {
            ...task,
            shots: normalizedShots,
            totalShots: normalizedShots.length,
            estimatedDuration: totalDuration,
          };
        })
      );
      triggerInsertHighlight(insertedId);
    },
    [activeTaskId, triggerInsertHighlight]
  );

  const appendShotsFromPrompts = useCallback(
    (prompts: string[]) => {
      if (!activeTaskId) {
        toast.error('请选择一个分镜任务后再导入提示词');
        return;
      }
      let addedCount = 0;
      let lastId: string | null = null;
      setTaskCollection((prev) =>
        prev.map((task) => {
          if (task.id !== activeTaskId) return task;
          const updatedShots = [...task.shots];
          prompts.forEach((prompt, index) => {
            const trimmed = prompt.trim();
            if (!trimmed) return;
            const id = `import-${Date.now()}-${addedCount}-${index}`;
            addedCount += 1;
            lastId = id;
            const baseTitle = trimmed.slice(0, 18) || '导入分镜';
            updatedShots.push({
              id,
              order: updatedShots.length + 1,
              label: baseTitle,
              title: baseTitle,
              description: trimmed,
              videoPrompt: trimmed,
              timeRange: null,
              duration: (updatedShots[updatedShots.length - 1]?.duration ?? 8) || 8,
              imageUrl: null,
              videoUrl: null,
              referenceThumbs: task.referenceThumbs || [],
              voiceover: null,
              status: 'DRAFT',
              tags: [],
              cameraNotes: null,
              lightingNotes: null,
            });
          });
          const normalizedShots = updatedShots.map((shot, index) => ({
            ...shot,
            order: index + 1,
          }));
          const totalDuration = normalizedShots.reduce(
            (sum, shot) => sum + (shot.duration ?? 0),
            0
          );
          return {
            ...task,
            shots: normalizedShots,
            totalShots: normalizedShots.length,
            estimatedDuration: totalDuration,
          };
        })
      );
      if (addedCount) {
        toast.success(`已导入 ${addedCount} 条提示词`);
        triggerInsertHighlight(lastId);
      } else {
        toast.error('未解析到有效的提示词内容');
      }
    },
    [activeTaskId, triggerInsertHighlight]
  );

  const handlePromptFilesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    try {
      const prompts: string[] = [];
      for (const file of Array.from(files)) {
        if (/\.xlsx?$/i.test(file.name)) {
          const buffer = await file.arrayBuffer();
          const workbook = read(buffer);
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) continue;
          const sheet = workbook.Sheets[sheetName];
          const rows = utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });
          rows.forEach((row) => {
            const line = row
              .map((cell) => (cell == null ? '' : String(cell)))
              .join(' ')
              .trim();
            if (line) prompts.push(line);
          });
        } else {
          const text = await file.text();
          parseTextLines(text).forEach((line) => prompts.push(line));
        }
      }
      if (!prompts.length) {
        toast.error('未解析到任何提示词');
        return;
      }
      appendShotsFromPrompts(prompts);
    } catch (error) {
      console.error(error);
      toast.error('导入提示词失败，请重试');
    } finally {
      event.target.value = '';
    }
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleImageFilesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    if (!activeTaskId) {
      toast.error('请选择一个分镜任务后再导入图片');
      event.target.value = '';
      return;
    }
    try {
      const dataUrls = await Promise.all(Array.from(files).map((file) => fileToDataUrl(file)));
      let appliedCount = 0;
      setTaskCollection((prev) =>
        prev.map((task) => {
          if (task.id !== activeTaskId) return task;
          const updatedShots = task.shots.map((shot, index) => {
            const dataUrl = dataUrls[index];
            if (!dataUrl) return shot;
            appliedCount += 1;
            return {
              ...shot,
              imageUrl: dataUrl,
            };
          });
          return {
            ...task,
            shots: updatedShots,
          };
        })
      );
      if (appliedCount) {
        toast.success(`已导入 ${appliedCount} 张图片`);
      } else {
        toast.error('图片数量不足，未进行导入');
      }
    } catch (error) {
      console.error(error);
      toast.error('导入图片失败，请重试');
    } finally {
      event.target.value = '';
    }
  };

  const handleSelectBoard = () => {
    setActiveTab('board');
  };

  if (!taskCollection.length) {
    return (
      <div className="rounded-[32px] border border-[var(--tenant-primary-muted)] bg-white/90 p-6 shadow-theme-glow dark:bg-gray-950/80">
        <EmptyState
          title={t.storyboard?.emptyTitle || '还没有分镜任务'}
          description={t.storyboard?.emptyDescription || '点击右上角的 + 创建你的第一条分镜任务'}
          action={{ label: t.storyboard?.createStoryboard || '创建分镜任务', onClick: handleCreateTask }}
          fullHeight
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-12 text-gray-900 dark:text-white sm:pt-[4.5rem]">
      <header className="fixed inset-x-0 top-0 z-20 border-b border-gray-200 bg-white/90 py-3 pl-[96px] pr-4 text-gray-900 shadow-[0_8px_24px_rgba(0,0,0,0.1)] backdrop-blur-lg sm:pl-[120px] sm:pr-6 dark:border-white/10 dark:bg-gray-950/90 dark:text-white dark:shadow-[0_8px_24px_rgba(0,0,0,0.65)]">
        <div className="relative flex min-h-[60px] flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3 pr-6">
            {isEditingTitle ? (
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-transparent px-0 py-0 text-gray-900 dark:text-white">
                <input
                  value={titleDraft}
                  autoFocus
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleTitleSave();
                    }
                    if (e.key === 'Escape') {
                      setIsEditingTitle(false);
                      setTitleDraft(displayTitle);
                    }
                  }}
                  onBlur={handleTitleSave}
                  className="min-w-[200px] flex-1 bg-transparent text-xl font-semibold text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
                  placeholder="输入分镜名称"
                />
              </div>
            ) : (
              <div className="min-w-0 flex-1 text-gray-900 sm:flex-none sm:max-w-[420px] dark:text-white">
                <button
                  type="button"
                  onClick={startEditingTitle}
                  className="group flex min-w-0 items-center gap-2 text-left text-gray-900 transition hover:text-gray-600 dark:text-white dark:hover:text-white/90"
                >
                  <span className="truncate text-lg font-semibold sm:text-xl">{displayTitle || '未命名分镜'}</span>
                  <Pencil size={16} className="text-gray-500 transition group-hover:text-gray-700 dark:text-white/60 dark:group-hover:text-white" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pr-20">
            <button
              type="button"
              onClick={handleBatchDownload}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm text-gray-700 transition hover:border-[var(--tenant-primary)] hover:text-[var(--tenant-primary)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:text-white"
            >
              <Download size={16} />
              批量下载
            </button>
          </div>

          <div className="pointer-events-auto absolute left-1/2 top-1/2 flex h-11 w-[13rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
            <div className="relative flex h-full w-full items-center rounded-full bg-gray-100 p-1 text-sm text-gray-600 shadow-inner dark:border dark:border-white/10 dark:bg-white/5 dark:text-white/70">
              <div
                className={clsx(
                  'absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-yellow-300 shadow transition-transform duration-300 ease-out dark:bg-yellow-300',
                  activeTab === 'board' ? 'translate-x-1' : 'translate-x-[calc(100%-2px)]'
                )}
              />
              <button
                type="button"
                onClick={handleSelectBoard}
                className={clsx(
                  'relative z-10 flex-1 rounded-full px-3 py-1.5 text-center transition-colors duration-300',
                  activeTab === 'board' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800 dark:hover:text-white'
                )}
              >
                分镜板
              </button>
              <button
                type="button"
                onClick={handleOpenTimeline}
                className={clsx(
                  'relative z-10 flex-1 rounded-full px-3 py-1.5 text-center transition-colors duration-300',
                  activeTab === 'timeline' ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800 dark:hover:text-white'
                )}
              >
                时间轴
              </button>
            </div>
          </div>
        </div>
      </header>

      {taskCollection.length > 1 && (
        <div className="flex flex-wrap gap-2 text-xs text-gray-600 dark:text-white/60">
          {taskCollection.map((task, index) => {
            const title = titleOverrides[task.id] ?? task.title;
            const isActive = task.id === activeTask?.id;
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => setActiveTaskId(task.id)}
                className={clsx(
                  'rounded-full px-3 py-1 transition',
                  isActive
                    ? 'bg-gray-900 text-white shadow dark:bg-white dark:text-gray-900'
                    : 'border border-gray-200 bg-white/70 text-gray-600 hover:border-gray-400 hover:text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:border-white/30 dark:hover:text-white'
                )}
              >
                {`TASK ${index + 1}`} · {title}
              </button>
            );
          })}
        </div>
      )}

      <section>
        {activeTab === 'timeline' ? (
          <div className="p-2 text-gray-900 dark:text-white">
            {!activeTask ? (
              <div className="py-20 text-center text-gray-500 dark:text-white/70">
                {t.storyboard?.timelineSelectTask || '请选择一个分镜任务后再查看时间轴'}
              </div>
            ) : activeTask.timelineSegments?.length ? (
              timelineViewData && (
                <StoryboardTimelineView initialTask={timelineViewData} mode="embedded" />
              )
            ) : (
              <div className="py-20 text-center text-gray-500 dark:text-white/70">
                {t.storyboard?.manual?.timelinePreviewEmpty || '添加分镜内容后即可在这里预览时间轴。'}
              </div>
            )}
          </div>
        ) : (
          <div className="p-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <div className="flex flex-wrap gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => promptFileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-gray-700 transition hover:border-[var(--tenant-primary)] hover:text-[var(--tenant-primary)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:text-white"
                >
                  导入提示词
                </button>
                <button
                  type="button"
                  onClick={() => imageFileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-gray-700 transition hover:border-[var(--tenant-primary)] hover:text-[var(--tenant-primary)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:text-white"
                >
                  导入图片
                </button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-white/60">
                <span>总镜头：{activeTask?.totalShots || 0}</span>
                <span>
                  预估时长：
                  {activeTask?.estimatedDuration
                    ? `${Math.round(activeTask.estimatedDuration)}s`
                    : '计算中'}
                </span>
              </div>
            </div>
            {activeTask ? (
              <ShotsTable task={activeTask} onInsert={handleInsertShot} recentInsertedId={lastInsertedShotId} />
            ) : (
              <EmptyState
                title="请选择一个分镜任务"
                description="左上角选择任务卡片即可查看分镜列表"
                compact
                className="bg-gray-50 text-gray-700 dark:bg-white/5 dark:text-white"
                innerClassName="text-gray-700 dark:text-white"
              />
            )}
          </div>
        )}
      </section>
      <input
        ref={promptFileInputRef}
        type="file"
        accept=".txt,.md,.csv,.tsv,.xlsx,.xls"
        className="hidden"
        multiple
        onChange={handlePromptFilesChange}
      />
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        multiple
        onChange={handleImageFilesChange}
      />
    </div>
  );
}

const headerGridClass =
  'grid min-w-[1500px] grid-cols-[70px_minmax(0,1.25fr)_minmax(0,0.55fr)_minmax(0,2.1fr)_minmax(0,2.1fr)_minmax(0,1.1fr)] gap-5';

function ShotsTable({
  task,
  onInsert,
  recentInsertedId,
}: {
  task: StoryboardHomeTask;
  onInsert: (position: number) => void;
  recentInsertedId?: string | null;
}) {
  const [activeShotId, setActiveShotId] = useState<string | null>(null);

  useEffect(() => {
    setActiveShotId(null);
  }, [task.id]);

  if (!task.shots.length) {
    return (
      <EmptyState
        title="分镜列表为空"
        description="等待分镜生成或上传素材后即可查看"
        compact
                className="bg-gray-50 text-gray-700 dark:bg-white/5 dark:text-white"
                innerClassName="text-gray-700 dark:text-white"
              />
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className={clsx('px-3 pb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-white/40', headerGridClass)}>
        <span>#</span>
        <span>分镜视频提示词</span>
        <span>主体参考</span>
        <span>图片</span>
        <span>视频</span>
        <span>口播文案</span>
      </div>
      <div>
        <InsertShotDivider
          positionLabel={`在分镜 ${task.shots[0]?.order ?? 1} 之前，新增一个分镜`}
          onInsert={() => onInsert(0)}
          showLine={false}
        />
        <AnimatePresence initial={false}>
          {task.shots.map((shot, index) => (
            <motion.div
              key={shot.id}
              layout
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <ShotRow
                shot={shot}
                isActive={activeShotId === shot.id}
                onActivate={() => setActiveShotId(shot.id)}
                highlight={recentInsertedId === shot.id}
              />
              <InsertShotDivider
                positionLabel={
                  task.shots[index + 1]
                    ? `在分镜 ${shot.order} 和分镜 ${task.shots[index + 1].order} 之间，新增一个分镜`
                    : `在分镜 ${shot.order} 之后，新增一个分镜`
                }
                onInsert={() => onInsert(index + 1)}
                showLine={Boolean(task.shots[index + 1])}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface ShotRowProps {
  shot: StoryboardShot;
  isActive: boolean;
  onActivate: () => void;
}

function ShotRow({ shot, isActive, onActivate, highlight = false }: ShotRowProps & { highlight?: boolean }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onActivate();
      }}
      className={clsx(
        headerGridClass,
        'cursor-pointer items-start gap-4 rounded-2xl border py-4 transition',
        highlight
          ? 'border-[var(--tenant-primary)]/60 bg-white shadow-theme-glow dark:bg-white/10'
          : isActive
            ? 'border-[var(--tenant-primary)]/40 bg-white dark:bg-white/10'
            : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
      )}
    >
      <div className="space-y-2 text-sm text-gray-700 dark:text-white/70">
        <div className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <span>{shot.order}</span>
        </div>
        {shot.timeRange && <p className="text-xs text-gray-500 dark:text-white/50">{shot.timeRange}</p>}
        {shot.duration && (
          <p className="text-xs text-gray-500 dark:text-white/50">
            ≈{Math.round(shot.duration)}s · {shot.label}
          </p>
        )}
      </div>

      <div className="space-y-2 text-sm text-gray-800 dark:text-white/80">
        {shot.title && <p className="text-xs uppercase tracking-[0.2em] text-gray-500 dark:text-white/50">{shot.title}</p>}
        <p className="whitespace-pre-line text-sm leading-relaxed text-gray-800 dark:text-white/80">
          {shot.videoPrompt || shot.description || '暂无提示词'}
        </p>
        {(shot.cameraNotes || shot.lightingNotes) && (
          <div className="text-xs text-gray-500 dark:text-white/50">
            {shot.cameraNotes && <p>运镜：{shot.cameraNotes}</p>}
            {shot.lightingNotes && <p>光线：{shot.lightingNotes}</p>}
          </div>
        )}
      </div>

      <ThumbnailStack referenceThumbs={shot.referenceThumbs} />

      <AssetPreview
        type="image"
        url={shot.imageUrl}
        emptyLabel="上传画面参考"
      />

      <AssetPreview
        type="video"
        url={shot.videoUrl}
        emptyLabel="等待视频生成"
      />

      <VoiceoverBlock voiceover={shot.voiceover} />
    </div>
  );
}

function ThumbnailStack({ referenceThumbs }: { referenceThumbs: string[] }) {
  if (!referenceThumbs.length) {
    return (
      <div className="flex min-h-[56px] items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 text-xs text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
        暂无主体参考
      </div>
    );
  }

  return (
    <div className="max-w-[160px] rounded-2xl border border-gray-200 bg-gray-50 p-1.5 dark:border-white/10 dark:bg-white/5">
      <div className="grid max-h-40 grid-cols-[repeat(auto-fill,minmax(42px,1fr))] auto-rows-[42px] gap-1.5 overflow-y-auto">
        {referenceThumbs.map((thumb, idx) => (
          <div
            key={`${thumb}-${idx}`}
            className="overflow-hidden rounded-lg bg-gray-100 dark:bg-black/30"
          >
            <img src={thumb} alt="主体参考" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
}

function AssetPreview({ type, url, emptyLabel }: { type: 'image' | 'video'; url: string | null; emptyLabel: string; }) {
  if (!url) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-center text-sm text-gray-600 dark:border-white/15 dark:bg-white/5 dark:text-white/60">
        <div className="flex h-full flex-col items-center justify-center gap-2">
          {type === 'image' ? <Film size={20} /> : <Video size={20} />}
          {emptyLabel}
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-black/30">
      {type === 'image' ? (
        <img src={url} alt="storyboard image" className="h-full w-full object-cover" />
      ) : (
        <video src={url} controls className="h-full w-full object-cover" />
      )}
    </div>
  );
}

function VoiceoverBlock({ voiceover }: { voiceover: string | null }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 dark:border-white/10 dark:bg-white/5 dark:text-white/80">
      <div className="mb-2 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gray-500 dark:text-white/50">
        <Mic size={14} />
        口播文案
      </div>
      <p className="flex-1 whitespace-pre-line text-sm leading-relaxed text-gray-800 dark:text-white/80">
        {voiceover || '等待口播生成'}
      </p>
    </div>
  );
}

function InsertShotDivider({
  positionLabel,
  onInsert,
  showLine = true,
}: {
  positionLabel: string;
  onInsert: () => void;
  showLine?: boolean;
}) {
  return (
    <div
      className={clsx(
        'group/insert relative flex w-full justify-center',
        showLine ? 'my-1 py-1' : 'my-1 py-1'
      )}
    >
      {showLine && (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gray-200 dark:bg-white/15"
            style={{ marginTop: '-2px' }}
          />
          <div
            className="pointer-events-none absolute inset-x-8 top-1/2 h-px -translate-y-1/2"
            style={{ marginTop: '-2px' }}
          >
            <div className="h-px w-full origin-center scale-x-0 bg-yellow-300 transition-transform duration-500 ease-out group-hover/insert:scale-x-100" />
          </div>
        </>
      )}
      <div className="relative z-[1] -translate-y-[2px] flex flex-col items-center gap-2 text-center">
        <div className="max-w-[220px] rounded-full bg-gray-900/85 px-3 py-1 text-[11px] text-white shadow-sm opacity-0 transition group-hover/insert:-translate-y-0.5 group-hover/insert:opacity-100">
          {positionLabel}
        </div>
        <button
          type="button"
          onClick={onInsert}
          className="pointer-events-none flex h-11 w-11 items-center justify-center rounded-full bg-[#FFD84D] text-base font-semibold text-gray-900 shadow-md opacity-0 transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#FFD84D] group-hover/insert:pointer-events-auto group-hover/insert:opacity-100 group-hover/insert:shadow-lg -translate-y-[2px]"
        >
          +
        </button>
      </div>
    </div>
  );
}
