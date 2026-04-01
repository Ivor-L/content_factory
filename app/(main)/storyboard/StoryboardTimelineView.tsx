"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useTransition,
  type CSSProperties,
} from "react";
import { useTheme } from "next-themes";
import { Save, RotateCcw, RefreshCcw, Play, Pause, Volume2, VolumeX, Film, ChevronDown } from "lucide-react";
import { toast } from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { useSidebarAutoCollapse } from "@/hooks/useSidebarAutoCollapse";
import { StoryboardPageHeader } from "./[id]/components/StoryboardPageHeader";
import {
  buildTimelineFromSegments,
  cloneTimeline,
  findVideoTrack,
  mergeTimelineWithSegments,
  sanitizeTimelineForSave,
  type SegmentForTimeline,
  type StoryboardTimelineClip,
  type StoryboardTimelineData,
  type StoryboardTimelineTrack,
} from "@/lib/storyboardTimeline";
import { saveStoryboardTimeline } from "@/app/actions/storyboard-timeline";

type StoryboardSegment = {
  id: string;
  order: number;
  duration: number;
  timeRange?: string | null;
  imagePrompt?: string | null;
  videoPrompt?: string | null;
  generatedImage?: string | null;
  generatedVideo?: string | null;
};

type StoryboardTimelineViewProps = {
  initialTask: {
    id: string;
    status: string;
    product?: { name?: string | null; images?: string | null } | null;
    segments: StoryboardSegment[];
    timeline?: unknown;
  };
  mode?: 'page' | 'embedded';
};

const MIN_DURATION = 0.5;
const SNAP_THRESHOLD = 0.1;

const clampStart = (value: number) => (Number.isFinite(value) && value >= 0 ? value : 0);
const clampDuration = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return MIN_DURATION;
  return Math.max(MIN_DURATION, value);
};
const roundSeconds = (value: number) => Math.round(value * 1000) / 1000;

const snapValue = (value: number, targets: Array<number | undefined>) => {
  let snapped = value;
  let bestDiff = SNAP_THRESHOLD + 0.00001;
  targets.forEach((target) => {
    if (target == null || !Number.isFinite(target)) return;
    const diff = Math.abs(value - target);
    if (diff <= bestDiff) {
      bestDiff = diff;
      snapped = target;
    }
  });
  return snapped;
};

const getAssetUrl = (segment?: SegmentForTimeline, clip?: StoryboardTimelineClip) => {
  if (segment?.generatedVideo) return segment.generatedVideo;
  if (segment?.generatedImage) return segment.generatedImage;
  return clip?.assetUrl ?? null;
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
};

export function StoryboardTimelineView({ initialTask, mode = 'page' }: StoryboardTimelineViewProps) {
  const { t } = useLanguage();
  const storyboardCopy = t.storyboard?.manual;
  const isEmbedded = mode === 'embedded';
  useSidebarAutoCollapse(mode === 'page', true);
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === 'dark';

  const orderedSegments = useMemo<SegmentForTimeline[]>(() => {
    return [...initialTask.segments]
      .sort((a, b) => a.order - b.order)
      .map((segment) => ({
        id: segment.id,
        order: segment.order,
        duration: segment.duration,
        timeRange: segment.timeRange,
        imagePrompt: segment.imagePrompt,
        videoPrompt: segment.videoPrompt,
        generatedImage: segment.generatedImage,
        generatedVideo: segment.generatedVideo,
      }));
  }, [initialTask.segments]);

  const segmentMap = useMemo(() => {
    return new Map(orderedSegments.map((segment) => [segment.id, segment]));
  }, [orderedSegments]);

  const hydratedTimeline = useMemo(() => {
    return mergeTimelineWithSegments(initialTask.timeline, orderedSegments);
  }, [initialTask.timeline, orderedSegments]);

  const [timeline, setTimeline] = useState<StoryboardTimelineData>(hydratedTimeline);
  const [savedSnapshot, setSavedSnapshot] = useState<StoryboardTimelineData>(hydratedTimeline);
  const [isPending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingClip, setIsDraggingClip] = useState<string | null>(null);
  const [isResizingClip, setIsResizingClip] = useState<{ clipId: string; edge: 'left' | 'right' } | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartValue, setDragStartValue] = useState(0);
  const [dragStartDuration, setDragStartDuration] = useState(0);
  const [isPortraitPreview, setIsPortraitPreview] = useState(false);
  const [volume, setVolume] = useState(0.7);

  const timelineRef = useRef<HTMLDivElement>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const clipDragMovedRef = useRef(false);

  const orderedTrackEntries = useMemo(() => {
    return timeline.tracks.map((track) => ({
      track,
      orderedClips: [...(track?.clips ?? [])].sort((a, b) =>
        a.start === b.start ? a.id.localeCompare(b.id) : a.start - b.start
      ),
    }));
  }, [timeline.tracks]);

  const videoTrackEntry =
    orderedTrackEntries.find((entry) => entry.track.type === 'video') ?? orderedTrackEntries[0];
  const orderedVideoClips = useMemo(() => videoTrackEntry?.orderedClips ?? [], [videoTrackEntry]);

  const clipContextMap = useMemo(() => {
    const map = new Map<
      string,
      { trackId: string; trackType: StoryboardTimelineTrack['type']; orderedClips: StoryboardTimelineClip[]; index: number }
    >();
    orderedTrackEntries.forEach(({ track, orderedClips }) => {
      orderedClips.forEach((clip, index) => {
        map.set(clip.id, { trackId: track.id, trackType: track.type, orderedClips, index });
      });
    });
    return map;
  }, [orderedTrackEntries]);

  const currentClip = useMemo(() => {
    return orderedVideoClips.find(
      (clip) => currentTime >= clip.start && currentTime < clip.start + clip.duration
    );
  }, [currentTime, orderedVideoClips]);
  const currentSegment = currentClip ? segmentMap.get(currentClip.segmentId) : undefined;
  const currentClipIndex = currentClip
    ? orderedVideoClips.findIndex((clip) => clip.id === currentClip.id)
    : -1;
  const currentPrompt =
    currentSegment?.videoPrompt ||
    currentSegment?.imagePrompt ||
    currentClip?.prompt ||
    "暂无提示词";

  useEffect(() => {
    setIsPortraitPreview(false);
  }, [currentClip?.id]);

  const getClipById = useCallback(
    (clipId: string) => {
      const context = clipContextMap.get(clipId);
      if (!context) return undefined;
      return context.orderedClips[context.index];
    },
    [clipContextMap]
  );

  const getNeighborTimes = useCallback(
    (clipId: string) => {
      const context = clipContextMap.get(clipId);
      if (!context) {
        return { prevEnd: 0, nextStart: Infinity };
      }
      const prev = context.index > 0 ? context.orderedClips[context.index - 1] : null;
      const next =
        context.index < context.orderedClips.length - 1
          ? context.orderedClips[context.index + 1]
          : null;
      return {
        prevEnd: prev ? roundSeconds(prev.start + prev.duration) : 0,
        nextStart: next ? roundSeconds(next.start) : Infinity,
      };
    },
    [clipContextMap]
  );

  const getSegmentDurationLimit = useCallback(
    (clipId: string) => {
      const clip = getClipById(clipId);
      if (!clip) return Infinity;
      const segment = segmentMap.get(clip.segmentId);
      const raw = Number(segment?.duration);
      if (Number.isFinite(raw) && raw > 0) {
        return raw;
      }
      return Infinity;
    },
    [getClipById, segmentMap]
  );

  const constrainClipStart = useCallback(
    (clipId: string, proposedStart: number, durationOverride?: number) => {
      const clip = getClipById(clipId);
      if (!clip) return clampStart(proposedStart);
      const duration = durationOverride ?? clip.duration;
      const { prevEnd, nextStart } = getNeighborTimes(clipId);
      let minStart = prevEnd;
      let maxStart = Number.isFinite(nextStart) ? nextStart - duration : Infinity;
      if (Number.isFinite(maxStart) && maxStart < minStart) {
        maxStart = minStart;
      }
      let nextValue = clampStart(proposedStart);
      if (Number.isFinite(maxStart)) {
        nextValue = Math.min(nextValue, maxStart);
      }
      nextValue = Math.max(nextValue, minStart);
      const timelineSnapTarget = Number.isFinite(timeline.totalDuration)
        ? roundSeconds(Math.max(0, timeline.totalDuration - duration))
        : undefined;
      nextValue = snapValue(nextValue, [minStart, Number.isFinite(maxStart) ? maxStart : undefined, 0, timelineSnapTarget]);
      return roundSeconds(nextValue);
    },
    [getClipById, getNeighborTimes, timeline.totalDuration]
  );

  const constrainClipDuration = useCallback(
    (clipId: string, proposedDuration: number, startOverride?: number) => {
      const clip = getClipById(clipId);
      if (!clip) return clampDuration(proposedDuration);
      const start = startOverride ?? clip.start;
      const { nextStart } = getNeighborTimes(clipId);
      const segmentLimit = getSegmentDurationLimit(clipId);
      const maxByNeighbor = Number.isFinite(nextStart) ? Math.max(0, nextStart - start) : Infinity;
      let allowedMax = Math.min(segmentLimit, maxByNeighbor);
      if (!Number.isFinite(allowedMax)) {
        allowedMax = Number.isFinite(segmentLimit) ? segmentLimit : maxByNeighbor;
      }
      if (!Number.isFinite(allowedMax)) {
        allowedMax = Infinity;
      }
      allowedMax = Math.max(allowedMax, MIN_DURATION);
      let duration = clampDuration(proposedDuration);
      if (Number.isFinite(allowedMax)) {
        duration = Math.min(duration, allowedMax);
      }
      const end = start + duration;
      const snapTargets = [
        Number.isFinite(nextStart) ? nextStart : undefined,
        Number.isFinite(segmentLimit) ? start + segmentLimit : undefined,
      ];
      const snappedEnd = snapValue(end, snapTargets);
      if (snappedEnd > start) {
        const snappedDuration = clampDuration(snappedEnd - start);
        duration = Number.isFinite(allowedMax) ? Math.min(snappedDuration, allowedMax) : snappedDuration;
      }
      duration = Math.min(duration, allowedMax);
      duration = Math.max(duration, MIN_DURATION);
      return roundSeconds(duration);
    },
    [getClipById, getNeighborTimes, getSegmentDurationLimit]
  );

  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentTime(prev => {
          const next = prev + 0.1;
          if (next >= timeline.totalDuration) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }, 100);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, timeline.totalDuration]);

  const pixelsToTime = useCallback((pixels: number) => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, pixels / rect.width));
    return ratio * timeline.totalDuration;
  }, [timeline.totalDuration]);

  const handleClipMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (clipDragMovedRef.current) {
      clipDragMovedRef.current = false;
      return;
    }
    if (isResizingClip || isDraggingPlayhead) return;
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(timeline.totalDuration, pixelsToTime(x)));
    setCurrentTime(time);
    clipDragMovedRef.current = false;
  }, [isResizingClip, isDraggingPlayhead, pixelsToTime, timeline.totalDuration]);

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (isDraggingPlayhead || isDraggingClip || isResizingClip) return;
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = pixelsToTime(x);
    setCurrentTime(time);
  }, [isDraggingPlayhead, isDraggingClip, isResizingClip, pixelsToTime]);

  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingPlayhead(true);
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = Math.max(0, Math.min(timeline.totalDuration, pixelsToTime(x)));
      setCurrentTime(time);
    };

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPlayhead, pixelsToTime, timeline.totalDuration]);

  const recalcDuration = useCallback((draft: StoryboardTimelineData) => {
    const maxEnd = Math.max(
      ...draft.tracks.flatMap((track) =>
        track.clips.map((clip) => roundSeconds(clip.start + clip.duration))
      ),
      MIN_DURATION
    );
    draft.totalDuration = maxEnd;
  }, []);

  const snapFollowingClips = useCallback((draft: StoryboardTimelineData, changedClipId: string) => {
    const targetTrack = draft.tracks.find((track) =>
      track.clips.some((clip) => clip.id === changedClipId)
    );
    if (!targetTrack || targetTrack.type !== 'video') return;
    const sorted = [...targetTrack.clips].sort((a, b) =>
      a.start === b.start ? a.id.localeCompare(b.id) : a.start - b.start
    );
    const startIndex = sorted.findIndex((clip) => clip.id === changedClipId);
    if (startIndex < 0) return;
    let cursor = roundSeconds(sorted[startIndex].start + sorted[startIndex].duration);
    const updates = new Map<string, number>();
    for (let i = startIndex + 1; i < sorted.length; i += 1) {
      const clip = sorted[i];
      if (Math.abs(clip.start - cursor) > SNAP_THRESHOLD) {
        updates.set(clip.id, roundSeconds(cursor));
      }
      cursor = roundSeconds(cursor + clip.duration);
    }
    if (!updates.size) return;
    draft.tracks = draft.tracks.map((track) => {
      if (track.id !== targetTrack.id) return track;
      return {
        ...track,
        clips: track.clips.map((clip) => {
          const nextStart = updates.get(clip.id);
          if (nextStart == null) return clip;
          return {
            ...clip,
            start: nextStart,
          };
        }),
      };
    });
  }, []);

  const updateClip = useCallback(
    (clipId: string, updater: (clip: StoryboardTimelineClip) => StoryboardTimelineClip) => {
      setTimeline((current) => {
        const next = cloneTimeline(current);
        let updated = false;
        next.tracks = next.tracks.map((track) => {
          const clips = track.clips.map((clip) => {
            if (clip.id !== clipId) return clip;
            updated = true;
            return updater(clip);
          });
          return { ...track, clips };
        });
        if (updated) {
          snapFollowingClips(next, clipId);
          recalcDuration(next);
          setDirty(true);
        }
        return updated ? next : current;
      });
    },
    [recalcDuration, snapFollowingClips]
  );

  const handleClipMouseDown = useCallback((clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    clipDragMovedRef.current = false;
    setIsDraggingClip(clipId);
    setDragStartX(e.clientX);
    const clip = getClipById(clipId);
    if (clip) {
      setDragStartValue(clip.start);
    }
  }, [getClipById]);

  useEffect(() => {
    if (!isDraggingClip) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStartX;
      const deltaTime = (deltaX / rect.width) * timeline.totalDuration;
      if (!clipDragMovedRef.current && Math.abs(deltaTime) > 0.0005) {
        clipDragMovedRef.current = true;
      }
      const newStart = Math.max(0, dragStartValue + deltaTime);
      const safeStart = constrainClipStart(isDraggingClip, newStart);

      updateClip(isDraggingClip, (clip) => ({
        ...clip,
        start: safeStart,
      }));
    };

    const handleMouseUp = () => {
      clipDragMovedRef.current = false;
      setIsDraggingClip(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingClip, dragStartX, dragStartValue, timeline.totalDuration, updateClip, constrainClipStart]);

  const handleResizeMouseDown = useCallback((clipId: string, edge: 'left' | 'right', e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizingClip({ clipId, edge });
    setDragStartX(e.clientX);
    const clip = getClipById(clipId);
    if (clip) {
      setDragStartValue(clip.start);
      setDragStartDuration(clip.duration);
    }
  }, [getClipById]);

  useEffect(() => {
    if (!isResizingClip) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStartX;
      const deltaTime = (deltaX / rect.width) * timeline.totalDuration;
      updateClip(isResizingClip.clipId, (clip) => {
        if (isResizingClip.edge === 'left') {
          const endTime = dragStartValue + dragStartDuration;
          const tentativeStart = Math.max(0, dragStartValue + deltaTime);
          const tentativeDuration = clampDuration(roundSeconds(endTime - tentativeStart));
          const safeStart = constrainClipStart(isResizingClip.clipId, tentativeStart, tentativeDuration);
          const durationAfterStart = clampDuration(roundSeconds(endTime - safeStart));
          const safeDuration = constrainClipDuration(isResizingClip.clipId, durationAfterStart, safeStart);
          return {
            ...clip,
            start: safeStart,
            duration: safeDuration,
          };
        } else {
          const tentativeDuration = clampDuration(roundSeconds(dragStartDuration + deltaTime));
          const safeDuration = constrainClipDuration(isResizingClip.clipId, tentativeDuration, clip.start);
          return {
            ...clip,
            duration: safeDuration,
          };
        }
      });
    };

    const handleMouseUp = () => {
      setIsResizingClip(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingClip, dragStartX, dragStartValue, dragStartDuration, timeline.totalDuration, updateClip, constrainClipStart, constrainClipDuration]);

  const refreshFromServer = useCallback(() => {
    setTimeline(savedSnapshot);
    setDirty(false);
  }, [savedSnapshot]);

  const rebuildFromSegments = useCallback(() => {
    const rebuilt = buildTimelineFromSegments(orderedSegments);
    setTimeline(rebuilt);
    setDirty(true);
  }, [orderedSegments]);

  const handleSave = useCallback(() => {
    startTransition(async () => {
      try {
        const sanitized = sanitizeTimelineForSave(timeline);
        await saveStoryboardTimeline({
          taskId: initialTask.id,
          timeline: sanitized,
        });
        setTimeline(sanitized);
        setSavedSnapshot(sanitized);
        setDirty(false);
        toast.success(t.common.success);
      } catch (error) {
        console.error(error);
        toast.error(t.common.error);
      }
    });
  }, [initialTask.id, timeline, t.common.success, t.common.error]);

  // Merge / stitch video
  const [mergeLoading, setMergeLoading] = useState(false);
  const [showMergeMenu, setShowMergeMenu] = useState(false);
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [subtitleTemplate, setSubtitleTemplate] = useState("jianying");

  const hasVideos = orderedSegments.some((s) => s.generatedVideo);
  const SUBTITLE_OPTIONS = [
    { id: "jianying", label: "剪映风格" },
    { id: "minimal", label: "简约风格" },
    { id: "dramatic", label: "戏剧风格" },
    { id: "modern", label: "现代风格" },
    { id: "elegant", label: "优雅风格" },
  ];

  const handleMerge = useCallback(async () => {
    setMergeLoading(true);
    setShowMergeMenu(false);
    try {
      const videoTrack = findVideoTrack(timeline);
      const segmentIds = (videoTrack?.clips || [])
        .map((clip) => clip.segmentId)
        .filter(Boolean) as string[];

      const res = await fetch(`/api/storyboard/${initialTask.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segmentIds: segmentIds.length > 0 ? segmentIds : undefined,
          enableSubtitles,
          subtitleTemplate: enableSubtitles ? subtitleTemplate : undefined,
        }),
      });
      if (!res.ok) throw new Error("Merge failed");
      toast.success("视频拼接已开始，完成后将自动通知");
    } catch {
      toast.error("拼接失败，请重试");
    } finally {
      setMergeLoading(false);
    }
  }, [initialTask.id, timeline, enableSubtitles, subtitleTemplate]);

  const headerTitle = initialTask.product?.name || storyboardCopy?.timelinePreviewTitle || "Timeline";

  const containerClass = isEmbedded
    ? 'rounded-3xl bg-white/95 text-gray-900 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-gray-900/80 dark:text-white'
    : cn(
        'min-h-screen transition-colors',
        isDarkTheme ? 'bg-[#050505] text-white' : 'text-[var(--tenant-primary-strong,#1f1600)]'
      );
  const containerStyle: CSSProperties | undefined = isEmbedded
    ? undefined
    : isDarkTheme
    ? {
        backgroundImage:
          "radial-gradient(circle at top right, rgba(255,255,255,0.06) 0%, transparent 55%), radial-gradient(circle at bottom left, rgba(255,255,255,0.04) 0%, transparent 45%)",
        backgroundColor: "#050505",
      }
    : {
        backgroundImage:
          "radial-gradient(circle at top right, var(--tenant-primary-soft, rgba(255,255,255,0.9)) 0%, transparent 55%), radial-gradient(circle at bottom left, var(--tenant-primary-muted, rgba(31,22,0,0.18)) 0%, transparent 45%)",
        backgroundColor: "var(--tenant-primary-soft, #f5f6fa)",
      };
  const mainWrapper = isEmbedded
    ? 'px-4 pb-4 -mt-1.5'
    : 'mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-10 -mt-1.5';
  const contentTextClass = isEmbedded ? 'text-gray-900 dark:text-white' : isDarkTheme ? 'text-white' : 'text-[var(--tenant-primary-strong,#1f1600)]';
  const basePanelClass = 'rounded-[32px] border backdrop-blur-sm shadow-theme-glow';
  const panelLight = 'bg-white/95 border-[var(--tenant-primary-muted)]';
  const panelDark = 'bg-[#0a0a0a]/85 border-white/10 text-white';
  const topSectionClass = cn(
    'grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr]',
    isEmbedded ? '' : cn(basePanelClass, isDarkTheme ? panelDark : panelLight, 'p-6')
  );
  const timelineSectionClass = cn(
    'space-y-3',
    isEmbedded ? '' : cn(basePanelClass, isDarkTheme ? panelDark : panelLight, 'p-6')
  );
  const previewCardClass = cn(
    'relative w-full overflow-hidden rounded-2xl border flex items-center justify-center text-white transition-colors',
    isEmbedded
      ? 'border-white/15 bg-black/80'
      : isDarkTheme
      ? 'border-white/10 bg-[#050505]/95 shadow-[0_25px_60px_rgba(0,0,0,0.65)]'
      : 'border-[var(--tenant-primary-muted)] bg-[var(--tenant-primary,#000)]/90 shadow-theme-glow'
  );
  const promptPanelClass = cn(
    'mt-2 rounded-2xl text-sm leading-relaxed p-4 flex-1 overflow-y-auto max-h-64 border backdrop-blur-sm',
    isEmbedded
      ? 'bg-white/70 text-gray-900 dark:bg-white/5 dark:text-white/90 border-white/20'
      : isDarkTheme
      ? 'bg-[#0f0f10]/80 text-white border-white/10 shadow-inner'
      : 'bg-[var(--tenant-primary-soft,#f4f4f5)] text-[var(--tenant-primary-strong,#1f1600)] border-[var(--tenant-primary-muted)] shadow-inner'
  );

  // Timeline action buttons rendered in shared header's rightExtra slot
  const timelineActions = mode === 'page' ? (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={rebuildFromSegments}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
      >
        <RefreshCcw className="h-3.5 w-3.5" />
        重置
      </button>
      <button
        type="button"
        onClick={refreshFromServer}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        撤回
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || !dirty}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
          dirty && !isPending
            ? "border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20"
            : "border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-400 dark:text-white/30 cursor-not-allowed opacity-50"
        )}
      >
        <Save className="h-3.5 w-3.5" />
        {isPending ? "保存中..." : "保存"}
      </button>

      {/* Merge button */}
      <div className="relative">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden">
          <button
            type="button"
            onClick={handleMerge}
            disabled={!hasVideos || mergeLoading}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
              hasVideos && !mergeLoading
                ? "bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 hover:bg-gray-50 dark:hover:bg-white/10"
                : "bg-white dark:bg-white/5 text-gray-400 dark:text-white/30 cursor-not-allowed opacity-50"
            )}
          >
            <Film className="h-3.5 w-3.5" />
            {mergeLoading ? "拼接中..." : "拼接成片"}
          </button>
          <button
            type="button"
            onClick={() => setShowMergeMenu((v) => !v)}
            disabled={!hasVideos || mergeLoading}
            className={cn(
              "flex items-center px-2 py-1.5 border-l border-gray-200 dark:border-white/10 transition-colors",
              hasVideos && !mergeLoading
                ? "text-gray-400 dark:text-white/40 hover:bg-gray-50 dark:hover:bg-white/10"
                : "text-gray-300 dark:text-white/20 cursor-not-allowed opacity-50"
            )}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {showMergeMenu && (
          <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-3 z-50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">添加字幕</span>
              <button
                type="button"
                onClick={() => setEnableSubtitles((v) => !v)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  enableSubtitles ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
                )}
              >
                <span className={cn(
                  "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                  enableSubtitles ? "translate-x-4" : "translate-x-0.5"
                )} />
              </button>
            </div>
            {enableSubtitles && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">字幕样式</p>
                {SUBTITLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSubtitleTemplate(opt.id)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors",
                      subtitleTemplate === opt.id
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 font-medium"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={handleMerge}
              disabled={mergeLoading}
              className="w-full py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium rounded-lg transition hover:bg-gray-700 dark:hover:bg-gray-100"
            >
              确认拼接
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className={containerClass} style={containerStyle}>
      {mode !== 'embedded' && (
        <StoryboardPageHeader
          taskId={initialTask.id}
          taskName={headerTitle}
          activeTab="timeline"
          isTerminal={true}
          rightExtra={timelineActions}
        />
      )}

      <main className={`${mainWrapper} space-y-6 ${contentTextClass}`}>
        <section className={topSectionClass}>
          <div className={cn(
            'flex flex-col gap-4 p-2',
            isEmbedded ? 'text-gray-900 dark:text-white' : 'text-[var(--tenant-primary-strong,#1f1600)]'
          )}>
            <p className={cn('text-xs uppercase tracking-[0.3em]', isEmbedded ? 'text-gray-500 dark:text-white/60' : 'text-gray-400')}>当前片段</p>
            <h2 className="mt-2 text-xl font-semibold">
              {currentClip ? currentClip.label || `片段 ${currentClipIndex + 1}` : "尚未选择片段"}
            </h2>
            <p className={cn('text-xs mt-1', isEmbedded ? 'text-gray-500 dark:text-white/60' : 'text-gray-500')}>
              {currentClip
                ? `${formatTime(currentClip.start)} - ${formatTime(currentClip.start + currentClip.duration)}`
                : "00:00.0 - 00:00.0"}
            </p>
            <div className={cn('mt-4 grid grid-cols-2 gap-3 text-xs', isEmbedded ? 'text-gray-500 dark:text-white/60' : 'text-gray-500')}>
              <div>
                <p className="uppercase tracking-[0.2em]">序号</p>
                <p className={cn('mt-1 text-sm', isEmbedded ? 'text-gray-900 dark:text-white' : 'text-gray-900')}>
                  {currentClipIndex >= 0 ? `分镜 ${currentClipIndex + 1}` : "--"}
                </p>
              </div>
              <div>
                <p className="uppercase tracking-[0.2em]">时长</p>
                <p className={cn('mt-1 text-sm', isEmbedded ? 'text-gray-900 dark:text-white' : 'text-gray-900')}>
                  {currentClip ? `${currentClip.duration.toFixed(1)}s` : "--"}
                </p>
              </div>
            </div>
            <div className={promptPanelClass}>
              {currentPrompt}
            </div>
          </div>
          <div className={previewCardClass}>
            <div className="relative w-full pb-[56.25%]">
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--tenant-primary,#000)]/90">
                {currentClip ? (
                  <PreviewContent
                    clip={currentClip}
                    segment={currentSegment}
                    currentTime={currentTime}
                    volume={volume}
                    onRatioChange={(portrait) => setIsPortraitPreview(portrait)}
                  />
                ) : (
                  <div className={cn('text-lg font-medium', isEmbedded || isPortraitPreview ? 'text-white' : 'text-[var(--tenant-primary-strong,#1f1600)]/60')}>无内容</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className={timelineSectionClass}>
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-4 text-sm",
              isEmbedded
                ? "px-2 text-gray-900 dark:text-white"
                : cn(
                    "rounded-2xl border px-4 py-3 shadow-sm",
                    isDarkTheme
                      ? "border-white/10 bg-[#0b0b0c]/85 text-white"
                      : "border-[var(--tenant-primary-muted)] bg-white/85 text-[var(--tenant-primary-strong,#1f1600)]"
                  )
            )}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full transition",
                  isEmbedded
                    ? "bg-[var(--tenant-primary)]/15 text-[var(--tenant-primary-strong,#1f1600)] hover:bg-[var(--tenant-primary)]/25 dark:bg-white/10 dark:text-white"
                    : "bg-[var(--tenant-primary,#facc15)] text-[var(--tenant-primary-foreground,#1f1600)] hover:bg-[var(--tenant-primary-hover,#f1c40f)]"
                )}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <div className="flex flex-col">
                <span
                  className={cn(
                    "font-mono text-xl tracking-tight",
                    "text-[var(--tenant-primary-strong,#1f1600)]",
                    isEmbedded ? "dark:text-white" : "opacity-100"
                  )}
                >
                  {formatTime(currentTime)}
                </span>
                <span
                  className={cn(
                    "font-mono text-xs opacity-70",
                    isEmbedded ? "text-gray-500 dark:text-white/70" : "text-[var(--tenant-primary-strong,#1f1600)]"
                  )}
                >
                  {formatTime(timeline.totalDuration)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {volume <= 0.01 ? (
                <VolumeX
                  className={cn(
                    "h-4 w-4 opacity-70",
                    isEmbedded
                      ? "text-[var(--tenant-primary-strong,#1f1600)] dark:text-white/70"
                      : isDarkTheme
                      ? "text-white/70"
                      : "text-[var(--tenant-primary-strong,#1f1600)]"
                  )}
                />
              ) : (
                <Volume2
                  className={cn(
                    "h-4 w-4",
                    isEmbedded
                      ? "text-[var(--tenant-primary-strong,#1f1600)] dark:text-white"
                      : isDarkTheme
                      ? "text-white"
                      : "text-[var(--tenant-primary-strong,#1f1600)]"
                  )}
                />
              )}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                className="w-32"
                style={{ accentColor: "var(--tenant-primary, #facc15)" }}
              />
              <span
                className={cn(
                  "w-10 text-right font-mono text-xs",
                  isEmbedded
                    ? "text-gray-600 dark:text-white/70"
                    : isDarkTheme
                    ? "text-white/80"
                    : "text-[var(--tenant-primary-strong,#1f1600)]"
                )}
              >
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>

          <div className="relative h-5">
            {Array.from({ length: Math.ceil(timeline.totalDuration / 5) + 1 }).map((_, i) => {
              const time = i * 5;
              if (time > timeline.totalDuration) return null;
              return (
                <div
                  key={i}
                  className="absolute top-0 flex flex-col items-center"
                  style={{ left: `${(time / timeline.totalDuration) * 100}%` }}
                >
                  <div className={cn('w-px h-2', isEmbedded ? 'bg-gray-300 dark:bg-white/30' : 'bg-gray-300 dark:bg-gray-700')} />
                  <span className={cn('text-xs mt-1', isEmbedded ? 'text-gray-500 dark:text-white/60' : 'text-gray-500 dark:text-gray-400')}>
                    {formatTime(time)}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            ref={timelineRef}
            className={cn(
              'relative rounded-3xl cursor-pointer select-none border',
              isEmbedded
                ? 'bg-gray-100/80 dark:bg-white/5 border-white/15'
                : isDarkTheme
                ? 'bg-[#090909]/90 border-white/10 shadow-[0_15px_40px_rgba(0,0,0,0.55)]'
                : 'bg-white/95 border-[var(--tenant-primary-muted)] shadow-theme-glow backdrop-blur-sm'
            )}
            onClick={handleTimelineClick}
          >
            <div className="flex flex-col gap-3 p-3">
              {orderedTrackEntries.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white/70 py-6 text-center text-xs text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
                  暂无轨道
                </div>
              )}
              {orderedTrackEntries.map(({ track, orderedClips }) => (
                <div
                  key={track.id}
                  className={cn(
                    'relative h-20 rounded-xl border overflow-hidden',
                    track.type === 'video'
                      ? isDarkTheme
                        ? 'bg-[#0f0f10]/85 border-white/10'
                        : 'bg-white/95 border-[var(--tenant-primary-muted)]'
                      : isDarkTheme
                        ? 'bg-[#141414]/70 border-white/10'
                        : 'bg-[var(--tenant-primary-soft,#f4f4f5)] border-[var(--tenant-primary-muted)]/70'
                  )}
                >
                  <div className="absolute left-3 top-2 z-10 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-white/50">
                    {track.name ||
                      (track.type === 'video'
                        ? '视频轨道'
                        : track.type === 'audio'
                        ? '音频轨道'
                        : '叠加轨道')}
                  </div>
                  {orderedClips.map((clip) => {
                    const left = timeline.totalDuration
                      ? (clip.start / timeline.totalDuration) * 100
                      : 0;
                    const width = timeline.totalDuration
                      ? (clip.duration / timeline.totalDuration) * 100
                      : 0;
                    const segment = segmentMap.get(clip.segmentId);
                    const assetUrl = getAssetUrl(segment, clip);
                    return (
                      <div
                        key={clip.id}
                        className={cn(
                          "absolute top-4 bottom-2 rounded overflow-hidden cursor-move group",
                          track.type === 'video'
                            ? isEmbedded
                              ? 'border border-gray-300 bg-white shadow-sm dark:border-white/30 dark:bg-white/10'
                              : isDarkTheme
                              ? 'border border-white/10 bg-[#0a0a0a] shadow-[0_15px_35px_rgba(0,0,0,0.4)]'
                              : 'border border-[var(--tenant-primary-muted)] bg-white/95 shadow-[0_8px_18px_rgba(15,23,42,0.08)]'
                            : isDarkTheme
                            ? 'border border-dashed border-white/15 bg-[#151515]/70'
                            : 'border border-dashed border-[var(--tenant-primary-muted)]/60 bg-[var(--tenant-primary-soft,#f4f4f5)]/70'
                        )}
                        style={{
                          left: `${Math.max(0, left)}%`,
                          width: `${Math.max(2, width)}%`,
                          minWidth: '32px'
                        }}
                        onMouseDown={(e) => handleClipMouseDown(clip.id, e)}
                        onMouseUp={handleClipMouseUp}
                      >
                        <div
                          className={cn(
                            "absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity z-10",
                            isEmbedded ? 'bg-gray-400 dark:bg-white/70' : 'bg-gray-400'
                          )}
                          onMouseDown={(e) => handleResizeMouseDown(clip.id, 'left', e)}
                        />
                        <div
                          className={cn(
                            "absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity z-10",
                            isEmbedded ? 'bg-gray-400 dark:bg-white/70' : 'bg-gray-400'
                          )}
                          onMouseDown={(e) => handleResizeMouseDown(clip.id, 'right', e)}
                        />

                        {assetUrl && (
                          <img
                            src={assetUrl}
                            alt=""
                            className="w-full h-full object-cover pointer-events-none"
                          />
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex flex-col justify-end p-2 pointer-events-none">
                          <div className="text-white text-xs font-medium truncate">
                            {clip.label || `片段 ${clip.id.slice(-4)}`}
                          </div>
                          <div className="text-white/80 text-xs">
                            {clip.duration.toFixed(1)}s
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div
              className={cn('absolute top-0 bottom-0 w-0.5 z-20 pointer-events-none', isEmbedded ? 'bg-gray-700 dark:bg-white' : 'bg-red-500')}
              style={{ left: `${(currentTime / timeline.totalDuration) * 100}%` }}
            >
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 rounded-full cursor-ew-resize pointer-events-auto"
                onMouseDown={handlePlayheadMouseDown}
              />
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                {formatTime(currentTime)}
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}

function PreviewContent({
  clip,
  segment,
  currentTime,
  volume,
  onRatioChange,
}: {
  clip: StoryboardTimelineClip;
  segment?: SegmentForTimeline;
  currentTime: number;
  volume: number;
  onRatioChange?: (isPortrait: boolean) => void;
}) {
  const assetUrl = getAssetUrl(segment, clip);
  const videoRef = useRef<HTMLVideoElement>(null);
  const derivedAssetType = useMemo<'image' | 'video' | null>(() => {
    if (segment?.generatedVideo) return 'video';
    if (segment?.generatedImage) return 'image';
    if (clip.assetUrl) return clip.assetType || 'image';
    return null;
  }, [clip.assetType, clip.assetUrl, segment?.generatedImage, segment?.generatedVideo]);
  const reportRatio = useCallback(
    (width: number, height: number) => {
      if (!width || !height) return;
      onRatioChange?.(height >= width);
    },
    [onRatioChange]
  );

  useEffect(() => {
    if (videoRef.current && derivedAssetType === 'video') {
      const clipTime = currentTime - clip.start;
      if (Math.abs(videoRef.current.currentTime - clipTime) > 0.5) {
        videoRef.current.currentTime = Math.max(0, clipTime);
      }
    }
  }, [currentTime, clip.start, derivedAssetType]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = volume;
    videoRef.current.muted = volume <= 0.001;
  }, [volume]);

  useEffect(() => {
    onRatioChange?.(false);
  }, [assetUrl, onRatioChange]);

  const handleVideoMetadata = useCallback(() => {
    if (!videoRef.current) return;
    reportRatio(videoRef.current.videoWidth, videoRef.current.videoHeight);
  }, [reportRatio]);

  const handleImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      reportRatio(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
    },
    [reportRatio]
  );

  if (assetUrl && derivedAssetType === 'video') {
    return (
      <video
        ref={videoRef}
        src={assetUrl}
        className="w-full h-full object-contain"
        muted={volume <= 0.001}
        onLoadedMetadata={handleVideoMetadata}
      />
    );
  }

  if (assetUrl && derivedAssetType === 'image') {
    return (
      <img
        src={assetUrl}
        alt=""
        className="w-full h-full object-contain"
        onLoad={handleImageLoad}
      />
    );
  }

  const prompt = segment?.videoPrompt || segment?.imagePrompt || clip.prompt;
  return (
    <div className="w-full h-full flex items-center justify-center p-12">
      <p className="text-white text-3xl text-center leading-relaxed">
        {prompt || "无内容"}
      </p>
    </div>
  );
}
