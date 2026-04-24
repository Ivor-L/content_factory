import prisma from "@/lib/prisma";
import { splitTextToChunks } from "@/lib/knowledge";

export const DEFAULT_CORE_DOCS: Array<{ path: string; title: string; content: string }> = [
  {
    path: "SOUL.md",
    title: "SOUL.md",
    content: [
      "# Soul",
      "",
      "定义这个仓库中 Agent 的长期价值观、决策偏好与边界。",
      "",
      "## Defaults",
      "- 真实优先，不编造来源",
      "- 文档优先，按文件树证据回答",
      "- 最小必要改动，确保可维护",
    ].join("\n"),
  },
  {
    path: "AGENTS.md",
    title: "AGENTS.md",
    content: [
      "# Agent Guide",
      "",
      "## Role",
      "以当前文件树与本文件夹内文档为准，不要写死固定人设。",
      "",
      "## Working Rules",
      "1. 回答前先判断是否需要读取文件；信息不足先 read，再回答。",
      "2. 文件修改遵循最小改动原则，保持结构清晰可维护。",
      "3. 若需求不明确，先给可执行方案，再实施。",
      "",
      "## Output",
      "- 默认输出可执行步骤。",
      "- 需要文件操作时返回 agent_actions。",
    ].join("\n"),
  },
  {
    path: "IDENTITY.md",
    title: "IDENTITY.md",
    content: [
      "# Identity",
      "",
      "## 产品定位",
      "- 以当前文件夹文档为准",
      "- 基于文件树做文档增删改查",
      "",
      "## 交互原则",
      "- 简洁、可执行、可追踪",
      "- 优先复用已有文档，不臆造事实",
    ].join("\n"),
  },
  {
    path: "MEMORY.md",
    title: "MEMORY.md",
    content: [
      "# Memory",
      "",
      "用于记录长期有效的项目约定、术语、决策结果。",
      "",
      "## Template",
      "- Date: YYYY-MM-DD",
      "- Decision: ...",
      "- Impact: ...",
      "- Related Files: ...",
    ].join("\n"),
  },
  {
    path: "USER.md",
    title: "USER.md",
    content: [
      "# User Preferences",
      "",
      "用于记录用户偏好与风格约束。",
      "",
      "## Template",
      "- Writing Style:",
      "- Forbidden Patterns:",
      "- Preferred Structure:",
      "- Notes:",
    ].join("\n"),
  },
  {
    path: "CLAUDE.md",
    title: "CLAUDE.md",
    content: [
      "# Project Instructions",
      "",
      "## Core Workflow",
      "1. 先定位相关文件再回答",
      "2. 信息不足时先 read 再输出结论",
      "3. 涉及改动时给出清晰执行步骤",
      "",
      "## Style",
      "- 输出简洁、可执行",
      "- 明确列出假设与边界条件",
    ].join("\n"),
  },
];

function normalizeDocPath(input: string) {
  return input
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/")
    .trim();
}

function pathBasename(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function toNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function getVirtualPathFromFile(file: {
  title: string;
  originalPath: string | null;
  metadata: unknown;
}) {
  const metadata =
    file.metadata && typeof file.metadata === "object" && !Array.isArray(file.metadata)
      ? (file.metadata as Record<string, unknown>)
      : {};

  return normalizeDocPath(
    toNonEmptyString(metadata.relativePath) ||
      toNonEmptyString(metadata.webkitRelativePath) ||
      toNonEmptyString(metadata.path) ||
      toNonEmptyString(file.originalPath) ||
      toNonEmptyString(file.title),
  );
}

export async function ensureCoreDocsForFolder(params: {
  userId: string;
  folderId: string;
}) {
  const { userId, folderId } = params;

  const folder = await prisma.knowledgeFolder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  });
  if (!folder) {
    return { created: 0, skipped: 0, createdPaths: [] as string[] };
  }

  const files = await prisma.knowledgeFile.findMany({
    where: { folderId: folder.id, userId },
    select: {
      title: true,
      originalPath: true,
      metadata: true,
    },
    take: 2500,
  });

  const existed = new Set<string>();
  for (const file of files) {
    const virtualPath = getVirtualPathFromFile(file);
    const baseByPath = pathBasename(virtualPath).toLowerCase();
    const baseByTitle = pathBasename(normalizeDocPath(file.title)).toLowerCase();
    if (baseByPath) existed.add(baseByPath);
    if (baseByTitle) existed.add(baseByTitle);
  }

  const hasAnyCoreDoc = Array.from(existed).some((basename) =>
    DEFAULT_CORE_DOCS.some((doc) => doc.path.toLowerCase() === basename),
  );

  if (hasAnyCoreDoc) {
    return { created: 0, skipped: 0, createdPaths: [] as string[] };
  }

  let created = 0;
  let skipped = 0;
  const createdPaths: string[] = [];

  for (const doc of DEFAULT_CORE_DOCS) {
    const basename = doc.path.toLowerCase();
    if (existed.has(basename)) {
      skipped += 1;
      continue;
    }

    const chunks = splitTextToChunks(doc.content, {
      chunkSize: 1100,
      overlap: 160,
      maxChunks: 240,
    });

    await prisma.$transaction(async (tx) => {
      const file = await tx.knowledgeFile.create({
        data: {
          folderId: folder.id,
          userId,
          title: doc.title,
          sourceType: "manual",
          status: "READY",
          originalPath: doc.path,
          metadata: {
            relativePath: doc.path,
            path: doc.path,
            originalFilename: doc.title,
            rawContent: doc.content,
            createdBy: "system-core-doc-bootstrap",
          },
        },
      });

      if (chunks.length > 0) {
        await tx.knowledgeChunk.createMany({
          data: chunks.map((chunk) => ({
            folderId: folder.id,
            fileId: file.id,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            contentLength: chunk.contentLength,
          })),
        });
      }
    });

    existed.add(basename);
    created += 1;
    createdPaths.push(doc.path);
  }

  return { created, skipped, createdPaths };
}
