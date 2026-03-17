"use client";

/* eslint-disable @next/next/no-img-element -- timeline view shows user-provided remote previews */

import { useMemo, useState, useTransition, useCallback } from "react";
import { RefreshCcw, Save, RotateCcw, Clock3, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  buildTimelineFromSegments,
  cloneTimeline,
  findVideoTrack,
  mergeTimelineWithSegments,
  sanitizeTimelineForSave,
  type SegmentForTimeline,
  type StoryboardTimelineClip,
  type StoryboardTimelineData,
} from "@/lib/storyboardTimeline";
import { formatStoryboardRange, formatStoryboardTimestamp } from "@/lib/storyboardTime";
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
};

const MIN_DURATION = 0.5;

const clampStart = (value: number) => (Number.isFinite(value) && value >= 0 ? value : 0);
const clampDuration = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return MIN_DURATION;
  return Math.max(MIN_DURATION, value);
};

const roundSeconds = (value: number) => Math.round(value * 1000) / 1000;

const getAssetUrl = (segment?: SegmentForTimeline, clip?: StoryboardTimelineClip) => {
  if (segment?.generatedVideo) return segment.generatedVideo;
  if (segment?.generatedImage) return segment.generatedImage;
  return clip?.assetUrl ?? null;
};

export function StoryboardTimelineView({ initialTask }: StoryboardTimelineViewProps) {
  const { t } = useLanguage();
  const storyboardCopy = t.storyboard?.manual;

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

  const refreshFromServer = useCallback(() => {
    setTimeline(savedSnapshot);
    setDirty(false);
  }, [savedSnapshot]);

  const rebuildFromSegments = useCallback(() => {
    const rebuilt = buildTimelineFromSegments(orderedSegments);
    setTimeline(rebuilt);
    setDirty(true);
  }, [orderedSegments]);

  const recalcDuration = useCallback((draft: StoryboardTimelineData) => {
    const maxEnd = Math.max(
      ...draft.tracks.flatMap((track) =>
        track.clips.map((clip) => roundSeconds(clip.start + clip.duration))
      ),
      MIN_DURATION
    );
    draft.totalDuration = maxEnd;
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
          recalcDuration(next);
          setDirty(true);
        }
        return updated ? next : current;
      });
    },
    [recalcDuration]
  );

  const handleNumericChange = useCallback(
    (clipId: string, field: "start" | "duration", value: number) => {
      updateClip(clipId, (clip) => {
        if (field === "start") {
          return { ...clip, start: clampStart(value) };
        }
        return { ...clip, duration: clampDuration(value) };
      });
    },
    [updateClip]
  );

  const handleLabelChange = useCallback(
    (clipId: string, label: string) => {
      updateClip(clipId, (clip) => ({ ...clip, label: label.trim().slice(0, 80) || clip.label }));
    },
    [updateClip]
  );

  const handlePromptChange = useCallback(
    (clipId: string, prompt: string) => {
      updateClip(clipId, (clip) => ({ ...clip, prompt }));
    },
    [updateClip]
  );

  const snapToPrevious = useCallback(
    (clipId: string) => {
      const track = findVideoTrack(timeline);
      if (!track) return;
      const sorted = [...track.clips].sort((a, b) => (a.start === b.start ? a.id.localeCompare(b.id) : a.start - b.start));
      const index = sorted.findIndex((clip) => clip.id === clipId);
      if (index <= 0) return;
      const prev = sorted[index - 1];
      handleNumericChange(clipId, "start", roundSeconds(prev.start + prev.duration));
    },
    [timeline, handleNumericChange]
  );

  const videoTrack = useMemo(() => findVideoTrack(timeline), [timeline]);
  const orderedClips = useMemo(() => {
    return [...(videoTrack?.clips ?? [])].sort((a, b) => (a.start === b.start ? a.id.localeCompare(b.id) : a.start - b.start));
  }, [videoTrack]);

  const timelineBars = useMemo(() => {
    return orderedClips.map((clip) => {
      const left = (clip.start / timeline.totalDuration) * 100;
      const width = (clip.duration / timeline.totalDuration) * 100;
      return {
        clip,
        left: Math.min(Math.max(left, 0), 100),
        width: Math.max(width, 4),
      };
    });
  }, [orderedClips, timeline.totalDuration]);

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

  const headerTitle = initialTask.product?.name || storyboardCopy?.timelinePreviewTitle || "Timeline";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gray-400">
            {storyboardCopy?.timelinePreviewTitle || "Timeline preview"}
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{headerTitle}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {storyboardCopy?.subtitle || "Adjust clip timing before rendering."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={rebuildFromSegments}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <RefreshCcw className="h-4 w-4" />
            {storyboardCopy?.viewTimeline || "Auto rebuild"}
          </button>
          <button
            type="button"
            onClick={refreshFromServer}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <RotateCcw className="h-4 w-4" />
            {storyboardCopy?.closeTimeline || "Reset to saved"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || orderedClips.length === 0 || !dirty}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white",
              isPending || orderedClips.length === 0 || !dirty
                ? "bg-gray-400/70 cursor-not-allowed"
                : "bg-gray-900 hover:bg-black"
            )}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isPending ? t.common.loading : t.common.save ?? "Save"}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/40 p-6 space-y-4">
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
          <span>{videoTrack?.clips.length || 0} clips</span>
          <span>
            {formatStoryboardTimestamp(0)} – {formatStoryboardTimestamp(timeline.totalDuration)}
          </span>
        </div>
        <div className="relative h-20 rounded-2xl bg-gray-50 dark:bg-gray-800 overflow-hidden">
          {timelineBars.map(({ clip, left, width }) => (
            <motion.div
              key={clip.id}
              className="absolute top-3 bottom-3 rounded-xl bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-200 text-xs text-white dark:text-black px-3 py-2 flex flex-col justify-between"
              style={{ left: `${left}%`, width: `${width}%`, minWidth: "80px" }}
              layout
            >
              <span className="font-semibold truncate">{clip.label || `Clip ${clip.id.slice(-4)}`}</span>
              <span className="text-[11px] opacity-80">
                {roundSeconds(clip.start).toFixed(2)}s – {roundSeconds(clip.start + clip.duration).toFixed(2)}s
              </span>
            </motion.div>
          ))}
          <div className="absolute bottom-1 left-0 right-0 flex justify-between px-4 text-[11px] text-gray-500 dark:text-gray-400">
            <span>0s</span>
            <span>{timeline.totalDuration.toFixed(2)}s</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Drag handles are coming soon. For now, edit numeric fields below to fine-tune start times and durations.
        </p>
      </div>

      <div className="space-y-4">
        {orderedClips.map((clip, index) => {
          const segment = segmentMap.get(clip.segmentId);
          const assetUrl = getAssetUrl(segment, clip);
          const displayRange = formatStoryboardRange(clip.start, clip.start + clip.duration);
          return (
            <div
              key={clip.id}
              className="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-5 space-y-4"
            >
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-white dark:text-black font-semibold">
                    {index + 1}
                  </span>
                  {index < orderedClips.length - 1 && (
                    <span className="w-px flex-1 bg-gray-200 dark:bg-gray-700" />
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        {storyboardCopy?.prompt || "Scene"}
                      </p>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {clip.label || segment?.videoPrompt || segment?.imagePrompt || `Shot ${index + 1}`}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{displayRange}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => snapToPrevious(clip.id)}
                      disabled={index === 0}
                      className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Clock3 className="h-4 w-4" />
                      Snap to previous
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <div className="w-32 h-32 rounded-2xl bg-gray-50 dark:bg-gray-800 overflow-hidden flex items-center justify-center text-xs text-gray-400">
                      {assetUrl ? (
                        <img src={assetUrl} alt={clip.label || `clip-${index + 1}`} className="h-full w-full object-cover" />
                      ) : (
                        <span>No asset</span>
                      )}
                    </div>
                    <div className="flex-1 grid gap-4 md:grid-cols-2">
                      <label className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                        <span>Label</span>
                        <input
                          type="text"
                          value={clip.label || ""}
                          onChange={(event) => handleLabelChange(clip.id, event.target.value)}
                          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                          placeholder={`Shot ${index + 1}`}
                        />
                      </label>
                      <label className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                        <span>Prompt hint</span>
                        <textarea
                          value={clip.prompt || segment?.videoPrompt || segment?.imagePrompt || ""}
                          onChange={(event) => handlePromptChange(clip.id, event.target.value)}
                          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm min-h-[80px]"
                          placeholder="Camera notes, shot idea…"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                  <span>Start (s)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={roundSeconds(clip.start)}
                    onChange={(event) => handleNumericChange(clip.id, "start", Number(event.target.value))}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                  <span>Duration (s)</span>
                  <input
                    type="number"
                    min={MIN_DURATION}
                    step="0.1"
                    value={roundSeconds(clip.duration)}
                    onChange={(event) => handleNumericChange(clip.id, "duration", Number(event.target.value))}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                  <span>Asset type</span>
                  <input
                    type="text"
                    value={clip.assetType}
                    readOnly
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm cursor-not-allowed"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
