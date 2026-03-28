import { NextResponse } from "next/server";
import { decodeOwnerDescriptor } from "@/lib/socialCollectorToken";
import {
  importViralReferenceQueueItems,
  type RawQueueItem,
} from "@/lib/viralReferenceImporter";

const CALLBACK_SECRET =
  process.env.SOCIAL_SCRAPER_WEBHOOK_SECRET || process.env.N8N_SOCIAL_WEBHOOK_SECRET || "";
const OWNER_TOKEN_DELIMITER = "::";

type WebhookPayload = {
  task_id?: string;
  platform?: string;
  results?: Array<Record<string, any>>;
  status?: string;
  message?: string;
};

const SUCCESS_STATUS = new Set(["completed", "success", "succeeded", "ok", "done"]);

function toNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function extractOwnerToken(taskId: string | undefined): string | null {
  if (!taskId) return null;
  const idx = taskId.lastIndexOf(OWNER_TOKEN_DELIMITER);
  if (idx === -1) return null;
  return taskId.slice(idx + OWNER_TOKEN_DELIMITER.length);
}

function buildQueueItem(result: Record<string, any>, fallbackPlatform: string): RawQueueItem {
  const platform = String(result.platform || fallbackPlatform || "tiktok").toLowerCase();
  const stats: Record<string, number> = {};
  const likes = toNumber(result.like_count);
  if (likes != null) stats.likes = likes;
  const collects = toNumber(result.collect_count ?? result.save_count);
  if (collects != null) stats.collects = collects;
  const comments = toNumber(result.comment_count);
  if (comments != null) stats.comments = comments;
  const shares = toNumber(result.share_count);
  if (shares != null) stats.shares = shares;
  const plays = toNumber(result.play_count);
  if (plays != null) stats.plays = plays;
  const fans = toNumber(result.fans_count);
  if (fans != null) stats.fans = fans;

  const sourceId =
    result.source_key ||
    result.post_id ||
    result.shortcode ||
    result.id ||
    result.display_url ||
    result.post_url;
  const primaryUrl = result.post_url || result.display_url || result.url;

  const data: Record<string, unknown> = {
    id: sourceId,
    noteId: sourceId,
    sourceId,
    source_id: sourceId,
    url: primaryUrl,
    link: primaryUrl,
    pageUrl: primaryUrl,
    title: result.text || result.title,
    desc: result.text || result.description,
    description: result.text || result.description,
    coverUrl: result.cover_url,
    videoUrl: result.video_url,
    mediaUrls: result.image_urls,
    media_urls: result.image_urls,
    text: result.text,
    caption: result.text,
    author: {
      name: result.author_name,
      profileUrl: result.author_profile_url,
      username: result.author_username,
      signature: result.author_signature,
      pageName: result.page_name,
      fans: fans ?? undefined,
    },
    stats,
    publishedAt: result.published_at,
    publishDate: result.published_at,
    time: result.published_at,
    media_type: result.media_type,
    script_text: result.script_text,
    raw: result.raw ?? result,
  };

  return {
    platform,
    sourceType: "post",
    collectorVersion: "social_web_direct_v1",
    data,
    userTags: {
      category: result.category ?? platform,
      remark: result.input_mode ? `来源: ${result.input_mode}` : undefined,
    },
  };
}

export async function POST(request: Request) {
  if (CALLBACK_SECRET) {
    const incoming = request.headers.get("x-social-webhook-secret")?.trim();
    if (incoming !== CALLBACK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: WebhookPayload | WebhookPayload[];
  try {
    body = (await request.json()) as WebhookPayload | WebhookPayload[];
  } catch (error) {
    console.error("[social-scraper-webhook] Invalid JSON", error);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const payload: WebhookPayload = Array.isArray(body) ? body[0] ?? {} : body ?? {};

  const taskId = payload.task_id;
  const ownerToken = extractOwnerToken(taskId);
  if (!ownerToken) {
    return NextResponse.json({ error: "Missing owner token" }, { status: 400 });
  }
  const ownerDescriptor = decodeOwnerDescriptor(ownerToken);
  if (!ownerDescriptor) {
    return NextResponse.json({ error: "Failed to resolve task owner" }, { status: 400 });
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  if (results.length === 0) {
    const statusText = payload.status || "NO_DATA";
    console.info("[social-scraper-webhook] No results", { taskId, status: statusText });
    return NextResponse.json({ success: true, imported: 0, status: statusText });
  }

  const queueItems = results.map((item) =>
    buildQueueItem(item, payload.platform || item.platform || "tiktok"),
  );

  const importResult = await importViralReferenceQueueItems(queueItems, ownerDescriptor.value);
  const isSuccess = SUCCESS_STATUS.has(String(payload.status || "").toLowerCase());

  return NextResponse.json({
    success: true,
    imported: importResult.results.length,
    errors: importResult.errors,
    status: payload.status ?? (isSuccess ? "COMPLETED" : "UNKNOWN"),
  });
}
