import { NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { encodeOwnerDescriptor } from "@/lib/socialCollectorToken";
import {
  importViralReferenceQueueItems,
  type RawQueueItem,
} from "@/lib/viralReferenceImporter";

const WEBHOOK_URL =
  process.env.N8N_SOCIAL_SCRAPER_WEBHOOK ||
  process.env.SOCIAL_SCRAPER_WEBHOOK_URL ||
  "https://hooks.atomx.top/webhook/social_scrape";
const INSTAGRAM_WORKFLOW_URL =
  process.env.N8N_INSTAGRAM_SCRAPER_WEBHOOK ||
  process.env.INSTAGRAM_SCRAPER_WEBHOOK_URL ||
  "https://hooks.atomx.top/webhook/instagram_scraper";
const fallbackAppUrl = (() => {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
  }
  return "http://localhost:3000";
})();

const CALLBACK_BASE =
  process.env.N8N_CALLBACK_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  fallbackAppUrl;
const APIFY_TOKEN =
  process.env.SOCIAL_SCRAPER_APIFY_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
const WORKFLOW_ID = process.env.SOCIAL_SCRAPER_WORKFLOW_ID || "flow_social_web";

type CollectorMode = "keyword" | "creator" | "video";

const PLATFORM_SUPPORT: Record<
  string,
  {
    modes: CollectorMode[];
  }
> = {
    xiaohongshu: { modes: [] },
    tiktok: { modes: ["keyword", "creator", "video"] },
    facebook: { modes: ["creator", "video"] },
    instagram: { modes: ["video"] },
  };

function normalizePlatform(value: string | undefined): string {
  return (value || "").trim().toLowerCase();
}

function splitEntries(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[\n,]/)
      .map((segment) => segment.trim())
      .filter(Boolean);
  }
  return [];
}

export async function POST(request: Request) {
  const { userId, apiKey } = await getRequestUserContext(request);
  const ownerApiKey = apiKey;
  if (!userId && !ownerApiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ownerApiKey) {
    return NextResponse.json(
      { error: "请先在个人设置中生成 API Key 后再使用数据采集功能。" },
      { status: 400 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const platform = normalizePlatform(body.platform);
  if (!platform) {
    return NextResponse.json({ error: "Missing platform" }, { status: 400 });
  }
  if (!PLATFORM_SUPPORT[platform] || PLATFORM_SUPPORT[platform].modes.length === 0) {
    return NextResponse.json({ error: `Platform ${platform} is not supported yet.` }, { status: 400 });
  }

  const requestedMode: CollectorMode =
    body.mode === "creator" || body.mode === "video" || body.mode === "keyword"
      ? body.mode
      : "video";
  if (!PLATFORM_SUPPORT[platform].modes.includes(requestedMode)) {
    return NextResponse.json(
      { error: `输入模式 ${requestedMode} 不适用于 ${platform}` },
      { status: 400 },
    );
  }

  const entries = splitEntries(body.entries ?? body.targets ?? body.input);
  if (requestedMode === "keyword" && platform !== "tiktok") {
    return NextResponse.json(
      { error: "当前仅支持 TikTok 关键词采集，请改用链接模式。" },
      { status: 400 },
    );
  }
  if (entries.length === 0) {
    return NextResponse.json(
      { error: requestedMode === "keyword" ? "请至少提供一个关键词" : "请至少提供一个链接" },
      { status: 400 },
    );
  }

  const ingestionOwner = userId ?? ownerApiKey;

  if (platform === "instagram") {
    if (requestedMode !== "video") {
      return NextResponse.json(
        { error: "Instagram 仅支持通过作品链接采集，请切换到链接模式。" },
        { status: 400 },
      );
    }

    const { items: instagramQueueItems, errors: workflowErrors } = await collectInstagramQueueItems(
      entries,
    );
    if (instagramQueueItems.length === 0) {
      const fallbackError = workflowErrors[0]?.reason || "Instagram 采集失败";
      return NextResponse.json(
        {
          error: fallbackError,
          failures: workflowErrors,
        },
        { status: 502 },
      );
    }

    const importResult = await importViralReferenceQueueItems(
      instagramQueueItems,
      ingestionOwner,
    );
    const successCount = importResult.results.length;
    const attemptCount = entries.length;
    const messageSegments = [
      `成功采集 ${successCount} 条 Instagram 作品`,
    ];
    if (workflowErrors.length > 0) {
      messageSegments.push(`工作流失败 ${workflowErrors.length} 条`);
    }
    if (importResult.errors.length > 0) {
      messageSegments.push(`导入失败 ${importResult.errors.length} 条`);
    }

    return NextResponse.json({
      success: true,
      platform,
      mode: requestedMode,
      attempted: attemptCount,
      imported: successCount,
      queueErrors: workflowErrors,
      importErrors: importResult.errors,
      message: `${messageSegments.join("，")}。`,
    });
  }

  if (!APIFY_TOKEN) {
    return NextResponse.json(
      { error: "Server missing SOCIAL_SCRAPER_APIFY_TOKEN / APIFY_TOKEN configuration." },
      { status: 500 },
    );
  }

  const limit = Number(body.limit);
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : undefined;

  let inputMode: "keyword" | "url" = requestedMode === "keyword" ? "keyword" : "url";
  const payload: Record<string, unknown> = {};

  if (platform === "tiktok" && inputMode === "keyword") {
    payload.searchQueries = entries;
    payload.limit = normalizedLimit ?? 20;
  } else if (platform === "tiktok") {
    payload.postURLs = entries;
  } else if (platform === "facebook") {
    payload.startUrls = entries.map((url) => ({ url }));
    payload.resultsLimit = normalizedLimit ?? 20;
    payload.captionText = Boolean(body.captionText ?? true);
  } else if (platform === "instagram") {
    payload.directUrls = entries;
    payload.resultsLimit = normalizedLimit ?? 10;
  } else {
    return NextResponse.json({ error: `暂不支持 ${platform}` }, { status: 400 });
  }

  const ownerDescriptorToken = encodeOwnerDescriptor({
    kind: userId ? "user" : "api",
    value: ingestionOwner,
  });
  const taskId = `social_${Date.now()}::${ownerDescriptorToken}`;
  const callbackUrl = `${CALLBACK_BASE.replace(/\/$/, "")}/api/webhook/social-scraper`;

  const requestPayload = {
    platform,
    input_mode: inputMode,
    api_key: ownerApiKey,
    apify_token: APIFY_TOKEN,
    callback_url: callbackUrl,
    workflow_id: WORKFLOW_ID,
    task_id: taskId,
    payload,
    request_meta: {
      source: "web",
      client_uid: userId ?? "",
    },
  };

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    let message = `Workflow trigger failed (${response.status})`;
    try {
      const errorPayload = await response.json();
      if (typeof errorPayload?.error === "string") {
        message = errorPayload.error;
      }
    } catch {
      // ignore
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    platform,
    mode: requestedMode,
    message: "采集任务已提交，请稍候在列表中查看更新。",
  });
}

type InstagramWorkflowResponse = {
  status?: string;
  message?: string;
  post_data?: InstagramPostData | null;
  raw_details?: Record<string, unknown> | null;
};

type InstagramPostData = {
  shortcode?: string;
  post_id?: string;
  media_type?: number;
  like_count?: number;
  comment_count?: number;
  caption_text?: string;
  publish_time?: number | string;
  author?: {
    username?: string;
    full_name?: string;
    profile_pic_url?: string;
  } | null;
  media_assets?: InstagramMediaAssets | null;
};

type InstagramMediaAssets = {
  images?: unknown;
  videos?: unknown;
  carousel?: unknown;
};

type InstagramWorkflowError = {
  url: string;
  reason: string;
};

async function collectInstagramQueueItems(urls: string[]): Promise<{
  items: RawQueueItem[];
  errors: InstagramWorkflowError[];
}> {
  const items: RawQueueItem[] = [];
  const errors: InstagramWorkflowError[] = [];

  for (const rawUrl of urls) {
    const targetUrl = rawUrl.trim();
    if (!targetUrl) continue;
    try {
      const queueItem = await buildInstagramQueueItem(targetUrl);
      if (!queueItem) {
        throw new Error("未获取到有效的帖子数据");
      }
      items.push(queueItem);
    } catch (error) {
      errors.push({
        url: targetUrl,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { items, errors };
}

async function buildInstagramQueueItem(url: string): Promise<RawQueueItem | null> {
  const payload = await triggerInstagramWorkflow(url);
  if (!payload.post_data) {
    return null;
  }
  return normalizeInstagramPost(payload.post_data, payload.raw_details ?? null, url);
}

async function triggerInstagramWorkflow(url: string): Promise<InstagramWorkflowResponse> {
  const response = await fetch(INSTAGRAM_WORKFLOW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error(`Instagram 采集器返回 ${response.status}`);
  }

  let rawBody: unknown;
  try {
    rawBody = await response.json();
  } catch (error) {
    throw new Error("Instagram 采集器响应格式错误");
  }

  const payload = normalizeInstagramWorkflowResponse(rawBody);
  if (!payload) {
    throw new Error("Instagram 采集器返回空数据");
  }
  if (payload.status && payload.status !== "success") {
    throw new Error(payload.message || "Instagram 采集失败");
  }
  if (!payload.post_data) {
    throw new Error("Instagram 采集器未返回帖子内容");
  }

  return payload;
}

function normalizeInstagramWorkflowResponse(raw: unknown): InstagramWorkflowResponse | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === "object" && "json" in first) {
      return normalizeInstagramWorkflowResponse((first as { json?: unknown }).json);
    }
    return normalizeInstagramWorkflowResponse(first);
  }
  if (typeof raw === "object") {
    return raw as InstagramWorkflowResponse;
  }
  return null;
}

function normalizeInstagramPost(
  post: InstagramPostData,
  rawDetails: Record<string, unknown> | null,
  fallbackUrl: string,
): RawQueueItem | null {
  const sourceId = sanitizeText(post.post_id) || sanitizeText(post.shortcode);
  if (!sourceId) return null;

  const normalizedUrl = buildInstagramPostUrl(fallbackUrl, post.shortcode);
  const caption = sanitizeText(post.caption_text) || "";
  const publishedAt = normalizePublishTime(post.publish_time);
  const imageUrls = extractInstagramImages(post.media_assets, rawDetails);
  const videoUrls = extractInstagramVideos(post.media_assets, rawDetails);

  const stats: Record<string, number> = {};
  if (typeof post.like_count === "number" && Number.isFinite(post.like_count)) {
    stats.likes = post.like_count;
  }
  if (typeof post.comment_count === "number" && Number.isFinite(post.comment_count)) {
    stats.comments = post.comment_count;
  }

  const authorUsername = sanitizeText(post.author?.username);
  const authorName = sanitizeText(post.author?.full_name) || authorUsername || "";
  const profileUrl = authorUsername ? `https://www.instagram.com/${authorUsername}/` : undefined;

  const data: Record<string, unknown> = {
    id: sourceId,
    sourceId,
    source_id: sourceId,
    shortcode: sanitizeText(post.shortcode),
    url: normalizedUrl,
    link: normalizedUrl,
    post_url: normalizedUrl,
    source_key: normalizedUrl,
    caption,
    text: caption,
    description: caption,
    title: caption,
    like_count: post.like_count ?? null,
    comment_count: post.comment_count ?? null,
    stats,
    published_at: publishedAt,
    publish_time: post.publish_time ?? null,
    media_type: post.media_type ?? null,
    video_url: videoUrls[0] ?? null,
    video_urls: videoUrls.length > 0 ? videoUrls : undefined,
    author_name: authorName,
    author_username: authorUsername,
    author_profile_url: profileUrl ?? post.author?.profile_pic_url ?? null,
    author: {
      name: authorName,
      username: authorUsername,
      profileUrl: profileUrl ?? post.author?.profile_pic_url ?? null,
      avatar: post.author?.profile_pic_url ?? null,
    },
    media_assets: post.media_assets ?? null,
    raw: rawDetails ?? post,
  };

  if (imageUrls.length > 0) {
    data.image_urls = imageUrls;
  }

  return {
    platform: "instagram",
    sourceType: "post",
    collectorVersion: "instagram_direct_v1",
    data,
    userTags: {
      category: "instagram",
    },
  };
}

function buildInstagramPostUrl(fallbackUrl: string, shortcode?: string): string {
  if (shortcode) {
    return `https://www.instagram.com/p/${shortcode}/`;
  }
  return fallbackUrl;
}

function sanitizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizePublishTime(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string") {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return normalizePublishTime(num);
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return null;
}

function extractInstagramImages(
  mediaAssets?: InstagramMediaAssets | null,
  rawDetails?: Record<string, unknown> | null,
): string[] {
  const urls: string[] = [];
  collectInstagramMediaUrls(mediaAssets?.images, urls);
  collectInstagramMediaUrls(mediaAssets?.carousel, urls);
  if (rawDetails) {
    collectInstagramMediaUrls((rawDetails as Record<string, unknown>).image_versions2, urls);
    collectInstagramMediaUrls((rawDetails as Record<string, unknown>).carousel_media, urls);
  }
  return uniqueUrls(urls.filter((url) => !isVideoLikeUrl(url)));
}

function extractInstagramVideos(
  mediaAssets?: InstagramMediaAssets | null,
  rawDetails?: Record<string, unknown> | null,
): string[] {
  const urls: string[] = [];
  collectInstagramMediaUrls(mediaAssets?.videos, urls);
  collectInstagramMediaUrls(mediaAssets?.carousel, urls);
  if (rawDetails) {
    collectInstagramMediaUrls((rawDetails as Record<string, unknown>).video_versions, urls);
    collectInstagramMediaUrls((rawDetails as Record<string, unknown>).carousel_media, urls);
  }
  return uniqueUrls(urls.filter((url) => isVideoLikeUrl(url)));
}

function collectInstagramMediaUrls(value: unknown, bucket: string[]) {
  if (!value) return;
  if (typeof value === "string") {
    const url = normalizeMediaUrl(value);
    if (url) bucket.push(url);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectInstagramMediaUrls(item, bucket);
    }
    return;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const directKeys = ["url", "src", "download_link", "downloadLink", "display_url", "image_url", "video_url"];
    for (const key of directKeys) {
      const candidate = normalizeMediaUrl(obj[key]);
      if (candidate) bucket.push(candidate);
    }
    const nestedKeys = [
      "candidates",
      "items",
      "media",
      "image_versions2",
      "imageVersions2",
      "video_versions",
      "videoVersions",
      "carousel_media",
      "carousel",
      "children",
      "resources",
    ];
    for (const key of nestedKeys) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        collectInstagramMediaUrls(obj[key], bucket);
      }
    }
  }
}

function normalizeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

const VIDEO_URL_RE = /\.(mp4|mov|m3u8)(\?|$)/i;

function isVideoLikeUrl(url: string): boolean {
  return (
    VIDEO_URL_RE.test(url) ||
    /\/video\//i.test(url) ||
    /\/master\//i.test(url)
  );
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}
