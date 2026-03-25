"use client";

/* eslint-disable @next/next/no-img-element -- Storyboard viewer renders remote previews without optimization */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Info,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";

export interface ViewerItem {
  id: string;
  url: string;
  type: "image" | "video";
  remoteUrl?: string;
  filename?: string;
}

interface StoryboardAssetViewerProps {
  isOpen: boolean;
  onClose: () => void;
  items: ViewerItem[];
  initialIndex?: number;
  segmentTitle?: string;
  mode: "image" | "video";
  onSave?: (items: ViewerItem[]) => void;
  onUploadAsset?: (file: File) => Promise<ViewerItem>;
  originalPrompt?: string | null;
  referenceItems?: ViewerItem[];
}

export function StoryboardAssetViewer({
  isOpen,
  onClose,
  items,
  initialIndex = 0,
  segmentTitle,
  mode,
  onSave,
  onUploadAsset,
  originalPrompt,
  referenceItems,
}: StoryboardAssetViewerProps) {
  const { t } = useLanguage();
  const viewerText = t.storyboard.viewer || {};
  const [assetList, setAssetList] = useState<ViewerItem[]>(items);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [prompt, setPrompt] = useState<string>("");
  const [model, setModel] = useState("nano");
  const [ratio, setRatio] = useState<"landscape" | "portrait">("landscape");
  const [quality, setQuality] = useState("standard");
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const allowUpload = Boolean(onUploadAsset);
  const allowSave = Boolean(onSave);
  const [referenceAssets, setReferenceAssets] = useState<ViewerItem[]>(referenceItems ?? []);
  const [referenceMenuOpen, setReferenceMenuOpen] = useState(false);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const referenceFileInputRef = useRef<HTMLInputElement>(null);
  const referenceButtonRef = useRef<HTMLButtonElement>(null);
  const referenceMenuRef = useRef<HTMLDivElement>(null);
  const [showExistingPicker, setShowExistingPicker] = useState(false);
  const originalPromptRef = useRef<HTMLDivElement>(null);

  const currentAsset = assetList[selectedIndex];
  const referencesControlled = Array.isArray(referenceItems);

  useEffect(() => {
    setAssetList(items);
    setSelectedIndex(initialIndex);
  }, [items, initialIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setReferenceMenuOpen(false);
      setShowExistingPicker(false);
      return;
    }
    if (referencesControlled) {
      setReferenceAssets(referenceItems ?? []);
      return;
    }
    const fallback = items[initialIndex] ?? items[0];
    setReferenceAssets(fallback ? [fallback] : []);
  }, [isOpen, referencesControlled, referenceItems, items, initialIndex]);

  useEffect(() => {
    if (!isOpen || referencesControlled || !currentAsset) return;
    setReferenceAssets((prev) => {
      const index = prev.findIndex((item) => item.id === currentAsset.id);
      if (index === 0) return prev;
      if (index > 0) {
        const next = [...prev];
        next.splice(index, 1);
        return [currentAsset, ...next];
      }
      return [currentAsset, ...prev];
    });
  }, [isOpen, referencesControlled, currentAsset]);

  useEffect(() => {
    if (!referenceMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        referenceMenuRef.current?.contains(target) ||
        referenceButtonRef.current?.contains(target)
      ) {
        return;
      }
      setReferenceMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [referenceMenuOpen]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !mounted) return null;

  const generateId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  const uploadItem = async (file: File): Promise<ViewerItem> => {
    if (onUploadAsset) {
      return onUploadAsset(file);
    }
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok || !data?.url) {
      throw new Error(data?.error || viewerText.uploadFailed || "上传失败");
    }
    return {
      id: generateId(),
      url: data.url as string,
      remoteUrl: data.url as string,
      filename: file.name,
      type: mode === "video" ? "video" : "image",
    };
  };

  const handleAddAsset = () => {
    if (!allowUpload) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onUploadAsset) return;
    setUploading(true);
    try {
      const newItem = await onUploadAsset(file);
      setAssetList((prev) => {
        const next = [...prev, newItem];
        setSelectedIndex(next.length - 1);
        return next;
      });
    } catch (error) {
      console.error("Failed to upload asset", error);
      toast.error(viewerText.uploadFailed || "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (index: number) => {
    setAssetList((prev) => prev.filter((_, idx) => idx !== index));
    setSelectedIndex((prev) => {
      if (index === prev) return Math.max(0, prev - 1);
      if (index < prev) return prev - 1;
      return prev;
    });
  };

  const handleApply = () => {
    onSave?.(assetList);
  };

  const scrollOriginalPrompt = (direction: "up" | "down") => {
    const target = originalPromptRef.current;
    if (!target) return;
    const delta = direction === "up" ? -120 : 120;
    target.scrollBy({ top: delta, behavior: "smooth" });
  };

  const addReferenceItem = (item: ViewerItem) => {
    setReferenceAssets((prev) => {
      if (prev.some((existing) => existing.id === item.id)) {
        return prev;
      }
      return [...prev, item];
    });
  };

  const handleReferenceFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setReferenceUploading(true);
    try {
      const newItem = await uploadItem(file);
      addReferenceItem(newItem);
    } catch (error) {
      console.error("Failed to upload reference", error);
      toast.error(viewerText.uploadFailed || "上传失败");
    } finally {
      setReferenceUploading(false);
    }
  };

  const openExistingPicker = () => {
    setShowExistingPicker(true);
    setReferenceMenuOpen(false);
  };

  const handleSelectExisting = (item: ViewerItem) => {
    addReferenceItem(item);
    setShowExistingPicker(false);
  };

  const removeReferenceItem = (id: string) => {
    setReferenceAssets((prev) => prev.filter((item) => item.id !== id));
  };

  const renderPreview = () => {
    if (!currentAsset) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
          <AlertCircle className="mb-2" size={28} />
          {viewerText.empty || "暂无素材"}
        </div>
      );
    }
    if (currentAsset.type === "video") {
      return (
        <video
          key={currentAsset.id}
          src={currentAsset.url}
          controls
          className="w-full h-full object-contain bg-black rounded-3xl"
        />
      );
    }
    return (
      <img
        key={currentAsset.id}
        src={currentAsset.url}
        alt="storyboard"
        className="w-full h-full object-contain rounded-3xl"
      />
    );
  };

  const originalPromptContent = originalPrompt?.trim()
    ? originalPrompt
    : viewerText.noPrompt || "暂无提示词";

  const viewerNode = (
    <div className="fixed inset-0 z-[1200] bg-black/85 backdrop-blur-sm">
      <div className="flex h-full flex-col relative">
        <div className="flex items-center justify-between px-6 py-4 text-white border-b border-white/10">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/60">
              {viewerText.label || "Storyboard Asset"}
            </p>
            <h2 className="text-2xl font-semibold">{segmentTitle || viewerText.defaultScene || "Scene"}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 flex overflow-hidden">
          <aside className="w-32 bg-black/40 border-r border-white/10 px-3 py-4 flex flex-col gap-4">
            <button
              onClick={handleAddAsset}
              disabled={!allowUpload}
              className={`aspect-[2/3] rounded-2xl border-2 border-dashed ${
                allowUpload
                ? "border-white/20 text-white hover:border-white/60"
                : "border-white/5 text-white/20 cursor-not-allowed"
            } flex items-center justify-center transition`}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Plus />}
          </button>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {assetList.map((asset, index) => (
              <div key={asset.id} className="relative group">
                <button
                  onClick={() => setSelectedIndex(index)}
                  className={`w-full aspect-[2/3] rounded-xl overflow-hidden border-2 ${
                    index === selectedIndex
                      ? "border-primary"
                      : index === 0
                      ? "border-white/40"
                      : "border-transparent"
                  }`}
                >
                  {asset.type === "video" ? (
                    <video src={asset.url} muted className="w-full h-full object-cover" />
                  ) : (
                    <img src={asset.url} alt="thumbnail" className="w-full h-full object-cover" />
                  )}
                </button>
                {index === 0 && (
                  <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground shadow-theme-glow">
                    {viewerText.primary || "主图"}
                  </span>
                )}
                <button
                  onClick={() => handleDelete(index)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-white/60 flex items-start gap-1">
            <Info size={12} className="mt-0.5" />
            {viewerText.primaryHint || "第一张作为分镜主图/视频"}
          </p>
        </aside>

        <section className="flex-1 bg-[#050505] flex items-center justify-center p-8">
          <div className="w-full h-full max-h-full max-w-5xl border border-white/10 rounded-[32px] bg-black/40 flex items-center justify-center overflow-hidden">
            {renderPreview()}
          </div>
        </section>

        <aside className="w-[420px] bg-[#070707] border-l border-white/10 p-6 overflow-y-auto text-white space-y-6">
          <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-white/40">
                  {viewerText.originalPromptLabel || "原提示词"}
                </p>
                <h3 className="text-xl font-semibold">{segmentTitle || viewerText.defaultScene || "Scene"}</h3>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => scrollOriginalPrompt("up")}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                  title={viewerText.scrollUp || "向上滚动"}
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollOriginalPrompt("down")}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                  title={viewerText.scrollDown || "向下滚动"}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div
              ref={originalPromptRef}
              className="max-h-64 overflow-y-auto pr-2 text-sm leading-relaxed text-white/80 whitespace-pre-wrap"
            >
              {originalPromptContent}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">
                  {viewerText.referenceLabel || "参考图"}
                </p>
                <p className="text-xs text-white/60 mt-1">
                  {viewerText.referenceHint || "添加参考确保角色、光线与风格保持一致"}
                </p>
              </div>
              <div className="flex gap-2">
                <span className="text-xs text-white/40">
                  {viewerText.referenceCountLabel || "已选"} {referenceAssets.length}
                </span>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              <div className="relative flex-none">
                <button
                  ref={referenceButtonRef}
                  type="button"
                  onClick={() => setReferenceMenuOpen((prev) => !prev)}
                  className="w-24 h-24 rounded-2xl border border-dashed border-white/20 flex flex-col items-center justify-center text-xs text-white/70 hover:border-white/60 hover:text-white"
                >
                  {referenceUploading ? <Loader2 className="animate-spin" /> : <Plus className="w-5 h-5" />}
                  <span className="mt-1">{viewerText.addReference || "添加参考"}</span>
                </button>
                {referenceMenuOpen && (
                  <div
                    ref={referenceMenuRef}
                    className="absolute left-0 top-[110%] w-44 rounded-2xl border border-white/10 bg-[#101010] shadow-2xl py-2 text-sm"
                  >
                    <button
                      className="w-full px-3 py-2 flex items-center gap-2 text-white/90 hover:bg-white/5"
                      onClick={openExistingPicker}
                    >
                      <ImagePlus className="w-4 h-4" />
                      {viewerText.chooseExisting || "从已有素材中选择"}
                    </button>
                    <button
                      className="w-full px-3 py-2 flex items-center gap-2 text-white/90 hover:bg-white/5"
                      onClick={() => {
                        referenceFileInputRef.current?.click();
                        setReferenceMenuOpen(false);
                      }}
                    >
                      <UploadCloud className="w-4 h-4" />
                      {viewerText.uploadLocal || "本地上传"}
                    </button>
                  </div>
                )}
              </div>
              {referenceAssets.map((asset, index) => (
                <div key={`${asset.id}-${index}`} className="relative flex-none">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden border border-white/20">
                    {asset.type === "video" ? (
                      <video src={asset.url} className="w-full h-full object-cover" muted />
                    ) : (
                      <img src={asset.url} alt={asset.filename || "reference"} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <span className="block text-xs text-white/70 mt-2 truncate max-w-[96px]">
                    {asset.filename || `${viewerText.referenceItem || "素材"} ${index + 1}`}
                  </span>
                  <button
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/80 text-white flex items-center justify-center"
                    onClick={() => removeReferenceItem(asset.id)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-white/50">
                {viewerText.promptInputLabel || "输入提示词"}
              </label>
              <div className="rounded-[24px] border border-white/10 bg-black/30 p-4">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={viewerText.promptPlaceholder || "输入想要修改或保留的细节"}
                  className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none resize-none min-h-[120px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <span className="text-[11px] uppercase tracking-wide text-white/50">
                  {viewerText.modelLabel || "大模型"}
                </span>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-2xl border border-white/15 bg-black/40 px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="nano">Nano Banana Pro</option>
                  <option value="veo">Google Veo</option>
                  <option value="sora">OpenAI Sora</option>
                </select>
              </div>
              <div className="space-y-2">
                <span className="text-[11px] uppercase tracking-wide text-white/50">
                  {viewerText.ratioLabel || "画幅"}
                </span>
                <div className="flex gap-2">
                  {[
                    { key: "landscape", label: viewerText.landscape || "横向" },
                    { key: "portrait", label: viewerText.portrait || "纵向" },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setRatio(option.key as typeof ratio)}
                      className={`flex-1 rounded-2xl border px-2 py-2 text-sm font-medium transition ${
                        ratio === option.key
                          ? "border-white bg-white text-black"
                          : "border-white/20 text-white/70"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[11px] uppercase tracking-wide text-white/50">
                  {viewerText.qualityLabel || "清晰度"}
                </span>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  className="w-full rounded-2xl border border-white/15 bg-black/40 px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="draft">Draft</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button className="w-full rounded-2xl bg-white text-black py-3 text-sm font-semibold">
                {viewerText.regenerate || "重新生成"}
              </button>
              <button
                disabled={!allowSave}
                onClick={handleApply}
                className={`w-full rounded-2xl border border-white/30 py-3 text-sm font-semibold transition ${
                  allowSave ? "hover:bg-white/5" : "opacity-60 cursor-not-allowed"
                }`}
              >
                {viewerText.apply || "应用到分镜"}
              </button>
            </div>
          </section>
          </aside>
        </div>
        {allowUpload && (
          <input
            ref={fileInputRef}
            type="file"
            accept={mode === "video" ? "video/*" : "image/*"}
            className="hidden"
            onChange={handleFileChange}
          />
        )}
        <input
          ref={referenceFileInputRef}
          type="file"
          accept={mode === "video" ? "video/*" : "image/*"}
          className="hidden"
          onChange={handleReferenceFileChange}
        />

        {showExistingPicker && (
          <div className="absolute inset-0 z-[80] bg-black/70 flex items-center justify-center px-4">
            <div className="w-full max-w-3xl rounded-[32px] border border-white/10 bg-[#0b0b0c] p-6 space-y-4">
              <div className="flex items-center justify-between text-white">
                <div>
                  <p className="text-lg font-semibold">
                    {viewerText.chooseExisting || "从已有素材中选择"}
                  </p>
                  <p className="text-sm text-white/60">
                    {viewerText.chooseExistingHint || "点击一张素材作为参考"}
                  </p>
                </div>
                <button
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                  onClick={() => setShowExistingPicker(false)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto pr-2">
                {assetList.length === 0 && (
                  <p className="col-span-full text-center text-white/60 py-12">
                    {viewerText.noExistingAssets || "暂无可选素材"}
                  </p>
                )}
                {assetList.map((asset) => (
                  <button
                    key={`picker-${asset.id}`}
                    className="rounded-2xl border border-white/15 overflow-hidden hover:border-white/50"
                    onClick={() => handleSelectExisting(asset)}
                  >
                    {asset.type === "video" ? (
                      <video src={asset.url} className="w-full h-32 object-cover" muted />
                    ) : (
                      <img src={asset.url} alt="asset" className="w-full h-32 object-cover" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;
  return createPortal(viewerNode, portalTarget);
}
