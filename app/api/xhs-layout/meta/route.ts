import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { splitMarkdownDocument } from "@/lib/markdown-frontmatter";
import { rewriteXhsNote } from "@/lib/xhsRewritePrompt";

type XhsMetaPayload = {
  title: string;
  body: string;
  tags: string[];
};

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
  const { userId } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
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
    const result = await rewriteXhsNote({
      title: fallbackTitle,
      body: sourceText,
      imageTexts: [],
      mode: "publishMeta",
      filePath,
    });
    const safeMeta = toSafeMeta(result);

    if (!safeMeta.title && !safeMeta.body && safeMeta.tags.length === 0) {
      return NextResponse.json({ error: "AI 未生成有效内容" }, { status: 502 });
    }

    return NextResponse.json({ data: safeMeta });
  } catch (error) {
    console.error("[xhs-layout/meta] generation failed", error);
    return NextResponse.json({ error: "AI 生成失败，请稍后重试" }, { status: 500 });
  }
}
