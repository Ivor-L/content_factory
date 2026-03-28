import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { buildCanvasUpstreamHeaders, resolveCanvasUpstreamApiKey } from "@/lib/canvasUpstream";

const SUNO_POLL_INTERVAL_MS = 4000;
const SUNO_POLL_MAX_ATTEMPTS = 90;

function resolveBaseUrl() {
  const candidates = [
    process.env.CANVAS_API_BASE_URL,
    process.env.CLOUD_API_BASE_URL,
  ];
  for (const c of candidates) {
    const s = (c || "").trim();
    if (s) return s.replace(/\/+$/, "");
  }
  return "https://yunwu.ai";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractSunoTaskId(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  if (typeof record.data === "string" && record.data.length > 8) return record.data;
  if (typeof record.task_id === "string") return record.task_id;
  if (typeof record.id === "string") return record.id;
  return "";
}

function extractSunoAudioUrl(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  // data.data might be an array of clips
  if (Array.isArray(record.data)) {
    for (const clip of record.data) {
      if (!clip || typeof clip !== "object") continue;
      const c = clip as Record<string, unknown>;
      if (c.status === "complete" && typeof c.audio_url === "string") return c.audio_url;
    }
  }
  if (typeof record.audio_url === "string") return record.audio_url;
  return "";
}

function extractSunoLyrics(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  // Lyrics result: data.data is object with text/lyric field, or array of items
  const inner = record.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const d = inner as Record<string, unknown>;
    if (typeof d.text === "string") return d.text;
    if (typeof d.lyric === "string") return d.lyric;
  }
  if (Array.isArray(record.data)) {
    for (const item of record.data) {
      if (!item || typeof item !== "object") continue;
      const i = item as Record<string, unknown>;
      const text = i.text || i.lyric;
      if (typeof text === "string" && text.length > 0) return text;
    }
  }
  return "";
}

function isSunoComplete(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  const code = String(record.code || "").toLowerCase();
  if (code === "success") {
    const d = record.data;
    // lyrics: data is string (task_id?) or object with text
    if (typeof d === "string" && d.length > 8) return true;
    // music: data is array of clips
    if (Array.isArray(d)) {
      return d.some((c) => c && typeof c === "object" && (c as Record<string, unknown>).status === "complete");
    }
    // lyrics result object
    if (d && typeof d === "object" && !Array.isArray(d)) {
      const di = d as Record<string, unknown>;
      if (di.text || di.lyric) return true;
    }
  }
  return false;
}

function isSunoFailed(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  const code = String(record.code || "").toLowerCase();
  return ["error", "failed", "task_not_exist"].includes(code);
}

/** POST: submit a suno task. Body: { type: "music"|"lyrics", ...params }
 *  GET:  poll a task. Query: { taskId }
 */

export async function POST(request: NextRequest) {
  const { userId, apiKey } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstreamApiKey = resolveCanvasUpstreamApiKey(apiKey);
  if (!upstreamApiKey) {
    return NextResponse.json(
      { error: { code: "CANVAS_API_KEY_REQUIRED", message: "画布服务尚未配置，请联系管理员处理。" } },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const type = String(payload.type || "music");

  const baseUrl = resolveBaseUrl();
  const headers = buildCanvasUpstreamHeaders({ userId, apiKey: upstreamApiKey });

  if (type === "lyrics") {
    const prompt = String(payload.prompt || "").trim();
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required for lyrics generation" }, { status: 400 });
    }
    const upstreamBody = { prompt };
    const res = await fetch(`${baseUrl}/suno/submit/lyrics`, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamBody),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    const taskId = extractSunoTaskId(data);
    if (!taskId) {
      return NextResponse.json({ error: "未获取到歌词任务 ID", raw: data }, { status: 502 });
    }
    // Poll inline and return lyrics text
    for (let i = 0; i < SUNO_POLL_MAX_ATTEMPTS; i++) {
      if (i > 0) await sleep(SUNO_POLL_INTERVAL_MS);
      const poll = await fetch(`${baseUrl}/suno/fetch/${encodeURIComponent(taskId)}`, {
        method: "GET",
        headers,
        cache: "no-store",
      });
      const pollData = await poll.json().catch(() => ({}));
      if (isSunoFailed(pollData)) {
        return NextResponse.json({ error: "歌词生成失败" }, { status: 502 });
      }
      const lyrics = extractSunoLyrics(pollData);
      if (lyrics) {
        return NextResponse.json({ lyrics, taskId });
      }
    }
    return NextResponse.json({ error: "歌词生成超时" }, { status: 504 });
  }

  // type === "music"
  const musicBody: Record<string, unknown> = {
    gpt_description_prompt: String(payload.gpt_description_prompt || payload.prompt || "").trim(),
    prompt: String(payload.prompt || "").trim(),
    mv: String(payload.mv || "chirp-v4"),
    make_instrumental: Boolean(payload.make_instrumental ?? false),
  };
  if (payload.title) musicBody.title = String(payload.title);
  if (payload.tags) musicBody.tags = String(payload.tags);

  const res = await fetch(`${baseUrl}/suno/submit/music`, {
    method: "POST",
    headers,
    body: JSON.stringify(musicBody),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  const taskId = extractSunoTaskId(data);
  if (!taskId) {
    return NextResponse.json({ error: "未获取到音乐任务 ID", raw: data }, { status: 502 });
  }
  return NextResponse.json({ taskId });
}

export async function GET(request: NextRequest) {
  const { userId, apiKey } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstreamApiKey = resolveCanvasUpstreamApiKey(apiKey);
  if (!upstreamApiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId")?.trim();
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  const baseUrl = resolveBaseUrl();
  const headers = buildCanvasUpstreamHeaders({ userId, apiKey: upstreamApiKey });

  const res = await fetch(`${baseUrl}/suno/fetch/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));

  if (isSunoFailed(data)) {
    return NextResponse.json({ status: "error", error: "任务失败" });
  }
  const audioUrl = extractSunoAudioUrl(data);
  if (audioUrl) {
    return NextResponse.json({ status: "completed", audioUrl });
  }
  return NextResponse.json({ status: "running" });
}
