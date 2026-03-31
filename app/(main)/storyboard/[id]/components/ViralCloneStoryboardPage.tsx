"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { cn } from "@/lib/utils";
import { AiGlowSpinner } from "@/components/AiGlowSpinner";
import { SegmentRow, type SegmentData } from "./SegmentRow";
import { StoryboardPageHeader } from "./StoryboardPageHeader";
import { supabase } from "@/lib/supabaseClient";

function extractProductImages(images: unknown): string[] {
  if (!images) return [];
  try {
    const parsed = typeof images === "string" ? JSON.parse(images) : images;
    if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === "string" && u.length > 0);
    if (typeof parsed === "string" && parsed.length > 0) return [parsed];
  } catch {
    if (typeof images === "string" && images.length > 0) return [images];
  }
  return [];
}

interface StoryboardTask {
  id: string;
  name?: string | null;
  status: string;
  progress: number;
  replicationMode: string;
  imageModel: string | null;
  videoModel: string | null;
  finalVideoUrl: string | null;
  scriptContent?: string | null;
  product?: { id: string; name: string; images?: any } | null;
  character?: { id: string; name: string; avatar: string } | null;
  segments: SegmentData[];
}

interface ViralCloneStoryboardPageProps {
  task: StoryboardTask;
}

const STATUS_STEPS = [
  { key: "BREAKDOWN_PENDING", label: "等待拆解", step: 1 },
  { key: "BREAKDOWN_PROCESSING", label: "拆解中", step: 1 },
  { key: "BREAKDOWN_COMPLETED", label: "拆解完成", step: 2 },
  { key: "IMAGE_GENERATING", label: "生成首帧图", step: 3 },
  { key: "IMAGE_GENERATION_COMPLETED", label: "首帧图就绪", step: 4 },
  { key: "VIDEO_GENERATING", label: "生成视频", step: 5 },
  { key: "VIDEO_GENERATION_COMPLETED", label: "视频就绪", step: 6 },
  { key: "MERGING", label: "拼接中", step: 7 },
  { key: "COMPLETED", label: "已完成", step: 8 },
  { key: "BREAKDOWN_FAILED", label: "拆解失败", step: -1 },
  { key: "MERGE_FAILED", label: "拼接失败", step: -1 },
];

const GENERATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function getStatusInfo(status: string) {
  return STATUS_STEPS.find((s) => s.key === status) || { key: status, label: status, step: 0 };
}

async function readErrorMessage(res: Response): Promise<string | null> {
  try {
    const data = await res.json();
    if (data && typeof data === "object") {
      if (typeof (data as any).message === "string" && (data as any).message.trim()) {
        return (data as any).message.trim();
      }
      if (typeof (data as any).error === "string" && (data as any).error.trim()) {
        return (data as any).error.trim();
      }
    }
  } catch {
    // ignore JSON parse issues
  }
  return null;
}

type TriggerResult = {
  segment_id?: string;
  success?: boolean;
  error?: string;
};

function parseTriggerResults(raw: unknown): { successIds: Set<string>; failed: TriggerResult[] } {
  const list: TriggerResult[] = Array.isArray(raw) ? (raw as TriggerResult[]) : [];
  const successIds = new Set<string>();
  const failed: TriggerResult[] = [];
  list.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const segmentId = typeof item.segment_id === "string" ? item.segment_id : "";
    if (item.success) {
      if (segmentId) successIds.add(segmentId);
    } else {
      failed.push({
        segment_id: segmentId,
        success: false,
        error: typeof item.error === "string" ? item.error : undefined,
      });
    }
  });
  return { successIds, failed };
}

const BREAKDOWN_LOADING_MESSAGES = [
  "AI 正在读取视频...",
  "AI 正在拆解分镜...",
  "AI 正在学习构图...",
  "AI 正在改写文案...",
  "AI 正在撰写图片提示词...",
  "AI 正在撰写视频提示词...",
];

type TypewriterPhase = "typing" | "pausing" | "deleting";

interface TypewriterOptions {
  typeDelay?: number;
  deleteDelay?: number;
  holdDelay?: number;
  gapDelay?: number;
}

function useTypewriterLoop(messages: readonly string[], options?: TypewriterOptions) {
  const { typeDelay = 70, deleteDelay = 28, holdDelay = 1400, gapDelay = 250 } = options ?? {};
  const [state, setState] = useState<{ index: number; length: number; phase: TypewriterPhase }>({
    index: 0,
    length: 0,
    phase: "typing",
  });

  useEffect(() => {
    if (!messages.length) return;
    setState({ index: 0, length: 0, phase: "typing" });
  }, [messages.length]);

  const displayText = messages.length ? messages[state.index]?.slice(0, state.length) ?? "" : "";

  useEffect(() => {
    if (!messages.length) return;
    const current = messages[state.index] ?? "";
    let timer: number | undefined;

    if (state.phase === "typing") {
      if (state.length < current.length) {
        timer = window.setTimeout(() => {
          setState((prev) => ({ ...prev, length: prev.length + 1 }));
        }, typeDelay);
      } else {
        timer = window.setTimeout(() => {
          setState((prev) => ({ ...prev, phase: "pausing" }));
        }, holdDelay);
      }
    } else if (state.phase === "pausing") {
      timer = window.setTimeout(() => {
        setState((prev) => ({ ...prev, phase: "deleting" }));
      }, gapDelay);
    } else {
      if (state.length > 0) {
        timer = window.setTimeout(() => {
          setState((prev) => ({ ...prev, length: Math.max(0, prev.length - 1) }));
        }, deleteDelay);
      } else {
        timer = window.setTimeout(() => {
          setState((prev) => ({
            index: messages.length ? (prev.index + 1) % messages.length : 0,
            length: 0,
            phase: "typing",
          }));
        }, gapDelay);
      }
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [messages, state, typeDelay, deleteDelay, holdDelay, gapDelay]);

  return displayText;
}

function BreakdownLoadingMessage() {
  const text = useTypewriterLoop(BREAKDOWN_LOADING_MESSAGES);
  const safeText = text || "\u00A0";
  return (
    <p className="mt-1 flex min-h-[1.25rem] items-center justify-center gap-1 text-sm text-gray-500 dark:text-white/40">
      <span>{safeText}</span>
      <span className="h-4 w-0.5 animate-pulse bg-current" />
    </p>
  );
}

export function ViralCloneStoryboardPage({ task: initialTask }: ViralCloneStoryboardPageProps) {
  const router = useRouter();
  const [task, setTask] = useState(initialTask);
  const [segments, setSegments] = useState<SegmentData[]>(initialTask.segments || []);
  const [regenImageLoading, setRegenImageLoading] = useState<Record<string, boolean>>({});
  const [regenVideoLoading, setRegenVideoLoading] = useState<Record<string, boolean>>({});
  const [batchImageLoading, setBatchImageLoading] = useState(false);
  const [batchVideoLoading, setBatchVideoLoading] = useState(false);
  const [videoModel, setVideoModel] = useState("veo3.1-fast");
  const [imageModel, setImageModel] = useState("nano-banana-pro");
  const [generatingTimedOut, setGeneratingTimedOut] = useState(false);
  const generatingStartRef = useRef<number | null>(null);

  // isPollingTerminal: only stop polling/subscriptions when the task is truly done.
  // generatingTimedOut should only re-enable buttons, NOT stop polling.
  const isPollingTerminal = task.status === "COMPLETED" || task.status === "BREAKDOWN_FAILED" || task.status === "MERGE_FAILED";
  const isTerminal = isPollingTerminal || generatingTimedOut;
  const isBreakdownDone = ["BREAKDOWN_COMPLETED", "IMAGE_GENERATING", "IMAGE_GENERATION_COMPLETED", "VIDEO_GENERATING", "VIDEO_GENERATION_COMPLETED", "MERGING", "COMPLETED"].includes(task.status);
  const allImagesReady = segments.length > 0 && segments.every((s) => s.status === "IMAGE_READY" || s.status.startsWith("VIDEO_"));
  const allVideosReady = segments.length > 0 && segments.every((s) => s.status === "VIDEO_READY");
  const hasAnyImage = segments.some((s) => s.generatedImage);
  const hasAnyVideo = segments.some((s) => s.generatedVideo);
  const fetchLatestStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/storyboard/${task.id}/status`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const latest = json?.data;
      if (!latest) return;
      setTask((prev) => ({
        ...prev,
        status: latest.status,
        progress: typeof latest.progress === "number" ? latest.progress : prev.progress,
        imageModel: latest.imageModel ?? prev.imageModel,
        videoModel: latest.videoModel ?? prev.videoModel,
        finalVideoUrl: latest.finalVideoUrl ?? prev.finalVideoUrl,
      }));
      if (Array.isArray(latest.segments)) {
        setSegments(latest.segments as SegmentData[]);
      }
    } catch (error) {
      console.warn("[storyboard] Failed to fetch latest status", error);
    }
  }, [task.id]);

  useEffect(() => {
    if (isPollingTerminal) return;

    const channel = supabase
      .channel(`storyboard-${task.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "storyboard_tasks", filter: `id=eq.${task.id}` },
        (payload) => {
          const data = payload.new as { status: string; progress: number };
          setTask((prev) => ({ ...prev, status: data.status, progress: data.progress || 0 }));
          if (data.status === "COMPLETED" || data.status === "BREAKDOWN_FAILED") {
            router.refresh();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "storyboard_segments", filter: `task_id=eq.${task.id}` },
        (payload) => {
          const updated = payload.new as SegmentData;
          setSegments((prev) =>
            prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isPollingTerminal, task.id, router]);

  useEffect(() => {
    if (isPollingTerminal) return;
    void fetchLatestStatus();
  }, [fetchLatestStatus, isPollingTerminal]);

  // Timeout detection: if stuck in generating state for too long, re-enable buttons
  useEffect(() => {
    if (task.status !== "IMAGE_GENERATING" && task.status !== "VIDEO_GENERATING") {
      generatingStartRef.current = null;
      setGeneratingTimedOut(false);
      return;
    }
    if (!generatingStartRef.current) generatingStartRef.current = Date.now();
    const remaining = GENERATION_TIMEOUT_MS - (Date.now() - generatingStartRef.current);
    if (remaining <= 0) { setGeneratingTimedOut(true); return; }
    const timer = setTimeout(() => setGeneratingTimedOut(true), remaining);
    return () => clearTimeout(timer);
  }, [task.status]);

  const handleBatchGenerateImages = async () => {
    setBatchImageLoading(true);
    setGeneratingTimedOut(false);
    generatingStartRef.current = null;
    try {
      const res = await fetch(`/api/storyboard/${task.id}/generate-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: imageModel || task.imageModel || "nano-banana-pro" }),
      });
      if (!res.ok) {
        const message = await readErrorMessage(res);
        throw new Error(message || "触发生图失败，请重试");
      }
      const data = await res.json();
      const { successIds, failed } = parseTriggerResults(data.results);
      if (successIds.size === 0) {
        const reason = failed[0]?.error || data.message || "触发生图失败，请重试";
        throw new Error(reason);
      }
      setTask((prev) => ({ ...prev, status: "IMAGE_GENERATING" }));
      setSegments((prev) =>
        prev.map((s) => (successIds.has(s.id) ? { ...s, status: "IMAGE_GENERATING" } : s))
      );
      const successMsg = failed.length
        ? `已触发 ${successIds.size} 个分镜（${failed.length} 个失败）`
        : `已触发 ${successIds.size} 个分镜生成首帧图`;
      toast.success(successMsg);
      if (failed.length) {
        toast.error(failed[0]?.error || "部分分镜触发失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "触发生图失败，请重试");
    } finally {
      setBatchImageLoading(false);
    }
  };

  const handleBatchGenerateVideos = async (options?: { allowTextVideo?: boolean; model?: string }) => {
    setBatchVideoLoading(true);
    try {
      const res = await fetch(`/api/storyboard/${task.id}/generate-videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options?.model || videoModel || "veo_3_1-fast",
          allowTextVideo: options?.allowTextVideo ?? false,
        }),
      });
      if (!res.ok) {
        const message = await readErrorMessage(res);
        throw new Error(message || "触发生视频失败，请重试");
      }
      const data = await res.json();
      const { successIds, failed } = parseTriggerResults(data.results);
      if (successIds.size === 0) {
        const reason = failed[0]?.error || data.message || "触发生视频失败，请重试";
        throw new Error(reason);
      }
      setTask((prev) => ({ ...prev, status: "VIDEO_GENERATING" }));
      setSegments((prev) =>
        prev.map((s) => (successIds.has(s.id) ? { ...s, status: "VIDEO_GENERATING" } : s))
      );
      const successMsg = failed.length
        ? `已触发 ${successIds.size} 个分镜（${failed.length} 个失败）`
        : `已触发 ${successIds.size} 个分镜生成视频`;
      toast.success(successMsg);
      if (failed.length) {
        toast.error(failed[0]?.error || "部分分镜触发失败");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "触发生视频失败，请重试");
    } finally {
      setBatchVideoLoading(false);
    }
  };

  const handleRegenImage = async (segmentId: string) => {
    setRegenImageLoading((prev) => ({ ...prev, [segmentId]: true }));
    try {
      const res = await fetch(`/api/storyboard/${task.id}/generate-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segmentIds: [segmentId],
          model: task.imageModel || "nanoBananapro",
        }),
      });
      if (!res.ok) {
        const message = await readErrorMessage(res);
        throw new Error(message || "重新生图失败");
      }
      const data = await res.json();
      const { successIds, failed } = parseTriggerResults(data.results);
      if (!successIds.has(segmentId)) {
        const reason = failed[0]?.error || data.message || "重新生图失败";
        throw new Error(reason);
      }
      toast.success("已重新触发生图");
      setSegments((prev) =>
        prev.map((s) => (s.id === segmentId ? { ...s, status: "IMAGE_GENERATING" } : s))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重新生图失败");
    } finally {
      setRegenImageLoading((prev) => ({ ...prev, [segmentId]: false }));
    }
  };

  const handleRegenVideo = async (segmentId: string, options?: { allowTextVideo?: boolean }) => {
    setRegenVideoLoading((prev) => ({ ...prev, [segmentId]: true }));
    try {
      const res = await fetch(`/api/storyboard/${task.id}/generate-videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segmentIds: [segmentId],
          model: task.videoModel || "veo_3_1-fast",
          allowTextVideo: options?.allowTextVideo ?? false,
        }),
      });
      if (!res.ok) {
        const message = await readErrorMessage(res);
        throw new Error(message || "重新生视频失败");
      }
      const data = await res.json();
      const { successIds, failed } = parseTriggerResults(data.results);
      if (!successIds.has(segmentId)) {
        const reason = failed[0]?.error || data.message || "重新生视频失败";
        throw new Error(reason);
      }
      toast.success("已重新触发生视频");
      setSegments((prev) =>
        prev.map((s) => (s.id === segmentId ? { ...s, status: "VIDEO_GENERATING" } : s))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重新生视频失败");
    } finally {
      setRegenVideoLoading((prev) => ({ ...prev, [segmentId]: false }));
    }
  };

  const handleSegmentUpdated = (segmentId: string, updates: Partial<SegmentData>) => {
    setSegments((prev) =>
      prev.map((s) => s.id === segmentId ? { ...s, ...updates } : s)
    );
  };

  const statusInfo = getStatusInfo(task.status);

  // Sync horizontal scroll between the sticky header row and the data rows
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  const syncScroll = useCallback((source: "header" | "body") => {
    const from = source === "header" ? headerScrollRef.current : bodyScrollRef.current;
    const to   = source === "header" ? bodyScrollRef.current  : headerScrollRef.current;
    if (from && to) to.scrollLeft = from.scrollLeft;
  }, []);
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    // The scrolling ancestor is the <main> element in the layout
    const mainEl = document.querySelector("main");
    if (!mainEl) return;
    const onScroll = () => setIsScrolled(mainEl.scrollTop > 48);
    mainEl.addEventListener("scroll", onScroll, { passive: true });
    return () => mainEl.removeEventListener("scroll", onScroll);
  }, []);

  const imageCount = segments.filter((s) => s.generatedImage).length;
  const videoCount = segments.filter((s) => s.generatedVideo).length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white">{/* ── Header ── */}
      <StoryboardPageHeader
        taskId={task.id}
        taskName={task.name || task.product?.name || task.character?.name || `分镜 ${task.id.slice(-6).toUpperCase()}`}
        activeTab="storyboard"
        isTerminal={isTerminal}
        statusLabel={statusInfo.label}
        progress={task.progress}
        showBatchActions={isBreakdownDone && segments.length > 0}
        allImagesReady={allImagesReady}
        allVideosReady={allVideosReady}
        batchImageLoading={batchImageLoading}
        batchVideoLoading={batchVideoLoading}
        isImageGenerating={task.status === "IMAGE_GENERATING" && !generatingTimedOut}
        isVideoGenerating={task.status === "VIDEO_GENERATING" && !generatingTimedOut}
        onBatchGenerateImages={handleBatchGenerateImages}
        onBatchGenerateVideos={handleBatchGenerateVideos}
        videoModel={videoModel}
        onVideoModelChange={setVideoModel}
        imageModel={imageModel}
        onImageModelChange={setImageModel}
      />

      {/* Breakdown pending state */}
      {(task.status === "BREAKDOWN_PENDING" || task.status === "BREAKDOWN_PROCESSING") && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <AiGlowSpinner size={64} />
          <BreakdownLoadingMessage />
        </div>
      )}

      {/* Breakdown failed */}
      {task.status === "BREAKDOWN_FAILED" && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl border border-red-500/30 bg-red-500/10 flex items-center justify-center text-2xl">
            ❌
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">拆解失败</p>
            <p className="text-sm text-gray-500 dark:text-white/40 mt-1">
              视频拆解过程中出现错误，请返回重新提交。
            </p>
          </div>
        </div>
      )}

      {/* Completed - final video */}
      {task.status === "COMPLETED" && task.finalVideoUrl && (
        <div className="mx-4 mt-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
          <p className="text-sm font-semibold text-green-400 mb-3">最终视频已生成</p>
          <video src={task.finalVideoUrl} controls className="w-full max-w-sm rounded-xl" />
          <a
            href={task.finalVideoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm text-green-400 underline"
          >
            下载视频
          </a>
        </div>
      )}

      {/* Segments table */}
      {segments.length > 0 && (
        <div>
          {/* Sticky header block: summary row + column labels, both in one container */}
          <div className="sticky top-14 z-10 bg-white dark:bg-gray-900 shadow-sm">
            {/* Summary row — collapses on scroll */}
            <div className={cn(
              "overflow-hidden transition-all duration-200 border-b border-gray-200 dark:border-white/10",
              isScrolled ? "max-h-0 opacity-0 border-b-0" : "max-h-10 opacity-100"
            )}>
              <div className="flex items-center gap-4 px-4 py-2 text-xs text-gray-400 dark:text-white/30">
                <span>共 {segments.length} 个分镜</span>
                <span>首帧图: {imageCount}/{segments.length}</span>
                <span>视频: {videoCount}/{segments.length}</span>
              </div>
            </div>

          {/* Column labels */}
            <div
              ref={headerScrollRef}
              onScroll={() => syncScroll("header")}
              className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] border-b border-gray-200 dark:border-white/10"
            >
              <div className="grid grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)_120px_340px_340px] min-w-[960px]">
                <div className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-400 dark:text-white/30 uppercase tracking-wider whitespace-nowrap">口播文案</span>
                </div>
                <div className="px-3 py-2.5 text-xs font-medium text-gray-400 dark:text-white/30 uppercase tracking-wider border-l border-gray-200 dark:border-white/10">图片提示词</div>
                <div className="px-3 py-2.5 text-xs font-medium text-gray-400 dark:text-white/30 uppercase tracking-wider border-l border-gray-200 dark:border-white/10">视频提示词</div>
                <div className="px-3 py-2.5 text-xs font-medium text-gray-400 dark:text-white/30 uppercase tracking-wider border-l border-gray-200 dark:border-white/10">主体参考</div>
                <div className="px-3 py-2.5 text-xs font-medium text-gray-400 dark:text-white/30 uppercase tracking-wider border-l border-gray-200 dark:border-white/10">首帧图</div>
                <div className="px-3 py-2.5 text-xs font-medium text-gray-400 dark:text-white/30 uppercase tracking-wider border-l border-gray-200 dark:border-white/10">视频</div>
              </div>
            </div>
          </div>

          {/* Data rows */}
          <div
            ref={bodyScrollRef}
            onScroll={() => syncScroll("body")}
            className="overflow-x-auto"
          >
            <div className="min-w-[960px]">
              {segments.map((segment) => (
                <SegmentRow
                  key={segment.id}
                  segment={segment}
                  taskId={task.id}
                  imageModel={task.imageModel}
                  videoModel={task.videoModel}
                  productImages={extractProductImages(task.product?.images)}
                  characterAvatar={task.character?.avatar || null}
                  onRegenImage={handleRegenImage}
                  onRegenVideo={handleRegenVideo}
                  onSegmentUpdated={handleSegmentUpdated}
                  isRegenImageLoading={regenImageLoading[segment.id]}
                  isRegenVideoLoading={regenVideoLoading[segment.id]}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
