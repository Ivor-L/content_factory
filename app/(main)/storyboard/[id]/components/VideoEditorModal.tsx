"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  X, RefreshCw, Plus, Loader2, Sparkles, Trash2, Upload,
} from "lucide-react";
import type { SegmentData, SubjectRef, GenerationParams } from "./SegmentRow";

interface VideoEditorModalProps {
  segment: SegmentData;
  taskId: string;
  videoModel?: string | null;
  onClose: () => void;
  onRegenerate: () => void;
  onSegmentUpdated: (updates: Partial<SegmentData>) => void;
}

export function VideoEditorModal({
  segment,
  taskId,
  videoModel,
  onClose,
  onRegenerate,
  onSegmentUpdated,
}: VideoEditorModalProps) {
  const params = segment.generationParams as GenerationParams | null;

  const [prompt, setPrompt] = useState(segment.videoPrompt || "");
  // video_refs: max 2 items (first frame ref + one extra)
  const [videoRefs, setVideoRefs] = useState<SubjectRef[]>(
    (params as Record<string, unknown> & { video_refs?: SubjectRef[] })?.video_refs || []
  );
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const refUploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPrompt(segment.videoPrompt || "");
    setVideoRefs(
      (params as Record<string, unknown> & { video_refs?: SubjectRef[] })?.video_refs || []
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment.id]);

  async function patchSegment(data: Record<string, unknown>) {
    await fetch(`/api/storyboard/segments/${segment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async function handleSaveAndRegenerate() {
    setRegenerating(true);
    try {
      await patchSegment({ videoPrompt: prompt, video_refs: videoRefs });
      onRegenerate();
      onSegmentUpdated({
        videoPrompt: prompt,
        generationParams: { ...(params || {}), video_refs: videoRefs } as GenerationParams,
      });
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await patchSegment({ videoPrompt: prompt, video_refs: videoRefs });
      onSegmentUpdated({
        videoPrompt: prompt,
        generationParams: { ...(params || {}), video_refs: videoRefs } as GenerationParams,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteVideo() {
    if (!segment.generatedVideo) return;
    const confirmed = window.confirm("确定要删除当前视频吗？删除后需要重新生成或上传。");
    if (!confirmed) return;
    setDeleting(true);
    try {
      await patchSegment({ generatedVideo: null, status: "IMAGE_READY" });
      onSegmentUpdated({ generatedVideo: null, status: "IMAGE_READY" });
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddRefFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoRefs.length >= 2) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload/image", { method: "POST", body: formData });
      const { url } = await res.json();
      if (url) setVideoRefs((prev) => [...prev, { type: "custom", url, label: "参考图" }]);
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function handleRemoveRef(idx: number) {
    setVideoRefs((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex" onClick={onClose}>
      <div className="flex w-full h-full" onClick={(e) => e.stopPropagation()}>

        {/* ─── Left: Reference images strip (max 2) ─── */}
        <div className="w-20 flex-shrink-0 bg-black border-r border-white/10 flex flex-col items-center gap-2 py-4 overflow-y-auto">
          {/* Add button — hidden once 2 refs reached */}
          {videoRefs.length < 2 && (
            <label className={cn(
              "w-14 h-14 rounded-lg border border-dashed border-white/20 flex flex-col items-center justify-center gap-0.5 text-white/30 cursor-pointer hover:border-white/40 transition-colors",
              uploading && "opacity-50 pointer-events-none"
            )}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="text-[9px]">参考图</span>
              <input
                ref={refUploadRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAddRefFile}
              />
            </label>
          )}

          {videoRefs.map((ref, idx) => (
            <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden group/ref border-2 border-transparent hover:border-white/40 transition-colors">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ref.url} alt={ref.label} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/ref:opacity-100 transition-opacity flex items-center justify-center">
                <button onClick={() => handleRemoveRef(idx)} className="p-1 rounded-full bg-red-500/80 hover:bg-red-500">
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5 px-1">
                <p className="text-[9px] text-white/60 text-center truncate">{idx === 0 ? "首帧参考" : "参考图"}</p>
              </div>
            </div>
          ))}

          {/* Slot count hint */}
          <p className="text-[9px] text-white/20 text-center px-1 mt-auto">
            {videoRefs.length}/2
          </p>
        </div>

        {/* ─── Center: Video preview ─── */}
        <div className="flex-1 flex flex-col bg-[#111] relative">
          {/* Top toolbar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            <div className="flex-1" />
            <button
              onClick={handleSaveAndRegenerate}
              disabled={regenerating}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors disabled:opacity-50"
            >
              {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              重新生成
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              保存
            </button>
            {segment.generatedVideo && (
              <button
                onClick={handleDeleteVideo}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-200 text-xs transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                删除视频
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Video area */}
          <div className="flex-1 flex items-center justify-center p-6 bg-black">
            {segment.generatedVideo ? (
              <video
                src={segment.generatedVideo}
                controls
                playsInline
                className="max-h-[calc(100vh-160px)] max-w-full object-contain rounded-xl"
              />
            ) : (
              <div className="flex flex-col items-center gap-4 text-white/30">
                <Sparkles className="h-12 w-12" />
                <p className="text-sm">尚未生成视频</p>
                <button
                  onClick={handleSaveAndRegenerate}
                  disabled={regenerating}
                  className="px-6 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
                >
                  {regenerating ? "生成中…" : "立即生成"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Right: Settings panel ─��─ */}
        <div className="w-80 flex-shrink-0 bg-[#0a0a0a] border-l border-white/10 flex flex-col overflow-y-auto">
          <div className="p-5 flex flex-col gap-5">
            <h2 className="text-lg font-semibold text-white">
              Scene {segment.order}
            </h2>

            {/* Video prompt */}
            <div>
              <p className="text-xs text-white/40 mb-2">视频提示词</p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/80 placeholder-white/20 resize-none focus:outline-none focus:border-white/30 leading-relaxed"
                placeholder="输入视频生成提示词…"
              />
            </div>

            {/* Script reference (read-only) */}
            {(segment.rewrittenScript || segment.originalScript) && (
              <div>
                <p className="text-xs text-white/40 mb-2">口播文案（参考）</p>
                <p className="text-xs text-white/50 leading-relaxed">
                  {segment.rewrittenScript || segment.originalScript}
                </p>
              </div>
            )}

            {/* Camera / lighting notes */}
            {segment.cameraNotes && (
              <div>
                <p className="text-xs text-white/40 mb-2">镜头说明（参考）</p>
                <p className="text-xs text-white/50 leading-relaxed">{segment.cameraNotes}</p>
              </div>
            )}

            {/* Generate button */}
            <div className="mt-auto pt-4 border-t border-white/10">
              <button
                onClick={handleSaveAndRegenerate}
                disabled={regenerating}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
              >
                {regenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {regenerating ? "生成中…" : "重新生成"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
