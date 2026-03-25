"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Image as ImageIcon,
  Video,
  ArrowLeft,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenant } from "@/hooks/useTenant";
export type StoryboardPageHeaderTab = "storyboard" | "timeline";

interface StoryboardPageHeaderProps {
  taskId: string;
  taskName: string;
  activeTab: StoryboardPageHeaderTab;

  // Status
  isTerminal: boolean;
  statusLabel?: string;
  progress?: number;

  // Batch actions (storyboard tab only)
  showBatchActions?: boolean;
  allImagesReady?: boolean;
  allVideosReady?: boolean;
  batchImageLoading?: boolean;
  batchVideoLoading?: boolean;
  isImageGenerating?: boolean;
  isVideoGenerating?: boolean;
  onBatchGenerateImages?: () => void;
  onBatchGenerateVideos?: (options?: { allowTextVideo?: boolean }) => void;
  // Extra content rendered before 批量下载 (e.g. timeline action buttons)
  rightExtra?: React.ReactNode;
}

export function StoryboardPageHeader({
  taskId,
  taskName,
  activeTab,
  isTerminal,
  statusLabel,
  progress,
  showBatchActions,
  allImagesReady,
  allVideosReady,
  batchImageLoading,
  batchVideoLoading,
  isImageGenerating,
  isVideoGenerating,
  onBatchGenerateImages,
  onBatchGenerateVideos,
  rightExtra,
}: StoryboardPageHeaderProps) {
  const router = useRouter();
  const { basePath } = useTenant();

  return (
    <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-white/10">
      <div className="flex items-center h-14 px-5 gap-4">

        {/* Left: back + task name + edit + status */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4 text-gray-500 dark:text-white/60" />
          </button>
          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {taskName}
          </span>
          {!isTerminal && statusLabel && (
            <div className="flex items-center gap-1.5 ml-1 flex-shrink-0">
              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
              <span className="text-xs text-gray-400 dark:text-white/40">{statusLabel}</span>
            </div>
          )}
        </div>

        {/* Center: pill tab switcher */}
        <div className="flex-shrink-0 bg-gray-100 dark:bg-white/10 rounded-full p-1 flex items-center gap-1">
          <a
            href={`${basePath}/storyboard/${taskId}`}
            className={cn(
              "px-5 py-1.5 rounded-full text-sm font-medium transition-all",
              activeTab === "storyboard"
                ? "bg-yellow-400 text-gray-900 shadow-sm"
                : "text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/80"
            )}
          >
            分镜板
          </a>
          <a
            href={`${basePath}/storyboard/${taskId}/timeline`}
            className={cn(
              "px-5 py-1.5 rounded-full text-sm font-medium transition-all",
              activeTab === "timeline"
                ? "bg-yellow-400 text-gray-900 shadow-sm"
                : "text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/80"
            )}
          >
            时间轴
          </a>
        </div>

        {/* Right: batch actions + download + collapse */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          {showBatchActions && (
            <div className="flex items-center gap-2">
              <button
                onClick={onBatchGenerateImages}
                disabled={batchImageLoading || isImageGenerating}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                  allImagesReady
                    ? "border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400"
                    : "border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/10",
                  (batchImageLoading || isImageGenerating) && "opacity-50 cursor-not-allowed"
                )}
              >
                {batchImageLoading || isImageGenerating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <ImageIcon className="h-3.5 w-3.5" />}
                {allImagesReady ? "首帧图✓" : "批量生成首帧图"}
              </button>

              <button
                onClick={() => onBatchGenerateVideos?.({ allowTextVideo: !allImagesReady })}
                disabled={batchVideoLoading || isVideoGenerating}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                  allVideosReady
                    ? "border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400"
                    : "border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/10",
                  (batchVideoLoading || isVideoGenerating) && "opacity-50 cursor-not-allowed"
                )}
              >
                {batchVideoLoading || isVideoGenerating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Video className="h-3.5 w-3.5" />}
                {allVideosReady ? "视频✓" : "批量生成视频"}
              </button>
            </div>
          )}

          {rightExtra}

          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors">
            <Download className="h-3.5 w-3.5" />
            批量下载
          </button>

        </div>
      </div>

      {/* Progress bar */}
      {!isTerminal && progress !== undefined && (
        <div className="h-0.5 bg-gray-100 dark:bg-white/5">
          <div
            className="h-full bg-yellow-400 transition-all duration-700"
            style={{ width: `${progress || 5}%` }}
          />
        </div>
      )}
    </div>
  );
}
