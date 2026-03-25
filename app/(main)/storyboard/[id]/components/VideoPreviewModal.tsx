"use client";

import { useState } from "react";
import { X, RefreshCw, Trash2, Loader2 } from "lucide-react";
import type { SegmentData } from "./SegmentRow";
import { cn } from "@/lib/utils";

interface VideoPreviewModalProps {
  segment: SegmentData;
  onClose: () => void;
  onRegenerate?: () => void;
  onSegmentUpdated?: (updates: Partial<SegmentData>) => void;
}

export function VideoPreviewModal({ segment, onClose, onRegenerate, onSegmentUpdated }: VideoPreviewModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function handleDeleteVideo() {
    if (!segment.generatedVideo) return;
    const confirmed = window.confirm("确定要删除当前视频吗？删除后需要重新生成或上传。");
    if (!confirmed) return;

    setDeleting(true);
    try {
      await fetch(`/api/storyboard/segments/${segment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generatedVideo: null, status: "IMAGE_READY" }),
      });
      onSegmentUpdated?.({ generatedVideo: null, status: "IMAGE_READY" });
      onClose();
    } catch (error) {
      console.error("Failed to delete video", error);
    } finally {
      setDeleting(false);
    }
  }

  async function handleRegenerate() {
    if (!onRegenerate) return;
    setRegenerating(true);
    try {
      await Promise.resolve(onRegenerate());
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 px-4 py-8 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-full max-w-5xl bg-[#050505] text-white rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">视频详情</p>
            <p className="text-sm text-white/80 mt-1">分镜 #{segment.order}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-black flex items-center justify-center min-h-[320px]">
            {segment.generatedVideo ? (
              <video
                src={segment.generatedVideo}
                controls
                playsInline
                className="w-full h-full max-h-[70vh] object-contain"
              />
            ) : (
              <div className="text-center text-white/60 text-sm">暂无视频</div>
            )}
          </div>

          <div className="border-t lg:border-t-0 lg:border-l border-white/10 p-6 space-y-5 bg-[#0f0f0f]">
            <div>
              <p className="text-xs text-white/40 mb-1">视频提示词</p>
              <p className="text-sm text-white/80 whitespace-pre-line min-h-[64px]">
                {segment.videoPrompt || "暂无视频提示词"}
              </p>
            </div>

            <div>
              <p className="text-xs text-white/40 mb-1">口播文案</p>
              <p className="text-sm text-white/70 whitespace-pre-line min-h-[64px]">
                {segment.rewrittenScript || segment.originalScript || "暂无口播文案"}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleRegenerate}
                disabled={!onRegenerate || regenerating}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm transition-colors",
                  (!onRegenerate || regenerating) && "opacity-60 cursor-not-allowed"
                )}
              >
                {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                重新生成
              </button>

              <button
                onClick={handleDeleteVideo}
                disabled={deleting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-sm text-red-200 border border-red-500/40 transition-colors"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                删除视频
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
