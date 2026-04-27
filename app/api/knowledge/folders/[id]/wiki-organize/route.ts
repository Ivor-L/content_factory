import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { splitTextToChunks } from "@/lib/knowledge";
import { callCloudChat } from "@/lib/cloudLLM";

type Params = {
  params: Promise<{ id: string }>;
};

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const RAW_PREFIX = "01-素材库/raw/";
const WIKI_PREFIX = "01-素材库/wiki/llm-wiki/";
const WIKI_HOOKS_PREFIX = "01-素材库/wiki/hooks/";
const WIKI_TOPICS_PREFIX = "01-素材库/wiki/topics/";
const WIKI_AUDIENCE_PREFIX = "01-素材库/wiki/audience/";
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

function getHooksPathFromRaw(rawPath: string, rawFileId: string) {
  const safeBase = sanitizeMdBaseName(rawPath);
  const shortId = rawFileId.slice(0, 8);
  return `${WIKI_HOOKS_PREFIX}${safeBase}-${shortId}.md`;
}

function getTopicsPathFromRaw(rawPath: string, rawFileId: string) {
  const safeBase = sanitizeMdBaseName(rawPath);
  const shortId = rawFileId.slice(0, 8);
  return `${WIKI_TOPICS_PREFIX}${safeBase}-${shortId}.md`;
}

function getAudiencePathFromRaw(rawPath: string, rawFileId: string) {
  const safeBase = sanitizeMdBaseName(rawPath);
  const shortId = rawFileId.slice(0, 8);
  return `${WIKI_AUDIENCE_PREFIX}${safeBase}-${shortId}.md`;
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

function collectCandidateSentences(rawText: string, limit = 24) {
  const normalized = rawText.replace(/\r\n/g, "\n");
  const chunks = normalized
    .split(/\n+/)
    .flatMap((block) => block.split(/(?<=[。！？!?；;])/g))
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 8 && item.length <= 120);

  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of chunks) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }
  return output;
}

function collectQuotedPhrases(rawText: string, limit = 8) {
  const patterns = [/「([^」]{6,120})」/g, /“([^”]{6,120})”/g, /"([^"\n]{6,120})"/g];
  const output: string[] = [];
  const seen = new Set<string>();
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = pattern.exec(rawText);
    while (match) {
      const value = (match[1] || "").trim();
      if (value) {
        const key = value.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          output.push(value);
          if (output.length >= limit) return output;
        }
      }
      match = pattern.exec(rawText);
    }
  }
  return output;
}

function inferTagsFromText(title: string, rawText: string) {
  const source = `${title}\n${rawText}`.toLowerCase();
  const tags: string[] = ["内容拆解", "可复用表达", "选题策略"];
  if (/(小红书|xhs|图文|笔记)/i.test(source)) tags.push("小红书");
  if (/(公众号|长文|推文|文章)/i.test(source)) tags.push("公众号");
  if (/(口播|视频|脚本|分镜)/i.test(source)) tags.push("口播脚本");
  if (/(选题|流量|爆款|转化|商业化)/i.test(source)) tags.push("爆款元素");
  return Array.from(new Set(tags)).slice(0, 8);
}

function buildFallbackWikiMarkdown(params: {
  title: string;
  rawPath: string;
  rawText: string;
}) {
  const { title, rawPath, rawText } = params;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const sentences = collectCandidateSentences(rawText, 30);
  const quoted = collectQuotedPhrases(rawText, 6);
  const coreQuotes = [...quoted, ...sentences].slice(0, 4);
  const tags = inferTagsFromText(title, rawText);
  const opening = sentences.slice(0, 2);
  const middle = sentences.slice(2, 6);
  const closing = sentences.slice(6, 8);
  const pick = (index: number, fallback: string) => coreQuotes[index] || sentences[index] || fallback;

  return [
    `# ${title} · llm-wiki`,
    "",
    "## 一、来源",
    `- 原文路径: ${rawPath}`,
    `- 梳理时间: ${now}`,
    "- 生成模式: fallback（模型不可用时的保底深拆）",
    "",
    "## 二、核心金句",
    `> 「${pick(0, "先抛出高价值判断，再给出证据支撑")}」`,
    "—— 用途：可作为开场总论句，先给结论再展开。",
    "",
    `> 「${pick(1, "把抽象观点翻译成可执行动作，读者更容易跟做")}」`,
    "—— 用途：用于方法段承接，提升执行感。",
    "",
    `> 「${pick(2, "数字化表达能显著提升可信度与传播效率")}」`,
    "—— 用途：用于案例段，增强说服力。",
    "",
    `> 「${pick(3, "结尾要回到边界与行动，避免只剩情绪")}」`,
    "—— 用途：用于结尾收束，形成行动闭环。",
    "",
    "## 三、结构拆解（按叙事推进）",
    `1. 开场钩子: ${opening[0] || "先给反常识结论或强结果，抓住注意力。"}`,
    `2. 问题展开: ${opening[1] || "明确目标受众痛点，并说明旧做法为何失效。"}`,
    `3. 方法与路径: ${middle[0] || "给出可执行步骤，最好是“动作+顺序+产出”结构。"}`,
    `4. 案例与证据: ${middle[1] || "用案例/数字/对比证明方法有效，降低怀疑。"} `,
    `5. 收束与行动: ${closing[0] || "结尾回到边界条件，给出下一步行动建议。"} `,
    "",
    "## 四、爆款元素总结",
    "| 元素 | 原文体现 | 效果 | 可迁移写法 |",
    "| --- | --- | --- | --- |",
    `| 反常识开场 | ${pick(0, "先给结论")} | 迅速抓眼球 | 用“你以为X，其实Y”开头 |`,
    `| 核心金句 | ${pick(1, "可被复述的一句话")} | 提升记忆点 | 每段放1句可复述判断 |`,
    `| 数字锚点 | ${pick(2, "加入比例/数据")} | 增强可信度 | 用“比例+结果”表达 |`,
    `| 步骤化方法 | ${middle[0] || "步骤拆解"} | 降低执行门槛 | 输出“步骤1-3”结构 |`,
    `| 场景化案例 | ${middle[1] || "真实场景说明"} | 提升代入感 | 用“场景-动作-结果”写法 |`,
    `| 边界提醒 | ${closing[0] || "明确适用边界"} | 降低争议 | 结尾补“适用对象/不适用对象” |`,
    "",
    "## 五、可直接复用模板",
    "### 1) 开场模板",
    "- 你以为【常见认知】，其实真正决定结果的是【关键变量】。",
    "- 做【目标】这件事，80%不是【常见做法】，而是【关键动作】。",
    "",
    "### 2) 方法模板",
    "- 第一步：先完成【动作A】，产出【结果A】。",
    "- 第二步：再做【动作B】，把【结果A】转成【结果B】。",
    "- 第三步：用【动作C】复盘，沉淀为可复用 SOP。",
    "",
    "### 3) 结尾模板",
    "- 这套方法对【人群A】最有效，对【人群B】需要调整。",
    "- 下一步只做一件事：先把【最小动作】跑一遍。",
    "",
    "## 六、风险与边界",
    "- 若缺少真实案例与数据，结论容易被质疑。",
    "- 过度强调情绪而缺少动作，会降低复用价值。",
    "- 仅复制表面句式，不结合自身受众，会导致转化偏低。",
    "",
    "## 七、后续动作",
    "- 在此文档补充：受众画像、选题角度、发布平台差异。",
    "- 基于本拆解再生成：公众号长文版 / 小红书图文版 / 口播脚本版。",
    "",
    "## 八、标签",
    tags.map((tag) => `#${tag.replace(/^#+/, "")}`).join(" "),
  ].join("\n");
}

function extractSection(markdown: string, heading: string) {
  const source = markdown.replace(/\r\n/g, "\n");
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`, "m");
  const match = source.match(regex);
  return (match?.[1] || "").trim();
}

function toBulletLines(lines: string[], limit: number) {
  const rows: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const cleaned = line
      .replace(/^\s*[-*+]\s*/, "")
      .replace(/^\s*\d+[.)、]\s*/, "")
      .replace(/^>\s*/, "")
      .replace(/^「|」$/g, "")
      .trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(`- ${cleaned}`);
    if (rows.length >= limit) break;
  }
  return rows;
}

function buildHooksMarkdown(params: {
  title: string;
  rawPath: string;
  wikiPath: string;
  wikiMarkdown: string;
}) {
  const { title, rawPath, wikiPath, wikiMarkdown } = params;
  const quoteSection = extractSection(wikiMarkdown, "二、核心金句");
  const templateSection = extractSection(wikiMarkdown, "五、可直接复用模板");
  const quoteLines = quoteSection
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(">") || line.startsWith("——"));
  const templateLines = toBulletLines(templateSection.split("\n"), 10);
  const normalizedQuoteLines = quoteLines.length
    ? quoteLines
    : toBulletLines(collectQuotedPhrases(wikiMarkdown, 6), 6);

  return [
    `# ${title} · hooks`,
    "",
    "## 来源",
    `- 原文路径: ${rawPath}`,
    `- wiki 路径: ${wikiPath}`,
    "",
    "## 核心金句",
    ...normalizedQuoteLines,
    "",
    "## 可复用模板",
    ...(templateLines.length
      ? templateLines
      : [
          "- 你以为【常见认知】，其实决定结果的是【关键变量】。",
          "- 第一步【动作A】→ 第二步【动作B】→ 第三步【动作C】。",
        ]),
  ].join("\n");
}

function buildTopicsMarkdown(params: {
  title: string;
  rawPath: string;
  wikiPath: string;
  wikiMarkdown: string;
}) {
  const { title, rawPath, wikiPath, wikiMarkdown } = params;
  const structureSection = extractSection(wikiMarkdown, "三、结构拆解（按叙事推进）");
  const actionSection = extractSection(wikiMarkdown, "七、后续动作");
  const structureBullets = toBulletLines(structureSection.split("\n"), 8);
  const actionBullets = toBulletLines(actionSection.split("\n"), 6);

  return [
    `# ${title} · topics`,
    "",
    "## 来源",
    `- 原文路径: ${rawPath}`,
    `- wiki 路径: ${wikiPath}`,
    "",
    "## 可复用选题结构",
    ...(structureBullets.length
      ? structureBullets
      : [
          "- 开场钩子 -> 问题展开 -> 方法路径 -> 证据案例 -> 结尾收束",
          "- 先给反常识结论，再给动作步骤与场景证据。",
        ]),
    "",
    "## 选题扩展动作",
    ...(actionBullets.length
      ? actionBullets
      : [
          "- 从当前主题延展 3 个受众子场景。",
          "- 每个子场景输出 1 个可直接发布的选题标题。",
        ]),
  ].join("\n");
}

function buildAudienceMarkdown(params: {
  title: string;
  rawPath: string;
  wikiPath: string;
  wikiMarkdown: string;
}) {
  const { title, rawPath, wikiPath, wikiMarkdown } = params;
  const riskSection = extractSection(wikiMarkdown, "六、风险与边界");
  const riskBullets = toBulletLines(riskSection.split("\n"), 8);
  const candidateSentences = collectCandidateSentences(wikiMarkdown, 6);

  return [
    `# ${title} · audience`,
    "",
    "## 来源",
    `- 原文路径: ${rawPath}`,
    `- wiki 路径: ${wikiPath}`,
    "",
    "## 受众痛点与边界",
    ...(riskBullets.length
      ? riskBullets
      : [
          "- 缺少真实案例与数据时，受众信任会显著下降。",
          "- 只给观点不给动作，执行转化会明显变差。",
        ]),
    "",
    "## 可沟通表达",
    ...toBulletLines(candidateSentences, 6),
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
      maxOutputTokens: 3000,
      system: [
        "你是内容工厂的资深内容拆解编辑，擅长把原始文章拆成可直接复用的生产资料。",
        "目标不是摘要，而是“可迁移、可改写、可执行”的深度拆解。",
        "输出必须是 Markdown，禁止输出 JSON。",
        "必须保留固定结构和标题顺序，不要缺节。",
        "写作要求：具体、可执行、避免空话，不要出现“待补充/略/同上”之类占位语。",
        "必须包含至少 4 条核心金句（用引用块）和至少 1 个 Markdown 表格（不少于 6 行）。",
        "不要输出任何 [!meta]、入库信息或技术日志。",
      ].join("\n"),
      user: [
        `标题: ${title}`,
        `原文路径: ${rawPath}`,
        "",
        "请严格按以下结构输出，并尽可能用原文信息填满：",
        "# {标题} · llm-wiki",
        "## 一、来源",
        "- 原文路径",
        "- 梳理时间",
        "",
        "## 二、核心金句",
        "- 至少 4 条，每条格式：",
        "> 「金句原文或贴近原文的高保真表达」",
        "—— 用途：这句话在内容中的作用/适用场景",
        "",
        "## 三、结构拆解（按叙事推进）",
        "- 至少 5 步：开场钩子 -> 问题展开 -> 方法路径 -> 证据案例 -> 结尾收束",
        "",
        "## 四、爆款元素总结",
        "- 用 Markdown 表格，列为：元素 | 原文体现 | 效果 | 可迁移写法",
        "- 至少 6 行",
        "",
        "## 五、可直接复用模板",
        "### 1) 开场模板（至少 2 条）",
        "### 2) 方法模板（至少 3 步）",
        "### 3) 结尾模板（至少 2 条）",
        "",
        "## 六、风险与边界",
        "- 至少 3 条，写清楚哪些条件下会失效",
        "",
        "## 七、后续动作",
        "- 至少 3 条，必须是可执行动作",
        "",
        "## 八、标签",
        "- 输出 5-10 个标签，格式 #标签",
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

async function upsertDerivedWikiDoc(params: {
  tx: TxClient;
  folderId: string;
  userId: string;
  path: string;
  title: string;
  rawContent: string;
  sourceFileId: string;
  sourcePath: string;
  sourceWikiPath: string;
  generatedAt: string;
  kind: "hooks" | "topics" | "audience";
}) {
  const { tx, folderId, userId, path, title, rawContent, sourceFileId, sourcePath, sourceWikiPath, generatedAt, kind } = params;
  const chunks = splitTextToChunks(rawContent, {
    chunkSize: 1100,
    overlap: 160,
    maxChunks: 120,
  });
  const existing = await tx.knowledgeFile.findFirst({
    where: { folderId, userId, originalPath: path },
    select: { id: true, metadata: true },
  });

  let fileId = "";
  if (existing) {
    const existingMetadata = toMetadataRecord(existing.metadata);
    const existingCf = toMetadataRecord(existingMetadata.contentFactory);
    await tx.knowledgeChunk.deleteMany({ where: { fileId: existing.id } });
    await tx.knowledgeFile.update({
      where: { id: existing.id },
      data: {
        title,
        sourceType: "wiki-organizer",
        status: "READY",
        originalPath: path,
        metadata: {
          ...existingMetadata,
          relativePath: path,
          path,
          originalFilename: title,
          rawContent,
          contentFactory: {
            ...existingCf,
            kind,
            sourceFileId,
            sourcePath,
            sourceWikiPath,
            generatedAt,
          },
        },
      },
    });
    fileId = existing.id;
  } else {
    const created = await tx.knowledgeFile.create({
      data: {
        folderId,
        userId,
        title,
        sourceType: "wiki-organizer",
        status: "READY",
        originalPath: path,
        metadata: {
          relativePath: path,
          path,
          originalFilename: title,
          rawContent,
          contentFactory: {
            kind,
            sourceFileId,
            sourcePath,
            sourceWikiPath,
            generatedAt,
          },
        },
      },
      select: { id: true },
    });
    fileId = created.id;
  }

  if (chunks.length > 0) {
    await tx.knowledgeChunk.createMany({
      data: chunks.map((chunk) => ({
        folderId,
        fileId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        contentLength: chunk.contentLength,
      })),
    });
  }

  return fileId;
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

        const hooksPath = getHooksPathFromRaw(rawPath, detail.id);
        const topicsPath = getTopicsPathFromRaw(rawPath, detail.id);
        const audiencePath = getAudiencePathFromRaw(rawPath, detail.id);
        const hooksMarkdown = buildHooksMarkdown({
          title: detail.title,
          rawPath,
          wikiPath,
          wikiMarkdown,
        });
        const topicsMarkdown = buildTopicsMarkdown({
          title: detail.title,
          rawPath,
          wikiPath,
          wikiMarkdown,
        });
        const audienceMarkdown = buildAudienceMarkdown({
          title: detail.title,
          rawPath,
          wikiPath,
          wikiMarkdown,
        });

        await upsertDerivedWikiDoc({
          tx,
          folderId: folder.id,
          userId,
          path: hooksPath,
          title: `${sanitizeMdBaseName(rawPath)}-hooks.md`,
          rawContent: hooksMarkdown,
          sourceFileId: detail.id,
          sourcePath: rawPath,
          sourceWikiPath: wikiPath,
          generatedAt: nowIso,
          kind: "hooks",
        });
        await upsertDerivedWikiDoc({
          tx,
          folderId: folder.id,
          userId,
          path: topicsPath,
          title: `${sanitizeMdBaseName(rawPath)}-topics.md`,
          rawContent: topicsMarkdown,
          sourceFileId: detail.id,
          sourcePath: rawPath,
          sourceWikiPath: wikiPath,
          generatedAt: nowIso,
          kind: "topics",
        });
        await upsertDerivedWikiDoc({
          tx,
          folderId: folder.id,
          userId,
          path: audiencePath,
          title: `${sanitizeMdBaseName(rawPath)}-audience.md`,
          rawContent: audienceMarkdown,
          sourceFileId: detail.id,
          sourcePath: rawPath,
          sourceWikiPath: wikiPath,
          generatedAt: nowIso,
          kind: "audience",
        });

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
                hooksPath,
                topicsPath,
                audiencePath,
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
