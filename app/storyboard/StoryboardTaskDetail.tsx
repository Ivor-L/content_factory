'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

interface StoryboardSegment {
  id: string;
  order: number;
  duration: number;
  imagePrompt: string | null;
  videoPrompt: string | null;
  generatedImage: string | null;
  generatedVideo: string | null;
  status: string;
}

interface StoryboardTask {
  id: string;
  status: string;
  videoUrl: string | null;
  coverImage: string | null;
  sceneImage: string | null;
  scenePrompt: string | null;
  product: { id: string, name: string, images: string } | null;
  character: { id: string, name: string, avatar: string } | null;
  segments: StoryboardSegment[];
  createdAt: Date;
  updatedAt: Date;
}

interface StoryboardTaskDetailProps {
  initialTask: StoryboardTask;
}

export function StoryboardTaskDetail({ initialTask }: StoryboardTaskDetailProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [task, setTask] = useState<StoryboardTask>(initialTask);
  const [loading, setLoading] = useState(false);

  // Status Badge Logic
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ANALYZING': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'SCENE_CONFIRMATION': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'GENERATING': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'COMPLETED': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'FAILED': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    return (t.storyboard.status as any)[status] || status;
  };

  // Mock Action for Scene Confirmation
  const handleConfirmScene = async () => {
    if (!confirm('Confirm scene and start generation?')) return;
    
    setLoading(true);
    try {
        // TODO: Call API to confirm scene
        toast.success('Scene confirmed! Generation started.');
        
        // Mock update for now
        setTask(prev => ({ ...prev, status: 'GENERATING' }));
    } catch (error) {
        console.error(error);
        toast.error('Failed to confirm scene');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b border-gray-200 dark:border-gray-800 pb-6">
        <div className="flex items-center gap-4">
            <Link href="/storyboard" className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            </Link>
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                    {task.product?.name || 'Task Detail'}
                    <span className={`text-xs px-2 py-1 rounded-md uppercase tracking-wider ${getStatusColor(task.status)}`}>
                        {getStatusText(task.status)}
                    </span>
                </h1>
                <p suppressHydrationWarning className="text-sm text-gray-500 mt-1">
                    ID: {task.id} • Created: {new Date(task.createdAt).toLocaleString()}
                </p>
            </div>
        </div>
        
        <div className="flex items-center gap-3">
            {task.status === 'COMPLETED' && (
                <button className="px-4 py-2 bg-brand-yellow text-black rounded-lg font-bold hover:bg-yellow-400 transition-colors shadow-sm">
                    {t.storyboard.download} Video
                </button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Context & Scene Reference */}
        <div className="space-y-6">
            {/* Product & Character Info */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 border-b border-gray-100 dark:border-gray-700 pb-2">
                    Project Context
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                             {/* Product Image Placeholder - need to parse JSON if real */}
                             <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                             </div>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Product</p>
                            <p className="font-medium text-gray-900 dark:text-white">{task.product?.name}</p>
                        </div>
                    </div>
                    
                    {task.character && (
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                                <img src={task.character.avatar} alt={task.character.name} className="w-full h-full object-cover" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wide">Character</p>
                                <p className="font-medium text-gray-900 dark:text-white">{task.character.name}</p>
                            </div>
                        </div>
                    )}

                    {task.videoUrl && (
                         <div className="pt-2">
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Reference Video</p>
                            <video src={task.videoUrl} controls className="w-full rounded-lg bg-black" />
                         </div>
                    )}
                </div>
            </div>

            {/* Scene Reference */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 border-b border-gray-100 dark:border-gray-700 pb-2 flex justify-between items-center">
                    {t.storyboard.sceneRef}
                    {task.status === 'SCENE_CONFIRMATION' && (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Action Required</span>
                    )}
                </h3>
                
                <div className="aspect-video bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden mb-4 relative group">
                    {task.sceneImage ? (
                        <img src={task.sceneImage} alt="Scene Reference" className="w-full h-full object-cover" />
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 flex-col gap-2">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            <span className="text-sm">Generating Scene...</span>
                        </div>
                    )}
                </div>

                {task.scenePrompt && (
                    <div className="mb-4">
                        <p className="text-xs text-gray-500 mb-1 font-mono uppercase">Scene Prompt</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-700 italic">
                            "{task.scenePrompt}"
                        </p>
                    </div>
                )}

                {task.status === 'SCENE_CONFIRMATION' && (
                    <div className="flex gap-3">
                        <button 
                            onClick={handleConfirmScene}
                            disabled={loading}
                            className="flex-1 bg-brand-yellow text-black font-bold py-2 rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Processing...' : t.storyboard.confirmScene}
                        </button>
                        <button 
                            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
                        >
                            Regenerate
                        </button>
                    </div>
                )}
            </div>
        </div>

        {/* Right Column: Segments */}
        <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        {t.storyboard.segments} ({task.segments.length})
                    </h3>
                </div>
                
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {task.segments.length === 0 ? (
                         <div className="p-12 text-center text-gray-500">
                            No segments yet. Wait for analysis to complete.
                         </div>
                    ) : (
                        task.segments.map((segment) => (
                            <div key={segment.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center font-bold text-sm text-gray-600 dark:text-gray-400">
                                        {segment.order + 1}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-500">
                                                {segment.duration}s
                                            </span>
                                            <span className={`text-xs px-2 py-0.5 rounded uppercase tracking-wider ${getStatusColor(segment.status)}`}>
                                                {getStatusText(segment.status)}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1 font-mono uppercase">Image Prompt</p>
                                                <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                                                    {segment.imagePrompt || 'Pending...'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1 font-mono uppercase">Video Prompt</p>
                                                <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                                                    {segment.videoPrompt || 'Pending...'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Generated Content */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="aspect-video bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden relative">
                                                {segment.generatedImage ? (
                                                    <img src={segment.generatedImage} alt="Generated Keyframe" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-gray-400 text-xs">
                                                        Image Pending
                                                    </div>
                                                )}
                                                <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded">Keyframe</div>
                                            </div>
                                            <div className="aspect-video bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden relative">
                                                {segment.generatedVideo ? (
                                                    <video src={segment.generatedVideo} controls className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-gray-400 text-xs">
                                                        Video Pending
                                                    </div>
                                                )}
                                                <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded">Video</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
