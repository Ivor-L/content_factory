'use client';

import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { Clock, ArrowRight, Play, Check } from 'lucide-react';
import { motion } from 'framer-motion';

interface VideoCardProps {
  item: any; // Using any for now to be flexible with Prisma result
  onSelect?: (id: string) => void;
  selected?: boolean;
  onClick: () => void;
}

export function VideoCard({ item, onSelect, selected, onClick }: VideoCardProps) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Parse result if it's a string
  const resultData = typeof item.result === 'string' ? JSON.parse(item.result || '{}') : item.result;
  const status = item.status?.toLowerCase() || 'pending';
  const isCompleted = status === 'completed' || status === 'success';
  const isProcessing = status === 'processing' || status === 'pending';
  
  // Mock progress for now if processing
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    if (isProcessing) {
      // Simulate progress
      const interval = setInterval(() => {
        setProgress(p => (p < 90 ? p + 1 : p));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isProcessing]);

  const handleMouseEnter = () => {
    if (isCompleted && videoRef.current) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleMouseLeave = () => {
    if (isCompleted && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    // Simple format: Yesterday · 02:46 PM or Date
    return date.toLocaleString();
  };

  return (
    <div 
      className={cn(
        "group relative bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-700 cursor-pointer flex flex-col h-[400px]",
        selected ? "ring-2 ring-brand-yellow" : ""
      )}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Top Badges */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 items-start">
        <span className={cn(
          "px-3 py-1 rounded-full text-xs font-bold shadow-sm",
          isCompleted 
            ? "bg-black text-white dark:bg-white dark:text-black" 
            : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
        )}>
          {isCompleted ? t.replication.completed : t.replication.processing}
        </span>
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/90 dark:bg-black/80 backdrop-blur text-gray-800 dark:text-gray-200 shadow-sm border border-gray-100 dark:border-gray-700">
          {item.type === 'FULL' ? t.replication.viralClone : 
           item.type === 'CHARACTER' ? t.replication.character : 
           t.replication.motionSwap}
        </span>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative bg-gray-50 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
        {isCompleted ? (
          <>
            {resultData?.videoUrl ? (
              <video
                ref={videoRef}
                src={resultData.videoUrl}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : (
              <div className="text-gray-400 flex flex-col items-center">
                <Play size={32} className="mb-2 opacity-50" />
                <span className="text-xs">No Preview</span>
              </div>
            )}
            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-gray-200 dark:text-gray-700"
                />
                <motion.circle
                  cx="48"
                  cy="48"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={251.2}
                  strokeDashoffset={251.2 - (251.2 * progress) / 100}
                  className="text-black dark:text-brand-yellow"
                  initial={{ strokeDashoffset: 251.2 }}
                  animate={{ strokeDashoffset: 251.2 - (251.2 * progress) / 100 }}
                  transition={{ duration: 0.5 }}
                />
              </svg>
              <span className="absolute text-xl font-bold text-gray-900 dark:text-white">
                {progress}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 h-16 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Clock size={14} />
          <span>{formatDate(item.createdAt)}</span>
        </div>
        <button 
          className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {t.replication.viewDetails} <ArrowRight size={12} />
        </button>
      </div>

      {/* Selection Checkbox (Visible on hover or selected) */}
      {onSelect && (
        <div 
          className={cn(
            "absolute top-3 right-3 z-30 transition-opacity",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(item.id);
          }}
        >
          <div className={cn(
            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
            selected 
              ? "bg-brand-yellow border-brand-yellow text-black" 
              : "bg-white/80 border-gray-300 hover:border-brand-yellow"
          )}>
            {selected && <Check size={14} strokeWidth={3} />}
          </div>
        </div>
      )}
    </div>
  );
}
