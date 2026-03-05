"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LayoutGrid, List, Trash2, Download, RefreshCw, PlayCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface ReplicationHistoryItem {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  product: { name: string } | null;
  script: { title: string } | null;
  // Mock data fields for display
  videoThumbnail?: string;
  prompt?: string;
}

interface ReplicationHistoryProps {
  initialHistory: ReplicationHistoryItem[];
}

export default function ReplicationHistory({ initialHistory }: ReplicationHistoryProps) {
  const { t } = useLanguage();
  // Mock data for display when history is empty
  const MOCK_HISTORY: ReplicationHistoryItem[] = [
    {
      id: "mock-1",
      type: "replication",
      status: "completed",
      createdAt: "2024-03-02T10:00:00.000Z",
      updatedAt: "2024-03-02T10:05:00.000Z",
      product: { name: "Wireless Earbuds Pro" },
      script: { title: "Unboxing & Review Script" },
      videoThumbnail: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80",
    },
    {
      id: "mock-2",
      type: "replication",
      status: "processing",
      createdAt: "2024-03-02T09:00:00.000Z",
      updatedAt: "2024-03-02T09:01:00.000Z",
      product: { name: "Smart Watch Series 5" },
      script: { title: "Feature Highlight: Health Tracking" },
    },
    {
      id: "mock-3",
      type: "replication",
      status: "failed",
      createdAt: "2024-03-01T10:00:00.000Z",
      updatedAt: "2024-03-01T10:05:00.000Z",
      product: { name: "Portable Coffee Maker" },
      script: { title: "Morning Routine Vlog" },
      videoThumbnail: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800&q=80",
    },
     {
      id: "mock-4",
      type: "replication",
      status: "completed",
      createdAt: "2024-02-29T10:00:00.000Z",
      updatedAt: "2024-02-29T10:30:00.000Z",
      product: { name: "Yoga Mat Eco" },
      script: { title: "Home Workout Essentials" },
      videoThumbnail: "https://images.unsplash.com/photo-1599447421405-0e32096d3033?w=800&q=80",
    }
  ];

  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [history, setHistory] = useState(initialHistory.length > 0 ? initialHistory : MOCK_HISTORY);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  // Mock function to handle selection
  const toggleSelection = (id: string) => {
    setSelectedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Mock bulk actions
  const handleDelete = async () => {
    if (selectedItems.length === 0) return;
    if (!confirm(`Delete ${selectedItems.length} items?`)) return;
    
    // In real app: call API
    setHistory(prev => prev.filter(item => !selectedItems.includes(item.id)));
    setSelectedItems([]);
    toast.success("Items deleted");
  };

  const handleDownload = () => {
    if (selectedItems.length === 0) return;
    toast.success(`Downloading ${selectedItems.length} items...`);
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header / Toolbar */}
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex items-center justify-between shrink-0">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          {t.replication.history} <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">{history.length}</span>
        </h3>
        
        <div className="flex items-center gap-2">
            {selectedItems.length > 0 && (
                <div className="flex items-center gap-2 mr-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 shadow-sm">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 ml-1">{selectedItems.length} selected</span>
                    <button onClick={handleDownload} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300" title={t.replication.download}>
                        <Download size={16} />
                    </button>
                    <button onClick={handleDelete} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-red-500 dark:text-red-400" title={t.common.delete}>
                        <Trash2 size={16} />
                    </button>
                </div>
            )}

            <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                <button 
                    onClick={() => setViewMode('list')}
                    className={cn(
                        "p-1.5 rounded transition-all",
                        viewMode === 'list' ? "bg-white dark:bg-gray-800 text-black dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                >
                    <List size={16} />
                </button>
                <button 
                    onClick={() => setViewMode('grid')}
                    className={cn(
                        "p-1.5 rounded transition-all",
                        viewMode === 'grid' ? "bg-white dark:bg-gray-800 text-black dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                >
                    <LayoutGrid size={16} />
                </button>
            </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                <RefreshCw size={48} className="mb-4 opacity-20" />
                <p>No replication history yet.</p>
            </div>
        ) : (
            <div className={cn(
                "gap-6",
                viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "space-y-4"
            )}>
                {history.map((item) => {
                    const isSelected = selectedItems.includes(item.id);
                    const isPending = item.status === 'pending' || item.status === 'processing';
                    
                    return (
                        <div 
                            key={item.id}
                            className={cn(
                                "group relative bg-white dark:bg-gray-800 border rounded-xl overflow-hidden transition-all hover:shadow-md cursor-pointer",
                                isSelected ? "border-black dark:border-white ring-1 ring-black dark:ring-white" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
                                viewMode === 'list' ? "flex items-center p-4 h-24" : "flex flex-col"
                            )}
                            onClick={() => toggleSelection(item.id)}
                        >
                            {/* Selection Checkbox */}
                            <div className="absolute top-3 left-3 z-10">
                                <div className={cn(
                                    "w-5 h-5 rounded border flex items-center justify-center transition-colors bg-white dark:bg-gray-800",
                                    isSelected ? "bg-black dark:bg-white border-black dark:border-white text-white dark:text-black" : "border-gray-300 dark:border-gray-600 opacity-0 group-hover:opacity-100"
                                )}>
                                    {isSelected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                            </div>

                            {/* Thumbnail */}
                            <div className={cn(
                                "relative bg-gray-100 dark:bg-gray-700 overflow-hidden flex items-center justify-center",
                                viewMode === 'list' ? "w-16 h-16 rounded-lg shrink-0 mr-4" : "w-full aspect-video"
                            )}>
                                {isPending ? (
                                    <div className="flex flex-col items-center text-gray-400 dark:text-gray-500">
                                        <Loader2 size={24} className="animate-spin mb-2 text-black dark:text-white" />
                                        <span className="text-xs font-medium">{t.replication.generating}</span>
                                    </div>
                                ) : (
                                    <>
                                        {item.videoThumbnail ? (
                                            <img src={item.videoThumbnail} alt="Thumbnail" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full bg-gradient-to-br from-gray-800 to-black opacity-80" />
                                        )}
                                        <PlayCircle className="absolute text-white/80 w-10 h-10" />
                                    </>
                                )}
                            </div>

                            {/* Content */}
                            <div className={cn(
                                "flex-1 min-w-0",
                                viewMode === 'grid' ? "p-4" : ""
                            )}>
                                <div className="flex items-start justify-between mb-1">
                                    <h4 className="font-bold text-gray-900 dark:text-white truncate pr-2 text-sm">
                                        {item.product?.name || "Unknown Product"}
                                    </h4>
                                    <span className={cn(
                                        "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0",
                                        item.status === 'completed' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                        item.status === 'failed' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                        "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                    )}>
                                        {item.status}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-3">
                                    Ref: {item.script?.title || "Unknown Script"}
                                </p>
                                
                                <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                                    <span suppressHydrationWarning>{new Date(item.createdAt).toLocaleDateString()}</span>
                                    {/* Action Buttons (Visible on hover) */}
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            className="p-1 hover:text-black dark:hover:text-white" 
                                            title={t.replication.regenerate}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toast.success("Regenerating...");
                                            }}
                                        >
                                            <RefreshCw size={14} />
                                        </button>
                                        <button 
                                            className="p-1 hover:text-black dark:hover:text-white" 
                                            title={t.replication.download}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toast.success("Downloading...");
                                            }}
                                        >
                                            <Download size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
      </div>
    </div>
  );
}
