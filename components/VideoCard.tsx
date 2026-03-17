'use client';

/* eslint-disable @next/next/no-img-element -- Video card backgrounds leverage remote thumbnails */

import { useState, useRef, useEffect, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { Clock, ArrowRight, Play, Check, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface VideoCardProps {
  item: any; // Using any for now to be flexible with Prisma result
  onSelect?: (id: string) => void;
  selected?: boolean;
  onClick: () => void;
  onDelete?: (id: string) => void;
}

export function VideoCard({ item, onSelect, selected, onClick, onDelete }: VideoCardProps) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const resultData = useMemo(() => {
    if (!item) return null;
    if (!item.result) return null;
    if (typeof item.result === 'string') {
      try {
        return JSON.parse(item.result || '{}');
      } catch (error) {
        console.warn('Failed to parse replication result JSON', error);
        return null;
      }
    }
    if (typeof item.result === 'object') {
      return item.result;
    }
    return null;
  }, [item]);
  
  const promptPayload = useMemo(() => {
    const raw = resultData?.finalResult ?? resultData?.result ?? null;
    if (!raw) return null;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (error) {
        console.warn('Failed to parse prompt payload JSON', error);
        return { generatedScript: raw };
      }
    }
    return raw;
  }, [resultData]);

  const status = (item.status || '').toLowerCase();
  const isCompleted = status === 'completed' || status === 'success';
  const isFailed = status === 'failed' || status === 'error';
  const isProcessing = !isCompleted && !isFailed;
  const stage = (resultData?.lastStage || resultData?.stage || '').toString().toLowerCase();
  const stageStatus = (resultData?.status || '').toString().toLowerCase();
  const hasPromptDetails = Boolean(
    promptPayload &&
      (promptPayload.generatedScript ||
        promptPayload.videoPrompt ||
        promptPayload.shots_count)
  );
  const promptReady =
    hasPromptDetails ||
    (!!stage && stage.includes('prompt')) ||
    (!!stageStatus && stageStatus.includes('prompt'));
  
  // Mock progress for now if processing
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    if (isProcessing) {
      const calculateProgress = () => {
        const created = new Date(item.createdAt).getTime();
        const now = Date.now();
        const elapsedSeconds = (now - created) / 1000;
        
        // Determine estimated duration based on type
        // Digital Human tasks take longer (10-20 mins)
        // Others are faster (usually < 5 mins)
        let durationSeconds = 300; // Default 5 mins
        
        if (item.type === 'LIP_SYNC' || item.type === 'VOICE_CLONE') {
            durationSeconds = 1200; // 20 mins for digital human
        } else if (item.type === 'FULL' || item.type === 'CHARACTER') {
            durationSeconds = 600; // 10 mins for full/character
        }
        
        // Calculate percentage, max 95% until actually completed
        let p = Math.min(Math.floor((elapsedSeconds / durationSeconds) * 95), 95);
        if (promptReady) {
          p = Math.max(p, 70);
        }
        setProgress(Math.max(0, p));
      };

      calculateProgress(); // Initial calculation
      const interval = setInterval(calculateProgress, 1000); // Update every second
      return () => clearInterval(interval);
    } else if (isCompleted) {
        setProgress(100);
    } else if (isFailed) {
        setProgress(0);
    }
  }, [isProcessing, isCompleted, isFailed, item.createdAt, item.type, promptReady]);

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
    // Format: MM/DD HH:MM
    return date.toLocaleString(undefined, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
  };

  const getFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div 
      className={cn(
        "group relative bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all border border-gray-100 dark:border-gray-700 cursor-pointer flex flex-col h-[400px]",
        selected ? "ring-2 ring-black dark:ring-white" : ""
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
            : "bg-white text-black border border-gray-200 dark:bg-gray-900 dark:text-white dark:border-gray-700"
        )}>
          {isCompleted ? t.replication.completed : t.replication.processing}
        </span>
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/90 dark:bg-black/80 backdrop-blur text-gray-800 dark:text-gray-200 shadow-sm border border-gray-100 dark:border-gray-700">
          {item.type === 'FULL' ? t.replication.viralClone : 
           item.type === 'CHARACTER' ? t.replication.character : 
           item.type === 'LIP_SYNC' ? t.storyboard.lipSync :
           item.type === 'VOICE_CLONE' ? t.storyboard.voiceClone :
           t.replication.motionSwap}
        </span>
        {promptReady && !isCompleted && (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200 shadow-sm">
            {t.replication.promptReady}
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 relative bg-white dark:bg-black flex items-center justify-center overflow-hidden">
        {/* Background Image (Always visible if available, dimmed when processing) */}
        {item.imageUrl && (
            <img 
                src={item.imageUrl} 
                alt="Background" 
                className={cn(
                    "absolute inset-0 w-full h-full object-cover transition-opacity",
                    isCompleted ? "opacity-100" : "opacity-20 grayscale"
                )}
            />
        )}

        {!isCompleted && (
          <div className="absolute inset-0 z-0 bg-gradient-to-b from-white via-gray-100 to-white dark:from-black dark:via-gray-900 dark:to-black opacity-90 pointer-events-none" />
        )}

        {isCompleted ? (
          <>
            {resultData?.videoUrl ? (
              <video
                ref={videoRef}
                src={resultData.videoUrl}
                className="w-full h-full object-cover relative z-10"
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : !item.imageUrl ? (
              <div className="text-gray-400 flex flex-col items-center relative z-10">
                <Play size={32} className="mb-2 opacity-50" />
                <span className="text-xs">No Preview</span>
              </div>
            ) : null}
            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none z-20" />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full relative z-10">
            <div className="relative w-24 h-24 flex items-center justify-center text-black dark:text-white">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="6"
                  fill="transparent"
                  className="text-gray-200 dark:text-gray-700 opacity-70"
                />
                <motion.circle
                  cx="48"
                  cy="48"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={251.2}
                  strokeDashoffset={251.2 - (251.2 * progress) / 100}
                  className="text-black dark:text-white"
                  initial={{ strokeDashoffset: 251.2 }}
                  animate={{ strokeDashoffset: 251.2 - (251.2 * progress) / 100 }}
                  transition={{ duration: 0.5 }}
                />
              </svg>
              <span className="absolute text-xl font-bold text-gray-900 dark:text-white">
                {progress}%
              </span>
            </div>
            <p className="mt-4 text-xs uppercase tracking-wide text-gray-600 dark:text-gray-300">
              {t.replication.generating}
            </p>
            {promptReady && (
              <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-300">
                {t.replication.promptReady}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 h-16 flex items-center justify-between shrink-0">
        <div 
        suppressHydrationWarning
        className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden group/date relative cursor-default"
        title={getFullDate(item.createdAt)}
      >
          <Clock size={14} className="shrink-0" />
          <span suppressHydrationWarning className="truncate">{formatDate(item.createdAt)}</span>
          
          {/* Tooltip for full date */}
          <div suppressHydrationWarning className="absolute bottom-full left-0 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover/date:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
            {getFullDate(item.createdAt)}
          </div>
        </div>
        <button 
          className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shrink-0 ml-2"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          {promptReady && !isCompleted ? t.replication.viewPrompt : t.replication.viewDetails} <ArrowRight size={12} />
        </button>
      </div>

      {/* Selection Checkbox (Visible on hover or selected) */}
      {(onSelect || onDelete) && (
        <div 
          className={cn(
            "absolute top-3 right-3 z-30 flex flex-col gap-2 transition-opacity",
            !onDelete && !selected ? "opacity-0 group-hover:opacity-100" : "opacity-100"
          )}
        >
          {onSelect && (
            <button
              className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                selected 
                  ? "bg-black border-black text-white dark:bg-white dark:border-white dark:text-black" 
                  : "bg-white/80 border-gray-300 hover:border-black dark:hover:border-white"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item.id);
              }}
              title="Select item"
            >
              {selected && <Check size={14} strokeWidth={3} />}
            </button>
          )}
          {onDelete && (
            <button
              className="w-6 h-6 rounded-full border-2 border-transparent bg-white/80 text-red-500 hover:text-red-600 hover:border-red-500 dark:bg-gray-900/80 dark:text-red-300 dark:hover:text-red-200 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              title="Delete"
            >
              <Trash2 size={13} strokeWidth={2.5} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
