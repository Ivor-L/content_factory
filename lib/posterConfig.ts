export const POSTER_COUNT_MIN = 1;
export const POSTER_COUNT_MAX = 6;
export const DEFAULT_POSTER_COUNT = 3;

export const clampPosterCount = (value?: number | null) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_POSTER_COUNT;
  }
  return Math.max(POSTER_COUNT_MIN, Math.min(POSTER_COUNT_MAX, Math.round(value)));
};
