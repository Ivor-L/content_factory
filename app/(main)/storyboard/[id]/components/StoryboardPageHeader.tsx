"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Image as ImageIcon,
  Video,
  ArrowLeft,
  Download,
  ChevronDown,
  Scissors,
  Check,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const DEFAULT_VOICES = [
  { label: "粤语-女生", id: "Cantonese_crisp_reporter_vv2" },
  { label: "粤语-女生2", id: "Cantonese_professional_reporter_vv2" },
  { label: "粤语-男生", id: "Cantonese_Articulate_commentator_vv2" },
  { label: "粤语-男生2", id: "Cantonese_energetic_commentator_vv2" },
  { label: "普通话-男", id: "moss_audio_ce44fc67-7ce3-11f0-8de5-96e35d26fb85" },
  { label: "Knowledge Pill", id: "moss_audio_737a299c-734a-11f0-918f-4e0486034804" },
  { label: "Engaging Girl", id: "moss_audio_c12a59b9-7115-11f0-a447-9613c873494c" },
  { label: "值得信赖的男声", id: "English_Trustworth_Man" },
  { label: "English_Explanatory_Man", id: "English_Explanatory_Man" },
] as const;

interface StoryboardPageHeaderProps {
  taskId: string;
  taskName: string;

  // Status
  isTerminal: boolean;
  statusLabel?: string;
  progress?: number;

  // Batch actions
  showBatchActions?: boolean;
  allImagesReady?: boolean;
  allVideosReady?: boolean;
  batchImageLoading?: boolean;
  batchVideoLoading?: boolean;
  isImageGenerating?: boolean;
  isVideoGenerating?: boolean;
  onBatchGenerateImages?: () => void;
  onBatchGenerateVideos?: (options?: { allowTextVideo?: boolean; model?: string }) => void;
  videoModel?: string;
  onVideoModelChange?: (model: string) => void;
  imageModel?: string;
  onImageModelChange?: (model: string) => void;

  // 一键剪辑
  hasVideos?: boolean;
  editStatus?: "idle" | "pending" | "done" | "error";
  onStartEdit?: (voiceId: string) => void;

  rightExtra?: React.ReactNode;
}

export function StoryboardPageHeader({
  taskId: _taskId,
  taskName,
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
  videoModel = "veo3.1-fast",
  onVideoModelChange,
  imageModel = "nano-banana-pro",
  onImageModelChange,
  hasVideos,
  editStatus = "idle",
  onStartEdit,
  rightExtra,
}: StoryboardPageHeaderProps) {
  const router = useRouter();
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showImageModelDropdown, setShowImageModelDropdown] = useState(false);
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState("English_Trustworth_Man");
  const [customVoiceId, setCustomVoiceId] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<"image" | "video" | null>(null);

  const videoModels = [
    { value: "veo3.1-fast", label: "Veo 3.1 Fast" },
    { value: "grok-video-3", label: "Grok 3" },
  ];

  const imageModels = [
    { value: "nano-banana-2", label: "Nano Banana2" },
    { value: "nano-banana-pro", label: "Banana Pro" },
    { value: "seedream-4.5", label: "Seedream 4.5" },
  ];

  const effectiveVoiceId = showCustomInput && customVoiceId.trim()
    ? customVoiceId.trim()
    : selectedVoiceId;

  const selectedVoiceLabel = DEFAULT_VOICES.find(v => v.id === effectiveVoiceId)?.label
    || (effectiveVoiceId ? effectiveVoiceId.slice(0, 12) : DEFAULT_VOICES[0].label);

  const closeAllDropdowns = () => {
    setShowModelDropdown(false);
    setShowImageModelDropdown(false);
    setShowVoiceDropdown(false);
  };

  return (
    <div className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-white/10">
      <div className="flex items-center h-14 px-5 gap-4">

        {/* Left: back + task name + status */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0 max-w-[280px]">
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

        {/* Right: batch actions + download + 一键剪辑 */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          {showBatchActions && (
            <>
              {/* Image model selector */}
              <div className="relative">
                <button
                  onClick={() => { setShowImageModelDropdown(!showImageModelDropdown); setShowModelDropdown(false); setShowVoiceDropdown(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors whitespace-nowrap"
                >
                  {imageModels.find(m => m.value === imageModel)?.label || imageModel}
                  <ChevronDown className="h-3 w-3 flex-shrink-0" />
                </button>
                {showImageModelDropdown && (
                  <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-lg shadow-lg z-50 min-w-[140px]">
                    {imageModels.map(model => (
                      <button
                        key={model.value}
                        onClick={() => { onImageModelChange?.(model.value); setShowImageModelDropdown(false); }}
                        className={cn(
                          "block w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-white/10 whitespace-nowrap",
                          imageModel === model.value && "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                        )}
                      >
                        {model.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Video model selector */}
              <div className="relative">
                <button
                  onClick={() => { setShowModelDropdown(!showModelDropdown); setShowImageModelDropdown(false); setShowVoiceDropdown(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors whitespace-nowrap"
                >
                  {videoModels.find(m => m.value === videoModel)?.label || videoModel}
                  <ChevronDown className="h-3 w-3 flex-shrink-0" />
                </button>
                {showModelDropdown && (
                  <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-lg shadow-lg z-50 min-w-[140px]">
                    {videoModels.map(model => (
                      <button
                        key={model.value}
                        onClick={() => { onVideoModelChange?.(model.value); setShowModelDropdown(false); }}
                        className={cn(
                          "block w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-white/10 whitespace-nowrap",
                          videoModel === model.value && "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                        )}
                      >
                        {model.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setConfirmTarget("image")}
                disabled={batchImageLoading || isImageGenerating}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap",
                  allImagesReady
                    ? "border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400"
                    : "border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/10",
                  (batchImageLoading || isImageGenerating) && "opacity-50 cursor-not-allowed"
                )}
              >
                {batchImageLoading || isImageGenerating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                  : <ImageIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                {allImagesReady ? "首帧图✓" : "批量生成首帧图"}
              </button>

              <button
                onClick={() => setConfirmTarget("video")}
                disabled={batchVideoLoading || isVideoGenerating}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap",
                  allVideosReady
                    ? "border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400"
                    : "border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/10",
                  (batchVideoLoading || isVideoGenerating) && "opacity-50 cursor-not-allowed"
                )}
              >
                {batchVideoLoading || isVideoGenerating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                  : <Video className="h-3.5 w-3.5 flex-shrink-0" />}
                {allVideosReady ? "视频✓" : "批量生成视频"}
              </button>
            </>
          )}

          {rightExtra}

          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors whitespace-nowrap">
            <Download className="h-3.5 w-3.5 flex-shrink-0" />
            批量下载
          </button>

          {/* 音色选择 + 一键剪辑 */}
          {hasVideos && (
            <>
              {/* Voice selector */}
              <div className="relative">
                <button
                  onClick={() => { setShowModelDropdown(false); setShowImageModelDropdown(false); setShowVoiceDropdown(v => !v); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors whitespace-nowrap"
                >
                  <span className="max-w-[80px] truncate">{selectedVoiceLabel}</span>
                  <ChevronDown className="h-3 w-3 flex-shrink-0" />
                </button>
                {showVoiceDropdown && (
                  <div className="absolute top-full right-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-white/10">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">选择音色</span>
                      <button onClick={() => setShowVoiceDropdown(false)} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-white/10">
                        <X className="h-3.5 w-3.5 text-gray-400" />
                      </button>
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                      {DEFAULT_VOICES.map((voice) => {
                        const isActive = !showCustomInput && selectedVoiceId === voice.id;
                        return (
                          <button
                            key={voice.id}
                            onClick={() => { setSelectedVoiceId(voice.id); setShowCustomInput(false); setShowVoiceDropdown(false); }}
                            className={cn(
                              "w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-gray-50 dark:hover:bg-white/5",
                              isActive && "bg-yellow-50 dark:bg-yellow-500/10"
                            )}
                          >
                            <div className="min-w-0">
                              <p className={cn("font-medium", isActive ? "text-yellow-700 dark:text-yellow-400" : "text-gray-700 dark:text-gray-200")}>
                                {voice.label}
                              </p>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{voice.id}</p>
                            </div>
                            {isActive && <Check className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="border-t border-gray-100 dark:border-white/10 px-3 py-2">
                      {showCustomInput ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={customVoiceId}
                            onChange={(e) => setCustomVoiceId(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && customVoiceId.trim()) setShowVoiceDropdown(false); }}
                            placeholder="输入声音 ID"
                            className="flex-1 text-xs rounded-lg border border-gray-200 dark:border-white/20 bg-white dark:bg-white/5 px-2.5 py-1.5 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                            autoFocus
                          />
                          <button
                            onClick={() => { setShowCustomInput(false); setCustomVoiceId(""); }}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10"
                          >
                            <X className="h-3.5 w-3.5 text-gray-400" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowCustomInput(true)}
                          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          添加自定义音色 ID
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 一键剪辑 — black solid */}
              {editStatus === "pending" ? (
                <button
                  disabled
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-400 dark:bg-white/20 text-white cursor-not-allowed whitespace-nowrap"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                  剪辑中…
                </button>
              ) : editStatus === "done" ? (
                <button
                  onClick={() => onStartEdit?.(effectiveVoiceId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-400 text-white transition-colors whitespace-nowrap"
                >
                  <Check className="h-3.5 w-3.5 flex-shrink-0" />
                  重新剪辑
                </button>
              ) : (
                <button
                  onClick={() => onStartEdit?.(effectiveVoiceId)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap",
                    editStatus === "error"
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-gray-900 hover:bg-gray-700 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900"
                  )}
                >
                  <Scissors className="h-3.5 w-3.5 flex-shrink-0" />
                  {editStatus === "error" ? "重试剪辑" : "一键剪辑"}
                </button>
              )}
            </>
          )}
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

      {/* Batch confirm dialog */}
      {confirmTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={() => setConfirmTarget(null)}>
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-80 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-yellow-50 dark:bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                {confirmTarget === "image"
                  ? <ImageIcon className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  : <Video className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {confirmTarget === "image" ? "批量生成首帧图" : "批量生成视频"}
                </p>
                <p className="text-xs text-gray-500 dark:text-white/50 mt-1 leading-relaxed">
                  {confirmTarget === "image"
                    ? "将为所有分镜批量生成首帧图，已生成的分镜将被跳过，是否继续？"
                    : "将为所有分镜批量生成视频，已生成的分镜将被跳过，是否继续？"}
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmTarget(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (confirmTarget === "image") {
                    onBatchGenerateImages?.();
                  } else {
                    onBatchGenerateVideos?.({ allowTextVideo: !allImagesReady, model: videoModel });
                  }
                  setConfirmTarget(null);
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
              >
                确认生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
