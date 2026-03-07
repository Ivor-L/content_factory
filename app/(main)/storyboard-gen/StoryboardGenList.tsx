
'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { StoryboardGenModal } from '@/components/StoryboardGenModal';
import { Plus, LayoutGrid, Loader2, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { breakdownStoryboardGrid } from '@/app/actions/storyboard-gen';
import { toast } from 'react-hot-toast';

interface StoryboardGenListProps {
  initialTasks: any[]; // Type should be StoryboardTask[]
}

export function StoryboardGenList({ initialTasks }: StoryboardGenListProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Helper to safely access nested keys
  const getText = (key: keyof typeof t.storyboard.genList, defaultText: string) => {
    return t.storyboard.genList?.[key] || defaultText;
  };

  const handleBreakdown = async (taskId: string, gridImageUrl: string, scriptContent: string) => {
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

  return (
    <div className="max-w-7xl mx-auto font-sans">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">
          {getText('title', "Storyboard Video Generation")}
        </h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center bg-black dark:bg-white hover:bg-gray-900 dark:hover:bg-gray-100 text-white dark:text-black font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline gap-2"
        >
          <Plus size={18} />
          {getText('create', "Create New")}
        </button>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {initialTasks.map((task) => (
            <div key={task.id} className="group block bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100 dark:border-gray-700">
              <div className="relative h-48 bg-gray-100 dark:bg-gray-700 overflow-hidden">
                {task.status === 'GENERATING_GRID' ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-2" />
                    <span className="text-sm text-gray-500">{getText('generatingGrid', "Generating Grid...")}</span>
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
                    task.status === 'GENERATING_GRID' 
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                      : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  }`}>
                    {task.status === 'GENERATING_GRID' ? getText('generating', 'Generating') : getText('completed', 'Completed')}
                  </span>
                </div>
              </div>

              <div className="p-5">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        ID: {task.id.slice(-6).toUpperCase()}
                    </span>
                    <span suppressHydrationWarning className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(task.createdAt).toLocaleDateString()}
                    </span>
                </div>

                <div className="line-clamp-2 text-sm text-gray-600 dark:text-gray-300 min-h-[2.5em] mb-4">
                  {task.scriptContent || getText('noScript', "No script content")}
                </div>

                <div className="pt-2 border-t dark:border-gray-700 flex justify-end">
                    {task.status === 'GRID_COMPLETED' && (
                        <button
                            onClick={() => handleBreakdown(task.id, task.coverImage, task.scriptContent)}
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
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-6xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden h-[85vh]">
            <StoryboardGenModal onClose={() => {
                setIsModalOpen(false);
                router.refresh();
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
