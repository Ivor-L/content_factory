import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { callCloudJson } from "@/lib/cloudLLM";
import { splitMarkdownDocument } from "@/lib/markdown-frontmatter";

type XhsMetaPayload = {
  title: string;
  body: string;
  tags: string[];
};

const MODEL = process.env.CLOUD_WRITING_MODEL || process.env.CLOUD_DEFAULT_MODEL || "gpt-4o-mini";
const MAX_SOURCE_LENGTH = 14000;

function sanitizeTag(raw: string): string {
  return String(raw ?? "")
    .replace(/^#+/, "")
    .replace(/[，、]/g, ",")
    .replace(/\s+/g, "")
    .replace(/[^\w\u4E00-\u9FFF-]/g, "")
    .trim()
    .slice(0, 16);
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = sanitizeTag(tag);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function sanitizeText(input: unknown, maxLength: number): string {
  if (typeof input !== "string") return "";
  return input.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function toSafeMeta(raw: unknown): XhsMetaPayload {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    title: sanitizeText(source.title, 32),
    body: sanitizeText(source.body, 360),
    tags: dedupeTags(Array.isArray(source.tags) ? source.tags.map((item) => String(item)) : []).slice(0, 8),
  };
}

function getFallbackTitle(filePath: string): string {
  const file = filePath.split("/").pop() || filePath;
  const title = file.replace(/\.[^.]+$/, "").trim();
  return title || "内容总结";
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const markdown = typeof body?.markdown === "string" ? body.markdown : "";
  const filePath = typeof body?.filePath === "string" && body.filePath.trim() ? body.filePath.trim() : "untitled.md";

  if (!markdown.trim()) {
    return NextResponse.json({ error: "正文为空，无法自动生成" }, { status: 400 });
  }

  const { body: markdownBody } = splitMarkdownDocument(markdown);
  const sourceText = (markdownBody || markdown).slice(0, MAX_SOURCE_LENGTH);
  const fallbackTitle = getFallbackTitle(filePath);

  try {
    const response = await callCloudJson<XhsMetaPayload>({
      model: MODEL,
      temperature: 0.35,
      maxOutputTokens: 900,
      system: [
        "你是资深小红书图文编辑。",
        "请基于用户提供的正文内容进行总结与重写，生成小红书发布结构。",
        "核心约束：必须是总结重写，不得直接原样拷贝大段正文。",
        "输出严格 JSON，不要 markdown 代码块。",
      ].join("\n"),
      user: [
        `文件名参考标题: ${fallbackTitle}`,
        "请返回 JSON 字段：",
        '{"title":"","body":"","tags":[]}',
        "字段要求:",
        "1) title: 发布标题，12-28字，不加井号。",
        "2) body: 发布正文，120-320字，口语化，有信息密度，必须是提炼总结而非复制原文。",
        "3) tags: 4-8个标签，只写词本身，不要#。",
        "正文如下:",
        sourceText,
      ].join("\n"),
      metadata: {
        feature: "xhs-layout-meta",
        userId,
      },
    });

    const safeMeta = toSafeMeta(response.data ?? {});

    if (!safeMeta.title && !safeMeta.body && safeMeta.tags.length === 0) {
      return NextResponse.json({ error: "AI 未生成有效内容" }, { status: 502 });
    }

    return NextResponse.json({ data: safeMeta });
  } catch (error) {
    console.error("[xhs-layout/meta] generation failed", error);
    return NextResponse.json({ error: "AI 生成失败，请稍后重试" }, { status: 500 });
  }
}
