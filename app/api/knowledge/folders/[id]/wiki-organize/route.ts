import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { splitTextToChunks } from "@/lib/knowledge";
import { callCloudChat } from "@/lib/cloudLLM";

type Params = {
  params: Promise<{ id: string }>;
};

const RAW_PREFIX = "01-素材库/raw/";
const WIKI_PREFIX = "01-素材库/wiki/llm-wiki/";
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;

function normalizeDocPath(input: string) {
  return input
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/")
    .trim();
}

function toNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function toMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getFilePath(file: { title: string; originalPath: string | null; metadata: unknown }) {
  const metadata = toMetadataRecord(file.metadata);
  return normalizeDocPath(
    toNonEmptyString(metadata.relativePath) ||
      toNonEmptyString(metadata.webkitRelativePath) ||
      toNonEmptyString(metadata.path) ||
      toNonEmptyString(file.originalPath) ||
      toNonEmptyString(file.title),
  );
}

function isRawPath(path: string) {
  return normalizeDocPath(path).toLowerCase().startsWith(RAW_PREFIX.toLowerCase());
}

function sanitizeMdBaseName(input: string) {
  const normalized = normalizeDocPath(input);
  const base = normalized.split("/").filter(Boolean).pop() || "untitled";
  const noExt = base.replace(/\.(md|markdown|txt)$/i, "");
  return noExt.replace(/[\\/:*?"<>|#%]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-") || "untitled";
}

function getWikiPathFromRaw(rawPath: string, rawFileId: string) {
  const safeBase = sanitizeMdBaseName(rawPath);
  const shortId = rawFileId.slice(0, 8);
  return `${WIKI_PREFIX}${safeBase}-${shortId}.md`;
}

function getRawContentFromFile(file: {
  metadata: unknown;
  chunks: Array<{ content: string }>;
}) {
  const metadata = toMetadataRecord(file.metadata);
  const raw = toNonEmptyString(metadata.rawContent);
  if (raw) return raw;
  return file.chunks.map((chunk) => chunk.content).filter(Boolean).join("\n\n").trim();
}

function isPendingRawFile(file: { title: string; originalPath: string | null; metadata: unknown }) {
  const path = getFilePath(file);
  if (!isRawPath(path)) return false;
  const metadata = toMetadataRecord(file.metadata);
  const contentFactory = toMetadataRecord(metadata.contentFactory);
  const wikiStatus = toNonEmptyString(contentFactory.wikiStatus).toLowerCase();
  return wikiStatus !== "done";
}

function buildFallbackWikiMarkdown(params: {
  title: string;
  rawPath: string;
  rawText: string;
}) {
  const { title, rawPath, rawText } = params;
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  const digest = paragraphs.slice(0, 3).join("\n\n");

  return [
    `# ${title} · llm-wiki`,
    "",
    "## 来源",
    `- 原文路径: ${rawPath}`,
    "",
    "## 核心摘要",
    digest || "原文内容较短，建议补充更多上下文后再次梳理。",
    "",
    "## 可复用信息",
    "- 结论待补充",
    "- 观点待补充",
    "",
    "## 后续动作",
    "- 可继续在此文档补充“受众/钩子/结构模板/金句”。",
  ].join("\n");
}

async function buildWikiMarkdownWithLlm(params: {
  title: string;
  rawPath: string;
  rawText: string;
}) {
  const { title, rawPath, rawText } = params;
  const clippedText = rawText.length > 16_000 ? `${rawText.slice(0, 16_000)}\n\n[内容已截断]` : rawText;
  const fallback = buildFallbackWikiMarkdown(params);

  try {
    const model = process.env.CONTENT_FACTORY_WIKI_MODEL?.trim() || "gpt-4.1-mini";
    const response = await callCloudChat({
      model,
      temperature: 0.2,
      maxOutputTokens: 1600,
      system: [
        "你是内容工厂的 Wiki 梳理助手。",
        "任务：把原始文章整理为可复用的 llm-wiki 文档。",
        "要求：输出 Markdown，结构稳定，不要输出 JSON。",
      ].join("\n"),
      user: [
        `标题: ${title}`,
        `原文路径: ${rawPath}`,
        "",
        "请输出以下结构：",
        "# {标题} · llm-wiki",
        "## 来源",
        "## 一句话结论",
        "## 核心观点（3-6条）",
        "## 可复用表达（3-8条）",
        "## 风险与边界",
        "## 可直接复用的选题方向（3-5条）",
        "## 标签",
        "",
        "原始文章内容：",
        clippedText,
      ].join("\n"),
    });

    const text = response.text.trim();
    if (!text) return fallback;
    return text;
  } catch {
    return fallback;
  }
}

function normalizeLimit(input: unknown) {
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(value), 1), MAX_LIMIT);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: folderId } = await params;
  const folder = await prisma.knowledgeFolder.findFirst({
    where: { id: folderId, userId },
    select: { id: true, name: true },
  });
  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // optional body
  }
  const limit = normalizeLimit(body.limit);

  const allFiles = await prisma.knowledgeFile.findMany({
    where: { folderId: folder.id, userId },
    select: {
      id: true,
      title: true,
      originalPath: true,
      metadata: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 3000,
  });

  const pendingRawFiles = allFiles.filter((file) => isPendingRawFile(file));
  const targetFiles = pendingRawFiles.slice(0, limit);

  if (targetFiles.length === 0) {
    return NextResponse.json({
      data: {
        folderId: folder.id,
        folderName: folder.name,
        requested: limit,
        processed: 0,
        succeeded: 0,
        failed: 0,
        pendingBefore: pendingRawFiles.length,
        pendingAfter: 0,
        items: [],
      },
    });
  }

  const results: Array<{
    rawFileId: string;
    rawPath: string;
    wikiPath?: string;
    wikiFileId?: string;
    ok: boolean;
    error?: string;
  }> = [];
  let succeeded = 0;
  let failed = 0;

  for (const row of targetFiles) {
    const rawPath = getFilePath(row);
    try {
      const detail = await prisma.knowledgeFile.findFirst({
        where: { id: row.id, folderId: folder.id, userId },
        select: {
          id: true,
          title: true,
          originalPath: true,
          metadata: true,
          chunks: {
            select: { content: true },
            orderBy: { chunkIndex: "asc" },
            take: 24,
          },
        },
      });
      if (!detail) {
        failed += 1;
        results.push({
          rawFileId: row.id,
          rawPath,
          ok: false,
          error: "Raw file not found",
        });
        continue;
      }

      const rawText = getRawContentFromFile(detail);
      if (!rawText) {
        failed += 1;
        const metadata = toMetadataRecord(detail.metadata);
        const contentFactory = toMetadataRecord(metadata.contentFactory);
        await prisma.knowledgeFile.update({
          where: { id: detail.id },
          data: {
            metadata: {
              ...metadata,
              contentFactory: {
                ...contentFactory,
                kind: "raw",
                wikiStatus: "failed",
                wikiLastError: "Raw content is empty",
                wikiLastAttemptAt: new Date().toISOString(),
              },
            },
          },
        });
        results.push({
          rawFileId: detail.id,
          rawPath,
          ok: false,
          error: "Raw content is empty",
        });
        continue;
      }

      const wikiPath = getWikiPathFromRaw(rawPath, detail.id);
      const wikiMarkdown = await buildWikiMarkdownWithLlm({
        title: detail.title,
        rawPath,
        rawText,
      });
      const chunks = splitTextToChunks(wikiMarkdown, {
        chunkSize: 1100,
        overlap: 160,
        maxChunks: 240,
      });

      const { wikiFileId } = await prisma.$transaction(async (tx) => {
        const existingWiki = await tx.knowledgeFile.findFirst({
          where: {
            folderId: folder.id,
            userId,
            originalPath: wikiPath,
          },
          select: {
            id: true,
            metadata: true,
          },
        });

        const nowIso = new Date().toISOString();
        let wikiId = "";
        if (existingWiki) {
          const wikiMetadata = toMetadataRecord(existingWiki.metadata);
          const wikiCf = toMetadataRecord(wikiMetadata.contentFactory);
          await tx.knowledgeChunk.deleteMany({ where: { fileId: existingWiki.id } });
          await tx.knowledgeFile.update({
            where: { id: existingWiki.id },
            data: {
              title: `${sanitizeMdBaseName(rawPath)}-llm-wiki.md`,
              sourceType: "wiki-organizer",
              status: "READY",
              originalPath: wikiPath,
              metadata: {
                ...wikiMetadata,
                relativePath: wikiPath,
                path: wikiPath,
                originalFilename: `${sanitizeMdBaseName(rawPath)}-llm-wiki.md`,
                rawContent: wikiMarkdown,
                contentFactory: {
                  ...wikiCf,
                  kind: "wiki",
                  sourceFileId: detail.id,
                  sourcePath: rawPath,
                  generatedAt: nowIso,
                },
              },
            },
          });
          wikiId = existingWiki.id;
        } else {
          const createdWiki = await tx.knowledgeFile.create({
            data: {
              folderId: folder.id,
              userId,
              title: `${sanitizeMdBaseName(rawPath)}-llm-wiki.md`,
              sourceType: "wiki-organizer",
              status: "READY",
              originalPath: wikiPath,
              metadata: {
                relativePath: wikiPath,
                path: wikiPath,
                originalFilename: `${sanitizeMdBaseName(rawPath)}-llm-wiki.md`,
                rawContent: wikiMarkdown,
                contentFactory: {
                  kind: "wiki",
                  sourceFileId: detail.id,
                  sourcePath: rawPath,
                  generatedAt: nowIso,
                },
              },
            },
            select: { id: true },
          });
          wikiId = createdWiki.id;
        }

        if (chunks.length > 0) {
          await tx.knowledgeChunk.createMany({
            data: chunks.map((chunk) => ({
              folderId: folder.id,
              fileId: wikiId,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              contentLength: chunk.contentLength,
            })),
          });
        }

        const rawMetadata = toMetadataRecord(detail.metadata);
        const rawCf = toMetadataRecord(rawMetadata.contentFactory);
        await tx.knowledgeFile.update({
          where: { id: detail.id },
          data: {
            metadata: {
              ...rawMetadata,
              contentFactory: {
                ...rawCf,
                kind: "raw",
                wikiStatus: "done",
                wikiPath,
                wikiFileId: wikiId,
                wikiLastError: null,
                wikiLastAttemptAt: nowIso,
                wikiUpdatedAt: nowIso,
              },
            },
          },
        });

        return { wikiFileId: wikiId };
      });

      succeeded += 1;
      results.push({
        rawFileId: detail.id,
        rawPath,
        wikiPath,
        wikiFileId,
        ok: true,
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Unknown error";
      const rawMetadata = toMetadataRecord(row.metadata);
      const rawCf = toMetadataRecord(rawMetadata.contentFactory);
      await prisma.knowledgeFile.update({
        where: { id: row.id },
        data: {
          metadata: {
            ...rawMetadata,
            contentFactory: {
              ...rawCf,
              kind: "raw",
              wikiStatus: "failed",
              wikiLastError: message,
              wikiLastAttemptAt: new Date().toISOString(),
            },
          },
        },
      });
      results.push({
        rawFileId: row.id,
        rawPath,
        ok: false,
        error: message,
      });
    }
  }

  const pendingAfter = Math.max(pendingRawFiles.length - succeeded, 0);

  return NextResponse.json({
    data: {
      folderId: folder.id,
      folderName: folder.name,
      requested: limit,
      processed: targetFiles.length,
      succeeded,
      failed,
      pendingBefore: pendingRawFiles.length,
      pendingAfter,
      items: results,
    },
  });
}
