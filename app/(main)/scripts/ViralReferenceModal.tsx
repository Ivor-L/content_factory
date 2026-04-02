"use client";

/* eslint-disable @next/next/no-img-element -- Modal displays proxied remote media and carousel thumbnails */

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Download, Zap, ExternalLink, ChevronLeft, ChevronRight, ArrowLeft, Copy, Check, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { ImageTextReplicationPanel } from "./ImageTextReplicationPanel";
import { CopyRemixPanel } from "@/app/(main)/replication/CopyRemixPanel";
import { toProxyUrl, toProxyImgUrl, toProxyMediaUrl, toForcedProxyUrl } from "@/lib/mediaProxy";
import { chooseBestMediaUrl, isLikelyBlockedXhsUrl } from "@/lib/viralReferenceMedia";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type StatPayload = Record<string, number | string | null>;

type ViralCreatorData = {
  id: string;
  platform: string;
  creatorHandle?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  stats?: StatPayload | null;
};

type ViralReferenceItemData = {
  id: string;
  platform: string;
  sourceType: string;
  sourceId: string;
  title?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  videoUrl?: string | null;
  mediaUrls?: (string | null)[] | null;
  sourceUrl?: string | null;
  stats?: StatPayload | null;
  category?: string | null;
  rankLabel?: string | null;
  benchmarkScore?: number | null;
  publishedAt?: string | null;
  creator?: ViralCreatorData | null;
  rawPayload?: unknown;
  scriptText?: string | null;
};

interface ViralReferenceModalProps {
  item: ViralReferenceItemData | null;
  onClose: () => void;
  onExtracted?: (itemId: string, scriptText: string) => void;
  onExtractionStarted?: (itemId: string) => void;
  onExtractionFailed?: (itemId: string) => void;
  isExtracting?: boolean;
}

type BreakdownView = 'idle' | 'loading' | 'done' | 'failed';

type WritingStyleSummary = {
  id: string;
  name: string;
  description?: string | null;
  channel?: string | null;
};

type WritingStyleDetail = WritingStyleSummary & Record<string, any>;

type CopyInsights = {
  copyText?: string;
  segments?: {
    intro?: string | null;
    body?: string | null;
    conclusion?: string | null;
  };
};

const parseResult = (value?: string | null) => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

function normalizeMediaList(media?: (string | null)[] | null): string[] {
  if (!Array.isArray(media)) return [];
  return media.filter((url): url is string => typeof url === "string" && url.trim().length > 0);
}

function formatCount(value?: number | string | null) {
  if (value == null) return "0";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "0";
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return `${Math.round(num)}`;
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0 ${className ?? ""}`}
      title="复制"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
    </button>
  );
}


export function ViralReferenceModal({ item, onClose, onExtracted, onExtractionStarted, onExtractionFailed, isExtracting }: ViralReferenceModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showImageTextPanel, setShowImageTextPanel] = useState(false);
  const [breakdownView, setBreakdownView] = useState<BreakdownView>('idle');
  const [showBreakdownPanel, setShowBreakdownPanel] = useState(false);
  const [copyInsights, setCopyInsights] = useState<CopyInsights | null>(null);
  const pendingExtractionRef = useRef(false);

  const platformId = (item?.platform || '').toLowerCase();
  const isTiktok = platformId === 'tiktok';

  // Check rawPayload.type first — XHS image posts can include a videoUrl but still be image-only content.
  // Normalize to lowercase to handle mixed-case variants from upstream APIs.
  const rawType = (() => {
    if (!item) return null;
    try {
      const p = typeof item.rawPayload === 'string' ? JSON.parse(item.rawPayload) : item.rawPayload;
      const t = (p as any)?.type ?? (p as any)?.data?.type ?? null;
      return typeof t === 'string' ? t.toLowerCase() : null;
    } catch {
      return null;
    }
  })();

  // XHS CDN heuristic: /spectrum/1040g0k0 prefix == video note cover.
  const coverIndicatesVideo = typeof item?.coverUrl === 'string' && /\/spectrum\/1040g0k0/i.test(item.coverUrl);

  const isVideo = (() => {
    if (!item) return false;
    if (isTiktok) return true;
    if (rawType === 'video') return true;
    if (rawType === 'image' || rawType === 'normal') return false;
    if (coverIndicatesVideo) return true;
    return !!item.videoUrl;
  })();

  const normalizeText = (value?: string | null) => (typeof value === "string" ? value.trim() : "");
  // scriptText can come from the top-level field (hydrated by the list API) or from rawPayload.scriptText
  const rawPayloadScriptText = (() => {
    const rp = item?.rawPayload;
    if (rp && typeof rp === "object" && !Array.isArray(rp)) {
      const v = (rp as Record<string, unknown>).scriptText;
      if (typeof v === "string") return v.trim();
    }
    return "";
  })();
  const existingCopyText = normalizeText(item?.scriptText) || rawPayloadScriptText;
  const hasExistingCopy = isVideo && existingCopyText.length > 0;
  const normalizedDescription = normalizeText(item?.description);
  const extractedCopy = normalizeText(copyInsights?.copyText) || existingCopyText;
  const hasCopyText = Boolean(extractedCopy);
  const isExtractingCopy = breakdownView === "loading";

  useEffect(() => {
    if (isExtracting) {
      // Extraction is in progress (started before modal was closed) — restore loading state.
      pendingExtractionRef.current = true;
      setBreakdownView('loading');
      setCopyInsights(null);
      setShowBreakdownPanel(false);
    } else if (hasExistingCopy) {
      setCopyInsights({ copyText: existingCopyText });
      setBreakdownView('done');
      setShowBreakdownPanel(false);
    } else {
      setCopyInsights(null);
      setBreakdownView('idle');
      setShowBreakdownPanel(false);
    }
  }, [item?.id, isExtracting, hasExistingCopy, existingCopyText]);

  // Subscribe to Supabase realtime so async n8n callback updates the UI automatically.
  useEffect(() => {
    if (!item?.id) return;
    const channel = supabase
      .channel(`viral-ref-extract-${item.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "viral_reference_items",
          filter: `id=eq.${item.id}`,
        },
        (payload) => {
          if (!pendingExtractionRef.current) return;
          const rawPayload = (payload.new as any)?.raw_payload ?? (payload.new as any)?.rawPayload;
          const scriptText =
            typeof rawPayload?.scriptText === "string" ? rawPayload.scriptText.trim() :
            typeof rawPayload?.script_text === "string" ? rawPayload.script_text.trim() : "";
          if (!scriptText) return;
          pendingExtractionRef.current = false;
          setCopyInsights({ copyText: scriptText });
          setBreakdownView("done");
          setShowBreakdownPanel(true);
          toast.success("口播文案提取完成");
          if (onExtracted && item.id) {
            onExtracted(item.id, scriptText);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [item?.id, onExtracted]);

  // Polling fallback: when waiting for async extraction, poll every 5s in case
  // Supabase realtime is not configured for this table.
  const applyExtractedText = useCallback((scriptText: string) => {
    pendingExtractionRef.current = false;
    setCopyInsights({ copyText: scriptText });
    setBreakdownView("done");
    setShowBreakdownPanel(true);
    toast.success("口播文案提取完成");
    if (onExtracted && item?.id) {
      onExtracted(item.id, scriptText);
    }
    // onExtracted in parent will remove from extractingItemIds automatically
  }, [item?.id, onExtracted]);

  useEffect(() => {
    if (breakdownView !== "loading" || !item?.id) return;

    const INTERVAL = 5000;
    const MAX_ATTEMPTS = 60; // 5 min max
    let attempts = 0;

    const timer = setInterval(async () => {
      if (!pendingExtractionRef.current) {
        clearInterval(timer);
        return;
      }
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(timer);
        pendingExtractionRef.current = false;
        setBreakdownView("idle");
        toast.error("提取超时，请重试");
        return;
      }
      try {
        const res = await fetch(`/api/viral-references/${item.id}`);
        if (!res.ok) return;
        const payload = await res.json().catch(() => ({}));
        const scriptText = payload?.data?.scriptText;
        if (typeof scriptText === "string" && scriptText.trim()) {
          clearInterval(timer);
          applyExtractedText(scriptText.trim());
        }
      } catch {
        // ignore transient errors, keep polling
      }
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [breakdownView, item?.id, applyExtractedText]);

  if (!item) return null;

  const normalizedMediaUrls = normalizeMediaList(item.mediaUrls);
  const preferredCoverImage = chooseBestMediaUrl(item.coverUrl, normalizedMediaUrls);

  // Image list (only used when no video)
  const baseImageCandidates = normalizedMediaUrls.length ? normalizedMediaUrls : (preferredCoverImage ? [preferredCoverImage] : []);
  const accessibleImages = baseImageCandidates.filter((url) => !isLikelyBlockedXhsUrl(url));
  const imageList = Array.from(new Set((accessibleImages.length ? accessibleImages : baseImageCandidates)));
  if (imageList.length === 0 && preferredCoverImage) {
    imageList.push(preferredCoverImage);
  }
  const hasMultipleImages = imageList.length > 1;
  const currentImage = imageList[currentImageIndex] ?? null;
  const posterCandidate = !isTiktok ? (preferredCoverImage || imageList[0] || null) : null;

  const goPrevImage = () =>
    setCurrentImageIndex((prev) => (prev - 1 + imageList.length) % imageList.length);
  const goNextImage = () =>
    setCurrentImageIndex((prev) => (prev + 1) % imageList.length);

  const buildProxyUrl = (url: string, filename: string) => toProxyUrl(url, filename);
  const buildProxyImgUrl = (url: string) => toProxyImgUrl(url);
  const buildProxyMediaUrl = (url: string) => toProxyMediaUrl(url);

  const shouldForceProxy = (url: string | null | undefined) => {
    if (!url) return false;
    try {
      const { hostname } = new URL(url);
      return /instagram|facebook|fbcdn/i.test(hostname);
    } catch {
      return false;
    }
  };

  const getPlaybackSrc = (url: string) =>
    shouldForceProxy(url) ? url : buildProxyMediaUrl(url);

  const getPosterSrc = (url: string) =>
    shouldForceProxy(url) ? toForcedProxyUrl(url, "img") : buildProxyImgUrl(url);

  const getImageSrc = (url: string) =>
    shouldForceProxy(url) ? toForcedProxyUrl(url, "img") : buildProxyImgUrl(url);

  const canTriggerCopyBreakdown = isVideo && !shouldForceProxy(item.videoUrl || item.sourceUrl);

  const handleDownload = async () => {
    const rawUrl = isVideo ? item.videoUrl : currentImage;
    if (!rawUrl) {
      toast.error("没有可下载的内容");
      return;
    }
    const ext = isVideo ? "mp4" : "jpg";
    const filename = `${item.title || item.sourceId}.${ext}`;
    if (shouldForceProxy(rawUrl)) {
      window.open(rawUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const a = document.createElement("a");
    a.href = buildProxyUrl(rawUrl, filename);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleBreakdown = async () => {
    if (!isVideo) {
      setShowImageTextPanel(true);
      return;
    }
    if (hasExistingCopy && existingCopyText) {
      setCopyInsights({ copyText: existingCopyText });
      setBreakdownView('done');
      setShowBreakdownPanel(true);
      return;
    }
    setBreakdownView('loading');
    setCopyInsights(null);
    setShowBreakdownPanel(false);
    pendingExtractionRef.current = true;
    if (onExtractionStarted && item?.id) {
      onExtractionStarted(item.id);
    }
    try {
      const res = await fetch("/api/replication/copy/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: item.videoUrl,
          referenceItemId: item.id,
          sourcePlatform: item.platform,
          noteDescription: item.description || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || `提取失败 (${res.status})`);
      }

      // Async path: n8n will call /callback and Supabase realtime will notify us.
      if (payload.data?.status === "pending") {
        // Stay in loading state; realtime subscription will handle completion.
        return;
      }

      // Sync fallback: n8n responded immediately with the transcript.
      const text =
        payload.data?.text ||
        payload.data?.transcript ||
        payload.data?.result?.text ||
        payload.data?.copyText;
      if (!text) throw new Error("未获取到文案");
      pendingExtractionRef.current = false;
      setCopyInsights({ copyText: text });
      setBreakdownView('done');
      setShowBreakdownPanel(true);
      if (onExtracted && item?.id) {
        onExtracted(item.id, text);
      }
    } catch (error) {
      pendingExtractionRef.current = false;
      if (onExtractionFailed && item?.id) {
        onExtractionFailed(item.id);
      }
      console.error("Copy extract failed:", error);
      toast.error(error instanceof Error ? error.message : "提取失败，请稍后重试");
      setBreakdownView('idle');
    }
  };

  const handleCancelBreakdown = () => {
    setBreakdownView('idle');
    setCopyInsights(null);
    setShowBreakdownPanel(false);
  };

  const displayAuthor = item.creator?.displayName || item.creator?.creatorHandle || "未知作者";

  // ── Breakdown results panel (right side) ──
  const renderBreakdownPanel = () => {
    return (
      <>
        <div className="flex items-center gap-3 p-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            type="button"
            onClick={() => { setShowBreakdownPanel(false); }}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">口播复刻</h3>
        </div>
        <div className="flex-1 min-h-0 p-4">
          {copyInsights ? (
            <CopyRemixPanel
              script={null}
              copyInsights={copyInsights}
              videoUrl={item.videoUrl || undefined}
              isVideoUploaded={Boolean(item.videoUrl)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              暂无口播文案，请重新提取
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-start md:items-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-6xl max-h-none md:max-h-[90vh] overflow-hidden flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
                  className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white backdrop-blur-sm transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ── Left side: video or image carousel ── */}
        <div className="w-full md:w-1/2 bg-black flex flex-col">
          {isVideo && item.videoUrl ? (
            <div className="relative flex-1 flex items-center justify-center" style={{ minHeight: 320 }}>
              <video
                key={item.id}
                src={getPlaybackSrc(item.videoUrl)}
                poster={posterCandidate ? getPosterSrc(posterCandidate) : undefined}
                controls
                playsInline
                preload="metadata"
                className="w-full h-full object-contain"
                style={{ maxHeight: "90vh" }}
              />
            </div>
          ) : (
            /* ── IMAGE CAROUSEL MODE ── */
            <>
              {/* Main image */}
              <div className="relative flex-1 flex items-center justify-center" style={{ minHeight: 320 }}>
                {currentImage ? (
                  <img
                    src={getImageSrc(currentImage)}
                    alt={item.title || "image"}
                    className="w-full h-full object-contain"
                    style={{ maxHeight: hasMultipleImages ? "calc(90vh - 100px)" : "90vh" }}
                  />
                ) : (
                  <div className="flex items-center justify-center text-white/50 text-sm min-h-[320px]">
                    无可用媒体
                  </div>
                )}

                {/* Prev / Next arrows */}
                {hasMultipleImages && (
                  <>
                    <button
                      type="button"
                      onClick={goPrevImage}
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white transition-all"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={goNextImage}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white transition-all"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-black/60 text-white text-xs font-medium">
                      {currentImageIndex + 1} / {imageList.length}
                    </div>
                  </>
                )}
              </div>

              {/* Thumbnail strip */}
              {hasMultipleImages && (
                <div
                  className="flex gap-2 p-3 overflow-x-auto bg-black/80"
                  style={{ scrollbarWidth: "none" }}
                >
                  {imageList.map((url, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setCurrentImageIndex(index)}
                      className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                        index === currentImageIndex
                          ? "border-white"
                          : "border-transparent opacity-50 hover:opacity-80"
                      }`}
                    >
                        <img
                          src={getImageSrc(url)}
                        alt={`图片 ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right side ── */}
        <div className="w-full md:w-1/2 flex flex-col" style={{ maxHeight: "90vh" }}>
          {/* Image-text replication panel */}
          {showImageTextPanel ? (
            <>
              <div className="flex items-center gap-3 p-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowImageTextPanel(false)}
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">图文复刻</h3>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ImageTextReplicationPanel
                  sourceTitle={item.title}
                  sourceText={item.description}
                  sourceImages={imageList}
                  sourcePlatform={item.platform}
                  sourceId={item.sourceId}
                  sourceUrl={item.sourceUrl ?? undefined}
                  onClose={onClose}
                />
              </div>
            </>
          ) : breakdownView === 'loading' ? (            /* Loading state */
            <>
              <div className="flex items-center gap-3 p-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleCancelBreakdown}
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">口播复刻</h3>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
                <Loader2 className="w-10 h-10 text-gray-700 dark:text-gray-300 animate-spin" />
                <div className="text-center space-y-1.5">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">AI 正在提取口播文案…</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">通常 30 秒内完成，稍候即可查看结果</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">可关闭弹窗，稍后重新打开查看</p>
                </div>
                <button
                  type="button"
                  onClick={handleCancelBreakdown}
                  className="mt-2 px-5 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  取消拆解
                </button>
              </div>
            </>
          ) : (breakdownView === 'done' && showBreakdownPanel) ? (
            renderBreakdownPanel()
          ) : (            /* Default info view */
            <>
              {/* Author info + 查看原文 */}
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <img
                    src={item.creator?.avatarUrl ? buildProxyImgUrl(item.creator.avatarUrl) : "/default-avatar.png"}
                    alt={displayAuthor}
                    className="w-11 h-11 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
                  />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                      {displayAuthor}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {item.platform === "xiaohongshu" ? "小红书" : item.platform}
                    </p>
                  </div>
                </div>
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    查看原文
                  </a>
                )}
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {item.title && (
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-snug">
                    {item.title}
                  </h2>
                )}
                {isVideo ? (
                  hasCopyText ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        口播文案
                      </p>
                      <div className="flex items-start gap-1">
                        <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                          {extractedCopy}
                        </p>
                        <CopyButton text={extractedCopy} />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-4 text-sm text-gray-600 dark:text-gray-300 space-y-3">
                      <p className="font-semibold text-gray-800 dark:text-gray-100">暂无口播文案</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        点击下方或使用下列按钮提取视频中的口播内容，方便直接复刻。
                      </p>
                      <button
                        type="button"
                        onClick={handleBreakdown}
                        disabled={!canTriggerCopyBreakdown || isExtractingCopy}
                        className={cn(
                          "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all",
                          canTriggerCopyBreakdown
                            ? "bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
                            : "bg-gray-200 text-gray-500 cursor-not-allowed",
                        )}
                      >
                        {isExtractingCopy ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            提取中...
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5" />
                            提取口播文案
                          </>
                        )}
                      </button>
                    </div>
                  )
                ) : (
                  normalizedDescription && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        原帖文案
                      </p>
                      <div className="flex items-start gap-1">
                        <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                          {normalizedDescription}
                        </p>
                        <CopyButton text={normalizedDescription} />
                      </div>
                    </div>
                  )
                )}
                {item.publishedAt && (
                  <p className="text-xs text-gray-400">
                    {new Date(item.publishedAt).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </p>
                )}
                {item.stats && (
                  <div className="flex items-center gap-5 text-sm text-gray-600 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
                    {item.stats.likes != null && Number(item.stats.likes) > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span>❤️</span>
                        <span>{formatCount(item.stats.likes)}</span>
                      </div>
                    )}
                    {item.stats.collects != null && Number(item.stats.collects) > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span>⭐</span>
                        <span>{formatCount(item.stats.collects)}</span>
                      </div>
                    )}
                    {item.stats.comments != null && Number(item.stats.comments) > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span>💬</span>
                        <span>{formatCount(item.stats.comments)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom action buttons */}
              <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex gap-3 flex-shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  下载
                </button>
                {!shouldForceProxy(item.videoUrl || item.sourceUrl) && (
                  breakdownView === 'done' ? (
                    <button
                      type="button"
                      onClick={() => setShowBreakdownPanel(true)}
                      className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 font-semibold transition-all shadow-md"
                    >
                      <Zap className="w-4 h-4" />
                      一键二创
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleBreakdown}
                      className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold transition-all shadow-md"
                    >
                      <Zap className="w-4 h-4" />
                      {isVideo ? "口播复刻" : "图文复刻"}
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
