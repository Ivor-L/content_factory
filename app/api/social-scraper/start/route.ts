import { NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { encodeOwnerDescriptor } from "@/lib/socialCollectorToken";

const WEBHOOK_URL =
  process.env.N8N_SOCIAL_SCRAPER_WEBHOOK ||
  process.env.SOCIAL_SCRAPER_WEBHOOK_URL ||
  "https://hooks.atomx.top/webhook/social_scrape";
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
    instagram: { modes: ["creator", "video"] },
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
  if (!APIFY_TOKEN) {
    return NextResponse.json(
      { error: "Server missing SOCIAL_SCRAPER_APIFY_TOKEN / APIFY_TOKEN configuration." },
      { status: 500 },
    );
  }

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

  const ownerDescriptor = encodeOwnerDescriptor({
    kind: userId ? "user" : "api",
    value: userId ?? ownerApiKey,
  });
  const taskId = `social_${Date.now()}::${ownerDescriptor}`;
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
