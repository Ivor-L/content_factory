'use client';

import { useState, useEffect } from "react";
import { PlusCircle, PlayCircle, Eye, ShoppingBag, ChevronDown, Zap, Layers, FileJson } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ConfirmModal } from '@/components/ConfirmModal';
import { ScriptForm } from "@/components/ScriptForm";
import ReplicationForm from "@/app/(main)/replication/ReplicationForm";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { deleteScript } from "./actions";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

import { ScriptStatusBadge } from "./ScriptStatusBadge";
import ScriptStatusPoller from "./[id]/ScriptStatusPoller";

interface Script {
  id: string;
  title: string;
  videoUrl: string | null;
  createdAt: string;
  status?: string;
  progress?: number;
  error?: string | null;
  blueprint?: string | null;
}

interface Character {
  id: string;
  name: string;
  avatar: string;
}

interface ScriptListProps {
  initialScripts: Script[];
  products: { id: string; name: string; images?: string }[];
  characters: Character[];
}

// Mock Data for Viral Templates
const VIRAL_TEMPLATES = [
    {
        id: '1',
        title: '母婴·防摔遥控器套',
        sales: '87',
        views: '71.3k+',
        coverCaption: 'IS YOUR BABY ALWAYS\nEATING THE REMOTE?',
        imageUrl: 'https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&q=80&w=600&h=800'
    },
    {
        id: '2',
        title: '孕期托腹带·日常出门不累腰',
        sales: '91',
        views: '77.6k+',
        imageUrl: 'https://images.unsplash.com/photo-1555243896-c709bfa0b564?auto=format&fit=crop&q=80&w=600&h=800'
    },
    {
        id: '3',
        title: '旅行便携电子称&收纳锁扣套装',
        sales: '592',
        views: '6124.5k+',
        imageUrl: 'https://images.unsplash.com/photo-1565514020176-db704462e245?auto=format&fit=crop&q=80&w=600&h=800'
    },
    {
        id: '4',
        title: '大码快干运动T恤',
        sales: '196',
        views: '20.7k+',
        imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=600&h=800'
    },
    {
        id: '5',
        title: '节日礼记·年度手账本',
        sales: '405',
        views: '43.1k+',
        imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&q=80&w=600&h=800'
    }
];

const REGIONS = [
    { id: 'all', en: 'All', zh: '全部' },
    { id: 'us', en: 'United States', zh: '美国' },
    { id: 'uk', en: 'United Kingdom', zh: '英国' },
    { id: 'id', en: 'Indonesia', zh: '印尼' },
    { id: 'my', en: 'Malaysia', zh: '马来西亚' },
    { id: 'th', en: 'Thailand', zh: '泰国' },
    { id: 'vn', en: 'Vietnam', zh: '越南' },
    { id: 'ph', en: 'Philippines', zh: '菲律宾' },
    { id: 'sg', en: 'Singapore', zh: '新加坡' },
];

const CATEGORIES = [
    { id: 'all', en: 'All', zh: '全部' },
    { id: 'fashion', en: 'Fashion', zh: '服饰鞋包' },
    { id: 'beauty', en: 'Beauty & Care', zh: '美妆个护' },
    { id: 'electronics', en: 'Electronics', zh: '3C数码' },
    { id: 'home', en: 'Home & Kitchen', zh: '家居厨卫' },
    { id: 'baby', en: 'Baby & Maternity', zh: '母婴用品' },
    { id: 'outdoor', en: 'Outdoor & Sports', zh: '户外运动' },
    { id: 'pets', en: 'Pets', zh: '宠物用品' },
    { id: 'health', en: 'Health', zh: '医药健康' },
    { id: 'food', en: 'Food & Beverage', zh: '食品饮料' },
    { id: 'toys', en: 'Toys & Hobbies', zh: '玩具兴趣' },
];

export function ScriptList({ initialScripts, products, characters }: ScriptListProps) {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'my-templates' | 'viral-templates'>('my-templates');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [scriptToDelete, setScriptToDelete] = useState<string | null>(null);
  const [selectedReplicationScript, setSelectedReplicationScript] = useState<Script | null>(null);
  const [isReplicationModalOpen, setIsReplicationModalOpen] = useState(false);

  // Filter states
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [activeDropdown, setActiveDropdown] = useState<'region' | 'category' | null>(null);
  
  // Replication Mode
  const [replicationMode, setReplicationMode] = useState<'one-click' | 'storyboard'>('one-click');
  const [analysisTab, setAnalysisTab] = useState<'replication' | 'breakdown'>('replication');

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Click outside handler
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.relative.inline-block')) {
            setActiveDropdown(null);
        }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleScriptCreated = () => {
    setIsModalOpen(false);
    setEditingScript(null);
    router.refresh();
  };

  const currentRegion = REGIONS.find(r => r.id === selectedRegion);
  const currentCategory = CATEGORIES.find(c => c.id === selectedCategory);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setScriptToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!scriptToDelete) return;

    try {
        await deleteScript(scriptToDelete);
        toast.success(t.common.success, {
            icon: '✅',
            duration: 2000,
            style: {
                borderRadius: '10px',
                background: '#f0fdf4',
                color: '#166534',
                border: '1px solid #bbf7d0',
            },
        });
        router.refresh();
    } catch (error) {
        console.error(error);
        toast.error(t.common.error);
    }
  };

  if (!mounted) {
    return null; // Or a loading spinner
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-sans">
      <div className="flex justify-between items-center mb-6">
        {/* Tab Navigation */}
        <div className="flex gap-8 border-b border-transparent items-end">
            <button
                onClick={() => setActiveTab('my-templates')}
                className={cn(
                    "font-bold pb-2 transition-all duration-300 ease-in-out relative",
                    activeTab === 'my-templates' 
                        ? "text-3xl text-gray-900 dark:text-white" 
                        : "text-xl text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                )}
            >
                {t.scripts.myTemplates}
                {activeTab === 'my-templates' && (
                    <motion.div
                        layoutId="script-tab-underline"
                        className="absolute bottom-0 left-0 w-full h-1 bg-black dark:bg-white rounded-full"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                )}
            </button>
            <button
                onClick={() => setActiveTab('viral-templates')}
                className={cn(
                    "font-bold pb-2 transition-all duration-300 ease-in-out relative",
                    activeTab === 'viral-templates' 
                        ? "text-3xl text-gray-900 dark:text-white" 
                        : "text-xl text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                )}
            >
                {t.scripts.viralTemplates}
                {activeTab === 'viral-templates' && (
                    <motion.div
                        layoutId="script-tab-underline"
                        className="absolute bottom-0 left-0 w-full h-1 bg-black dark:bg-white rounded-full"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                )}
            </button>
        </div>

        <button
          onClick={() => {
            setEditingScript(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-bold rounded-lg shadow-sm text-white dark:text-black bg-black dark:bg-white hover:bg-gray-900 dark:hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black dark:focus:ring-white transition-colors uppercase tracking-wide gap-2"
        >
          <PlusCircle size={20} />
          {t.scripts.newScript}
        </button>
      </div>

      {activeTab === 'my-templates' ? (
        // My Templates View
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {initialScripts.map((script) => (
            <div 
                key={script.id} 
                onClick={() => {
                    setSelectedReplicationScript(script);
                    setIsReplicationModalOpen(true);
                }}
                onMouseEnter={(e) => {
                    const video = e.currentTarget.querySelector('video');
                    if (video) {
                        video.play().catch(() => {});
                    }
                }}
                onMouseLeave={(e) => {
                    const video = e.currentTarget.querySelector('video');
                    if (video) {
                        video.pause();
                        video.currentTime = 0;
                    }
                }}
                className="group relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer shadow-sm hover:shadow-lg transition-all duration-300"
            >
                {/* Status Overlay for Pending Scripts */}
                {script.status && script.status !== 'completed' && (
                    <ScriptStatusBadge 
                        status={script.status} 
                        progress={script.progress || 0} 
                        scriptId={script.id}
                        error={script.error}
                        compact
                    />
                )}

                {/* Background Video/Image */}
                <div className="absolute inset-0">
                    {script.videoUrl ? (
                    <video 
                        src={script.videoUrl} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                        muted 
                        loop
                        playsInline
                        preload="metadata"
                    />
                    ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800">
                        <PlayCircle size={32} />
                        <span className="text-xs mt-2">No Video</span>
                    </div>
                    )}
                </div>

                {/* Overlay Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />

                {/* Bottom Content */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                    <h3 className="font-bold text-white text-sm line-clamp-2 mb-2 leading-tight drop-shadow-md" title={script.title}>
                        {script.title}
                    </h3>
                    
                    <div className="flex items-center justify-between text-[10px] text-gray-300">
                        <span suppressHydrationWarning>{new Date(script.createdAt).toLocaleDateString()}</span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEditingScript(script);
                                    setIsModalOpen(true);
                                }}
                                className="text-gray-300 hover:text-white p-1.5 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
                                title={t.common.edit}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 00 2 2h11a2 2 0 00 2-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            </button>
                            <button
                                onClick={(e) => handleDeleteClick(e, script.id)}
                                className="text-gray-300 hover:text-red-400 p-1.5 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
                                title={t.common.delete}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            ))}
            
            {initialScripts.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800">
                <p className="text-lg mb-4 font-medium">{t.scripts.noScripts}</p>
                <button 
                onClick={() => {
                    setEditingScript(null);
                    setIsModalOpen(true);
                }}
                className="text-gray-900 dark:text-gray-100 hover:text-black font-bold flex items-center gap-2 hover:underline"
                >
                <PlusCircle size={20} />
                {t.scripts.createFirst}
                </button>
            </div>
            )}
        </div>
      ) : (
        // Viral Templates View
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex gap-3 overflow-x-visible pb-2">
                <div className="relative inline-block">
                    <button 
                        onClick={() => setActiveDropdown(activeDropdown === 'region' ? null : 'region')}
                        className="flex items-center gap-1 px-4 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
                    >
                        {t.scripts.region} <span className="text-gray-400">|</span> {language === 'en' ? currentRegion?.en : currentRegion?.zh} <ChevronDown size={14} />
                    </button>
                    {activeDropdown === 'region' && (
                        <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 py-1 z-10 max-h-64 overflow-y-auto">
                            {REGIONS.map((region) => (
                                <button
                                    key={region.id}
                                    onClick={() => {
                                        setSelectedRegion(region.id);
                                        setActiveDropdown(null);
                                    }}
                                    className={cn(
                                        "w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700",
                                        selectedRegion === region.id 
                                            ? "text-black dark:text-white font-bold bg-gray-50 dark:bg-gray-700" 
                                            : "text-gray-600 dark:text-gray-400"
                                    )}
                                >
                                    {language === 'en' ? region.en : region.zh}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="relative inline-block">
                    <button 
                        onClick={() => setActiveDropdown(activeDropdown === 'category' ? null : 'category')}
                        className="flex items-center gap-1 px-4 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
                    >
                        {t.scripts.category} <span className="text-gray-400">|</span> {language === 'en' ? currentCategory?.en : currentCategory?.zh} <ChevronDown size={14} />
                    </button>
                    {activeDropdown === 'category' && (
                        <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 py-1 z-10 max-h-64 overflow-y-auto">
                            {CATEGORIES.map((category) => (
                                <button
                                    key={category.id}
                                    onClick={() => {
                                        setSelectedCategory(category.id);
                                        setActiveDropdown(null);
                                    }}
                                    className={cn(
                                        "w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700",
                                        selectedCategory === category.id 
                                            ? "text-black dark:text-white font-bold bg-gray-50 dark:bg-gray-700" 
                                            : "text-gray-600 dark:text-gray-400"
                                    )}
                                >
                                    {language === 'en' ? category.en : category.zh}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {VIRAL_TEMPLATES.map((template) => (
                    <div key={template.id} className="group relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer shadow-sm hover:shadow-lg transition-all duration-300">
                        {/* Background Image */}
                        <img 
                            src={template.imageUrl} 
                            alt={template.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                        
                        {/* Overlay Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                        {/* Optional Center Caption */}
                        {template.coverCaption && (
                            <div className="absolute inset-0 flex items-center justify-center px-4">
                                <p className="text-white font-black text-center text-xl leading-tight tracking-tighter drop-shadow-lg" style={{ textShadow: '2px 2px 0 #000' }}>
                                    {template.coverCaption}
                                </p>
                            </div>
                        )}

                        {/* Bottom Badges */}
                        <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                            <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-2 py-1 rounded-md flex items-center gap-1 shadow-sm">
                                <ShoppingBag size={10} className="text-gray-500" />
                                <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">{template.sales} {t.scripts.sales}</span>
                            </div>
                            <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-2 py-1 rounded-md flex items-center gap-1 shadow-sm">
                                <Eye size={10} className="text-gray-500" />
                                <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">{template.views}</span>
                            </div>
                        </div>

                        {/* Hover Overlay Title */}
                        <div className="absolute top-0 left-0 right-0 p-4 transform -translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-gradient-to-b from-black/80 to-transparent">
                            <h3 className="text-white text-sm font-bold line-clamp-2">{template.title}</h3>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
            setIsModalOpen(false);
            setEditingScript(null);
        }}
        title={editingScript ? t.scripts.editTitle : t.scripts.formTitle}
      >
        <ScriptForm 
            onSuccess={handleScriptCreated} 
            initialData={editingScript || undefined}
            key={editingScript?.id || 'new'}
        />
      </Modal>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
            setIsDeleteModalOpen(false);
            setScriptToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title={t.common.delete}
        message={t.common.confirmDelete}
      />

      <Modal
        isOpen={isReplicationModalOpen}
        onClose={() => {
            setIsReplicationModalOpen(false);
            setSelectedReplicationScript(null);
            setReplicationMode('one-click');
            setAnalysisTab('replication');
        }}
        title={
            <div className="flex items-center justify-center w-full pr-8 relative">
                <span className="truncate absolute left-0 max-w-[30%] text-left">{selectedReplicationScript?.title || t.replication.title}</span>
                
                {/* Main Function Tabs - Centered */}
                <div className="bg-gray-100 dark:bg-gray-800/50 p-1 rounded-full inline-flex shrink-0 mx-auto">
                    <button
                        onClick={() => setAnalysisTab('replication')}
                        className={cn(
                            "px-6 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 relative z-10",
                            analysisTab === 'replication' 
                                ? "text-white" 
                                : "text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
                        )}
                    >
                        {analysisTab === 'replication' && (
                            <motion.div
                                layoutId="analysis-tab-bg"
                                className="absolute inset-0 bg-black dark:bg-white rounded-full -z-10 shadow-sm"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                        <Zap size={16} />
                        爆款复刻
                    </button>
                    <button
                        onClick={() => setAnalysisTab('breakdown')}
                        className={cn(
                            "px-6 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 relative z-10",
                            analysisTab === 'breakdown' 
                                ? "text-white" 
                                : "text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
                        )}
                    >
                        {analysisTab === 'breakdown' && (
                            <motion.div
                                layoutId="analysis-tab-bg"
                                className="absolute inset-0 bg-black dark:bg-white rounded-full -z-10 shadow-sm"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                        <FileJson size={16} />
                        爆款拆解
                    </button>
                </div>
            </div>
        }
        maxWidth="max-w-6xl"
      >
        <div className="flex flex-col h-[75vh] relative">
            {/* Mode Tabs - Top Right Absolute (Sub-modes only) */}
            <div className="absolute top-0 right-0 z-10 flex gap-2">
                {/* Sub-modes for Replication (only show when Replication tab is active AND a script is selected) */}
                {analysisTab === 'replication' && selectedReplicationScript && (
                    <div className="bg-gray-100 dark:bg-gray-800/50 p-1 rounded-full inline-flex animate-in fade-in slide-in-from-left-2 duration-300 relative">
                        <button
                            onClick={() => setReplicationMode('one-click')}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 relative z-10",
                                replicationMode === 'one-click' 
                                    ? "text-black dark:text-white" 
                                    : "text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
                            )}
                        >
                            {replicationMode === 'one-click' && (
                                <motion.div
                                    layoutId="replication-mode-bg"
                                    className="absolute inset-0 bg-white dark:bg-gray-700 rounded-full -z-10 shadow-sm"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <Zap size={14} />
                            {(t as any).home?.oneClickMode || 'One-Click Video'}
                        </button>
                        <button
                            onClick={() => setReplicationMode('storyboard')}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 relative z-10",
                                replicationMode === 'storyboard' 
                                    ? "text-black dark:text-white" 
                                    : "text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
                            )}
                        >
                            {replicationMode === 'storyboard' && (
                                <motion.div
                                    layoutId="replication-mode-bg"
                                    className="absolute inset-0 bg-white dark:bg-gray-700 rounded-full -z-10 shadow-sm"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <Layers size={14} />
                            {(t as any).home?.storyboardMode || 'Storyboard Control'}
                        </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0 lg:pt-0">
                {/* Left: Video */}
                <div className="bg-black rounded-xl overflow-hidden flex items-center justify-center relative lg:col-span-3">
                    {selectedReplicationScript?.videoUrl ? (
                        <>
                            <video 
                                src={selectedReplicationScript.videoUrl} 
                                className="w-full h-full object-contain" 
                                controls 
                                autoPlay
                                muted
                                loop
                                playsInline
                            />
                            {selectedReplicationScript.status && selectedReplicationScript.status !== 'completed' && (
                                <div className="absolute inset-0 bg-white/90 dark:bg-gray-900/90 z-20 flex flex-col items-center justify-center">
                                    <ScriptStatusPoller 
                                        scriptId={selectedReplicationScript.id} 
                                        initialStatus={selectedReplicationScript.status}
                                        initialProgress={selectedReplicationScript.progress}
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-white text-center">
                            <PlayCircle size={64} className="mx-auto mb-4 opacity-50" />
                            <p>No video preview available</p>
                        </div>
                    )}
                </div>
                
                {/* Right: Replication Form or Breakdown Analysis */}
                <div className={cn(
                    "flex flex-col h-full overflow-hidden lg:col-span-2",
                    analysisTab === 'replication' && "pt-12"
                )}>
                    {selectedReplicationScript && (
                        analysisTab === 'replication' ? (
                            <ReplicationForm 
                                products={products} 
                                scripts={[selectedReplicationScript]}
                                characters={characters}
                                preselectedScriptId={selectedReplicationScript.id}
                                mode={replicationMode}
                                onSuccess={() => {
                                    setIsReplicationModalOpen(false);
                                    setSelectedReplicationScript(null);
                                    setReplicationMode('one-click');
                                    setAnalysisTab('replication');
                                }}
                            />
                        ) : (
                            <div className="h-full overflow-y-auto pr-2 custom-scrollbar space-y-6">
                                {/* Analysis Result Content */}
                                {selectedReplicationScript.blueprint ? (
                                    (() => {
                                        try {
                                            const analysisData = JSON.parse(selectedReplicationScript.blueprint);
                                            return (
                                                <div className="space-y-6">
                                                    {/* Meta Info */}
                                                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                                                        <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                                            <span className="text-xl">🎬</span> 视频元数据
                                                        </h3>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-1">
                                                                <span className="text-xs text-gray-500 uppercase tracking-wider">风格</span>
                                                                <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{analysisData.meta?.art_style || 'N/A'}</p>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <span className="text-xs text-gray-500 uppercase tracking-wider">情绪</span>
                                                                <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{analysisData.meta?.mood_atmosphere || 'N/A'}</p>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <span className="text-xs text-gray-500 uppercase tracking-wider">画质</span>
                                                                <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{analysisData.meta?.render_quality || 'N/A'}</p>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <span className="text-xs text-gray-500 uppercase tracking-wider">时长</span>
                                                                <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{analysisData.meta?.total_duration || 'N/A'}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Scene Breakdown */}
                                                    <div className="space-y-4">
                                                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 px-1">
                                                            <span className="text-xl">✂️</span> 镜头拆解
                                                            <span className="text-xs font-normal text-gray-500 ml-auto">共 {analysisData.scene_breakdown?.length || 0} 个镜头</span>
                                                        </h3>
                                                        
                                                        {analysisData.scene_breakdown?.map((scene: any, idx: number) => (
                                                            <div key={idx} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                                                <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                                                    <span className="font-bold text-sm text-gray-700 dark:text-gray-200">镜头 {scene.id}</span>
                                                                    <span className="text-xs font-mono bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300">{scene.time_range}</span>
                                                                </div>
                                                                
                                                                <div className="p-4 space-y-4">
                                                                    {/* Visual Specs */}
                                                                    <div className="space-y-3">
                                                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">视觉呈现</h4>
                                                                        <div className="grid gap-3 text-sm">
                                                                            <div className="flex gap-3">
                                                                                <span className="text-black dark:text-white shrink-0 mt-0.5">🎥</span>
                                                                                <div>
                                                                                    <span className="font-medium text-gray-900 dark:text-white block text-xs mb-0.5">运镜</span>
                                                                                    <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{scene.visual_specs?.camera}</p>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex gap-3">
                                                                                <span className="text-black dark:text-white shrink-0 mt-0.5">💃</span>
                                                                                <div>
                                                                                    <span className="font-medium text-gray-900 dark:text-white block text-xs mb-0.5">动作</span>
                                                                                    <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{scene.visual_specs?.subject_action}</p>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex gap-3">
                                                                                <span className="text-black dark:text-white shrink-0 mt-0.5">💡</span>
                                                                                <div>
                                                                                    <span className="font-medium text-gray-900 dark:text-white block text-xs mb-0.5">光影</span>
                                                                                    <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{scene.visual_specs?.lighting_environment}</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Logic */}
                                                                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                                                                        <h4 className="text-xs font-bold text-black dark:text-white uppercase tracking-wider mb-2">核心逻辑</h4>
                                                                        <p className="text-sm text-gray-700 dark:text-gray-200 mb-2">
                                                                            <span className="font-bold">功能：</span> {scene.abstract_logic?.narrative_role}
                                                                        </p>
                                                                        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                                                            "{scene.abstract_logic?.universal_instruction}"
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        } catch (e) {
                                            return (
                                                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                                                    <p>Failed to parse analysis result.</p>
                                                </div>
                                            );
                                        }
                                    })()
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                                        <FileJson size={48} className="mb-4 opacity-20" />
                                        <p>暂无详细分析数据</p>
                                        <p className="text-xs mt-2">请等待分析完成</p>
                                    </div>
                                )}
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
      </Modal>
    </div>
  );
}
