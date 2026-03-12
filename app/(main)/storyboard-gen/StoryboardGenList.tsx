
'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { StoryboardGenModal } from '@/components/StoryboardGenModal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Plus, LayoutGrid, Loader2, ArrowRight, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { breakdownStoryboardGrid, deleteStoryboardTask, deleteStoryboardTasks } from '@/app/actions/storyboard-gen';
import { toast } from 'react-hot-toast';

interface StoryboardGenListProps {
  initialTasks: any[]; // Type should be StoryboardTask[]
}

export function StoryboardGenList({ initialTasks }: StoryboardGenListProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Delete & Selection State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Helper to safely access nested keys
  const getText = (key: keyof typeof t.storyboard.genList, defaultText: string) => {
    return t.storyboard.genList?.[key] || defaultText;
  };

  const isGenerating = (status: string) => ['GENERATING_GRID', 'ANALYZING_SCRIPT', 'GENERATING_IMAGE'].includes(status);

  const getStatusText = (status: string) => {
    if (status === 'ANALYZING_SCRIPT') return getText('analyzingScript', 'Analyzing Script...');
    if (status === 'GENERATING_IMAGE') return getText('generatingImage', 'Generating Image...');
    if (status === 'GENERATING_GRID') return getText('generatingGrid', 'Generating Grid...');
    return getText('generating', 'Generating');
  };

  // Poll for updates if any task is generating
  useEffect(() => {
    const hasGeneratingTask = initialTasks.some(task => isGenerating(task.status));
    if (!hasGeneratingTask) return;

    const interval = setInterval(() => {
      router.refresh();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [initialTasks, router]);

  const handleCardClick = (task: any) => {
    if (task.status === 'GRID_COMPLETED') {
      router.push(`/storyboard-gen/${task.id}`);
    }
  };

  const handleBreakdown = async (e: React.MouseEvent, taskId: string, gridImageUrl: string, scriptContent: string) => {
    e.stopPropagation(); // Prevent card click
    setProcessingId(taskId);
    try {
      const formData = new FormData();
      formData.append('gridImageUrl', gridImageUrl || '');
      formData.append('script', scriptContent || '');
      formData.append('taskId', taskId);

      const result = await breakdownStoryboardGrid(formData);
      
      toast.success(t.common.success);
      router.push(`/storyboard/${result.taskId}`);
    } catch (error) {
      console.error(error);
      toast.error(t.common.error);
    } finally {
      setProcessingId(null);
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

  return (
    <div className="max-w-7xl mx-auto font-sans">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">
          {getText('title', "Storyboard Video Generation")}
        </h1>
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
            <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center bg-black dark:bg-white hover:bg-gray-900 dark:hover:bg-gray-100 text-white dark:text-black font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline gap-2"
            >
            <Plus size={18} />
            {getText('create', "Create New")}
            </button>
        </div>
      </div>

      {initialTasks.length === 0 ? (
        <div className="text-center py-20 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <LayoutGrid size={48} className="mx-auto mb-4 opacity-50" />
            <p className="mb-4">{getText('noTasks', "No generation tasks yet.")}</p>
            <button
                onClick={() => setIsModalOpen(true)}
                className="text-blue-600 hover:text-blue-500 font-medium underline"
            >
                {getText('startFirst', "Start your first generation")}
            </button>
        </div>
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
            {initialTasks.map((task) => (
                <div 
                key={task.id} 
                onClick={() => handleCardClick(task)}
                className={`group block bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100 dark:border-gray-700 relative ${task.status === 'GRID_COMPLETED' ? 'cursor-pointer ring-2 ring-transparent hover:ring-black dark:hover:ring-white' : ''} ${selectedIds.includes(task.id) ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''}`}
                >
                {/* Checkbox Overlay */}
                <div 
                    className={`absolute top-3 left-3 z-20 transition-opacity duration-200 ${selectedIds.includes(task.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    onClick={(e) => toggleSelection(e, task.id)}
                >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer shadow-sm transition-colors ${selectedIds.includes(task.id) ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300 hover:border-blue-400'}`}>
                        {selectedIds.includes(task.id) && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                        )}
                    </div>
                </div>

                <div className="relative h-48 bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    {isGenerating(task.status) ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-2" />
                        <span className="text-sm text-gray-500">{getStatusText(task.status)}</span>
                    </div>
                    ) : task.coverImage ? (
                    <img 
                        src={task.coverImage} 
                        alt="Grid Result" 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    />
                    ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        <span className="text-sm">{getText('noImage', "No Image")}</span>
                    </div>
                    )}
                    
                    <div className="absolute top-2 right-2">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                        isGenerating(task.status)
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    }`}>
                        {isGenerating(task.status) ? getText('generating', 'Generating') : getText('completed', 'Completed')}
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

                    <div className="line-clamp-2 text-sm text-gray-600 dark:text-gray-300 min-h-[2.5em] mb-4">
                    {task.scriptContent || getText('noScript', "No script content")}
                    </div>

                    <div className="pt-2 border-t dark:border-gray-700 flex justify-end">
                        {task.status === 'GRID_COMPLETED' && (
                            <button
                                onClick={(e) => handleBreakdown(e, task.id, task.coverImage, task.scriptContent)}
                                disabled={!!processingId}
                                className="flex items-center gap-1 text-sm font-bold text-black dark:text-white hover:underline disabled:opacity-50"
                            >
                                {processingId === task.id ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <ArrowRight size={14} />
                                )}
                                {getText('breakdown', "Breakdown")}
                            </button>
                        )}
                    </div>
                </div>
                </div>
            ))}
            </div>
        </>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-6xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden h-[85vh]">
            <StoryboardGenModal onClose={() => {
                setIsModalOpen(false);
                // Add a small delay to avoid "Lock broken" error in dev mode and ensure DB write propagates
                setTimeout(() => {
                  router.refresh();
                }, 500);
            }} />
          </div>
        </div>
      )}

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
