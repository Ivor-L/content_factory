'use client';

/* eslint-disable @next/next/no-img-element -- Video detail modal surfaces remote thumbnails */

import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { toForcedProxyUrl } from '@/lib/mediaProxy';
import { Download, Share2, Check, ChevronDown, Calendar, Clock, Languages, Monitor, Maximize, Copy, AlertTriangle, Globe, Play } from 'lucide-react';
import { deleteVideos } from "@/app/actions/video";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { useMemo, useState, useRef, useEffect } from "react";

const COUNTRY_LABELS: Record<string, string> = {
  us: 'United States',
  uk: 'United Kingdom',
  ca: 'Canada',
  au: 'Australia',
  de: 'Germany',
  fr: 'France',
  es: 'Spain',
  it: 'Italy',
  jp: 'Japan',
  kr: 'South Korea',
  cn: 'China',
  in: 'India',
  br: 'Brazil',
  mx: 'Mexico',
  ru: 'Russia',
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  zh: 'Chinese',
  es: 'Spanish',
  ru: 'Russian',
  fr: 'French',
  de: 'German',
  jp: 'Japanese',
  ko: 'Korean',
  pt: 'Portuguese',
};

function resolveMediaUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const firstChar = trimmed[0];
    const lastChar = trimmed[trimmed.length - 1];
    if (
      (firstChar === '[' && lastChar === ']') ||
      (firstChar === '{' && lastChar === '}')
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return resolveMediaUrl(parsed);
      } catch {
        // treat as literal URL when JSON parse fails
      }
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const resolved = resolveMediaUrl(entry);
      if (resolved) return resolved;
    }
    return null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return (
      resolveMediaUrl(record.url) ||
      resolveMediaUrl(record.imageUrl) ||
      resolveMediaUrl(record.coverUrl) ||
      resolveMediaUrl(record.thumbnailUrl) ||
      resolveMediaUrl(record.previewUrl) ||
      resolveMediaUrl(record.remoteUrl) ||
      resolveMediaUrl(record.images) ||
      null
    );
  }
  return null;
}

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTouchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || isTouchMac;
}

function toDownloadUrl(url: string, filename: string): string {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(url, base);
    if (parsed.pathname === '/api/proxy/download') {
      parsed.searchParams.set('filename', filename);
      if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
        return `${parsed.pathname}?${parsed.searchParams.toString()}`;
      }
      return parsed.toString();
    }
  } catch {
    // fall through
  }
  return toForcedProxyUrl(url, filename);
}

function triggerDownload(
  rawUrl: string,
  filename: string,
  options?: { preferDirectNavigationOnMobile?: boolean },
) {
  const downloadUrl = toDownloadUrl(rawUrl, filename);
  if (
    options?.preferDirectNavigationOnMobile &&
    typeof window !== 'undefined' &&
    isMobileBrowser()
  ) {
    const opened = window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.assign(downloadUrl);
    }
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.setAttribute('download', filename);
  anchor.setAttribute('target', '_blank');
  anchor.setAttribute('rel', 'noopener noreferrer');
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

interface VideoDetailsModalProps {
  item: any;
  onClose: () => void;
}

export function VideoDetailsModal({ item, onClose }: VideoDetailsModalProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasVideoInteracted, setHasVideoInteracted] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const resultData = useMemo(() => {
    if (!item?.result) return null;
    if (typeof item.result === 'string') {
      try {
        return JSON.parse(item.result || '{}');
      } catch (error) {
        console.warn('Failed to parse replication result JSON', error);
        return null;
      }
    }
    if (typeof item.result === 'object') {
      return item.result;
    }
    return null;
  }, [item?.result]);
  const product = useMemo(() => item.product || {}, [item?.product]);
  const script = useMemo(() => item.script || {}, [item?.script]);
  const videoUrl = resultData?.videoUrl || item.resultUrl || "";
  const downloadUrl = videoUrl || null;

  const isDigitalHuman = item.type === 'LIP_SYNC' || item.type === 'VOICE_CLONE';
  const promptResult = useMemo(() => {
    const raw = resultData?.finalResult ?? resultData?.result ?? null;
    if (!raw) return null;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (error) {
        console.warn('Failed to parse prompt payload JSON', error);
        return { generatedScript: raw };
      }
    }
    return raw;
  }, [resultData]);
  const hasPromptResult = Boolean(
    promptResult &&
      (promptResult.generatedScript || promptResult.videoPrompt || promptResult.shots_count)
  );
  const stage = (resultData?.lastStage || resultData?.stage || '').toString().toLowerCase();
  const resultStatus = (resultData?.status || '').toString().toLowerCase();
  const promptReady =
    hasPromptResult ||
    (!!stage && stage.includes('prompt')) ||
    (!!resultStatus && resultStatus.includes('prompt'));
  const normalizedStatus = (item.status || '').toLowerCase();
  const isCompleted = normalizedStatus === 'completed' || normalizedStatus === 'success';
  const isFailed = normalizedStatus === 'failed' || normalizedStatus === 'error';
  const statusLabel = isCompleted ? t.replication.completed : isFailed ? t.common.error : t.replication.processing;
  const StatusIcon = isCompleted ? Check : isFailed ? AlertTriangle : Clock;

  const inputParams = useMemo(() => {
    if (!item?.inputParams) return null;
    if (typeof item.inputParams === 'string') {
      try {
        return JSON.parse(item.inputParams);
      } catch (error) {
        console.warn('Failed to parse inputParams JSON', error);
        return null;
      }
    }
    return item.inputParams;
  }, [item?.inputParams]);
  const productSnapshot = inputParams?.productSnapshot;
  const scriptSnapshot = inputParams?.scriptSnapshot;
  const previewImageUrl = useMemo(() => {
    return (
      resolveMediaUrl(resultData?.thumbnailUrl) ||
      resolveMediaUrl(resultData?.coverUrl) ||
      resolveMediaUrl(resultData?.coverImage) ||
      resolveMediaUrl(resultData?.imageUrl) ||
      resolveMediaUrl(resultData?.images) ||
      resolveMediaUrl(item.thumbnailUrl) ||
      resolveMediaUrl(item.imageUrl) ||
      resolveMediaUrl(productSnapshot?.coverImage) ||
      resolveMediaUrl(productSnapshot?.thumbnailUrl) ||
      resolveMediaUrl(productSnapshot?.images) ||
      resolveMediaUrl(scriptSnapshot?.coverImage) ||
      resolveMediaUrl(scriptSnapshot?.thumbnailUrl) ||
      resolveMediaUrl(scriptSnapshot?.images) ||
      resolveMediaUrl(product.images) ||
      resolveMediaUrl(script.images) ||
      null
    );
  }, [item.imageUrl, item.thumbnailUrl, productSnapshot, scriptSnapshot, product, script, resultData]);

  useEffect(() => {
    setHasVideoInteracted(false);
    setIsVideoReady(false);
    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.pause();
      try {
        videoElement.currentTime = 0;
      } catch {
        // Ignore seek errors in some browsers
      }
    }
  }, [item?.id, videoUrl]);

  const ratio = resultData?.ratio || "9:16";
  const language =
    (inputParams?.targetLanguage && LANGUAGE_LABELS[inputParams.targetLanguage.toLowerCase()]?.toUpperCase()) ||
    (resultData?.language || "EN");
  const credits = resultData?.credits || (isDigitalHuman ? "10" : "20");
  const createdAt = new Date(item.createdAt).toLocaleDateString();
  const targetCountryLabel =
    inputParams?.targetCountry ? COUNTRY_LABELS[inputParams.targetCountry.toLowerCase()] || inputParams.targetCountry.toUpperCase() : null;
  const quantity = inputParams?.quantity || "1";
  const displayedProductName = productSnapshot?.name || product.name || t.replication.selectProduct;
  const displayedScriptTitle = scriptSnapshot?.title || script.title || t.replication.selectScript;
  
  const parsedBreakdown = useMemo(() => {
    const raw = scriptSnapshot?.breakdown || script.breakdown;
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      console.warn('Failed to parse script breakdown', error);
      return null;
    }
  }, [scriptSnapshot?.breakdown, script.breakdown]);

  const firstScene = parsedBreakdown?.[0] || null;

  const scene1Text = isDigitalHuman 
    ? (item.scriptContent || "No script content.") 
    : (firstScene?.visual || "No script breakdown available.");
  
  const spokenText = isDigitalHuman 
    ? (item.scriptContent || "No audio script.") 
    : (firstScene?.audio || "No script audio available.");
    
  const promptText = isDigitalHuman
    ? (item.type === 'LIP_SYNC' ? "Lip Sync from audio" : "Voice Clone from text")
    : (resultData?.prompt || "A confident young man, appearing to be in his early 20s, with short brown hair and striking green eyes, wearing a dark casual shirt. Context: A modern, clean kitchen with white countertops and light-colored walls, suggesting a home setting.");

  const handleDelete = async () => {
    if (!confirm(t.common.confirmDelete)) return;
    
    setIsDeleting(true);
    try {
      const res = await deleteVideos([item.id]);
      if (res.success) {
        toast.success(t.common.success);
        onClose();
        router.refresh();
      } else {
        toast.error(t.common.error);
      }
    } catch (error) {
      console.error(error);
      toast.error(t.common.error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = () => {
    if (!downloadUrl) {
      toast.error("Video is still processing. Try again later.");
      return;
    }

    try {
      const urlWithoutQuery = downloadUrl.split('?')[0];
      const extension = urlWithoutQuery.includes('.') ? urlWithoutQuery.split('.').pop() : 'mp4';
      triggerDownload(
        downloadUrl,
        `${item.type || 'video'}-${item.id}.${extension}`,
        { preferDirectNavigationOnMobile: true },
      );
    } catch (error) {
      console.error('Failed to download video', error);
      toast.error(t.common.error);
    }
  };

  const handleCopy = async (text?: string) => {
    if (!text) return;
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(text);
      toast.success(t.common.copied || "Copied!");
    } catch (error) {
      console.error('Failed to copy text to clipboard', error);
      toast.error(t.common.error);
    }
  };

  return (
    <div className="flex flex-col h-[calc(85vh-8rem)] overflow-hidden bg-white dark:bg-gray-900 -m-6">
      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
          {/* Left: Video Preview */}
          <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl overflow-hidden flex items-center justify-center relative min-h-[400px] lg:h-full">
            {resultData?.videoUrl ? (
              <video
                src={resultData.videoUrl}
                className="w-full h-full object-contain"
                controls
                autoPlay
                loop
                playsInline
                // iOS Safari: keep native controls inline instead of forcing fullscreen.
                webkit-playsinline="true"
              />
            ) : previewImageUrl ? (
              <img
                src={previewImageUrl}
                alt="preview"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-gray-400 text-center">
                <p>No video available</p>
              </div>
            )}
          </div>

          {/* Right: Info Panels */}
          <div className="flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
            
            {/* Project Info Panel */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t.replication.projectInfo}</h3>
                <span
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1",
                    isCompleted
                      ? "bg-black text-white dark:bg-white dark:text-black"
                      : isFailed
                        ? "bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-200"
                        : "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200"
                  )}
                >
                  <StatusIcon size={12} strokeWidth={3} /> {statusLabel}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                {!isDigitalHuman && (
                  <>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-1">
                        <Maximize size={12} /> {t.replication.ratio}
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-sm">{ratio}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-1">
                        {t.products.title}
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-sm">{displayedProductName}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-1">
                        {t.scripts.title}
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-sm">{displayedScriptTitle}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-1">
                        <Languages size={12} /> {t.replication.language}
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-sm">{language}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-1">
                        <Globe size={12} /> {t.replication.targetCountry || 'Country'}
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-sm">
                        {targetCountryLabel || '--'}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-1">
                        {t.replication.quantity}
                      </div>
                      <div className="font-bold text-gray-900 dark:text-white text-sm">{quantity}</div>
                    </div>
                  </>
                )}
                <div>
                  <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-1">
                    <Calendar size={12} /> {t.replication.createdAt}
                  </div>
                  <div className="font-bold text-gray-900 dark:text-white text-sm" suppressHydrationWarning>{createdAt}</div>
                </div>
              </div>
            </div>

            {/* Prompts Panel */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 flex-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-6">
                {isDigitalHuman ? "Task Parameters" : t.replication.aiPrompts}
              </h3>
              
              {!isDigitalHuman && promptReady && (
                <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 text-amber-900 border border-amber-100 text-xs font-semibold">
                  {t.replication.promptReady}
                </div>
              )}
              
              <div className="space-y-6">
                {isDigitalHuman ? (
                  <>
                    {/* Reference Image */}
                    {item.imageUrl && (
                      <div>
                        <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-2">
                          {t.characters.avatar}
                        </div>
                        <img 
                          src={item.imageUrl} 
                          alt="Reference" 
                          className="w-32 h-32 object-contain rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" 
                        />
                      </div>
                    )}

                    {/* Reference Audio */}
                    {item.audioUrl && (
                      <div>
                        <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-2">
                          {t.characters.voice}
                        </div>
                        <audio controls src={item.audioUrl} className="w-full h-10" />
                      </div>
                    )}

                    {/* Script */}
                    {item.scriptContent && (
                      <div>
                        <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-2">
                          {t.generation.scriptContent}
                        </div>
                        <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">
                          {item.scriptContent}
                        </div>
                      </div>
                    )}
                  </>
                ) : hasPromptResult ? (
                  <>
                    {promptResult?.generatedScript && (
                      <div>
                        <div className="flex items-center justify-between gap-2 text-gray-400 text-[10px] uppercase font-bold mb-2">
                          <span className="flex items-center gap-2">
                            <Monitor size={12} /> {t.replication.generatedScriptLabel}
                          </span>
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white"
                            onClick={() => handleCopy(promptResult.generatedScript)}
                          >
                            <Copy size={12} /> {t.common.copy}
                          </button>
                        </div>
                        <pre className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto custom-scrollbar">{promptResult.generatedScript}</pre>
                      </div>
                    )}

                    {promptResult?.videoPrompt && (
                      <div>
                        <div className="flex items-center justify-between gap-2 text-gray-400 text-[10px] uppercase font-bold mb-2">
                          <span className="flex items-center gap-2">
                            <Share2 size={12} /> {t.replication.videoPromptLabel}
                          </span>
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white"
                            onClick={() => handleCopy(promptResult.videoPrompt)}
                          >
                            <Copy size={12} /> {t.common.copy}
                          </button>
                        </div>
                        <pre className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto custom-scrollbar">{promptResult.videoPrompt}</pre>
                      </div>
                    )}

                    {!promptResult?.generatedScript && !promptResult?.videoPrompt && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t.replication.promptUnavailable}</p>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-[10px] uppercase font-bold mb-2">
                        <Monitor size={12} /> {t.replication.scene} 1
                      </div>
                      <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 italic relative">
                        <span className="absolute top-2 left-2 text-gray-300 text-2xl font-serif">&quot;</span>
                        <p className="pl-4">{spokenText}</p>
                      </div>
                    </div>

                    {resultData?.prompt && (
                      <div>
                        <div className="flex items-center justify-between gap-2 text-gray-400 text-[10px] uppercase font-bold mb-2">
                          <span className="flex items-center gap-2">
                            <Share2 size={12} /> 生图提示词
                          </span>
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white"
                            onClick={() => handleCopy(resultData.prompt)}
                          >
                            <Copy size={12} /> {t.common.copy}
                          </button>
                        </div>
                        <pre className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto custom-scrollbar">{resultData.prompt}</pre>
                      </div>
                    )}

                    {promptReady && (
                      <div className="text-xs font-semibold text-amber-600 dark:text-amber-300">
                        {t.replication.promptUnavailable}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 flex justify-end items-center gap-3 shrink-0 z-10">
        <div className="flex gap-2 mr-auto">
            <button 
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-sm font-medium transition-colors text-red-600 dark:text-red-400"
            >
                {isDeleting ? t.common.loading : t.common.delete}
            </button>
        </div>

        {!isDigitalHuman && (
          <>
            <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors text-gray-700 dark:text-gray-300">
                <Share2 size={16} /> {t.replication.shareTiktok}
            </button>

            <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors text-gray-700 dark:text-gray-300">
                {t.replication.original} 720p <ChevronDown size={16} />
            </button>
          </>
        )}

        <button
          onClick={handleDownload}
          disabled={!downloadUrl}
          className="flex items-center gap-2 px-6 py-2 bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <Download size={16} /> {t.replication.download} 
        </button>
      </div>
    </div>
  );
}
