"use client";

/* eslint-disable @next/next/no-img-element -- Modal displays proxied remote media and carousel thumbnails */

import { useState } from "react";
import { X, Download, Zap, ExternalLink, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ImageTextReplicationPanel } from "./ImageTextReplicationPanel";
import { useTenant } from "@/hooks/useTenant";
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

export function ViralReferenceModal({ item, onClose }: ViralReferenceModalProps) {
  const router = useRouter();
  const { basePath } = useTenant();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isReplicating, setIsReplicating] = useState(false);
  const [showImageTextPanel, setShowImageTextPanel] = useState(false);

  if (!item) return null;

  const normalizedMediaUrls = normalizeMediaList(item.mediaUrls);
  const preferredCoverImage = chooseBestMediaUrl(item.coverUrl, normalizedMediaUrls);
  const platformId = (item.platform || '').toLowerCase();
  const isTiktok = platformId === 'tiktok';

  // Check rawPayload.type first — XHS image posts can have a videoUrl (livePhoto/cover)
  // but should still be treated as image content
  const rawType = (() => {
    try {
      const p = typeof item.rawPayload === 'string' ? JSON.parse(item.rawPayload) : item.rawPayload;
      return (p as any)?.type ?? (p as any)?.data?.type ?? null;
    } catch { return null; }
  })();
  // XHS CDN heuristic: /spectrum/1040g0k0 prefix = video note cover
  const coverIndicatesVideo = typeof item.coverUrl === 'string' && /\/spectrum\/1040g0k0/i.test(item.coverUrl);
  const isVideo = isTiktok
    ? true
    : rawType === 'video'
    ? true
    : rawType === 'image'
    ? false
    : coverIndicatesVideo
    ? true
    : (!!item.videoUrl && (!item.mediaUrls || (item.mediaUrls as string[]).length === 0));

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
    // For video: download the video file. For images: download current image.
    const rawUrl = isTiktok ? item.videoUrl : (isVideo ? item.videoUrl : currentImage);
    if (!rawUrl) {
      toast.error("没有可下载的内容");
      return;
    }
    const ext = isVideo ? "mp4" : "jpg";
    const filename = `${item.title || item.sourceId}.${ext}`;
    // Route through server proxy to avoid CORS restrictions on CDN URLs
    const a = document.createElement("a");
    a.href = isTiktok ? rawUrl : buildProxyUrl(rawUrl, filename);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleReplicate = async () => {
    if (!isVideo) {
      // Open image-text replication panel inline
      setShowImageTextPanel(true);
      return;
    }

    setIsReplicating(true);
    try {
      // Create a new script template from the video reference, then trigger breakdown
      const response = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title || `参考视频 ${item.sourceId}`,
          videoUrl: item.videoUrl,
          description: item.description ?? undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "创建模板失败");
      }

      // Jump to "My Templates" tab on the scripts page — the new template will appear there
      onClose();
      router.push(`${basePath}/scripts?tab=my-templates`);
    } catch (error) {
      console.error("Replication failed:", error);
      toast.error(error instanceof Error ? error.message : "操作失败，请稍后重试");
      setIsReplicating(false);
    }
  };

  const displayAuthor = item.creator?.displayName || item.creator?.creatorHandle || "未知作者";

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

        {/* ── Right side: author, content, stats, buttons ── */}
        <div className="w-full md:w-1/2 flex flex-col" style={{ maxHeight: "90vh" }}>
          {showImageTextPanel ? (
            <>
              {/* Image-text replication panel header */}
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
              {/* Panel content */}
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
          ) : (
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
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {item.description}
                  </p>
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
                  onClick={handleReplicate}
                  disabled={isReplicating}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                >
                  {isReplicating ? (
                    <span className="animate-spin text-base">⏳</span>
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {isReplicating ? "跳转中..." : "爆款复刻"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
