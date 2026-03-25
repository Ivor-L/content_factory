"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  X, RefreshCw, Plus, ChevronUp, ChevronDown, Loader2, Sparkles, Trash2,
} from "lucide-react";
import type { SegmentData, SubjectRef, GenerationParams } from "./SegmentRow";

const IMAGE_MODELS = [
  { id: "nanoBananapro", label: "Nano Banana Pro" },
  { id: "nanoBanana2", label: "Nano Banana 2" },
];

const ASPECT_RATIOS = ["9:16", "16:9", "1:1", "4:5"];

interface ImageEditorModalProps {
  segment: SegmentData;
  taskId: string;
  imageModel?: string | null;
  videoModel?: string | null;
  onClose: () => void;
  onRegenerate: () => void;
  onSegmentUpdated: (updates: Partial<SegmentData>) => void;
}

export function ImageEditorModal({
  segment,
  taskId,
  imageModel,
  onClose,
  onRegenerate,
  onSegmentUpdated,
}: ImageEditorModalProps) {
  const params = segment.generationParams as GenerationParams | null;

  const [selectedModel, setSelectedModel] = useState(imageModel || "nanoBananapro");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [prompt, setPrompt] = useState(segment.imagePrompt || "");
  const [subjectRefs, setSubjectRefs] = useState<SubjectRef[]>(params?.subject_refs || []);
  const [imageHistory, setImageHistory] = useState<string[]>(params?.image_history || []);
  const [selectedHistoryIdx, setSelectedHistoryIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [deletingImage, setDeletingImage] = useState(false);

  // Current displayed image (history selection or latest generated)
  const displayedImage =
    selectedHistoryIdx !== null ? imageHistory[selectedHistoryIdx] : segment.generatedImage;

  // Refresh history from server when opened
  useEffect(() => {
    setSubjectRefs(params?.subject_refs || []);
    setImageHistory(params?.image_history || []);
  }, [segment.id, params?.subject_refs, params?.image_history]);

  async function handleSaveAndRegenerate() {
    setRegenerating(true);
    try {
      // 1. Save prompt + refs to DB, push current image to history
      await fetch(`/api/storyboard/segments/${segment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagePrompt: prompt,
          subject_refs: subjectRefs,
          push_image_url: !!segment.generatedImage,
        }),
      });
      // Update local history
      const newHistory = segment.generatedImage
        ? [segment.generatedImage, ...imageHistory].slice(0, 20)
        : imageHistory;
      setImageHistory(newHistory);

      // 2. Trigger regeneration
      onRegenerate();
      onSegmentUpdated({
        imagePrompt: prompt,
        generationParams: { ...(params || {}), subject_refs: subjectRefs, image_history: newHistory },
      });
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/storyboard/segments/${segment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePrompt: prompt, subject_refs: subjectRefs }),
      });
      onSegmentUpdated({
        imagePrompt: prompt,
        generationParams: { ...(params || {}), subject_refs: subjectRefs },
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteImage() {
    if (!segment.generatedImage) return;
    const confirmed = window.confirm("确定要删除当前图片吗？删除后可重新上传或生成。");
    if (!confirmed) return;
    setDeletingImage(true);
    try {
      await fetch(`/api/storyboard/segments/${segment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generatedImage: null, status: "IMAGE_PENDING" }),
      });
      onSegmentUpdated({
        generatedImage: null,
        status: "IMAGE_PENDING",
        generationParams: { ...(params || {}), subject_refs: subjectRefs, image_history: imageHistory },
      });
      setSelectedHistoryIdx(null);
      onClose();
    } finally {
      setDeletingImage(false);
    }
  }

  function handleRemoveRef(idx: number) {
    setSubjectRefs((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleAddRefFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload/image", { method: "POST", body: formData });
      const { url } = await res.json();
      if (url) setSubjectRefs((prev) => [...prev, { type: "custom", url, label: "自定义" }]);
    } catch (err) {
      console.error("Upload failed", err);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex" onClick={onClose}>
      {/* Prevent close when clicking inside */}
      <div
        className="flex w-full h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Left: History strip ─── */}
        <div className="w-20 flex-shrink-0 bg-black border-r border-white/10 flex flex-col items-center gap-2 py-4 overflow-y-auto">
          {/* New / add placeholder */}
          <div className="w-14 h-14 rounded-lg border border-dashed border-white/20 flex items-center justify-center text-white/30 text-xs cursor-pointer hover:border-white/40">
            <Plus className="h-4 w-4" />
          </div>

          {/* Current generated (top of history) */}
          {segment.generatedImage && (
            <button
              onClick={() => setSelectedHistoryIdx(null)}
              className={cn(
                "w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors",
                selectedHistoryIdx === null ? "border-yellow-400" : "border-transparent hover:border-white/40"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={segment.generatedImage} alt="current" className="w-full h-full object-cover" />
            </button>
          )}

          {/* History items */}
          {imageHistory.map((url, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedHistoryIdx(idx)}
              className={cn(
                "w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors",
                selectedHistoryIdx === idx ? "border-yellow-400" : "border-transparent hover:border-white/40"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`history-${idx}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>

        {/* ─── Center: Image preview ─── */}
        <div className="flex-1 flex flex-col bg-[#111] relative">
          {/* Top toolbar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            {selectedHistoryIdx !== null && (
              <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-medium">
                历史版本
              </span>
            )}
            {selectedHistoryIdx === null && segment.generatedImage && (
              <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                已选中
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={handleSaveAndRegenerate}
              disabled={regenerating}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
            >
              {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              重新生成
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              保存
            </button>
            {segment.generatedImage && (
              <button
                onClick={handleDeleteImage}
                disabled={deletingImage}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-200 text-xs transition-colors"
              >
                {deletingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                删除图片
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Image area */}
          <div className="flex-1 flex items-center justify-center p-6">
            {displayedImage ? (
              <div className="relative max-h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayedImage}
                  alt="Generated"
                  className="max-h-[calc(100vh-160px)] max-w-full object-contain rounded-xl"
                />
                {/* Navigation arrows */}
                <button
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white"
                  onClick={() => {
                    const total = imageHistory.length + (segment.generatedImage ? 1 : 0);
                    const current = selectedHistoryIdx === null ? -1 : selectedHistoryIdx;
                    if (current > 0) setSelectedHistoryIdx(current - 1);
                    else if (current === 0) setSelectedHistoryIdx(null);
                  }}
                >
                  <ChevronUp className="h-4 w-4 rotate-[-90deg]" />
                </button>
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white"
                  onClick={() => {
                    const current = selectedHistoryIdx === null ? -1 : selectedHistoryIdx;
                    if (current < imageHistory.length - 1) setSelectedHistoryIdx(current + 1);
                  }}
                >
                  <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 text-white/30">
                <Sparkles className="h-12 w-12" />
                <p className="text-sm">尚未生成图片</p>
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

        {/* ─── Right: Settings panel ─── */}
        <div className="w-80 flex-shrink-0 bg-[#0a0a0a] border-l border-white/10 flex flex-col overflow-y-auto">
          <div className="p-5 flex flex-col gap-5">
            {/* Scene title */}
            <h2 className="text-lg font-semibold text-white">
              Scene {segment.order}
            </h2>

            {/* Subject refs */}
            <div>
              <p className="text-xs text-white/40 mb-2">主体参考图</p>
              <div className="grid grid-cols-3 gap-2">
                {/* Add button */}
                <label className="aspect-square rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:border-white/40 transition-colors">
                  <Plus className="h-5 w-5 text-white/30" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleAddRefFile} />
                </label>

                {subjectRefs.map((ref, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-square rounded-xl overflow-hidden bg-white/5 group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ref.url} alt={ref.label} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        onClick={() => handleRemoveRef(idx)}
                        className="p-1 rounded-full bg-red-500/80 hover:bg-red-500"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5 px-1">
                      <p className="text-[9px] text-white/60 text-center truncate">{ref.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Prompt */}
            <div>
              <p className="text-xs text-white/40 mb-2">提示词</p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/80 placeholder-white/20 resize-none focus:outline-none focus:border-white/30 leading-relaxed"
                placeholder="输入图片生成提示词…"
              />
            </div>

            {/* Visual description (read-only reference) */}
            {segment.visualDescription && (
              <div>
                <p className="text-xs text-white/40 mb-2">场景描述（参考）</p>
                <p className="text-xs text-white/50 leading-relaxed">{segment.visualDescription}</p>
              </div>
            )}

            {/* Bottom: Model + aspect ratio + generate */}
            <div className="mt-auto pt-4 border-t border-white/10 space-y-3">
              {/* Model selector */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white appearance-none focus:outline-none focus:border-white/30"
                >
                  {IMAGE_MODELS.map((m) => (
                    <option key={m.id} value={m.id} className="bg-gray-900">
                      {m.label}
                    </option>
                  ))}
                </select>

                {/* Aspect ratio */}
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white appearance-none focus:outline-none focus:border-white/30"
                >
                  {ASPECT_RATIOS.map((r) => (
                    <option key={r} value={r} className="bg-gray-900">{r}</option>
                  ))}
                </select>
              </div>

              {/* Generate button */}
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
