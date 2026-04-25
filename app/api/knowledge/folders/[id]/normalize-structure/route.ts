import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { splitTextToChunks } from "@/lib/knowledge";

type Params = {
  params: Promise<{ id: string }>;
};

type KnowledgeRow = {
  id: string;
  title: string;
  originalPath: string | null;
  metadata: unknown;
  updatedAt: Date;
  createdAt: Date;
};

const DEFAULT_FOLDER_PATHS = [
  "00-系统",
  "00-系统/任务提示词",
  "01-素材库",
  "01-素材库/raw",
  "01-素材库/raw/legacy",
  "01-素材库/wiki",
  "01-素材库/wiki/llm-wiki",
  "01-素材库/wiki/topics",
  "01-素材库/wiki/audience",
  "01-素材库/wiki/hooks",
  "02-选题池",
  "02-选题池/待筛选",
  "02-选题池/公众号长文",
  "02-选题池/口播文案",
  "02-选题池/小红书图文",
  "03-内容工厂",
  "03-内容工厂/公众号长文",
  "03-内容工厂/公众号长文/初稿",
  "03-内容工厂/口播文案",
  "03-内容工厂/口播文案/初稿",
  "03-内容工厂/小红书图文",
  "03-内容工厂/小红书图文/初稿",
  "04-已发布归档",
  "04-已发布归档/公众号已发布",
] as const;

const DEFAULT_TEXT_FILES: Array<{ path: string; content: string }> = [
  {
    path: "AGENTS.md",
    content: [
      "# AGENTS",
      "",
      "## 角色定位",
      "- 你是内容工厂的执行 Agent。",
      "- 默认遵循本仓库结构，不得擅自改动目录规范。",
      "",
      "## 执行边界",
      "- 原文入库统一写入 `01-素材库/raw/`。",
      "- 梳理产物统一写入 `01-素材库/wiki/llm-wiki/`。",
      "- 不得生成本地 shell 命令交付用户。",
      "",
      "## 文件操作",
      "- 优先使用 agent_actions 创建/更新文档。",
      "- 路径使用当前仓库相对路径。",
    ].join("\n"),
  },
  {
    path: "IDENTITY.md",
    content: [
      "# IDENTITY",
      "",
      "你是内容工厂的长期协作 Agent。",
      "",
      "## 身份约束",
      "- 目标：帮助用户稳定产出高质量内容资产。",
      "- 原则：真实、可复用、可追溯，不编造来源。",
      "- 默认流程：raw 入库 -> wiki 沉淀 -> 选题复用 -> 成品归档。",
      "",
      "## 行为准则",
      "- 先读仓库结构与规则文件再执行任务。",
      "- 路径与命名遵循默认目录规范。",
      "- 结果输出优先给可执行动作和可落地文件。",
    ].join("\n"),
  },
  {
    path: "soul.md",
    content: [
      "# soul",
      "",
      "- 真实优先，不编造来源。",
      "- 先入库，再沉淀，再复用。",
      "- 对话不中断，处理可异步。",
    ].join("\n"),
  },
  {
    path: "user.md",
    content: [
      "# user",
      "",
      "记录用户风格、禁用词、平台调性与偏好。",
      "",
      "## 模板",
      "- 平台：",
      "- 风格：",
      "- 禁用表达：",
      "- 特殊约束：",
    ].join("\n"),
  },
  {
    path: "memory.md",
    content: [
      "# memory",
      "",
      "记录长期有效的决策、流程与踩坑结论。",
      "",
      "- Date:",
      "- Decision:",
      "- Reason:",
      "- Impact:",
    ].join("\n"),
  },
  {
    path: "00-系统/任务提示词/01-素材入库任务.md",
    content: [
      "# 01 素材入库任务",
      "",
      "目标：把原始文章或爆款复刻解析结果沉淀到 raw 层。",
      "",
      "## 规则",
      "- 所有原始内容写入 `01-素材库/raw/`。",
      "- 文档首部尽量包含来源、平台、时间、作者。",
      "- 不直接改写原文，不删减核心信息。",
    ].join("\n"),
  },
  {
    path: "00-系统/任务提示词/02-可复用沉淀任务.md",
    content: [
      "# 02 可复用沉淀任务",
      "",
      "目标：把 raw 内容整理成可复用 wiki。",
      "",
      "## 规则",
      "- 产出统一写入 `01-素材库/wiki/llm-wiki/`。",
      "- 每篇 wiki 必须回链原文路径。",
      "- 重点提炼：观点、结构、钩子、可复用表达。",
    ].join("\n"),
  },
  {
    path: "01-素材库/wiki/index.md",
    content: [
      "# Wiki Index",
      "",
      "用于登记 llm-wiki 文档与主题索引。",
    ].join("\n"),
  },
  {
    path: "01-素材库/wiki/log.md",
    content: [
      "# Wiki Log",
      "",
      "用于记录每次梳理任务处理结果。",
    ].join("\n"),
  },
  {
    path: "01-素材库/wiki/style-playbook.md",
    content: [
      "# Style Playbook",
      "",
      "沉淀已验证有效的表达方式、排版模板与开头结构。",
    ].join("\n"),
  },
];

const ALLOWED_TOP_LEVEL = new Set([
  "00-系统",
  "01-素材库",
  "02-选题池",
  "03-内容工厂",
  "04-已发布归档",
  "AGENTS.md",
  "IDENTITY.md",
  "soul.md",
  "user.md",
  "memory.md",
]);
const ALLOWED_TOP_LEVEL_LOWER = new Set(Array.from(ALLOWED_TOP_LEVEL).map((item) => item.toLowerCase()));

function normalizeDocPath(input: string) {
  return input
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/")
    .trim();
}

function toMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function getVirtualPath(file: KnowledgeRow) {
  const metadata = toMetadataRecord(file.metadata);
  return normalizeDocPath(
    toNonEmptyString(metadata.relativePath) ||
      toNonEmptyString(metadata.webkitRelativePath) ||
      toNonEmptyString(metadata.path) ||
      toNonEmptyString(file.originalPath) ||
      toNonEmptyString(file.title),
  );
}

function getBaseName(path: string) {
  const normalized = normalizeDocPath(path);
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function hasHiddenPathSegment(path: string) {
  return normalizeDocPath(path)
    .split("/")
    .filter(Boolean)
    .some((segment) => segment.startsWith("."));
}

function sanitizeFileName(input: string) {
  return input.replace(/[\\/:*?"<>|#%]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-");
}

function ensureMarkdownPath(input: string) {
  const normalized = normalizeDocPath(input);
  if (!normalized) return "";
  if (/\.(md|markdown|txt)$/i.test(normalized)) return normalized;
  return `${normalized}.md`;
}

function getTopLevel(path: string) {
  const normalized = normalizeDocPath(path);
  const parts = normalized.split("/").filter(Boolean);
  return parts[0] || "";
}

function detectWrapperPrefix(paths: string[]) {
  const firstSegments = paths
    .map((path) => normalizeDocPath(path).split("/").filter(Boolean)[0] || "")
    .filter(Boolean);
  if (!firstSegments.length) return "";

  const counts = new Map<string, number>();
  for (const segment of firstSegments) {
    counts.set(segment, (counts.get(segment) || 0) + 1);
  }

  let topSegment = "";
  let topCount = 0;
  for (const [segment, count] of counts.entries()) {
    if (count > topCount) {
      topSegment = segment;
      topCount = count;
    }
  }
  if (!topSegment) return "";
  if (ALLOWED_TOP_LEVEL_LOWER.has(topSegment.toLowerCase())) return "";

  const ratio = topCount / firstSegments.length;
  if (ratio < 0.7) return "";
  return topSegment;
}

function isAllowedPath(path: string) {
  const normalized = normalizeDocPath(path);
  const top = getTopLevel(normalized);
  if (!top) return false;
  if (ALLOWED_TOP_LEVEL_LOWER.has(top.toLowerCase()) && !top.includes(".")) return true;
  if (ALLOWED_TOP_LEVEL_LOWER.has(normalized.toLowerCase())) return true;
  return false;
}

function stripMarkdownExt(input: string) {
  return input.replace(/\.(md|markdown|txt)$/i, "");
}

function isUuidHeavyName(input: string) {
  const token = input.trim().toLowerCase();
  if (!token) return false;
  const plainUuid = /^[0-9a-f]{8}-[0-9a-f-]{20,}$/.test(token);
  const chainedUuid = /^([0-9a-f]{8}-[0-9a-f-]{20,})(__+[0-9a-f-]{8,})+$/.test(token);
  return plainUuid || chainedUuid;
}

function pickLegacyBaseName(params: { originalPath: string; fileId: string; title: string; metadata: unknown }) {
  const { originalPath, fileId, title, metadata } = params;
  const metadataRecord = toMetadataRecord(metadata);
  const candidates = [
    toNonEmptyString(metadataRecord.originalFilename),
    toNonEmptyString(title),
    getBaseName(originalPath),
  ];

  for (const item of candidates) {
    if (!item) continue;
    const normalized = normalizeDocPath(item);
    const base = stripMarkdownExt(getBaseName(normalized));
    const safe = sanitizeFileName(base).trim();
    if (!safe) continue;
    if (isUuidHeavyName(safe)) continue;
    return safe;
  }

  return `legacy-${fileId.slice(0, 8)}`;
}

function toLegacyRawPath(params: { originalPath: string; fileId: string; title: string; metadata: unknown }) {
  const base = pickLegacyBaseName(params);
  return `01-素材库/raw/legacy/${ensureMarkdownPath(base)}`;
}

function markerPathForFolder(folderPath: string) {
  return `${normalizeDocPath(folderPath)}/__folder__.md`;
}

function markerContent(folderPath: string) {
  return [
    `# ${folderPath}`,
    "",
    "Folder marker file. Keep this file to preserve empty directory in file tree.",
  ].join("\n");
}

function toJsonValue(record: Record<string, unknown>) {
  return record as unknown as Prisma.InputJsonValue;
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

  const files = await prisma.knowledgeFile.findMany({
    where: { folderId: folder.id, userId },
    select: {
      id: true,
      title: true,
      originalPath: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 4000,
  });

  const allPaths = files.map((row) => getVirtualPath(row)).filter(Boolean);
  const wrapperPrefix = detectWrapperPrefix(allPaths);

  const deleteIds = new Set<string>();
  const desiredPathById = new Map<string, string>();
  const reasonById = new Map<string, "keep" | "move-legacy" | "remove-wrapper" | "delete">();

  for (const row of files) {
    const currentPath = getVirtualPath(row);
    if (!currentPath) {
      deleteIds.add(row.id);
      reasonById.set(row.id, "delete");
      continue;
    }

    let normalized = currentPath;
    if (wrapperPrefix && normalized.startsWith(`${wrapperPrefix}/`)) {
      normalized = normalizeDocPath(normalized.slice(wrapperPrefix.length + 1));
    }

    if (!normalized) {
      deleteIds.add(row.id);
      reasonById.set(row.id, "delete");
      continue;
    }

    const isFolderMarker = getBaseName(normalized).toLowerCase() === "__folder__.md";
    const extensionOk = /\.(md|markdown|txt)$/i.test(normalized);

    if (hasHiddenPathSegment(normalized)) {
      deleteIds.add(row.id);
      reasonById.set(row.id, "delete");
      continue;
    }

    if (!extensionOk) {
      desiredPathById.set(row.id, toLegacyRawPath({
        originalPath: normalized,
        fileId: row.id,
        title: row.title,
        metadata: row.metadata,
      }));
      reasonById.set(row.id, "move-legacy");
      continue;
    }

    const legacyBase = stripMarkdownExt(getBaseName(normalized));
    const shouldRenormalizeLegacyName =
      normalized.startsWith("01-素材库/raw/legacy/") &&
      isUuidHeavyName(legacyBase);
    if (shouldRenormalizeLegacyName) {
      desiredPathById.set(row.id, toLegacyRawPath({
        originalPath: normalized,
        fileId: row.id,
        title: row.title,
        metadata: row.metadata,
      }));
      reasonById.set(row.id, "move-legacy");
      continue;
    }

    if (isAllowedPath(normalized) || normalized.startsWith("00-系统/") || normalized.startsWith("01-素材库/") || normalized.startsWith("02-选题池/") || normalized.startsWith("03-内容工厂/") || normalized.startsWith("04-已发布归档/")) {
      if (isFolderMarker && !DEFAULT_FOLDER_PATHS.some((folderPath) => markerPathForFolder(folderPath) === normalized)) {
        deleteIds.add(row.id);
        reasonById.set(row.id, "delete");
      } else {
        desiredPathById.set(row.id, normalized);
        reasonById.set(row.id, wrapperPrefix && currentPath !== normalized ? "remove-wrapper" : "keep");
      }
      continue;
    }

    if (isFolderMarker) {
      deleteIds.add(row.id);
      reasonById.set(row.id, "delete");
      continue;
    }

    desiredPathById.set(row.id, toLegacyRawPath({
      originalPath: normalized,
      fileId: row.id,
      title: row.title,
      metadata: row.metadata,
    }));
    reasonById.set(row.id, "move-legacy");
  }

  const occupied = new Set<string>();
  const finalPathById = new Map<string, string>();
  const sortedRows = [...files].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  for (const row of sortedRows) {
    if (deleteIds.has(row.id)) continue;
    const desired = ensureMarkdownPath(desiredPathById.get(row.id) || "");
    if (!desired) {
      deleteIds.add(row.id);
      reasonById.set(row.id, "delete");
      continue;
    }
    let candidate = desired;
    let suffix = 1;
    while (occupied.has(candidate.toLowerCase())) {
      const base = getBaseName(desired).replace(/\.(md|markdown|txt)$/i, "");
      const ext = desired.match(/\.(md|markdown|txt)$/i)?.[0] || ".md";
      const parent = normalizeDocPath(desired).split("/").filter(Boolean).slice(0, -1).join("/");
      candidate = `${parent ? `${parent}/` : ""}${base}-${row.id.slice(0, 6)}-${suffix}${ext}`;
      suffix += 1;
    }
    occupied.add(candidate.toLowerCase());
    finalPathById.set(row.id, candidate);
  }

  let moved = 0;
  let deleted = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of files) {
      if (!deleteIds.has(row.id)) continue;
      await tx.knowledgeFile.delete({ where: { id: row.id } });
      deleted += 1;
    }

    for (const row of files) {
      if (deleteIds.has(row.id)) continue;
      const nextPath = finalPathById.get(row.id);
      if (!nextPath) continue;
      const currentPath = getVirtualPath(row);
      if (normalizeDocPath(currentPath).toLowerCase() === nextPath.toLowerCase()) continue;

      const metadata = toMetadataRecord(row.metadata);
      const contentFactory = toMetadataRecord(metadata.contentFactory);
      const nextMetadata: Record<string, unknown> = {
        ...metadata,
        relativePath: nextPath,
        path: nextPath,
        originalFilename: getBaseName(nextPath),
      };

      if (nextPath.startsWith("01-素材库/raw/")) {
        nextMetadata.contentFactory = {
          ...contentFactory,
          kind: "raw",
          wikiStatus: toNonEmptyString(contentFactory.wikiStatus) || "pending",
          importedFrom: toNonEmptyString(contentFactory.importedFrom) || "structure-normalizer",
        };
      }

      await tx.knowledgeFile.update({
        where: { id: row.id },
        data: {
          title: getBaseName(nextPath) || row.title,
          originalPath: nextPath,
          metadata: toJsonValue(nextMetadata),
        },
      });
      moved += 1;
    }
  });

  const latestFiles = await prisma.knowledgeFile.findMany({
    where: { folderId: folder.id, userId },
    select: {
      id: true,
      title: true,
      originalPath: true,
      metadata: true,
    },
    take: 5000,
  });
  const existingPaths = new Set(
    latestFiles.map((file) => normalizeDocPath(getVirtualPath({
      ...file,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as KnowledgeRow)).toLowerCase()).filter(Boolean),
  );

  let created = 0;
  const createFileWithContent = async (path: string, content: string, sourceType: string) => {
    const normalizedPath = ensureMarkdownPath(path);
    if (!normalizedPath) return;
    if (existingPaths.has(normalizedPath.toLowerCase())) return;

    const chunks = splitTextToChunks(content, {
      chunkSize: 1100,
      overlap: 160,
      maxChunks: 240,
    });

    await prisma.$transaction(async (tx) => {
      const file = await tx.knowledgeFile.create({
        data: {
          folderId: folder.id,
          userId,
          title: getBaseName(normalizedPath) || "untitled.md",
          sourceType,
          status: "READY",
          originalPath: normalizedPath,
          metadata: toJsonValue({
            relativePath: normalizedPath,
            path: normalizedPath,
            originalFilename: getBaseName(normalizedPath),
            rawContent: content,
            createdBy: sourceType,
          }),
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

    existingPaths.add(normalizedPath.toLowerCase());
    created += 1;
  };

  for (const folderPath of DEFAULT_FOLDER_PATHS) {
    await createFileWithContent(markerPathForFolder(folderPath), markerContent(folderPath), "structure-normalizer");
  }
  for (const file of DEFAULT_TEXT_FILES) {
    await createFileWithContent(file.path, file.content, "structure-normalizer");
  }

  const pendingRaw = await prisma.knowledgeFile.count({
    where: {
      folderId: folder.id,
      userId,
      OR: [
        { originalPath: { startsWith: "01-素材库/raw/" } },
        { originalPath: { startsWith: `${wrapperPrefix}/01-素材库/raw/` } },
      ],
    },
  });

  return NextResponse.json({
    data: {
      folderId: folder.id,
      folderName: folder.name,
      wrapperPrefixRemoved: wrapperPrefix || null,
      moved,
      deleted,
      created,
      pendingRaw,
    },
  });
}
