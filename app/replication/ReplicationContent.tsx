'use client';

import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { VideoCard } from "@/components/VideoCard";
import { VideoDetailsModal } from "@/components/VideoDetailsModal";
import { Modal } from "@/components/Modal";
import { cn } from "@/lib/utils";
import { Clapperboard, Video, ArrowLeftRight, Download, AlertTriangle } from "lucide-react";

interface ReplicationContentProps {
  history: any[];
}

export default function ReplicationContent({ history }: ReplicationContentProps) {
  const { t } = useLanguage();
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [selectedVideo, setSelectedVideo] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showBanner, setShowBanner] = useState(true);

  const filters = [
    { id: 'ALL', label: t.replication.allAds, icon: Clapperboard },
    { id: 'FULL', label: t.replication.viralClone, icon: null },
    { id: 'CHARACTER', label: t.replication.character, icon: Video },
    { id: 'MOTION_SWAP', label: t.replication.motionSwap, icon: ArrowLeftRight },
  ];

  const filteredHistory = activeFilter === 'ALL' 
    ? history 
    : history.filter(item => item.type === activeFilter);

  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBatchDownload = () => {
    // Implement batch download logic here
    console.log("Downloading ids:", Array.from(selectedIds));
    // For demo, just alert
    alert(`Downloading ${selectedIds.size} videos...`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-sans h-full flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t.replication.title}</h1>
      </div>

      {/* Top Navigation & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 shrink-0">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border",
                activeFilter === filter.id
                  ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white shadow-md"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
              )}
            >
              {filter.icon && <filter.icon size={16} />}
              {filter.label}
            </button>
          ))}
        </div>

        {/* Batch Actions */}
        <button
          onClick={handleBatchDownload}
          disabled={selectedIds.size === 0}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download size={16} />
          {t.replication.batchDownload}
          {selectedIds.size > 0 && <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-xs">{selectedIds.size}</span>}
        </button>
      </div>

      {/* Warning Banner */}
      {showBanner && (
        <div className="mb-8 p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/30 rounded-xl flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-3">
                <AlertTriangle className="text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" size={18} />
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                {t.replication.retentionWarning}
                </p>
            </div>
            <button 
                onClick={() => setShowBanner(false)}
                className="text-yellow-500 hover:text-yellow-700 dark:text-yellow-600 dark:hover:text-yellow-400"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8">
        {filteredHistory.map((item) => (
          <VideoCard
            key={item.id}
            item={item}
            selected={selectedIds.has(item.id)}
            onSelect={handleSelect}
            onClick={() => {
              setSelectedVideo(item);
              setIsModalOpen(true);
            }}
          />
        ))}
      </div>

      {/* Empty State */}
      {filteredHistory.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-20">
          <Clapperboard size={48} className="mb-4 opacity-20" />
          <p>No videos found</p>
        </div>
      )}

      {/* Details Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVideo(null);
        }}
        title={selectedVideo?.product?.name || t.replication.viewDetails}
        maxWidth="max-w-6xl"
      >
        {selectedVideo && (
          <VideoDetailsModal 
            item={selectedVideo} 
            onClose={() => setIsModalOpen(false)} 
          />
        )}
      </Modal>
    </div>
  );
}
