'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import Link from 'next/link';
import { StoryboardModal } from './StoryboardModal';
import { deleteStoryboardTask, deleteStoryboardTasks } from '@/app/actions/storyboard-gen';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface StoryboardTask {
  id: string;
  status: string;
  videoUrl: string | null;
  coverImage: string | null;
  sceneImage: string | null;
  scenePrompt: string | null;
  product: { id: string, name: string, images: string } | null;
  character: { id: string, name: string, avatar: string } | null;
  segments: any[]; // Using any for now to avoid duplication, or import shared type
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface StoryboardTaskListProps {
  initialTasks: StoryboardTask[];
  products?: any[];
  characters?: any[];
}

export function StoryboardTaskList({ initialTasks, products = [], characters = [] }: StoryboardTaskListProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [selectedTask, setSelectedTask] = useState<StoryboardTask | null>(null);

  // Delete & Selection State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-sans">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t.storyboard.title}</h1>
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
            <Link
            href="/"
            className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-bold rounded-lg shadow-sm text-white dark:text-black bg-black dark:bg-white hover:bg-gray-900 dark:hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black dark:focus:ring-white transition-colors uppercase tracking-wide"
            >
            {t.common.create}
            </Link>
        </div>
      </div>

      {initialTasks.length === 0 ? (
        <div className="text-center py-20 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="mb-4">{t.replication.history} is empty</p>
          <Link 
            href="/"
            className="text-blue-600 hover:text-blue-500 font-medium underline"
          >
            {t.common.create}
          </Link>
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
                onClick={() => setSelectedTask(task)}
                className={`group block bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100 dark:border-gray-700 cursor-pointer relative ${selectedIds.includes(task.id) ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''}`}
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
                    {task.coverImage ? (
                    <img
                        src={task.coverImage}
                        alt="Cover"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
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
                        {task.product?.name || 'Untitled Product'}
                    </h3>
                    
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
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
                </div>
                </div>
            ))}
            </div>
        </>
      )}

      {selectedTask && (
        <StoryboardModal 
            task={selectedTask} 
            isOpen={!!selectedTask} 
            onClose={() => setSelectedTask(null)} 
            products={products}
            characters={characters}
        />
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
