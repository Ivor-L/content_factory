'use client';

/* eslint-disable @next/next/no-img-element -- raw storyboard assets need vanilla img/video tags */

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { toast } from 'react-hot-toast';
import { Download, Clock3, Film, Video, Pencil, ChevronDown, FolderOpen, Image as ImageIcon, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { read, utils } from 'xlsx';
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { useTenant } from '@/hooks/useTenant';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSidebarAutoCollapse } from '@/hooks/useSidebarAutoCollapse';
import { supabase } from '@/lib/supabaseClient';
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
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const promptFileInputRef = useRef<HTMLInputElement>(null);
  const imageFolderInputRef = useRef<HTMLInputElement>(null);
  const importMenuRef = useRef<HTMLDivElement | null>(null);
  const promptImportTargetRef = useRef<'video' | 'image'>('video');
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);
  const [titleSaving, setTitleSaving] = useState(false);
  const [importingPrompts, setImportingPrompts] = useState(false);
  const [assigningImages, setAssigningImages] = useState(false);
  const [insertingShot, setInsertingShot] = useState(false);

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
    if (activeTab !== 'board') {
      setImportMenuOpen(false);
    }
  }, [activeTab]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setDownloadMenuOpen(false);
  }, [activeTaskId]);

  const authedFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) {
      throw new Error('请先登录后再执行此操作');
    }
    const headers = new Headers(init?.headers || {});
    if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(input, { ...init, headers });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error || payload?.message || `请求失败（${response.status}）`;
      throw new Error(message);
    }
    return response.json();
  }, []);

  const uploadAsset = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error || '上传失败，请重试');
    }
    return payload.url as string;
  }, []);

  useEffect(() => {
    if (!importMenuOpen) return undefined;
    const handleClickOutside = (event: MouseEvent) => {
      if (!importMenuRef.current) return;
      if (!importMenuRef.current.contains(event.target as Node)) {
        setImportMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [importMenuOpen]);

  useEffect(() => {
    if (!downloadMenuOpen) return undefined;
    const handleClickOutside = (event: MouseEvent) => {
      if (!downloadMenuRef.current) return;
      if (!downloadMenuRef.current.contains(event.target as Node)) {
        setDownloadMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDownloadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [downloadMenuOpen]);

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

  const gatherDownloadAssets = useCallback(
    (scope: 'images' | 'videos') => {
      if (!activeTask) return [];
      const seen = new Set<string>();
      return activeTask.shots
        .map((shot, index) => {
          const candidate = scope === 'images' ? shot.imageUrl : shot.videoUrl;
          if (!candidate || candidate.startsWith('data:') || seen.has(candidate)) {
            return null;
          }
          seen.add(candidate);
          return {
            url: candidate,
            filename: buildAssetFilename(index, scope, candidate),
          };
        })
        .filter((asset): asset is { url: string; filename: string } => Boolean(asset));
    },
    [activeTask]
  );

  const handleBatchDownload = (scope: 'images' | 'videos') => {
    if (!activeTask) {
      toast.error('请选择一个分镜任务');
      return;
    }
    setDownloadMenuOpen(false);
    const assets = gatherDownloadAssets(scope);
    if (!assets.length) {
      toast.error(scope === 'images' ? '暂无可下载图片' : '暂无可下载视频');
      return;
    }
    assets.forEach(({ url, filename }) => triggerBrowserDownload(url, filename));
    toast.success(scope === 'images' ? '已开始下载图片' : '已开始下载视频');
  };

  const handleImportOptionClick = (option: 'videoPrompts' | 'imagePrompts' | 'images') => {
    if (option === 'images' && assigningImages) return;
    if (option !== 'images' && importingPrompts) return;
    setImportMenuOpen(false);
    if (option === 'images') {
      imageFolderInputRef.current?.click();
      return;
    }
    promptImportTargetRef.current = option === 'videoPrompts' ? 'video' : 'image';
    promptFileInputRef.current?.click();
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
    if (!activeTask || titleSaving) return;
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      toast.error('名称不能为空');
      return;
    }
    setTitleSaving(true);
    void authedFetch(`/api/storyboard/${activeTask.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: trimmed }),
    })
      .then(() => {
        setTitleOverrides((prev) => ({ ...prev, [activeTask.id]: trimmed }));
        setIsEditingTitle(false);
        toast.success('名称已更新');
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : '名称更新失败');
        setTitleDraft(displayTitle);
      })
      .finally(() => {
        setTitleSaving(false);
      });
  };

  const handleInsertShot = useCallback(
    async (position: number) => {
      if (!activeTaskId || insertingShot) return;
      setInsertingShot(true);
      try {
        const response = await authedFetch(`/api/storyboard/${activeTaskId}/segments`, {
          method: 'POST',
          body: JSON.stringify({
            insertAt: position,
            segments: [{}],
          }),
        });
        const createdSegment: StoryboardSegmentResponse | undefined = response?.segments?.[0];
        if (!createdSegment) {
          throw new Error('未能创建新的分镜');
        }
        setTaskCollection((prev) =>
          prev.map((task) => {
            if (task.id !== activeTaskId) return task;
            const updatedShots = [...task.shots];
            const newShot = segmentToShot(createdSegment, task.referenceThumbs || []);
            updatedShots.splice(position, 0, newShot);
            const normalizedShots = recalcShots(updatedShots);
            const totalDuration = normalizedShots.reduce(
              (sum, shot) => sum + (shot.duration ?? 0),
              0
            );
            return {
              ...task,
              shots: normalizedShots,
              totalShots: normalizedShots.length,
              estimatedDuration: totalDuration,
              timelineSegments: mergeTimelineSegments(task.timelineSegments, [createdSegment], position),
            };
          })
        );
        triggerInsertHighlight(createdSegment.id);
        toast.success('已新增分镜');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '新增分镜失败');
      } finally {
        setInsertingShot(false);
      }
    },
    [activeTaskId, authedFetch, insertingShot, triggerInsertHighlight]
  );

  const appendShotsFromPrompts = useCallback(
    async (prompts: string[], { target }: { target: 'video' | 'image' }) => {
      if (!activeTaskId || !activeTask) {
        toast.error('请选择一个分镜任务后再导入提示词');
        return;
      }
      const sanitizedPrompts = prompts.map((prompt) => prompt.trim()).filter(Boolean);
      if (!sanitizedPrompts.length) {
        toast.error('未解析到有效的提示词内容');
        return;
      }
      setImportingPrompts(true);
      try {
        const response = await authedFetch(`/api/storyboard/${activeTaskId}/segments`, {
          method: 'POST',
          body: JSON.stringify({
            segments: sanitizedPrompts.map((prompt) => ({
              videoPrompt: target === 'video' ? prompt : undefined,
              imagePrompt: target === 'image' ? prompt : undefined,
            })),
            insertAt: activeTask.shots.length,
          }),
        });
        const createdSegments: StoryboardSegmentResponse[] = response?.segments ?? [];
        if (!createdSegments.length) {
          throw new Error('服务器未返回新增的分镜');
        }
        setTaskCollection((prev) =>
          prev.map((task) => {
            if (task.id !== activeTaskId) return task;
            const appendedShots = createdSegments.map((segment) =>
              segmentToShot(segment, task.referenceThumbs || [])
            );
            const updatedShots = recalcShots([...task.shots, ...appendedShots]);
            const totalDuration = updatedShots.reduce((sum, shot) => sum + (shot.duration ?? 0), 0);
            return {
              ...task,
              shots: updatedShots,
              totalShots: updatedShots.length,
              estimatedDuration: totalDuration,
              timelineSegments: mergeTimelineSegments(task.timelineSegments, createdSegments),
            };
          })
        );
        triggerInsertHighlight(createdSegments[createdSegments.length - 1]?.id ?? null);
        toast.success(`已导入 ${createdSegments.length} 条${target === 'video' ? '视频' : '图片'}提示词`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '导入提示词失败，请重试');
      } finally {
        setImportingPrompts(false);
      }
    },
    [activeTask, activeTaskId, authedFetch, triggerInsertHighlight]
  );

  const handlePromptFilesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    const target = promptImportTargetRef.current;
    const prompts: string[] = [];
    try {
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
    } catch (error) {
      console.error(error);
      toast.error('导入提示词失败，请重试');
      event.target.value = '';
      return;
    }
    event.target.value = '';
    await appendShotsFromPrompts(prompts, { target });
  };

  const handleImageFilesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    event.target.value = '';
    if (!activeTask) {
      toast.error('请选择一个分镜任务后再导入图片');
      return;
    }
    if (assigningImages) return;
    try {
      const imageFiles = Array.from(files).filter((file) => {
        if (file.type) return file.type.startsWith('image/');
        return /\.(png|jpe?g|gif|bmp|webp|heic|heif)$/i.test(file.name);
      });
      if (!imageFiles.length) {
        toast.error('选中的文件夹中没有图片文件');
        return;
      }
      const sorted = imageFiles.sort((a, b) => {
        const aPath = (a as File & { webkitRelativePath?: string }).webkitRelativePath || a.name;
        const bPath = (b as File & { webkitRelativePath?: string }).webkitRelativePath || b.name;
        return aPath.localeCompare(bPath, undefined, { numeric: true });
      });
      const targetShots = activeTask.shots.slice(0, sorted.length);
      if (!targetShots.length) {
        toast.error('当前分镜任务没有可更新的镜头');
        return;
      }
      setAssigningImages(true);
      const uploadedUrls = await Promise.all(sorted.slice(0, targetShots.length).map((file) => uploadAsset(file)));
      await Promise.all(
        targetShots.slice(0, uploadedUrls.length).map((shot, index) =>
          authedFetch(`/api/storyboard/segments/${shot.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ generatedImage: uploadedUrls[index] }),
          })
        )
      );
      const shotUrlMap = new Map<string, string>();
      targetShots.slice(0, uploadedUrls.length).forEach((shot, index) => {
        shotUrlMap.set(shot.id, uploadedUrls[index]);
      });
      setTaskCollection((prev) =>
        prev.map((task) => {
          if (task.id !== activeTask.id) return task;
          const updatedShots = task.shots.map((shot) =>
            shotUrlMap.has(shot.id) ? { ...shot, imageUrl: shotUrlMap.get(shot.id) || null } : shot
          );
          const updatedTimeline = task.timelineSegments
            ? task.timelineSegments.map((segment) =>
                shotUrlMap.has(segment.id)
                  ? { ...segment, generatedImage: shotUrlMap.get(segment.id) || null }
                  : segment
              )
            : task.timelineSegments;
          return {
            ...task,
            shots: updatedShots,
            timelineSegments: updatedTimeline,
          };
        })
      );
      toast.success(`已导入 ${shotUrlMap.size} 张图片`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : '导入图片失败，请重试');
    } finally {
      setAssigningImages(false);
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
                  {titleSaving ? (
                    <Loader2 size={16} className="text-gray-500 animate-spin dark:text-white/70" />
                  ) : (
                    <Pencil size={16} className="text-gray-500 transition group-hover:text-gray-700 dark:text-white/60 dark:group-hover:text-white" />
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pr-20">
            <div className="relative" ref={downloadMenuRef}>
              <button
                type="button"
                onClick={() => setDownloadMenuOpen((prev) => !prev)}
                disabled={!activeTask?.shots.length}
                aria-expanded={downloadMenuOpen}
                className={clsx(
                  'inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm text-gray-700 transition hover:border-[var(--tenant-primary)] hover:text-[var(--tenant-primary)] dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:text-white',
                  !activeTask?.shots.length && 'cursor-not-allowed opacity-60 hover:border-gray-200 hover:text-gray-700 dark:hover:text-white/80'
                )}
              >
                <Download size={16} />
                批量下载
                <ChevronDown
                  className={clsx(
                    'h-4 w-4 transition-transform duration-200',
                    downloadMenuOpen ? 'rotate-180' : 'rotate-0'
                  )}
                />
              </button>
              {downloadMenuOpen && (
                <div className="absolute right-0 z-20 mt-2 w-48 space-y-1 rounded-2xl border border-gray-200 bg-white/95 p-2 text-sm text-gray-800 shadow-2xl dark:border-white/10 dark:bg-gray-900/95 dark:text-white">
                  <button
                    type="button"
                    onClick={() => handleBatchDownload('images')}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 transition hover:bg-gray-100 dark:hover:bg-white/10"
                  >
                    <ImageIcon className="h-4 w-4" />
                    下载首帧图
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchDownload('videos')}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 transition hover:bg-gray-100 dark:hover:bg-white/10"
                  >
                    <Film className="h-4 w-4" />
                    下载视频
                  </button>
                </div>
              )}
            </div>
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
                <div className="relative" ref={importMenuRef}>
                  <button
                    type="button"
                    onClick={() => setImportMenuOpen((prev) => !prev)}
                    disabled={importingPrompts}
                    className={clsx(
                      'inline-flex items-center gap-2 rounded-full border px-4 py-2 transition',
                      'border-gray-200 bg-gray-100 text-gray-700 hover:border-[var(--tenant-primary)] hover:text-[var(--tenant-primary)]',
                      'dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:text-white',
                      importingPrompts && 'cursor-not-allowed opacity-60 hover:border-gray-200 hover:text-gray-700 dark:hover:text-white/80'
                    )}
                  >
                    批量导入
                    {importingPrompts && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <ChevronDown
                      className={clsx(
                        'h-4 w-4 transition-transform duration-200',
                        importMenuOpen ? 'rotate-180' : 'rotate-0'
                      )}
                    />
                  </button>
                  {importMenuOpen && (
                    <div className="absolute z-20 mt-2 w-56 space-y-1 rounded-2xl border border-gray-200 bg-white/95 p-2 text-sm text-gray-800 shadow-2xl dark:border-white/10 dark:bg-gray-900/95 dark:text-white">
                      <button
                        type="button"
                        onClick={() => handleImportOptionClick('videoPrompts')}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 transition hover:bg-gray-100 dark:hover:bg-white/10"
                      >
                        <Film className="h-4 w-4" />
                        导入视频提示词
                      </button>
                      <button
                        type="button"
                        onClick={() => handleImportOptionClick('imagePrompts')}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 transition hover:bg-gray-100 dark:hover:bg-white/10"
                      >
                        <ImageIcon className="h-4 w-4" />
                        导入图片提示词
                      </button>
                      <button
                        type="button"
                        onClick={() => handleImportOptionClick('images')}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 transition hover:bg-gray-100 dark:hover:bg-white/10"
                      >
                        <FolderOpen className="h-4 w-4" />
                        导入图片
                      </button>
                    </div>
                  )}
                </div>
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
              <ShotsTable
                task={activeTask}
                onInsert={handleInsertShot}
                recentInsertedId={lastInsertedShotId}
                disableInsert={insertingShot}
              />
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
        disabled={importingPrompts}
        onChange={handlePromptFilesChange}
      />
      <input
        ref={(node) => {
          if (node) {
            node.setAttribute('webkitdirectory', 'true');
            node.setAttribute('directory', 'true');
            imageFolderInputRef.current = node;
          } else {
            imageFolderInputRef.current = null;
          }
        }}
        type="file"
        accept="image/*"
        className="hidden"
        multiple
        disabled={assigningImages}
        onChange={handleImageFilesChange}
      />
    </div>
  );
}

const headerGridClass =
  'grid min-w-[1300px] grid-cols-[70px_minmax(0,1.35fr)_minmax(0,0.55fr)_minmax(0,2.1fr)_minmax(0,2.1fr)] gap-5';

function ShotsTable({
  task,
  onInsert,
  recentInsertedId,
  disableInsert = false,
}: {
  task: StoryboardHomeTask;
  onInsert: (position: number) => void | Promise<void>;
  recentInsertedId?: string | null;
  disableInsert?: boolean;
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
      </div>
      <div>
        <InsertShotDivider
          positionLabel={`在分镜 ${task.shots[0]?.order ?? 1} 之前增加一行`}
          onInsert={() => onInsert(0)}
          disabled={disableInsert}
        />
        <AnimatePresence initial={false}>
          {task.shots.map((shot, index) => (
            <motion.div
              key={shot.id}
              layout
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{
                duration: 0.22,
                ease: 'easeOut',
                layout: { type: 'spring', stiffness: 320, damping: 32 },
              }}
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
                    ? `在分镜 ${shot.order} 和分镜 ${task.shots[index + 1].order} 之间增加一行`
                    : `在分镜 ${shot.order} 之后增加一行`
                }
                onInsert={() => onInsert(index + 1)}
                disabled={disableInsert}
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

function InsertShotDivider({
  positionLabel,
  onInsert,
  showLine = true,
  disabled = false,
}: {
  positionLabel: string;
  onInsert: () => void;
  showLine?: boolean;
  disabled?: boolean;
}) {
  const [cursorRatio, setCursorRatio] = useState(0.5);
  const [isHovered, setIsHovered] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const clampRatio = (value: number) => Math.min(0.96, Math.max(0.04, value));

  const updateCursorRatio = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (!rect?.width) return;
    const next = (event.clientX - rect.left) / rect.width;
    setCursorRatio(clampRatio(Number.isFinite(next) ? next : 0.5));
  };

  const resetDividerState = () => {
    setIsHovered(false);
    setCursorRatio(0.5);
  };

  return (
    <div
      ref={trackRef}
      className="relative isolate my-1 flex w-full items-center justify-center py-3"
      onMouseEnter={(event) => {
        setIsHovered(true);
        updateCursorRatio(event);
      }}
      onMouseMove={updateCursorRatio}
      onMouseLeave={resetDividerState}
      onFocus={() => setIsHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          resetDividerState();
        }
      }}
    >
      {showLine && (
        <>
          <div
            className={clsx(
              'pointer-events-none absolute inset-x-5 top-1/2 h-px -translate-y-1/2 rounded-full transition-colors duration-300',
              isHovered ? 'bg-[#FFE45E]' : 'bg-gray-200 dark:bg-white/15'
            )}
          />
          <div
            className={clsx(
              'pointer-events-none absolute inset-x-10 top-1/2 h-[3px] -translate-y-1/2 rounded-full blur-lg transition-opacity duration-500',
              isHovered ? 'bg-[#FFE45E]/70 opacity-100' : 'bg-[#FFE45E]/20 opacity-0'
            )}
          />
        </>
      )}
      <div className="relative z-10 flex w-full flex-col items-center gap-2 px-6 text-center">
        <div
          className={clsx(
            'max-w-[260px] rounded-full bg-gray-900/85 px-3 py-1 text-[11px] text-white shadow-sm transition-all duration-200',
            isHovered ? '-translate-y-0.5 opacity-100' : 'translate-y-0 opacity-0'
          )}
        >
          {positionLabel}
        </div>
        <button
          type="button"
          onClick={onInsert}
          aria-label={positionLabel}
          onFocus={() => setIsHovered(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              resetDividerState();
            }
          }}
          style={{ left: `${cursorRatio * 100}%` }}
          disabled={disabled}
          className={clsx(
            'absolute top-1/2 h-11 w-11 -translate-y-1/2 -translate-x-1/2 rounded-full bg-[#FFD84D] text-base font-semibold text-gray-900 shadow-md transition-all duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD84D] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-black',
            isHovered ? 'opacity-100 shadow-[0_4px_16px_rgba(255,216,77,0.45)]' : 'opacity-0 shadow-none',
            disabled && 'cursor-not-allowed opacity-40 hover:scale-100'
          )}
        >
          +
        </button>
      </div>
    </div>
  );
}

interface StoryboardSegmentResponse {
  id: string;
  order: number;
  duration: number;
  timeRange: string | null;
  imagePrompt: string | null;
  videoPrompt: string | null;
  generatedImage: string | null;
  generatedVideo: string | null;
  status?: string | null;
}

function segmentToShot(segment: StoryboardSegmentResponse, referenceThumbs: string[]): StoryboardShot {
  const baseTitle =
    segment.videoPrompt?.slice(0, 18) ||
    segment.imagePrompt?.slice(0, 18) ||
    `分镜 ${segment.order + 1}`;
  return {
    id: segment.id,
    order: segment.order + 1,
    label: baseTitle,
    title: baseTitle,
    description: segment.videoPrompt || segment.imagePrompt || null,
    imagePrompt: segment.imagePrompt,
    videoPrompt: segment.videoPrompt,
    timeRange: segment.timeRange,
    duration: segment.duration ?? null,
    imageUrl: segment.generatedImage,
    videoUrl: segment.generatedVideo,
    referenceThumbs,
    voiceover: null,
    status: segment.status || 'DRAFT',
    tags: [],
    cameraNotes: null,
    lightingNotes: null,
  };
}

function segmentToTimelineSegment(segment: StoryboardSegmentResponse): StoryboardTimelineSegment {
  return {
    id: segment.id,
    order: segment.order,
    duration: segment.duration,
    timeRange: segment.timeRange,
    imagePrompt: segment.imagePrompt,
    videoPrompt: segment.videoPrompt,
    generatedImage: segment.generatedImage,
    generatedVideo: segment.generatedVideo,
  };
}

function recalcShots(shots: StoryboardShot[]): StoryboardShot[] {
  return shots.map((shot, index) => ({
    ...shot,
    order: index + 1,
  }));
}

function mergeTimelineSegments(
  existing: StoryboardTimelineSegment[] | undefined,
  created: StoryboardSegmentResponse[],
  insertIndex?: number
): StoryboardTimelineSegment[] {
  if (!created.length) {
    return existing ? existing.map((segment, index) => ({ ...segment, order: index })) : [];
  }
  const base = Array.isArray(existing) ? [...existing] : [];
  const mapped = created.map(segmentToTimelineSegment);
  const index =
    typeof insertIndex === 'number' ? Math.max(0, Math.min(insertIndex, base.length)) : base.length;
  base.splice(index, 0, ...mapped);
  return base.map((segment, order) => ({ ...segment, order }));
}

function buildAssetFilename(index: number, scope: 'images' | 'videos', source?: string) {
  const paddedIndex = String(index + 1).padStart(2, '0');
  const baseName = scope === 'images' ? `storyboard-image-${paddedIndex}` : `storyboard-video-${paddedIndex}`;
  const cleanSource = source?.split(/[?#]/)[0] ?? '';
  const ext =
    cleanSource.includes('.')
      ? cleanSource.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '')
      : undefined;
  const fallback = scope === 'images' ? 'png' : 'mp4';
  return `${baseName}.${ext || fallback}`;
}

function triggerBrowserDownload(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', filename);
  anchor.setAttribute('target', '_blank');
  anchor.setAttribute('rel', 'noopener noreferrer');
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
