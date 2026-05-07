import { NextRequest, NextResponse } from "next/server";
import { getApiKeyForUser, getRequestUserContext } from "@/lib/authServer";
import { resolveCanvasCreditsApiKey } from "@/lib/canvasCredits";
import { deductConfiguredCredits } from "@/lib/creditBilling";

type NormalizePayload = {
  markdown: string;
  standardizedMarkdown: string;
  needsRewrite: boolean;
};

const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";
const ALLOWED_MODELS = new Set([
  DEFAULT_MODEL,
  "gemini-2.5-pro",
]);
const MODEL = ALLOWED_MODELS.has((process.env.XHS_LAYOUT_NORMALIZE_MODEL || "").trim())
  ? (process.env.XHS_LAYOUT_NORMALIZE_MODEL || "").trim()
  : DEFAULT_MODEL;
const MAX_SOURCE_LENGTH = 16000;

function readEnv(name: string) {
  return (process.env[name] || "").trim();
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function resolveCanvasChatEndpoint() {
  const explicit = readEnv("CANVAS_CHAT_COMPLETIONS_URL");
  if (explicit) return explicit;
  const baseUrl = readEnv("CANVAS_API_BASE_URL") || readEnv("CLOUD_API_BASE_URL");
  if (!baseUrl) return "";
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
}

function resolveCanvasUpstreamApiKey() {
  return readEnv("CANVAS_UPSTREAM_DEFAULT_API_KEY") || readEnv("CLOUD_API_KEY");
}

function sanitizeInput(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim();
}

function splitPlainParagraph(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (trimmed.length <= 72) return [trimmed];

  const sentences = trimmed.match(/[^。！？!?；;]+[。！？!?；;]?/g)
    ?.map((item) => item.trim())
    .filter(Boolean) || [trimmed];

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const next = current ? `${current}${sentence}` : sentence;
    if (current && next.length > 72) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [trimmed];
}

function buildFormatOnlyFallback(source: string): string {
  const lines = source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return source;

  const formatted: string[] = [];
  lines.forEach((line, index) => {
    if (/^\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+[.)、]\s+|>\s?|\|)/.test(line)) {
      formatted.push(line);
      return;
    }
    if (index === 0 && line.length <= 42) {
      formatted.push(`# ${line}`);
      return;
    }
    if (/^[^：:]{2,18}[：:]$/.test(line)) {
      formatted.push(`## ${line.replace(/[：:]$/, "")}`);
      return;
    }
    splitPlainParagraph(line).forEach((chunk) => formatted.push(chunk));
  });

  return formatted.join("\n\n");
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

function toNormalizePayload(raw: unknown, fallback: string): NormalizePayload {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const markdown = sanitizeInput(source.markdown);
  const standardizedMarkdown = sanitizeInput(source.standardizedMarkdown || source.standard_markdown || source.normalizedMarkdown);
  const needsRewrite = Boolean(source.needsRewrite ?? source.needs_rewrite);
  const normalizedMarkdown = standardizedMarkdown || markdown;

  if (!normalizedMarkdown) {
    const formatOnly = buildFormatOnlyFallback(fallback);
    return {
      markdown: formatOnly,
      standardizedMarkdown: formatOnly,
      needsRewrite: false,
    };
  }

  return {
    markdown: normalizedMarkdown,
    standardizedMarkdown: normalizedMarkdown,
    needsRewrite: needsRewrite || normalizedMarkdown !== fallback,
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

  // AI 排版复用 Canvas 上游模型通道，避免被全局写作模型配置覆盖。
  const upstreamApiKey = resolveCanvasUpstreamApiKey();
  if (!upstreamApiKey) {
    return NextResponse.json({ error: "Canvas AI 服务尚未配置，请联系管理员处理。" }, { status: 500 });
  }

  const endpoint = resolveCanvasChatEndpoint();
  if (!endpoint) {
    return NextResponse.json({ error: "缺少 Canvas AI 对话接口配置" }, { status: 501 });
  }

  const body = await request.json().catch(() => null);
  const markdown = sanitizeInput(body?.markdown).slice(0, MAX_SOURCE_LENGTH);

  if (!markdown) {
    return NextResponse.json({ error: "内容为空，无法规范化" }, { status: 400 });
  }

  const userApiKey = await getApiKeyForUser(userId).catch(() => null);
  const creditsApiKey = resolveCanvasCreditsApiKey(userApiKey);
  if (!creditsApiKey) {
    return NextResponse.json({ error: "积分服务未配置，请联系管理员处理。" }, { status: 400 });
  }

  try {
    await deductConfiguredCredits({
      apiKey: creditsApiKey,
      featureKey: "xhs_layout_normalize",
      userId,
      defaultAmount: 1,
      modelKey: MODEL,
      workflowId: "xhs_layout_normalize",
      workflowName: "小红书 AI 排版",
      reason: "xhs_layout_normalize",
    });
  } catch (error) {
    console.error("[xhs-layout/normalize] credit deduction failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error && error.message
          ? error.message
          : "积分扣费失败，请稍后重试",
      },
      { status: 402 },
    );
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${upstreamApiKey}`,
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
              "你是小红书图文卡片的 Markdown 信息架构排版师，不是文案编辑器。",
              "任务：先理解原文的信息层级，再把原文整理成更利于阅读的 Markdown 文档，用于图文卡片渲染。",
              "渲染器支持：# / ## / ### 标题、段落、引用 >、无序/有序列表、**加粗**、==高亮==、++下划线++、~~删除线~~、分隔线 ---、Markdown 表格。",
              "硬性要求：",
              "1) 禁止润色、总结、扩写、删减核心信息、调换事实顺序或翻译原文。",
              "2) 禁止新增原文没有的观点、事实、情绪词、连接词、标签、CTA 或解释。",
              "3) 允许的文字修正只有：明显重复字/词、明显错别字、OCR/复制导致的错误断行；除此之外不要换词。",
              "4) 优先使用原文中的标题句、结论句、问题句、数字项、对比项、步骤项作为 Markdown 标题/重点/列表。",
              "5) 可以用 **加粗** 或 ==高亮== 标出原文中的关键词、数字、结论，但被标记的文字必须来自原文。",
              "6) 可以把原文里天然并列、对比、参数、费用、步骤、优缺点等内容整理成表格；表头必须来自原文已有分类/字段，没有现成字段就不要造表。",
              "7) 可以修正错误换行、合并被断开的句子、拆分过长段落，让阅读节奏更清晰。",
              "8) 不要输出“封面标题/副标题/正文/标签”等模板字段，除非原文已经有这些字。",
              "9) 输出严格 JSON，不要 markdown 代码块。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              "请返回 JSON：",
              '{"markdown":"","standardizedMarkdown":"","needsRewrite":true}',
              "字段说明：",
              "- markdown: 排版后的 Markdown 文档。要体现标题、重点、列表、引用或表格等阅读层级。",
              "- standardizedMarkdown: 同 markdown（兼容字段，保持一致）。",
              "- needsRewrite: 只表示做了排版或允许范围内的纠错；不得代表内容改写。",
              "自检：输出前确认没有新增原文不存在的信息；除明显重复、错别字、错误断行外，没有替换原文字词。",
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
    const normalized = toNormalizePayload(parsed, markdown);

    return NextResponse.json({ data: normalized });
  } catch (error) {
    console.error("[xhs-layout/normalize] failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error && error.message
          ? error.message
          : "内容规范化失败，请稍后重试",
      },
      { status: 500 },
    );
  }
}
