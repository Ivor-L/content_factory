type JsonObject = Record<string, unknown>;

export type ViralReferenceMedia = {
  coverUrl: string | null;
  videoUrl: string | null;
  mediaUrls: string[] | null;
};

const VIDEO_EXT_RE = /\.(mp4|mov|m3u8)(\?|$)/i;

const COVER_PATHS: Array<Array<string | number>> = [
  ["coverUrl"],
  ["cover_url"],
  ["displayUrl"],
  ["display_url"],
  ["cover"],
  ["thumbnail"],
  ["thumb"],
  ["poster"],
  ["posterUrl"],
  ["poster_url"],
  ["imageUrl"],
  ["image_url"],
  ["cover", "url"],
  ["cover", "urlDefault"],
  ["cover", "url_default"],
  ["note", "cover", "url"],
  ["note", "cover", "urlDefault"],
  ["note", "cover", "url_default"],
  ["video", "cover", "url"],
  ["note", "video", "cover", "url"],
  ["data", "coverUrl"],
  ["data", "cover_url"],
  ["data", "cover"],
  ["raw", "displayUrl"],
  ["raw", "display_url"],
  ["raw", "coverUrl"],
  ["raw", "cover_url"],
  ["images", 0],
  ["images", 0, "url"],
  ["images", 0, "urlDefault"],
  ["images", 0, "url_default"],
  ["imageList", 0, "url"],
  ["imageList", 0, "urlDefault"],
  ["imageList", 0, "url_default"],
  ["image_list", 0, "url"],
  ["image_list", 0, "urlDefault"],
  ["image_list", 0, "url_default"],
];

const VIDEO_PATHS: Array<Array<string | number>> = [
  ["videoUrl"],
  ["video_url"],
  ["playUrl"],
  ["play_url"],
  ["raw", "videoUrl"],
  ["raw", "video_url"],
  ["video", "url"],
  ["video", "playUrl"],
  ["video", "play_url"],
  ["video", "masterUrl"],
  ["video", "master_url"],
  ["video", "playAddr"],
  ["video", "play_addr"],
  ["note", "video", "url"],
  ["note", "videoUrl"],
  ["note", "video_url"],
  ["data", "videoUrl"],
  ["data", "video_url"],
];

export function parseRawPayloadObject(raw: unknown): JsonObject | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isPlainObject(raw) ? raw : null;
}

export function extractViralReferenceMedia(data: JsonObject): ViralReferenceMedia {
  const directMedia = collectMediaUrls(data);
  const coverFromPaths = pickFirstUrlByPaths(data, COVER_PATHS);
  const videoFromPaths = pickFirstUrlByPaths(data, VIDEO_PATHS);
  const videoFromStream = extractVideoFromStream(data);

  const coverUrl = coverFromPaths ?? pickFirstNonVideoUrl(directMedia);
  const videoUrl = videoFromPaths ?? videoFromStream ?? pickFirstVideoUrl(directMedia);
  const mediaUrls = uniqueUrls([...(directMedia ?? []), ...(coverUrl ? [coverUrl] : []), ...(videoUrl ? [videoUrl] : [])]);

  return {
    coverUrl: coverUrl ?? null,
    videoUrl: videoUrl ?? null,
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : null,
  };
}

export function hydrateViralReferenceMedia<
  T extends {
    coverUrl?: string | null;
    videoUrl?: string | null;
    mediaUrls?: unknown;
    rawPayload?: unknown;
  }
>(item: T): T & ViralReferenceMedia {
  const rawObject = parseRawPayloadObject(item.rawPayload);
  const extracted = rawObject ? extractViralReferenceMedia(rawObject) : null;
  const existingMedia = normalizeMediaUrls(item.mediaUrls);

  const rawCoverUrl =
    sanitizeUrl(item.coverUrl) ??
    extracted?.coverUrl ??
    pickFirstNonVideoUrl(existingMedia) ??
    null;
  const videoUrl =
    sanitizeUrl(item.videoUrl) ??
    extracted?.videoUrl ??
    pickFirstVideoUrl(existingMedia) ??
    null;

  const mergedMedia = uniqueUrls([
    ...(existingMedia ?? []),
    ...(extracted?.mediaUrls ?? []),
    ...(rawCoverUrl ? [rawCoverUrl] : []),
    ...(videoUrl ? [videoUrl] : []),
  ]);

  const normalizedMedia = mergedMedia.length > 0 ? mergedMedia : null;
  const coverUrl = chooseBestMediaUrl(rawCoverUrl, normalizedMedia);

  return {
    ...item,
    coverUrl,
    videoUrl,
    mediaUrls: normalizedMedia,
  };
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getByPath(obj: JsonObject, path: Array<string | number>): unknown {
  let current: unknown = obj;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return null;
      current = current[segment];
      continue;
    }
    if (!isPlainObject(current)) return null;
    current = current[segment];
  }
  return current;
}

function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("blob:")) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return isLikelyUrl(trimmed) ? trimmed : null;
}

function pickFirstUrlByPaths(data: JsonObject, paths: Array<Array<string | number>>): string | null {
  for (const path of paths) {
    const candidate = getByPath(data, path);
    const url = extractUrlFromUnknown(candidate);
    if (url) return url;
  }
  return null;
}

function extractUrlFromUnknown(value: unknown): string | null {
  const direct = sanitizeUrl(value);
  if (direct) return direct;
  if (!isPlainObject(value)) return null;

  const candidates = [
    value.url,
    value.urlDefault,
    value.url_default,
    value.masterUrl,
    value.master_url,
    value.playUrl,
    value.play_url,
    value.playAddr,
    value.play_addr,
    value.src,
  ];
  for (const candidate of candidates) {
    const url = sanitizeUrl(candidate);
    if (url) return url;
  }
  return null;
}

function normalizeMediaUrls(raw: unknown): string[] | null {
  const urls = collectUrlsFromUnknown(raw);
  return urls.length > 0 ? uniqueUrls(urls) : null;
}

function collectMediaUrls(data: JsonObject): string[] | null {
  const urls: string[] = [];

  const directCandidates = [
    data.mediaUrls,
    data.media_urls,
    data.images,
    data.imageList,
    data.image_list,
    data.media,
    data.assets,
    data.photos,
  ];
  for (const candidate of directCandidates) {
    urls.push(...collectUrlsFromUnknown(candidate));
  }

  const nestedCandidates = [
    getByPath(data, ["note", "imageList"]),
    getByPath(data, ["note", "images"]),
    getByPath(data, ["note", "mediaUrls"]),
    getByPath(data, ["note", "media_urls"]),
    getByPath(data, ["data", "imageList"]),
    getByPath(data, ["data", "images"]),
    getByPath(data, ["data", "mediaUrls"]),
    getByPath(data, ["data", "media_urls"]),
  ];
  for (const candidate of nestedCandidates) {
    urls.push(...collectUrlsFromUnknown(candidate));
  }

  return urls.length > 0 ? uniqueUrls(urls) : null;
}

function collectUrlsFromUnknown(value: unknown): string[] {
  if (value == null) return [];

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return collectUrlsFromUnknown(JSON.parse(trimmed));
      } catch {
        // Not JSON string, treat as plain URL/text list.
      }
    }
    if (trimmed.includes(",")) {
      return trimmed
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    }
    return [trimmed];
  }

  if (Array.isArray(value)) {
    const urls: string[] = [];
    for (const item of value) {
      urls.push(...collectUrlsFromUnknown(item));
    }
    return urls;
  }

  if (!isPlainObject(value)) return [];
  const url = extractUrlFromUnknown(value);
  if (url) return [url];

  // Prefer URL-like child fields from known containers.
  const nestedCandidates = [
    value.urls,
    value.url_list,
    value.list,
    value.items,
    value.value,
  ];
  const urls: string[] = [];
  for (const candidate of nestedCandidates) {
    urls.push(...collectUrlsFromUnknown(candidate));
  }
  return urls;
}

function extractVideoFromStream(data: JsonObject): string | null {
  const streamCandidates = [
    getByPath(data, ["video", "media", "stream"]),
    getByPath(data, ["note", "video", "media", "stream"]),
    getByPath(data, ["data", "video", "media", "stream"]),
  ];

  const priority = ["h264", "h265", "hevc", "av1"];

  for (const stream of streamCandidates) {
    if (!isPlainObject(stream)) continue;
    const entries = Object.entries(stream).sort((a, b) => {
      const ia = priority.indexOf(a[0]);
      const ib = priority.indexOf(b[0]);
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    for (const [, value] of entries) {
      const urls = collectUrlsFromUnknown(value);
      const videoCandidate = urls.find((candidate) => isVideoLikeUrl(candidate));
      if (videoCandidate) return videoCandidate;
    }
  }

  return null;
}

function isVideoLikeUrl(url: string): boolean {
  return (
    VIDEO_EXT_RE.test(url) ||
    /\/video\//i.test(url) ||
    /\/master\//i.test(url) ||
    /xgvideo/i.test(url)
  );
}

function pickFirstVideoUrl(urls: string[] | null): string | null {
  if (!urls || urls.length === 0) return null;
  return urls.find((url) => isVideoLikeUrl(url)) ?? null;
}

function pickFirstNonVideoUrl(urls: string[] | null): string | null {
  if (!urls || urls.length === 0) return null;
  return urls.find((url) => !isVideoLikeUrl(url)) ?? urls[0] ?? null;
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of urls) {
    const normalized = sanitizeUrl(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function isLikelyUrl(value: string): boolean {
  return /^(https?:\/\/|\/)/i.test(value);
}

export function chooseBestMediaUrl(
  primary: string | null | undefined,
  candidates?: (string | null | undefined)[] | null,
): string | null {
  const normalizedCandidates =
    candidates?.filter((url): url is string => typeof url === "string" && url.trim().length > 0) ?? [];

  if (primary && !isLikelyBlockedXhsUrl(primary)) {
    return primary;
  }

  const fallback = normalizedCandidates.find((url) => !isLikelyBlockedXhsUrl(url));
  if (fallback) {
    return fallback;
  }

  return primary ?? normalizedCandidates[0] ?? null;
}

export function isLikelyBlockedXhsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/\.xhscdn\.com$/i.test(parsed.hostname)) {
      return false;
    }
    const path = parsed.pathname;
    if (path.includes("!") || path.includes("@") || path.endsWith(".mp4")) {
      return false;
    }
    const lastSegment = path.split("/").pop() ?? "";
    return /^(?:\d+|[a-z])$/i.test(lastSegment);
  } catch {
    return false;
  }
}
