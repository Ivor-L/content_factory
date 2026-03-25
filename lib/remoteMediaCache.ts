import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { uploadToStorage } from "./storageUpload";
import { supabaseAdmin } from "./supabaseAdmin";

const MEDIA_CACHE_BUCKET = process.env.MEDIA_CACHE_BUCKET?.trim() || "proxy-cache";
const MEDIA_CACHE_PREFIX = process.env.MEDIA_CACHE_PREFIX?.trim() || "viral-media";
const MEDIA_CACHE_MAX_BYTES =
  Number.parseInt(process.env.MEDIA_CACHE_MAX_BYTES ?? "", 10) || 30 * 1024 * 1024; // 30 MB
const MEDIA_CACHE_TTL_DAYS =
  Number.parseInt(process.env.MEDIA_CACHE_TTL_DAYS ?? "", 10) || 5;
const MEDIA_CACHE_FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  Referer: "https://www.xiaohongshu.com/",
  Accept: "*/*",
};
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const SELF_HOSTED_HOSTS = new Set(["supabase-api.atomx.top", "localhost", "127.0.0.1"]);

let lastCleanupAt = 0;
let bucketSetupPromise: Promise<void> | null = null;

export type CachedMediaFields = {
  coverUrl?: string | null;
  videoUrl?: string | null;
  mediaUrls?: string[] | null;
};

type CacheContext = {
  platform: string;
  sourceId: string;
};

export async function cacheReferenceMediaAssets(
  fields: CachedMediaFields,
  context: CacheContext,
): Promise<CachedMediaFields> {
  await cleanupExpiredCache();

  const urlMap = new Map<string, string>();

  const transform = async (url: string | null | undefined) => {
    if (!url) return url;
    if (urlMap.has(url)) {
      return urlMap.get(url)!;
    }
    const cached = await cacheSingleUrl(url, context).catch((error) => {
      console.warn("[media-cache] Failed to cache asset", { url, error });
      return url;
    });
    if (cached) {
      urlMap.set(url, cached);
      return cached;
    }
    urlMap.set(url, url);
    return url;
  };

  const newCoverUrl = await transform(fields.coverUrl);
  const newVideoUrl = await transform(fields.videoUrl);

  const originalMediaList = Array.isArray(fields.mediaUrls)
    ? fields.mediaUrls
    : [];
  const newMediaUrls: string[] = [];
  for (const mediaUrl of originalMediaList) {
    if (typeof mediaUrl !== "string") continue;
    const cached = await transform(mediaUrl);
    if (cached) {
      newMediaUrls.push(cached);
    }
  }

  return {
    coverUrl: newCoverUrl ?? null,
    videoUrl: newVideoUrl ?? null,
    mediaUrls: newMediaUrls.length > 0 ? newMediaUrls : null,
  };
}

async function cacheSingleUrl(url: string, context: CacheContext): Promise<string | null> {
  if (!isCacheableUrl(url)) {
    return url;
  }

  const response = await fetch(url, {
    headers: MEDIA_CACHE_FETCH_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > MEDIA_CACHE_MAX_BYTES) {
      throw new Error(`Asset exceeds ${MEDIA_CACHE_MAX_BYTES} bytes`);
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength > MEDIA_CACHE_MAX_BYTES) {
    throw new Error(`Downloaded asset exceeds ${MEDIA_CACHE_MAX_BYTES} bytes`);
  }

  await ensureCacheBucket();
  const extension = guessExtension(url, contentType);
  const filename = `${Date.now()}-${context.platform}-${context.sourceId}-${randomUUID()}${extension}`;
  const path = `${MEDIA_CACHE_PREFIX}/${filename}`;

  const { publicUrl } = await uploadToStorage({
    bucket: MEDIA_CACHE_BUCKET,
    path,
    body: buffer,
    contentType,
    upsert: false,
  });

  return publicUrl;
}

function isCacheableUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    if (SELF_HOSTED_HOSTS.has(parsed.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function guessExtension(url: string, contentType: string | null) {
  const lookup: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
  };
  if (contentType && lookup[contentType]) {
    return lookup[contentType];
  }
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const lastSegment = pathname.split("/").pop() ?? "";
    const dotIndex = lastSegment.lastIndexOf(".");
    if (dotIndex >= 0) {
      const ext = lastSegment.slice(dotIndex);
      if (ext.length <= 6) {
        return ext;
      }
    }
  } catch {
    // ignore
  }
  return "";
}

async function cleanupExpiredCache() {
  if (MEDIA_CACHE_TTL_DAYS <= 0) {
    return;
  }
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanupAt = now;

  const cutoff = new Date(now - MEDIA_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

  while (true) {
    const { data, error } = await supabaseAdmin.storage
      .from(MEDIA_CACHE_BUCKET)
      .list(MEDIA_CACHE_PREFIX, {
        limit: 1000,
        sortBy: { column: "created_at", order: "asc" },
      });

    if (error) {
      console.warn("[media-cache] Cleanup list failed", error.message);
      return;
    }

    if (!data || data.length === 0) {
      return;
    }

    const expiredPaths = data
      .filter((item) => {
        if (!item.created_at) return false;
        const createdAt = new Date(item.created_at);
        return createdAt < cutoff;
      })
      .map((item) => `${MEDIA_CACHE_PREFIX}/${item.name}`);

    if (expiredPaths.length > 0) {
      const { error: removeError } = await supabaseAdmin.storage
        .from(MEDIA_CACHE_BUCKET)
        .remove(expiredPaths);
      if (removeError) {
        console.warn("[media-cache] Cleanup remove failed", removeError.message);
        return;
      }
    }

    if (expiredPaths.length === 0) {
      return;
    }
  }
}

async function ensureCacheBucket() {
  if (bucketSetupPromise) {
    return bucketSetupPromise;
  }
  bucketSetupPromise = (async () => {
    const { data, error } = await supabaseAdmin.storage.getBucket(MEDIA_CACHE_BUCKET);
    if (error) {
      if (!error.message?.toLowerCase().includes("not found")) {
        console.warn("[media-cache] getBucket failed", error.message);
        return;
      }
      const { error: createError } = await supabaseAdmin.storage.createBucket(MEDIA_CACHE_BUCKET, {
        public: true,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime", "video/webm"],
        fileSizeLimit: MEDIA_CACHE_MAX_BYTES.toString(),
      });
      if (createError && !createError.message?.includes("already exists")) {
        console.warn("[media-cache] Failed to create bucket", createError.message);
      }
      return;
    }

    if (data && !data.public) {
      const { error: updateError } = await supabaseAdmin.storage.updateBucket(MEDIA_CACHE_BUCKET, {
        public: true,
      });
      if (updateError) {
        console.warn("[media-cache] Failed to update bucket visibility", updateError.message);
      }
    }
  })().catch((err) => {
    console.warn("[media-cache] ensure bucket failed", err);
    bucketSetupPromise = null;
  });
  return bucketSetupPromise;
}
