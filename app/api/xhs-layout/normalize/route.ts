import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";

type NormalizePayload = {
  markdown: string;
  standardizedMarkdown: string;
  needsRewrite: boolean;
};

const MODEL = process.env.CLOUD_WRITING_MODEL || process.env.CLOUD_DEFAULT_MODEL || "gpt-4o-mini";
const MAX_SOURCE_LENGTH = 16000;

function readEnv(name: string) {
  return (process.env[name] || "").trim();
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function resolveSystemChatEndpoint() {
  const explicit = readEnv("CLOUD_CHAT_COMPLETIONS_URL");
  if (explicit) return explicit;
  const baseUrl = readEnv("CLOUD_API_BASE_URL");
  if (!baseUrl) return "";
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
}

function resolveSystemApiKey() {
  return readEnv("CLOUD_API_KEY");
}

function sanitizeInput(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim();
}

function extractAssistantText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const source = payload as Record<string, unknown>;

  const choices = source.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const content = (choices[0] as any)?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .map((part) => (part && typeof part === "object" ? (part as any).text : ""))
        .filter((item) => typeof item === "string" && item.trim())
        .join("\n");
      if (text.trim()) return text.trim();
    }
  }

  const candidates = source.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const parts = (candidates[0] as any)?.content?.parts;
    if (Array.isArray(parts)) {
      const text = parts
        .map((part) => (part && typeof part === "object" ? (part as any).text : ""))
        .filter((item) => typeof item === "string" && item.trim())
        .join("\n");
      if (text.trim()) return text.trim();
    }
  }

  if (typeof source.output_text === "string") {
    return source.output_text.trim();
  }

  return "";
}

function parseJsonFromText(raw: string): unknown {
  const text = String(raw || "").trim();
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function toSafePayload(raw: unknown, fallback: string): NormalizePayload {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const markdown = sanitizeInput(source.markdown);
  const standardizedMarkdown = sanitizeInput(source.standardizedMarkdown || source.standard_markdown || source.normalizedMarkdown);
  const needsRewrite = Boolean(source.needsRewrite ?? source.needs_rewrite);

  const normalized = standardizedMarkdown || markdown || fallback;
  return {
    markdown: markdown || fallback,
    standardizedMarkdown: normalized,
    needsRewrite: needsRewrite || normalized !== fallback,
  };
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // AI 排版固定走系统云模型 key，不经过画布 upstream/invite token 通道。
  const systemApiKey = resolveSystemApiKey();
  if (!systemApiKey) {
    return NextResponse.json({ error: "系统 AI 服务尚未配置，请联系管理员处理。" }, { status: 500 });
  }

  const endpoint = resolveSystemChatEndpoint();
  if (!endpoint) {
    return NextResponse.json({ error: "缺少系统 AI 对话接口配置" }, { status: 501 });
  }

  const body = await request.json().catch(() => null);
  const markdown = sanitizeInput(body?.markdown).slice(0, MAX_SOURCE_LENGTH);

  if (!markdown) {
    return NextResponse.json({ error: "内容为空，无法规范化" }, { status: 400 });
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${systemApiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        temperature: 0.2,
        max_tokens: 1800,
        messages: [
          {
            role: "system",
            content: [
              "你是内容结构化编辑器。",
              "任务：把非标准文案整理成可用于小红书图文排版的标准 Markdown。",
              "要求：",
              "1) 可以重写与结构化，但必须保留原意，不得虚构事实。",
              "2) 输出包含主标题、二级小节、列表，段落简洁。",
              "3) 删除口水词、重复句、无意义表情符号。",
              "4) 输出严格 JSON，不要 markdown 代码块。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              "请返回 JSON：",
              '{"markdown":"","standardizedMarkdown":"","needsRewrite":true}',
              "字段说明：",
              "- markdown: 你整理后的标准 Markdown（最终可用于排版）。",
              "- standardizedMarkdown: 同 markdown（兼容字段，保持一致）。",
              "- needsRewrite: 是否进行了明显结构化改写。",
              "原始内容如下：",
              markdown,
            ].join("\n"),
          },
        ],
      }),
      cache: "no-store",
    });

    const upstreamPayload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const upstreamMsg =
        typeof (upstreamPayload as any)?.error?.message === "string"
          ? (upstreamPayload as any).error.message
          : typeof (upstreamPayload as any)?.error === "string"
            ? (upstreamPayload as any).error
            : "";
      return NextResponse.json(
        { error: upstreamMsg || `规范化失败（上游状态 ${upstream.status}）` },
        { status: 502 },
      );
    }

    const rawText = extractAssistantText(upstreamPayload);
    const parsed = parseJsonFromText(rawText);
    const safe = toSafePayload(parsed, markdown);

    return NextResponse.json({ data: safe });
  } catch (error) {
    console.error("[xhs-layout/normalize] failed", error);
    return NextResponse.json({ error: "内容规范化失败，请稍后重试" }, { status: 500 });
  }
}
