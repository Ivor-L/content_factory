"use client";

/* eslint-disable @next/next/no-img-element -- Modal displays proxied remote media and carousel thumbnails */

import { useState, useEffect, useCallback } from "react";
import { X, Download, Zap, ExternalLink, ChevronLeft, ChevronRight, ArrowLeft, Copy, Check, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { ImageTextReplicationPanel } from "./ImageTextReplicationPanel";
import { toProxyUrl, toProxyImgUrl, toProxyMediaUrl } from "@/lib/mediaProxy";
import { chooseBestMediaUrl, isLikelyBlockedXhsUrl } from "@/lib/viralReferenceMedia";

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
};

interface ViralReferenceModalProps {
  item: ViralReferenceItemData | null;
  onClose: () => void;
}

type BreakdownView = 'idle' | 'loading' | 'done' | 'failed';

type BreakdownSegment = {
  order?: number;
  time_range?: string;
  original_script?: string;
  dialogue_vo_zh?: string;
  visual_description?: string;
  visual_content_description?: string;
  camera_notes?: string;
  [key: string]: unknown;
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

function formatSegmentsAsText(segments: BreakdownSegment[]): string {
  return segments
    .map((seg, idx) => {
      const order = seg.order ?? idx + 1;
      const time = seg.time_range ? ` [${seg.time_range}]` : "";
      const script = seg.original_script || seg.dialogue_vo_zh || "";
      const visual = seg.visual_description || seg.visual_content_description || "";
      const camera = seg.camera_notes || "";
      const parts = [`【第${order}幕${time}】`];
      if (script) parts.push(`台词：${script}`);
      if (visual) parts.push(`画面：${visual}`);
      if (camera) parts.push(`镜头：${camera}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

export function ViralReferenceModal({ item, onClose }: ViralReferenceModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showImageTextPanel, setShowImageTextPanel] = useState(false);
  const [breakdownView, setBreakdownView] = useState<BreakdownView>('idle');
  const [breakdownSegments, setBreakdownSegments] = useState<BreakdownSegment[]>([]);
  const [pollingScriptId, setPollingScriptId] = useState<string | null>(null);

  if (!item) return null;

  const normalizedMediaUrls = normalizeMediaList(item.mediaUrls);
  const preferredCoverImage = chooseBestMediaUrl(item.coverUrl, normalizedMediaUrls);
  const platformId = (item.platform || '').toLowerCase();
  const isTiktok = platformId === 'tiktok';

  // Check rawPayload.type first — XHS image posts can have a videoUrl (livePhoto/cover)
  // but should still be treated as image content.
  // Normalize to lowercase to handle "Video"/"Image" variants (e.g. from Instagram Apify).
  const rawType = (() => {
    try {
      const p = typeof item.rawPayload === 'string' ? JSON.parse(item.rawPayload) : item.rawPayload;
      const t = (p as any)?.type ?? (p as any)?.data?.type ?? null;
      return typeof t === 'string' ? t.toLowerCase() : null;
    } catch { return null; }
  })();
  // XHS CDN heuristic: /spectrum/1040g0k0 prefix = video note cover
  const coverIndicatesVideo = typeof item.coverUrl === 'string' && /\/spectrum\/1040g0k0/i.test(item.coverUrl);
  const isVideo = isTiktok
    ? true
    : rawType === 'video'
    ? true
    : rawType === 'image' || rawType === 'normal'
    ? false
    : coverIndicatesVideo
    ? true
    : !!item.videoUrl;

  // Image list (only used when no video)
  const baseImageCandidates = normalizedMediaUrls.length ? normalizedMediaUrls : (preferredCoverImage ? [preferredCoverImage] : []);
  const accessibleImages = baseImageCandidates.filter((url) => !isLikelyBlockedXhsUrl(url));
  const imageList = Array.from(new Set((accessibleImages.length ? accessibleImages : baseImageCandidates)));
  if (imageList.length === 0 && preferredCoverImage) {
    imageList.push(preferredCoverImage);
  }
  const hasMultipleImages = imageList.length > 1;
  const currentImage = imageList[currentImageIndex] ?? null;

  const goPrevImage = () =>
    setCurrentImageIndex((prev) => (prev - 1 + imageList.length) % imageList.length);
  const goNextImage = () =>
    setCurrentImageIndex((prev) => (prev + 1) % imageList.length);

  const buildProxyUrl = (url: string, filename: string) => toProxyUrl(url, filename);
  const buildProxyImgUrl = (url: string) => toProxyImgUrl(url);
  const buildProxyMediaUrl = (url: string) => toProxyMediaUrl(url);

  const handleDownload = async () => {
    const rawUrl = isVideo ? item.videoUrl : currentImage;
    if (!rawUrl) {
      toast.error("没有可下载的内容");
      return;
    }
    const ext = isVideo ? "mp4" : "jpg";
    const filename = `${item.title || item.sourceId}.${ext}`;
    const a = document.createElement("a");
    a.href = buildProxyUrl(rawUrl, filename);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pollBreakdown = useCallback(async (scriptId: string) => {
    try {
      const res = await fetch(`/api/scripts/${scriptId}/status`);
      if (!res.ok) return;
      const json = await res.json();
      const { status, breakdown } = json.data ?? {};
      if (status === 'completed' && breakdown) {
        const segments: BreakdownSegment[] =
          breakdown.scene_breakdown ?? breakdown.segments ?? [];
        setBreakdownSegments(segments);
        setBreakdownView('done');
        setPollingScriptId(null);
      } else if (status === 'failed' || status === 'error') {
        setBreakdownView('failed');
        setPollingScriptId(null);
        toast.error("拆解失败，请稍后重试");
      }
    } catch {
      // ignore transient errors, keep polling
    }
  }, []);

  useEffect(() => {
    if (!pollingScriptId || breakdownView !== 'loading') return;
    const interval = setInterval(() => pollBreakdown(pollingScriptId), 3000);
    return () => clearInterval(interval);
  }, [pollingScriptId, breakdownView, pollBreakdown]);

  const handleBreakdown = async () => {
    if (!isVideo) {
      setShowImageTextPanel(true);
      return;
    }
    setBreakdownView('loading');
    try {
      // Create script + trigger storyboard breakdown in one call
      const scriptRes = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title || `参考视频 ${item.sourceId}`,
          videoUrl: item.videoUrl,
          description: item.description ?? undefined,
          scriptPurpose: 'storyboard',
        }),
      });
      if (!scriptRes.ok) {
        const err = await scriptRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "创建记录失败");
      }
      const { data: { scriptId } } = await scriptRes.json();

      // Start polling for breakdown result
      setPollingScriptId(scriptId);
    } catch (error) {
      console.error("Breakdown failed:", error);
      toast.error(error instanceof Error ? error.message : "操作失败，请稍后重试");
      setBreakdownView('idle');
    }
  };

  const displayAuthor = item.creator?.displayName || item.creator?.creatorHandle || "未知作者";

  // ── Breakdown results panel (right side) ──
  const renderBreakdownPanel = () => {
    const originalText = item.description || item.title || "";
    const segmentsText = formatSegmentsAsText(breakdownSegments);
    const fullText = [originalText && `【原文】\n${originalText}`, segmentsText && `【拆解】\n${segmentsText}`]
      .filter(Boolean).join("\n\n");

    return (
      <>
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            type="button"
            onClick={() => { setBreakdownView('idle'); setBreakdownSegments([]); setPollingScriptId(null); }}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">爆款拆解结果</h3>
          {fullText && <CopyButton text={fullText} className="ml-auto" />}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Original text */}
          {originalText && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">原文</span>
                <CopyButton text={originalText} />
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                {originalText}
              </p>
            </div>
          )}

          {/* Segments */}
          {breakdownSegments.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  场景拆解 · {breakdownSegments.length} 幕
                </span>
                <CopyButton text={segmentsText} />
              </div>
              <div className="space-y-3">
                {breakdownSegments.map((seg, idx) => {
                  const order = seg.order ?? idx + 1;
                  const script = seg.original_script || seg.dialogue_vo_zh || "";
                  const visual = seg.visual_description || seg.visual_content_description || "";
                  const camera = seg.camera_notes || "";
                  const segText = [script && `台词：${script}`, visual && `画面：${visual}`, camera && `镜头：${camera}`].filter(Boolean).join("\n");
                  return (
                    <div key={idx} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          第{order}幕{seg.time_range ? ` · ${seg.time_range}` : ""}
                        </span>
                        {segText && <CopyButton text={segText} />}
                      </div>
                      {script && <p className="text-xs text-gray-700 dark:text-gray-300 mb-1">💬 {script}</p>}
                      {visual && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">🎬 {visual}</p>}
                      {camera && <p className="text-xs text-gray-400 dark:text-gray-500">📷 {camera}</p>}
                    </div>
                  );
                })}
              </div>
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
                src={buildProxyMediaUrl(item.videoUrl)}
                poster={!isTiktok && preferredCoverImage ? buildProxyImgUrl(preferredCoverImage) : undefined}
                controls
                playsInline
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
                    src={buildProxyImgUrl(currentImage)}
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
                        src={buildProxyImgUrl(url)}
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
          ) : breakdownView === 'loading' ? (
            /* Loading state */
            <>
              <div className="flex items-center gap-3 p-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { setBreakdownView('idle'); setPollingScriptId(null); }}
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">爆款拆解</h3>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  AI 正在拆解视频内容…<br />
                  <span className="text-xs">通常需要 30–90 秒，请稍候</span>
                </p>
              </div>
            </>
          ) : breakdownView === 'done' ? (
            renderBreakdownPanel()
          ) : (
            /* Default info view */
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
                {item.description && (
                  <div className="flex items-start gap-1">
                    <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {item.description}
                    </p>
                    <CopyButton text={item.description} />
                  </div>
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
              <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  下载
                </button>
                <button
                  type="button"
                  onClick={handleBreakdown}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold transition-all shadow-md"
                >
                  <Zap className="w-4 h-4" />
                  {isVideo ? "爆款拆解" : "图文复刻"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
