
'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowLeft, LayoutGrid, FileText, Film, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { breakdownStoryboardGrid } from '@/app/actions/storyboard-gen';
import { toast } from 'react-hot-toast';

interface StoryboardGenDetailProps {
  task: any; // StoryboardTask
}

export function StoryboardGenDetail({ task }: StoryboardGenDetailProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'script' | 'prompts'>('script');
  const [isProcessing, setIsProcessing] = useState(false);

  // Helper to safely access nested keys
  const getText = (key: keyof typeof t.storyboard.genList, defaultText: string) => {
    return t.storyboard.genList?.[key] || defaultText;
  };

  const handleBreakdown = async () => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('gridImageUrl', task.coverImage || '');
      formData.append('script', task.scriptContent || '');
      formData.append('taskId', task.id);

      const result = await breakdownStoryboardGrid(formData);
      
      toast.success(t.common.success);
      router.push(`/storyboard/${result.taskId}`);
    } catch (error) {
      console.error(error);
      toast.error(t.common.error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Parse prompts if available
  // Workflow returns 'shots' array in grid_plan_json (stored as storyboardStructure)
  const prompts = Array.isArray(task.storyboardStructure?.shots) 
    ? task.storyboardStructure.shots 
    : (Array.isArray(task.storyboardStructure?.scenes) ? task.storyboardStructure.scenes : []);

  return (
    <div className="max-w-7xl mx-auto p-6 font-sans h-[calc(100vh-100px)] flex flex-col">
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={() => router.back()}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold">
          {getText('title', "Storyboard Detail")}
        </h1>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Left: Image */}
        <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden flex items-center justify-center border dark:border-gray-700">
          {task.coverImage ? (
            <img 
              src={task.coverImage} 
              alt="Grid Result" 
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="text-gray-400 flex flex-col items-center">
              <LayoutGrid size={48} className="mb-2" />
              <span>{getText('noImage', "No Image")}</span>
            </div>
          )}
        </div>

        {/* Right: Info */}
        <div className="w-96 flex flex-col bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b dark:border-gray-700">
            <button
              onClick={() => setActiveTab('script')}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'script' 
                  ? 'text-black dark:text-white border-b-2 border-black dark:border-white' 
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <FileText size={16} />
              {t.generation.scriptContent}
            </button>
            <button
              onClick={() => setActiveTab('prompts')}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'prompts' 
                  ? 'text-black dark:text-white border-b-2 border-black dark:border-white' 
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Film size={16} />
              {getText('prompts', "Scene Prompts")}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'script' ? (
              <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {task.scriptContent || getText('noScript', "No script content")}
              </div>
            ) : (
              <div className="space-y-4">
                {prompts.length > 0 ? (
                  prompts.map((scene: any, index: number) => (
                    <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border dark:border-gray-700">
                      <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
                        Scene {index + 1}
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200">
                        {scene.prompt || scene.description || JSON.stringify(scene)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-gray-500">
                    <p>{getText('noPrompts', "No scene prompts available.")}</p>
                    <p className="text-xs mt-2 opacity-70">
                      (Prompts will appear here if the workflow returns them)
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Action */}
          <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <button
              onClick={handleBreakdown}
              disabled={isProcessing}
              className="w-full py-3 bg-black dark:bg-white text-white dark:text-black font-bold rounded hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <LayoutGrid size={18} />
              )}
              {getText('breakdown', "Start Breakdown")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
