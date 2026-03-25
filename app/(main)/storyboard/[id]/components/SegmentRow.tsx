"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, Play, Upload, Sparkles, Plus, X } from "lucide-react";
import { ImageEditorModal } from "./ImageEditorModal";
import { VideoPreviewModal } from "./VideoPreviewModal";
import { toast } from "react-hot-toast";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SubjectRef {
  type: "character" | "product" | "reference_frame" | "custom";
  url: string;
  label: string;
}

export interface GenerationParams {
  reference_frame_url?: string | null;
  has_person?: boolean;
  has_product?: boolean;
  subject_refs?: SubjectRef[];
  image_history?: string[];
}

export interface SegmentData {
  id: string;
  order: number;
  duration: number;
  timeRange?: string | null;
  imagePrompt?: string | null;
  videoPrompt?: string | null;
  generatedImage?: string | null;
  generatedVideo?: string | null;
  status: string;
  originalScript?: string | null;
  rewrittenScript?: string | null;
  visualDescription?: string | null;
  cameraNotes?: string | null;
  lightingNotes?: string | null;
  imageGenerationModel?: string | null;
  videoGenerationModel?: string | null;
  retryCount: number;
  generationParams?: GenerationParams | null;
}

interface SegmentRowProps {
  segment: SegmentData;
  taskId: string;
  imageModel?: string | null;
  videoModel?: string | null;
  productImages?: string[];
  characterAvatar?: string | null;
  onRegenImage?: (segmentId: string) => void;
  onRegenVideo?: (segmentId: string, options?: { allowTextVideo?: boolean }) => void;
  onSegmentUpdated?: (segmentId: string, updates: Partial<SegmentData>) => void;
  isRegenImageLoading?: boolean;
  isRegenVideoLoading?: boolean;
}

// ── Row height: video/image columns are 260px wide → 260×9/16 ≈ 146px ────
const ROW_H = "h-[191px]";

// ── Inline editable text cell (auto-save on blur) ──────────────────────────
function EditableCell({
  value,
  placeholder,
  onSave,
}: {
  value: string;
  placeholder?: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing) textareaRef.current?.focus(); }, [editing]);

  const handleBlur = async () => {
    setEditing(false);
    if (draft === value) return;
    setSaving(true);
    try {
      await onSave(draft);
    } catch {
      toast.error("保存失败");
      setDraft(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {saving && <Loader2 className="absolute top-1 right-1 h-3 w-3 text-blue-400 animate-spin z-10" />}
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => { if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
          className="flex-1 w-full resize-none rounded-lg border border-blue-400/60 bg-blue-50/40 dark:bg-blue-500/10 px-2 py-1.5 text-xs text-gray-800 dark:text-white/90 focus:outline-none focus:border-blue-500 dark:border-blue-400/50"
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="flex-1 overflow-y-auto cursor-text rounded-lg px-2 py-1 -mx-2 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
        >
          {draft ? (
            <p className="text-xs text-gray-800 dark:text-white/80 leading-relaxed whitespace-pre-wrap">{draft}</p>
          ) : (
            <p className="text-xs text-gray-300 dark:text-white/20 italic">{placeholder || "点击编辑…"}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Subject refs modal ─────────────────────────────────────────────────────
function SubjectRefsModal({
  refs,
  onClose,
  onSave,
}: {
  refs: SubjectRef[];
  onClose: () => void;
  onSave: (newRefs: SubjectRef[]) => Promise<void>;
}) {
  const [list, setList] = useState<SubjectRef[]>(refs);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleRemove = (idx: number) => setList((prev) => prev.filter((_, i) => i !== idx));

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload/image", { method: "POST", body: formData });
      const { url } = await res.json();
      if (url) setList((prev) => [...prev, { type: "custom", url, label: "自定义" }]);
    } catch {
      toast.error("上传失败");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(list);
      onClose();
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md mx-4 rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/10">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">主体参考图</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <X className="h-4 w-4 text-gray-500 dark:text-white/50" />
          </button>
        </div>

        {/* Grid */}
        <div className="p-5">
          {list.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-white/30 text-center py-4">暂无参考图，点击下方添加</p>
          )}
          <div className="grid grid-cols-3 gap-3">
            {list.map((ref, idx) => (
              <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ref.url} alt={ref.label} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                <button
                  onClick={() => handleRemove(idx)}
                  className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-red-500 p-1 hover:bg-red-600"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                  <p className="text-[10px] text-white/80 truncate">{ref.label}</p>
                </div>
              </div>
            ))}

            {/* Add button */}
            <label className={cn(
              "aspect-square rounded-xl border-2 border-dashed border-gray-300 dark:border-white/20 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-gray-400 dark:hover:border-white/40 transition-colors",
              uploading && "opacity-60 pointer-events-none"
            )}>
              {uploading ? (
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              ) : (
                <>
                  <Plus className="h-5 w-5 text-gray-400 dark:text-white/30" />
                  <span className="text-[10px] text-gray-400 dark:text-white/30">添加图片</span>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100 dark:border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-gray-200 dark:border-white/20 text-sm text-gray-600 dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-full bg-gray-900 dark:bg-white text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Main SegmentRow ────────────────────────────────────────────────────────
export function SegmentRow({
  segment,
  taskId,
  imageModel,
  videoModel,
  productImages = [],
  characterAvatar,
  onRegenImage,
  onRegenVideo,
  onSegmentUpdated,
  isRegenImageLoading,
  isRegenVideoLoading,
}: SegmentRowProps) {
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [isImageDragging, setIsImageDragging] = useState(false);
  const [isVideoDragging, setIsVideoDragging] = useState(false);
  const [imageCanceling, setImageCanceling] = useState(false);
  const [videoCanceling, setVideoCanceling] = useState(false);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const videoUploadRef = useRef<HTMLInputElement>(null);

  const params = segment.generationParams as GenerationParams | null;

  // Effective refs: stored first, fall back to task-level product/character
  const storedRefs: SubjectRef[] = params?.subject_refs || [];
  const subjectRefs: SubjectRef[] = storedRefs.length > 0
    ? storedRefs
    : (() => {
        const fb: SubjectRef[] = [];
        if (characterAvatar) fb.push({ type: "character", url: characterAvatar, label: "模特图" });
        if (productImages[0]) fb.push({ type: "product", url: productImages[0], label: "产品图" });
        if (params?.reference_frame_url) fb.push({ type: "reference_frame", url: params.reference_frame_url, label: "参考帧" });
        return fb;
      })();

  const isImageGenerating = segment.status === "IMAGE_GENERATING" || isRegenImageLoading;
  const isVideoGenerating = segment.status === "VIDEO_GENERATING" || isRegenVideoLoading;
  const hasImage = !!segment.generatedImage;
  const hasVideo = !!segment.generatedVideo;
  const videoAiDisabled = isRegenVideoLoading;

  const handleVideoAiGenerate = () => {
    if (!onRegenVideo) return;
    onRegenVideo(segment.id, { allowTextVideo: !hasImage });
  };

  const handleCancelImageGeneration = async () => {
    if (!isImageGenerating || imageCanceling) return;
    setImageCanceling(true);
    try {
      const nextStatus = hasImage ? "IMAGE_READY" : "IMAGE_PENDING";
      await patchSegment({ status: nextStatus });
      onSegmentUpdated?.(segment.id, { status: nextStatus });
      toast.success("已取消首帧图生成");
    } catch (err) {
      console.error("cancel image generation failed", err);
      toast.error("取消生图失败，请重试");
    } finally {
      setImageCanceling(false);
    }
  };

  const handleCancelVideoGeneration = async () => {
    if (!isVideoGenerating || videoCanceling) return;
    setVideoCanceling(true);
    try {
      const nextStatus = hasVideo ? "VIDEO_READY" : hasImage ? "IMAGE_READY" : "PENDING";
      await patchSegment({ status: nextStatus });
      onSegmentUpdated?.(segment.id, { status: nextStatus });
      toast.success("已取消视频生成");
    } catch (err) {
      console.error("cancel video generation failed", err);
      toast.error("取消视频生成失败，请重试");
    } finally {
      setVideoCanceling(false);
    }
  };

  useEffect(() => { if (!hasVideo) setVideoModalOpen(false); }, [hasVideo]);

  return (
    <>
      {/* Fixed-height row: 146px = 260px wide × 9/16 */}
      <div className={cn(
        "grid grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)_120px_340px_340px] gap-0 border-b border-gray-200 dark:border-white/10",
        ROW_H
      )}>

        {/* ── Col 1: 口播文案 ── */}
        <div className="p-3 flex flex-col overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1 shrink-0">
            <span className="text-[10px] font-mono text-gray-400 dark:text-white/40">#{segment.order}</span>
            {segment.timeRange && (
              <span className="text-[10px] font-mono bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded text-gray-400 dark:text-white/40">
                {segment.timeRange}
              </span>
            )}
            <span className="text-[10px] bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded text-gray-400 dark:text-white/40">
              {segment.duration}s
            </span>
          </div>
          <EditableCell
            value={segment.rewrittenScript || segment.originalScript || ""}
            placeholder="点击填写…"
            onSave={async (v) => { await patchSegment({ rewrittenScript: v }); onSegmentUpdated?.(segment.id, { rewrittenScript: v }); }}
          />
        </div>

        {/* ── Col 2: 图片提示词 ── */}
        <div className="p-3 border-l border-gray-200 dark:border-white/10 flex flex-col overflow-hidden">
          <EditableCell
            value={segment.imagePrompt || ""}
            placeholder="点击填写…"
            onSave={async (v) => { await patchSegment({ imagePrompt: v }); onSegmentUpdated?.(segment.id, { imagePrompt: v }); }}
          />
        </div>

        {/* ── Col 3: 视频提示词 ── */}
        <div className="p-3 border-l border-gray-200 dark:border-white/10 flex flex-col overflow-hidden">
          <EditableCell
            value={segment.videoPrompt || ""}
            placeholder="点击填写…"
            onSave={async (v) => { await patchSegment({ videoPrompt: v }); onSegmentUpdated?.(segment.id, { videoPrompt: v }); }}
          />
        </div>

        {/* ── Col 4: 主体参考 — click to open modal ── */}
        <div
          className="p-2 border-l border-gray-200 dark:border-white/10 flex flex-col gap-1 cursor-pointer group hover:bg-gray-50 dark:hover:bg-white/5 transition-colors overflow-hidden"
          onClick={() => setSubjectModalOpen(true)}
        >
          {subjectRefs.length > 0 ? (
            <div className="flex flex-wrap gap-1 content-start">
              {subjectRefs.slice(0, 4).map((ref, idx) => (
                <div key={idx} className="relative w-[46px] h-[46px] rounded overflow-hidden bg-gray-100 dark:bg-white/5 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ref.url} alt={ref.label} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-1 opacity-40 group-hover:opacity-70 transition-opacity">
              <Plus className="h-4 w-4 text-gray-400 dark:text-white/40" />
              <span className="text-[10px] text-gray-400 dark:text-white/40">添加</span>
            </div>
          )}
        </div>

        {/* ── Col 5: 首帧图 ── */}
        <div className="border-l border-gray-200 dark:border-white/10 relative group overflow-hidden bg-gray-100 dark:bg-[#111213]">
          {hasImage ? (
            <div className="w-full h-full absolute inset-0 cursor-pointer" onClick={() => setImageEditorOpen(true)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={segment.generatedImage!} alt={`分镜 ${segment.order}`} className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="text-white text-xs font-medium">查看/编辑</span>
              </div>
              <div className="absolute inset-x-0 bottom-0 pb-2 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); onRegenImage?.(segment.id); }}
                  disabled={isRegenImageLoading}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/30 backdrop-blur-sm text-white text-xs transition-colors"
                >
                  <RefreshCw className={cn("h-3 w-3", isRegenImageLoading && "animate-spin")} />重做
                </button>
              </div>
              {isImageGenerating && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                  <div className="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCancelImageGeneration(); }}
                      disabled={imageCanceling}
                      className={cn(
                        "px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-medium border border-white/30 hover:bg-white/20 transition-colors",
                        imageCanceling && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {imageCanceling ? "取消中…" : "取消生成"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full absolute inset-0"
              onDragOver={(e) => { e.preventDefault(); setIsImageDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); const r = e.relatedTarget as Node | null; if (!r || !e.currentTarget.contains(r)) setIsImageDragging(false); }}
              onDrop={handleImageDrop}
            >
              {/* Panel fills full 16:9 area */}
              <div className={cn(
                "absolute inset-0 flex items-center justify-center",
                isImageGenerating
                  ? "bg-gray-200 dark:bg-[#2a2d36]"
                  : isImageDragging ? "bg-blue-100 dark:bg-[#1e3a5f]" : "bg-gray-200 dark:bg-[#2a2d36]"
              )}>
                {isImageGenerating ? (
                  <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute inset-0 animate-shimmer-sweep w-1/2 bg-gradient-to-r from-transparent via-black/[0.04] dark:via-white/[0.06] to-transparent" />
                  </div>
                ) : (
                  <svg className="w-9 h-9 text-gray-400 dark:text-white/20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                  </svg>
                )}
                {/* Buttons overlaid at bottom */}
                {isImageGenerating ? (
                  <div className="absolute bottom-2.5 inset-x-0 flex items-center justify-center opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
                    <button
                      onClick={handleCancelImageGeneration}
                      disabled={imageCanceling}
                      className={cn(
                        "flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-medium border border-white/30 hover:bg-white/20 transition-colors",
                        imageCanceling && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {imageCanceling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      {imageCanceling ? "取消中…" : "取消生成"}
                    </button>
                  </div>
                ) : (
                  <div className="absolute bottom-2.5 inset-x-0 flex items-center justify-center gap-1.5">
                    <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-gray-800 dark:bg-black text-white/70 hover:text-white text-[11px] font-medium cursor-pointer transition-colors whitespace-nowrap">
                      <Upload className="h-3 w-3" />上传图片
                      <input ref={imageUploadRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                    <button
                      onClick={() => onRegenImage?.(segment.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-gray-800 dark:bg-black text-white/70 hover:text-white text-[11px] font-medium transition-colors whitespace-nowrap"
                    >
                      <Sparkles className="h-3 w-3" />AI 生成
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Col 6: 视频 ── */}
        <div
          className={cn("border-l border-gray-200 dark:border-white/10 relative group overflow-hidden bg-gray-100 dark:bg-[#111213]", hasVideo && "cursor-pointer")}
          onClick={hasVideo ? () => setVideoModalOpen(true) : undefined}
          role={hasVideo ? "button" : undefined}
          tabIndex={hasVideo ? 0 : undefined}
          onKeyDown={hasVideo ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setVideoModalOpen(true); } } : undefined}
        >
          {hasVideo ? (
            <>
              <video src={segment.generatedVideo!} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" muted loop playsInline
                onMouseEnter={(e) => { (e.currentTarget as HTMLVideoElement).play(); setVideoPlaying(true); }}
                onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; setVideoPlaying(false); }}
              />
              {!videoPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center">
                    <Play className="h-4 w-4 text-white fill-white" />
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                <span className="text-white text-xs font-medium">查看/编辑</span>
              </div>
              <div className="absolute inset-x-0 bottom-0 pb-2 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); onRegenVideo?.(segment.id); }} disabled={isRegenVideoLoading} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/30 backdrop-blur-sm text-white text-xs transition-colors">
                  <RefreshCw className={cn("h-3 w-3", isRegenVideoLoading && "animate-spin")} />重做
                </button>
              </div>
              {isVideoGenerating && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                  <div className="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCancelVideoGeneration(); }}
                      disabled={videoCanceling}
                      className={cn(
                        "px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-medium border border-white/30 hover:bg-white/20 transition-colors",
                        videoCanceling && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {videoCanceling ? "取消中…" : "取消生成"}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full absolute inset-0"
              onDragOver={(e) => { e.preventDefault(); if (!isVideoGenerating) setIsVideoDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); const r = e.relatedTarget as Node | null; if (!r || !e.currentTarget.contains(r)) setIsVideoDragging(false); }}
              onDrop={handleVideoDrop}
            >
              {/* Panel fills full 16:9 area */}
              <div className={cn(
                "absolute inset-0 flex items-center justify-center",
                isVideoGenerating
                  ? "bg-gray-200 dark:bg-[#2a2d36]"
                  : isVideoDragging ? "bg-purple-100 dark:bg-[#2a1e3f]" : "bg-gray-200 dark:bg-[#2a2d36]"
              )}>
                {isVideoGenerating ? (
                  <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute inset-0 animate-shimmer-sweep w-1/2 bg-gradient-to-r from-transparent via-black/[0.04] dark:via-white/[0.06] to-transparent" />
                  </div>
                ) : (
                  <svg className="w-9 h-9 text-gray-400 dark:text-white/20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4zm-6 11l-1-2H8l1 2H6l-3-6h15l-3 6h-3z"/>
                  </svg>
                )}
                {/* Buttons overlaid at bottom */}
                {isVideoGenerating ? (
                  <div className="absolute bottom-2.5 inset-x-0 flex items-center justify-center opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
                    <button
                      onClick={handleCancelVideoGeneration}
                      disabled={videoCanceling}
                      className={cn(
                        "flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-medium border border-white/30 hover:bg-white/20 transition-colors",
                        videoCanceling && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {videoCanceling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      {videoCanceling ? "取消中…" : "取消生成"}
                    </button>
                  </div>
                ) : (
                  <div className="absolute bottom-2.5 inset-x-0 flex items-center justify-center gap-1.5">
                    <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-gray-800 dark:bg-black text-white/70 hover:text-white text-[11px] font-medium cursor-pointer transition-colors whitespace-nowrap">
                      <Upload className="h-3 w-3" />上传视频
                      <input ref={videoUploadRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                    </label>
                    <button
                      onClick={handleVideoAiGenerate}
                      disabled={videoAiDisabled}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-gray-800 dark:bg-black text-white/70 hover:text-white text-[11px] font-medium transition-colors whitespace-nowrap",
                        videoAiDisabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <Sparkles className="h-3 w-3" />AI 生成
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {subjectModalOpen && (
        <SubjectRefsModal
          refs={subjectRefs}
          onClose={() => setSubjectModalOpen(false)}
          onSave={async (newRefs) => {
            await patchSegment({ subject_refs: newRefs });
            const newParams = { ...(params || {}), subject_refs: newRefs };
            onSegmentUpdated?.(segment.id, { generationParams: newParams });
          }}
        />
      )}

      {imageEditorOpen && (
        <ImageEditorModal
          segment={segment}
          taskId={taskId}
          imageModel={imageModel}
          videoModel={videoModel}
          onClose={() => setImageEditorOpen(false)}
          onRegenerate={() => onRegenImage?.(segment.id)}
          onSegmentUpdated={(updates) => onSegmentUpdated?.(segment.id, updates)}
        />
      )}

      {videoModalOpen && (
        <VideoPreviewModal
          segment={segment}
          onClose={() => setVideoModalOpen(false)}
          onRegenerate={() => onRegenVideo?.(segment.id)}
          onSegmentUpdated={(updates) => onSegmentUpdated?.(segment.id, updates)}
        />
      )}
    </>
  );

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function patchSegment(data: Record<string, unknown>) {
    const res = await fetch(`/api/storyboard/segments/${segment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("patch failed");
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadImageFile(file);
    e.target.value = "";
  }

  async function uploadImageFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload/image", { method: "POST", body: formData });
      const { url } = await res.json();
      if (url) { await patchSegment({ generatedImage: url, status: "IMAGE_READY" }); onSegmentUpdated?.(segment.id, { generatedImage: url, status: "IMAGE_READY" }); }
    } catch { console.error("Image upload failed"); }
  }

  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadVideoFile(file);
    e.target.value = "";
  }

  async function uploadVideoFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload/video", { method: "POST", body: formData });
      const { url } = await res.json();
      if (url) { await patchSegment({ generatedVideo: url, status: "VIDEO_READY" }); onSegmentUpdated?.(segment.id, { generatedVideo: url, status: "VIDEO_READY" }); }
    } catch { console.error("Video upload failed"); }
  }

  async function handleImageDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation(); setIsImageDragging(false);
    if (isImageGenerating) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("仅支持上传图片文件"); return; }
    await uploadImageFile(file);
  }

  async function handleVideoDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation(); setIsVideoDragging(false);
    if (isVideoGenerating) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast.error("仅支持上传视频文件"); return; }
    await uploadVideoFile(file);
  }
}
