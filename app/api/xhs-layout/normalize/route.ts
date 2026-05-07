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

function stripMarkdownSyntaxForCompare(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line))
    .map((line) => line
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s{0,3}>\s?/, "")
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/^\s*\d+[.)、]\s+/, "")
      .replace(/\|/g, "")
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1$2")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1$2")
      .replace(/<\/?[^>]+>/g, "")
      .replace(/(\*\*|__|~~|`|==|\+\+|''|\*)/g, "")
    )
    .join("\n");
}

function normalizeComparableText(value: string): string {
  return stripMarkdownSyntaxForCompare(value)
    .replace(/\s+/g, "")
    .trim();
}

function preservesOriginalContent(candidate: string, original: string): boolean {
  const normalizedCandidate = normalizeComparableText(candidate);
  const normalizedOriginal = normalizeComparableText(original);
  return Boolean(normalizedCandidate) && normalizedCandidate === normalizedOriginal;
}

function buildFormatOnlyFallback(source: string): string {
  const lines = source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return source;

  return lines
    .map((line, index) => {
      if (/^\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+[.)、]\s+|>\s?|\|)/.test(line)) {
        return line;
      }
      if (index === 0 && line.length <= 42) {
        return `# ${line}`;
      }
      return line;
    })
    .join("\n\n");
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
  const safeMarkdown = preservesOriginalContent(markdown, fallback) ? markdown : normalized;
  if (!preservesOriginalContent(safeMarkdown, fallback)) {
    const formatOnly = buildFormatOnlyFallback(fallback);
    return {
      markdown: formatOnly,
      standardizedMarkdown: formatOnly,
      needsRewrite: false,
    };
  }

  return {
    markdown: safeMarkdown,
    standardizedMarkdown: safeMarkdown,
    needsRewrite: needsRewrite && safeMarkdown !== fallback,
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
              "你是 Markdown 排版格式化器，不是文案编辑器。",
              "任务：只给原文增加 Markdown 排版符号和换行，让它更适合小红书图文卡片排版。",
              "硬性要求：",
              "1) 绝对禁止改写、润色、总结、扩写、删减、调换顺序或翻译原文。",
              "2) 绝对禁止新增原文中不存在的标题、表头、标签、解释、情绪词、连接词或任何事实。",
              "3) 原文里的每一个非空白字符都必须保留，且顺序不变；只允许调整空格/换行，或添加 Markdown 控制符号（#、##、-、>、** 等）。",
              "4) 可以把原文中已有的一行加成标题，可以把原文中已有的逐条内容加成列表，但列表文字必须逐字不变。",
              "5) 已有 Markdown 表格可以修正分隔行；不要把普通键值信息改成新表格，因为表头会新增内容。",
              "6) 不要删除口水词、重复句、表情符号或标点；它们也是原文。",
              "7) 输出严格 JSON，不要 markdown 代码块。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              "请返回 JSON：",
              '{"markdown":"","standardizedMarkdown":"","needsRewrite":true}',
              "字段说明：",
              "- markdown: 只添加 Markdown 排版后的文本，原文字词必须逐字保留。",
              "- standardizedMarkdown: 同 markdown（兼容字段，保持一致）。",
              "- needsRewrite: 只能在确实添加了 Markdown 排版符号或换行时为 true；不得代表内容改写。",
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
