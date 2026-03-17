import { z } from 'zod';
import {
  DEFAULT_SEGMENT_DURATION,
  normalizeStoryboardSegments,
  type SegmentTimingSource,
} from '@/lib/storyboardTime';

export const storyboardTimelineClipSchema = z.object({
  id: z.string(),
  segmentId: z.string(),
  trackId: z.string(),
  start: z.number().min(0),
  duration: z.number().positive(),
  assetType: z.enum(['image', 'video']).default('image'),
  assetUrl: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
});

export const storyboardTimelineTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['video', 'audio', 'overlay']).default('video'),
  clips: z.array(storyboardTimelineClipSchema),
});

export const storyboardTimelineSchema = z.object({
  version: z.number().int().positive().default(1),
  fps: z.number().positive().default(24),
  totalDuration: z.number().positive().default(DEFAULT_SEGMENT_DURATION),
  tracks: z.array(storyboardTimelineTrackSchema).min(1),
});

export type StoryboardTimelineClip = z.infer<typeof storyboardTimelineClipSchema>;
export type StoryboardTimelineTrack = z.infer<typeof storyboardTimelineTrackSchema>;
export type StoryboardTimelineData = z.infer<typeof storyboardTimelineSchema>;

export const DEFAULT_TIMELINE_VERSION = 1;
export const DEFAULT_TIMELINE_FPS = 24;
export const DEFAULT_TIMELINE_TRACK_ID = 'video-track';
export const MIN_TIMELINE_DURATION = 0.5;

export type SegmentForTimeline = SegmentTimingSource & {
  id: string;
  order?: number | null;
  imagePrompt?: string | null;
  videoPrompt?: string | null;
  generatedImage?: string | null;
  generatedVideo?: string | null;
};

const roundSeconds = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 1000) / 1000);
};

const ensureDuration = (value: number) => {
  const rounded = roundSeconds(value);
  return rounded > MIN_TIMELINE_DURATION ? rounded : MIN_TIMELINE_DURATION;
};

const ensureStart = (value: number) => roundSeconds(Math.max(0, value));

const computeTotalDuration = (clips: StoryboardTimelineClip[]) => {
  if (!clips.length) return DEFAULT_SEGMENT_DURATION;
  const maxEnd = Math.max(...clips.map((clip) => roundSeconds(clip.start + clip.duration)));
  return Math.max(maxEnd, MIN_TIMELINE_DURATION);
};

const baseVideoTrack = () => ({
  id: DEFAULT_TIMELINE_TRACK_ID,
  name: '视频轨道',
  type: 'video' as const,
  clips: [] as StoryboardTimelineClip[],
});

const buildClipsFromSegments = (segments: SegmentForTimeline[]): StoryboardTimelineClip[] => {
  const normalized = normalizeStoryboardSegments(segments);
  return normalized.map((segment, index) => ({
    id: segment.id,
    segmentId: segment.id,
    trackId: DEFAULT_TIMELINE_TRACK_ID,
    start: ensureStart(segment.startSeconds),
    duration: ensureDuration(segment.duration),
    assetType: segment.generatedVideo ? 'video' : 'image',
    assetUrl: segment.generatedVideo || segment.generatedImage || null,
    prompt: segment.videoPrompt || segment.imagePrompt || null,
    label: `分镜 ${index + 1}`,
  }));
};

export function buildTimelineFromSegments(segments: SegmentForTimeline[]): StoryboardTimelineData {
  const clips = buildClipsFromSegments(segments);
  return {
    version: DEFAULT_TIMELINE_VERSION,
    fps: DEFAULT_TIMELINE_FPS,
    totalDuration: computeTotalDuration(clips),
    tracks: [
      {
        ...baseVideoTrack(),
        clips,
      },
    ],
  };
}

export function mergeTimelineWithSegments(
  existingTimeline: unknown,
  segments: SegmentForTimeline[]
): StoryboardTimelineData {
  if (!segments.length) {
    const parsed = storyboardTimelineSchema.safeParse(existingTimeline);
    if (parsed.success) {
      return parsed.data;
    }
    return buildTimelineFromSegments([]);
  }

  const fallback = buildTimelineFromSegments(segments);
  const parsed = storyboardTimelineSchema.safeParse(existingTimeline);
  if (!parsed.success) {
    return fallback;
  }

  const base = parsed.data;
  const videoTrack = base.tracks.find((track) => track.type === 'video') ?? base.tracks[0] ?? baseVideoTrack();
  const otherTracks = base.tracks.filter((track) => track !== videoTrack);

  const clipMap = new Map(videoTrack.clips.map((clip) => [clip.segmentId, clip]));
  const normalizedSegments = normalizeStoryboardSegments(segments);

  const mergedClips = normalizedSegments.map((segment, index) => {
    const existingClip = clipMap.get(segment.id);
    const clipId = existingClip?.id ?? segment.id;
    const start = existingClip ? ensureStart(existingClip.start) : ensureStart(segment.startSeconds);
    const duration = existingClip ? ensureDuration(existingClip.duration) : ensureDuration(segment.duration);
    const assetType = segment.generatedVideo ? 'video' : existingClip?.assetType ?? 'image';
    const assetUrl = segment.generatedVideo ?? segment.generatedImage ?? existingClip?.assetUrl ?? null;

    return {
      id: clipId,
      segmentId: segment.id,
      trackId: existingClip?.trackId ?? videoTrack.id ?? DEFAULT_TIMELINE_TRACK_ID,
      start,
      duration,
      assetType,
      assetUrl,
      prompt: segment.videoPrompt || segment.imagePrompt || existingClip?.prompt || null,
      label: existingClip?.label || `分镜 ${index + 1}`,
    } satisfies StoryboardTimelineClip;
  });

  mergedClips.sort((a, b) => {
    if (a.start === b.start) {
      return a.segmentId.localeCompare(b.segmentId);
    }
    return a.start - b.start;
  });

  return {
    version: base.version || DEFAULT_TIMELINE_VERSION,
    fps: base.fps || DEFAULT_TIMELINE_FPS,
    totalDuration: computeTotalDuration(mergedClips),
    tracks: [
      {
        id: videoTrack.id || DEFAULT_TIMELINE_TRACK_ID,
        name: videoTrack.name || '视频轨道',
        type: 'video',
        clips: mergedClips,
      },
      ...otherTracks,
    ],
  };
}

export function sanitizeTimelineForSave(timeline: StoryboardTimelineData): StoryboardTimelineData {
  const parsed = storyboardTimelineSchema.parse(timeline);
  return {
    ...parsed,
    totalDuration: computeTotalDuration(parsed.tracks.flatMap((track) => track.clips)),
  };
}

export function cloneTimeline(timeline: StoryboardTimelineData): StoryboardTimelineData {
  return JSON.parse(JSON.stringify(timeline));
}

export function findVideoTrack(timeline: StoryboardTimelineData): StoryboardTimelineTrack {
  return timeline.tracks.find((track) => track.type === 'video') ?? timeline.tracks[0];
}

export function formatClipRange(clip: StoryboardTimelineClip) {
  const start = ensureStart(clip.start);
  const end = ensureStart(clip.start + clip.duration);
  return { start, end };
}
