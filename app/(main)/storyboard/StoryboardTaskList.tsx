'use client';

/* eslint-disable @next/next/no-img-element -- Storyboard cards show user-generated art from remote storages */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { breakdownStoryboardGrid, deleteStoryboardTask, deleteStoryboardTasks } from '@/app/actions/storyboard-gen';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';
import { AddButton } from '@/components/AddButton';
import { Clapperboard, Trash2, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';

interface StoryboardTask {
  id: string;
  status: string;
  videoUrl: string | null;
  coverImage: string | null;
  sceneImage: string | null;
  scenePrompt: string | null;
  storyboardImageUrl?: string | null;
  storyboardImages?: unknown;
  referenceImage?: string | null;
  scriptContent?: string | null;
  progress?: number | null;
  videoType?: string | null;
  product: { id: string, name: string, images: string } | null;
  character: { id: string, name: string, avatar: string } | null;
  segments: any[]; // Using any for now to avoid duplication, or import shared type
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface StoryboardTaskListProps {
  initialTasks: StoryboardTask[];
}

export function StoryboardTaskList({ initialTasks }: StoryboardTaskListProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const { basePath } = useTenant();

  // Delete & Selection State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [breakdownTaskId, setBreakdownTaskId] = useState<string | null>(null);
  const [splitTaskId, setSplitTaskId] = useState<string | null>(null);
  const [splitPromptTask, setSplitPromptTask] = useState<StoryboardTask | null>(null);

  const openCreationPage = () => {
    const path = `${basePath}/storyboard/create`;
    router.push(path);
  };

  const openTaskDetail = (taskId: string) => {
    const path = `${basePath}/storyboard/${taskId}`;
    router.push(path);
  };

  const parseStoryboardImages = (value: unknown): string[] => {
    if (!value) return [];
    let parsed = value;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return [];
      }
    }
    const candidate = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as any)?.images)
      ? (parsed as any).images
      : [];
    return candidate
      .map((item: any) => {
        if (!item) return null;
        if (typeof item === 'string') return item;
        if (typeof item === 'object') {
          return (
            item.url ||
            item.image_url ||
            item.imageUrl ||
            item.public_url ||
            item.publicUrl ||
            item.src ||
            null
          );
        }
        return null;
      })
      .filter((url: unknown): url is string => typeof url === 'string' && url.length > 0);
  };

  const getPrimaryImage = (task: StoryboardTask) => {
    const storyboardImages = parseStoryboardImages(task.storyboardImages);
    if (storyboardImages.length > 0) return storyboardImages[0];
    return task.storyboardImageUrl || task.coverImage || task.sceneImage || task.referenceImage || null;
  };

  const GRID_GENERATING_STATUSES = new Set([
    'GENERATING_GRID',
    'ANALYZING_SCRIPT',
    'GENERATING_IMAGE',
    'PROCESSING',
    'PENDING',
    'QUEUED',
  ]);

  const GRID_PIPELINE_STATUSES = new Set([
    ...GRID_GENERATING_STATUSES,
    'GRID_COMPLETED',
    'SPLIT_PENDING',
    'SPLIT_COMPLETED',
  ]);

  const getProgressValue = (value?: number | null) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.min(100, Math.max(0, Math.round(value)));
  };

  const getNormalizedStatus = (status: string) => (status || '').toUpperCase();

  const isGridGenerating = (status: string) => GRID_GENERATING_STATUSES.has(getNormalizedStatus(status));
  const isGridPipeline = (status: string) => GRID_PIPELINE_STATUSES.has(getNormalizedStatus(status));

  const getGridImageUrl = (task: StoryboardTask) =>
    task.storyboardImageUrl || task.coverImage || task.sceneImage || task.referenceImage || '';

  const isNineGridTask = (task: StoryboardTask) => Boolean(task.videoType);
  const hasStoryboardSegments = (task: StoryboardTask) => Array.isArray(task.segments) && task.segments.length > 0;
  const needsSplitBeforeDetail = (task: StoryboardTask) => isNineGridTask(task) && !hasStoryboardSegments(task);

  const canBreakdownTask = (task: StoryboardTask) => {
    if (task.segments?.length > 0) return false;
    const normalized = getNormalizedStatus(task.status);
    return normalized === 'GRID_COMPLETED' || normalized === 'SPLIT_COMPLETED';
  };

  const getStatusColor = (status: string) => {
    switch (getNormalizedStatus(status)) {
      case 'ANALYZING': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'SCENE_CONFIRMATION': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200';
      case 'GENERATING': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'COMPLETED': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'FAILED': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'GENERATING_GRID': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'GRID_COMPLETED': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'SPLIT_PENDING': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200';
      case 'SPLIT_COMPLETED': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    const normalized = getNormalizedStatus(status);
    if (normalized === 'GENERATING_GRID') {
      return t.storyboard.genList?.generatingGrid || 'Generating Grid';
    }
    if (normalized === 'GRID_COMPLETED') {
      return t.storyboard.genList?.gridCompleted || 'Grid Completed';
    }
    if (normalized === 'SPLIT_PENDING') {
      return t.storyboard.genList?.splitPending || 'Splitting…';
    }
    if (normalized === 'SPLIT_COMPLETED') {
      return t.storyboard.genList?.completed || 'Split Completed';
    }
    return (t.storyboard.status as any)[normalized] || status;
  };

  const handleBreakdown = async (e: React.MouseEvent, task: StoryboardTask) => {
    e.stopPropagation();
    const gridImageUrl = getGridImageUrl(task);
    if (!gridImageUrl) {
      toast.error(t.storyboard.genList?.noImage || t.common.error);
      return;
    }
    setBreakdownTaskId(task.id);
    try {
      const formData = new FormData();
      formData.append('gridImageUrl', gridImageUrl);
      if (task.scriptContent) {
        formData.append('script', task.scriptContent);
      }
      formData.append('taskId', task.id);
      const result = await breakdownStoryboardGrid(formData);
      toast.success(t.storyboard.genList?.breakdownComplete || t.common.success);
      openTaskDetail(result.taskId);
    } catch (error) {
      console.error(error);
      toast.error(t.storyboard.genList?.breakdownFailed || t.common.error);
    } finally {
      setBreakdownTaskId(null);
    }
  };

  const requestSplit = async (task: StoryboardTask, options?: { refresh?: boolean }) => {
    const storyboardImage = getGridImageUrl(task);
    if (!storyboardImage) {
      toast.error(t.storyboard.genList?.noImage || t.common.error);
      return false;
    }
    setSplitTaskId(task.id);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error(t.storyboard.genList?.loginPlease || t.common.error);
      }
      const res = await fetch('/api/storyboard-gen/split', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          taskId: task.id,
          storyboardImageUrl: storyboardImage,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        if (res.status === 401) {
          throw new Error(t.storyboard.genList?.loginPlease || 'Unauthorized');
        }
        if (res.status === 403) {
          throw new Error(t.settings?.apiKeyRequired || 'Please bind your API key first.');
        }
        throw new Error(payload.error || `Failed with status ${res.status}`);
      }

      toast.success(t.storyboard.genList?.splitStarted || t.common.success);
      if (options?.refresh !== false) {
        router.refresh();
      }
      return true;
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : t.common.error);
      return false;
    } finally {
      setSplitTaskId(null);
    }
  };

  const handleSplit = async (e: React.MouseEvent, task: StoryboardTask) => {
    e.stopPropagation();
    await requestSplit(task);
  };

  const handleCardClick = (task: StoryboardTask) => {
    if (needsSplitBeforeDetail(task)) {
      setSplitPromptTask(task);
      return;
    }
    openTaskDetail(task.id);
  };

  const closeSplitModal = () => {
    if (splitPromptTask && splitTaskId === splitPromptTask.id) return;
    setSplitPromptTask(null);
  };

  const handleSplitModalConfirm = async () => {
    if (!splitPromptTask) return;
    const targetTask = splitPromptTask;
    const success = await requestSplit(targetTask, { refresh: false });
    if (success) {
      setSplitPromptTask(null);
      openTaskDetail(targetTask.id);
    }
  };

  // Delete Handlers
  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setTaskToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    setTaskToDelete(null); // Indicates batch delete
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      if (taskToDelete) {
        await deleteStoryboardTask(taskToDelete);
        setSelectedIds(prev => prev.filter(id => id !== taskToDelete));
      } else {
        await deleteStoryboardTasks(selectedIds);
        setSelectedIds([]);
      }
      toast.success(t.common.success);
      setIsDeleteModalOpen(false);
      setTaskToDelete(null);
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(t.common.error);
    }
  };

  const toggleSelection = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === initialTasks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(initialTasks.map(t => t.id));
    }
  };

  const splitModalImage = splitPromptTask ? getPrimaryImage(splitPromptTask) : null;
  const splitModalBusy = splitPromptTask ? splitTaskId === splitPromptTask.id : false;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-sans">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t.storyboard.title}</h1>
          {t.storyboard.subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-3xl">{t.storyboard.subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
            {selectedIds.length > 0 && (
                <button
                    onClick={handleBatchDelete}
                    className="inline-flex items-center px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors"
                >
                    <Trash2 size={16} className="mr-2" />
                    {t.common.delete} ({selectedIds.length})
                </button>
            )}
            <AddButton
              label={t.storyboard.manual?.title || t.storyboard.emptyState.action || t.common.create}
              onClick={openCreationPage}
            />
        </div>
      </div>

      {initialTasks.length === 0 ? (
          <EmptyState
            icon={<Clapperboard className="h-6 w-6" />}
            title={t.storyboard.emptyState.title}
            description={t.storyboard.emptyState.description}
            action={{
              label: t.storyboard.emptyState.action,
              onClick: openCreationPage,
            }}
          />
      ) : (
        <>
            <div className="flex items-center justify-between mb-4">
                <button 
                    onClick={toggleSelectAll}
                    className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center gap-2"
                >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.length === initialTasks.length && initialTasks.length > 0 ? 'bg-black border-black dark:bg-white dark:border-white' : 'border-gray-300 dark:border-gray-600'}`}>
                        {selectedIds.length === initialTasks.length && initialTasks.length > 0 && (
                            <svg className="w-3 h-3 text-white dark:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                        )}
                    </div>
                    {selectedIds.length === initialTasks.length ? t.common.deselectAll : t.common.selectAll}
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {initialTasks.map((task) => {
              const primaryImage = getPrimaryImage(task);
              const normalizedStatus = getNormalizedStatus(task.status);
              const gridPipeline = isGridPipeline(task.status);
              const showProgressOverlay = isGridGenerating(task.status);
              const progressValue = getProgressValue(task.progress);
              const showSplitButton = normalizedStatus === 'GRID_COMPLETED';
              const showBreakdownButton = canBreakdownTask(task);
              const splitPending = normalizedStatus === 'SPLIT_PENDING';

              return (
                <div
                  key={task.id}
                  onClick={() => handleCardClick(task)}
                  className={`group block bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100 dark:border-gray-700 cursor-pointer relative ${selectedIds.includes(task.id) ? 'ring-2 ring-primary' : ''}`}
                >
                  {/* Checkbox Overlay */}
                  <div 
                    className={`absolute top-3 left-3 z-20 transition-opacity duration-200 ${selectedIds.includes(task.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    onClick={(e) => toggleSelection(e, task.id)}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer shadow-sm transition-colors ${selectedIds.includes(task.id) ? 'bg-primary border-primary text-primary-foreground' : 'bg-white border-gray-300 hover:border-primary'}`}>
                      {selectedIds.includes(task.id) && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                      )}
                    </div>
                  </div>

                  <div className="relative h-48 bg-gray-100 dark:bg-gray-700 overflow-hidden rounded-3xl">
                    {primaryImage ? (
                      <>
                        <img
                          src={primaryImage}
                          alt="Storyboard cover"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        {showProgressOverlay && (
                          <div className="absolute inset-0 bg-black/60 text-white flex flex-col items-center justify-center gap-2 px-6 text-center">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <div className="text-xs uppercase tracking-wide font-semibold">
                              {getStatusText(task.status)}
                            </div>
                            <div className="w-full max-w-[180px]">
                              <div className="flex items-center justify-between text-[11px] text-white/80 mb-1">
                                <span>{t.storyboard.genList?.progress || 'Progress'}</span>
                                <span className="font-bold">{progressValue}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-white/30 overflow-hidden">
                                <div
                                  className="h-full bg-white transition-all duration-500"
                                  style={{ width: `${progressValue}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        <span className="text-xs">{t.storyboard.genList?.noImage || 'No preview yet'}</span>
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${getStatusColor(task.status)}`}>
                        {getStatusText(task.status)}
                      </span>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        ID: {task.id.slice(-6).toUpperCase()}
                      </span>
                      <div className="flex items-center gap-2">
                        <span suppressHydrationWarning className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(task.createdAt).toLocaleDateString()}
                        </span>
                        <button
                          onClick={(e) => handleDeleteClick(e, task.id)}
                          className="text-gray-400 hover:text-red-600 p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors opacity-0 group-hover:opacity-100"
                          title={t.common.delete}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 truncate">
                      {task.product?.name || t.storyboard.manual?.taskName || 'Untitled Task'}
                    </h3>

                    {task.scriptContent && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-3">
                        {task.scriptContent}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      {task.character && (
                        <span className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                          {task.character.name}
                        </span>
                      )}
                      <span className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                        {task.segments.length} {t.storyboard.segments}
                      </span>
                    </div>

                    {gridPipeline && (
                      <div className="mt-4 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                        {!showProgressOverlay && task.videoType && (
                          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            {task.videoType.toUpperCase()}
                          </div>
                        )}
                        {showProgressOverlay && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                              <span>{t.storyboard.genList?.progress || 'Progress'}</span>
                              <span className="font-semibold text-gray-900 dark:text-gray-100">{progressValue}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                              <div
                                className="h-full bg-black dark:bg-white transition-all duration-500"
                                style={{ width: `${progressValue}%` }}
                              />
                            </div>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {showSplitButton && (
                            <button
                              onClick={(e) => handleSplit(e, task)}
                              disabled={splitTaskId === task.id}
                              className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-900 text-white dark:bg-white dark:text-black disabled:opacity-50"
                            >
                              {splitTaskId === task.id ? <Loader2 size={14} className="animate-spin" /> : null}
                              {t.storyboard.genList?.split || '一键拆解'}
                            </button>
                          )}
                          {showBreakdownButton && (
                            <button
                              onClick={(e) => handleBreakdown(e, task)}
                              disabled={breakdownTaskId === task.id}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white disabled:opacity-50"
                            >
                              {breakdownTaskId === task.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <ArrowRight size={14} />
                              )}
                              {t.storyboard.genList?.breakdown || t.storyboard.manual?.create || 'Add to Board'}
                            </button>
                          )}
                          {splitPending && (
                            <span className="flex items-center gap-2 text-xs font-semibold text-orange-600 dark:text-orange-300">
                              <Loader2 size={14} className="animate-spin" />
                              {t.storyboard.genList?.splitPending || '拆解中...'}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
        </>
      )}

      <Modal
        isOpen={Boolean(splitPromptTask)}
        onClose={closeSplitModal}
        title={
          <div className="flex items-center gap-3 text-base">
            <Clapperboard size={18} className="text-gray-500 dark:text-gray-400" />
            <span>{t.storyboard.genList?.splitRequiredTitle || 'Split Required'}</span>
          </div>
        }
        maxWidth="max-w-lg"
      >
        {splitPromptTask && (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-xl bg-gray-100 dark:bg-gray-700 overflow-hidden flex items-center justify-center">
                {splitModalImage ? (
                  <img src={splitModalImage} alt="Storyboard grid" className="w-full h-full object-cover" />
                ) : (
                  <Clapperboard className="w-6 h-6 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {splitPromptTask.product?.name || t.storyboard.manual?.taskName || 'Storyboard Task'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  ID: {splitPromptTask.id.slice(-6).toUpperCase()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {getStatusText(splitPromptTask.status)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              <p>{t.storyboard.genList?.splitRequiredDescription || 'This 9-grid task needs to be split before entering the storyboard workspace.'}</p>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-3">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                <span>{t.storyboard.genList?.splitPending || 'Splitting...'}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={closeSplitModal}
                disabled={splitModalBusy}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleSplitModalConfirm}
                disabled={splitModalBusy}
                className="btn-openclaw flex items-center gap-2 px-4 py-2 text-sm font-semibold"
              >
                {splitModalBusy && <Loader2 size={16} className="animate-spin" />}
                {t.storyboard.genList?.split || '一键拆解'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
            setIsDeleteModalOpen(false);
            setTaskToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title={t.common.delete}
        message={taskToDelete ? t.common.confirmDelete : `Are you sure you want to delete ${selectedIds.length} items?`}
      />
    </div>
  );
}
