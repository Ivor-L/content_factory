export const DEFAULT_SEGMENT_DURATION = 8;

export type SegmentTimingSource = {
  duration?: number | null;
  timeRange?: string | null;
};

export type NormalizedStoryboardSegment<T extends SegmentTimingSource> = T & {
  duration: number;
  timeRange: string;
  startSeconds: number;
  endSeconds: number;
};

const RANGE_SEPARATOR = /[-–—~～]/;

const clampSeconds = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);

export function formatStoryboardTimestamp(seconds: number): string {
  const safeSeconds = clampSeconds(seconds);
  const totalSeconds = Math.floor(safeSeconds);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${secs}`;
}

export function formatStoryboardRange(startSeconds: number, endSeconds: number): string {
  return `${formatStoryboardTimestamp(startSeconds)}-${formatStoryboardTimestamp(endSeconds)}`;
}

export function parseStoryboardTimeToken(token: string): number | null {
  if (!token) return null;
  const normalized = token.trim().replace(/：/g, ':');
  if (!normalized) return null;

  if (/^\d{1,2}:\d{1,2}$/.test(normalized)) {
    const [minutes, seconds] = normalized.split(':').map((part) => Number(part));
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return clampSeconds(minutes * 60 + seconds);
  }

  if (/^\d{1,2}\.\d{1,2}$/.test(normalized)) {
    const [minutes, seconds] = normalized.split('.').map((part) => Number(part));
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return clampSeconds(minutes * 60 + seconds);
  }

  const asNumber = Number(normalized);
  if (Number.isFinite(asNumber)) {
    return clampSeconds(asNumber);
  }
  return null;
}

export function parseStoryboardTimeRange(range: string | null | undefined) {
  if (!range) return null;
  const cleaned = range.trim();
  if (!cleaned) return null;

  const parts = cleaned.split(RANGE_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const start = parseStoryboardTimeToken(parts[0]);
  const end = parseStoryboardTimeToken(parts[1]);
  if (start == null || end == null || end <= start) return null;
  return { startSeconds: start, endSeconds: end };
}

export function normalizeStoryboardSegments<T extends SegmentTimingSource>(
  segments: T[],
  defaultDuration = DEFAULT_SEGMENT_DURATION
): NormalizedStoryboardSegment<T>[] {
  let cursor = 0;

  return segments.map((segment) => {
    const rawDuration = Number(segment.duration);
    let duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : defaultDuration;
    let startSeconds = cursor;
    let endSeconds = cursor + duration;

    const parsedRange = parseStoryboardTimeRange(segment.timeRange || undefined);
    if (parsedRange) {
      startSeconds = clampSeconds(parsedRange.startSeconds);
      endSeconds = clampSeconds(parsedRange.endSeconds);
      const parsedDuration = endSeconds - startSeconds;
      if (parsedDuration > 0) {
        duration = parsedDuration;
      }
    }

    cursor = Math.max(endSeconds, cursor + duration);

    const fallbackRange = formatStoryboardRange(startSeconds, endSeconds);
    const normalizedRange =
      (parsedRange && formatStoryboardRange(startSeconds, endSeconds)) ||
      (segment.timeRange || '').trim() ||
      fallbackRange;

    return {
      ...segment,
      duration,
      timeRange: normalizedRange,
      startSeconds,
      endSeconds,
    };
  });
}
