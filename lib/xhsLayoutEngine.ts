import { splitMarkdownDocument, type MarkdownFrontmatterValue } from "@/lib/markdown-frontmatter";

export type CardTemplateId =
  | "cinematic-film"
  | "starry-night"
  | "polaroid"
  | "notion-style"
  | "elegant-book"
  | "ios-memo"
  | "swiss-studio"
  | "minimalist-magazine"
  | "aura-gradient"
  | "deep-night"
  | "pro-doc"
  | "blank";

export type XhsLayoutStyleKey = "clean" | "dark" | "gradient";

export type CoverTitleAlignX = "left" | "center" | "right";
export type CoverTitleAlignY = "top" | "center" | "bottom";

export type CoverConfig = {
  coverStyleId?: string;
  coverTitle?: string;
  coverSubtitle?: string;
  coverImage?: string;
  coverTextColor?: string;
  coverHighlightColor?: string;
  coverCardRadius?: number;
  coverShowStickers?: boolean;
  coverFontFamily?: string;
  coverTitleAlignX?: CoverTitleAlignX;
  coverTitleAlignY?: CoverTitleAlignY;
  coverFontSize?: number;
  coverSubtitleFontSize?: number;
  coverLineHeight?: number;
};

export type TemplateSpec = {
  id: CardTemplateId;
  nameZh: string;
  defaultBgMode: "solid" | "gradient";
  defaultBgColor: string;
  defaultGradientStart: string;
  defaultGradientEnd: string;
  defaultGradientAngle: number;
  defaultTextColor: string;
  defaultAccentColor: string;
};

const NOTE_META_KEYS = new Set([
  "title", "cover_title", "cover", "subtitle",
  "description", "desc", "summary", "excerpt",
  "type", "status", "platform", "category", "tags", "tag",
  "author", "date", "created", "updated", "source", "slug",
  "标题", "封面标题", "描述", "简介", "类型", "状态", "平台", "分类", "标签", "作者", "日期", "来源",
]);

const CARD_SYSTEM_META_KEYS = new Set([
  "来源", "链接", "采集时间", "内容类型", "素材来源", "生成时间", "更新时间",
  "source", "link", "url", "collected", "content type", "generated at", "updated at",
]);

const CARD_SYSTEM_FOOTER_HEADING = /^(关联素材|相关素材|素材关联|references?|sources?)$/i;
const META_CALLOUT_START_RE = /^(?:[>|]\s*)?\[!meta\]\s*/i;
const META_CALLOUT_TITLE_RE = /^(?:[>|]\s*)?入库信息(?:\s*[（(].*[)）])?\s*$/i;
const META_CALLOUT_INFO_RE =
  /^(?:[>|]\s*)?(来源|平台|保存时间|采集时间|来源链接|source|platform|saved\s*at|url|link)\s*[:：]/i;
const META_CALLOUT_TRAIL_RE = /^(?:[>|]\s*)?<\s*备注录/i;

export const TEMPLATE_SPECS: TemplateSpec[] = [
  {
    id: "cinematic-film",
    nameZh: "电影胶片",
    defaultBgMode: "solid",
    defaultBgColor: "#121211",
    defaultGradientStart: "#1a1a18",
    defaultGradientEnd: "#0f0f0e",
    defaultGradientAngle: 135,
    defaultTextColor: "#ece6dc",
    defaultAccentColor: "#d9c8a6",
  },
  {
    id: "starry-night",
    nameZh: "星光质感",
    defaultBgMode: "gradient",
    defaultBgColor: "#102447",
    defaultGradientStart: "#0f1e3a",
    defaultGradientEnd: "#1f3d73",
    defaultGradientAngle: 145,
    defaultTextColor: "#d9e8ff",
    defaultAccentColor: "#ffd870",
  },
  {
    id: "polaroid",
    nameZh: "复古拍立得",
    defaultBgMode: "solid",
    defaultBgColor: "#d7d2cc",
    defaultGradientStart: "#e4ddd3",
    defaultGradientEnd: "#cfc8bb",
    defaultGradientAngle: 135,
    defaultTextColor: "#3a2e24",
    defaultAccentColor: "#9b4d3a",
  },
  {
    id: "notion-style",
    nameZh: "效率笔记",
    defaultBgMode: "solid",
    defaultBgColor: "#f7f6f3",
    defaultGradientStart: "#f8f7f4",
    defaultGradientEnd: "#efede8",
    defaultGradientAngle: 180,
    defaultTextColor: "#37352f",
    defaultAccentColor: "#0f7b6c",
  },
  {
    id: "elegant-book",
    nameZh: "书籍内页",
    defaultBgMode: "solid",
    defaultBgColor: "#fdfbf7",
    defaultGradientStart: "#fdfbf7",
    defaultGradientEnd: "#f4efe6",
    defaultGradientAngle: 180,
    defaultTextColor: "#2b2b2b",
    defaultAccentColor: "#8c3a3a",
  },
  {
    id: "ios-memo",
    nameZh: "苹果备忘录",
    defaultBgMode: "solid",
    defaultBgColor: "#fff9dd",
    defaultGradientStart: "#fff9dd",
    defaultGradientEnd: "#fef3c7",
    defaultGradientAngle: 180,
    defaultTextColor: "#3f3a2a",
    defaultAccentColor: "#c99500",
  },
  {
    id: "swiss-studio",
    nameZh: "苏黎世工作室",
    defaultBgMode: "solid",
    defaultBgColor: "#ffffff",
    defaultGradientStart: "#ffffff",
    defaultGradientEnd: "#f7f7f7",
    defaultGradientAngle: 180,
    defaultTextColor: "#1f1f1f",
    defaultAccentColor: "#ff3b30",
  },
  {
    id: "minimalist-magazine",
    nameZh: "极简杂志",
    defaultBgMode: "solid",
    defaultBgColor: "#fcfcfb",
    defaultGradientStart: "#fcfcfb",
    defaultGradientEnd: "#f5f5f4",
    defaultGradientAngle: 180,
    defaultTextColor: "#1f1f1f",
    defaultAccentColor: "#111111",
  },
  {
    id: "aura-gradient",
    nameZh: "弥散极光",
    defaultBgMode: "gradient",
    defaultBgColor: "#e6e9ff",
    defaultGradientStart: "#ffdff4",
    defaultGradientEnd: "#dfe7ff",
    defaultGradientAngle: 135,
    defaultTextColor: "#272143",
    defaultAccentColor: "#6f4ee6",
  },
  {
    id: "deep-night",
    nameZh: "暗夜深思",
    defaultBgMode: "gradient",
    defaultBgColor: "#101a34",
    defaultGradientStart: "#0b1020",
    defaultGradientEnd: "#101a34",
    defaultGradientAngle: 140,
    defaultTextColor: "#d9f2ff",
    defaultAccentColor: "#00d4ff",
  },
  {
    id: "pro-doc",
    nameZh: "大厂文档",
    defaultBgMode: "solid",
    defaultBgColor: "#f8fbff",
    defaultGradientStart: "#f8fbff",
    defaultGradientEnd: "#f3f6fb",
    defaultGradientAngle: 180,
    defaultTextColor: "#1f2937",
    defaultAccentColor: "#2563eb",
  },
  {
    id: "blank",
    nameZh: "空白模板",
    defaultBgMode: "solid",
    defaultBgColor: "#ffffff",
    defaultGradientStart: "#ffffff",
    defaultGradientEnd: "#f7f7f7",
    defaultGradientAngle: 180,
    defaultTextColor: "#1a1a1a",
    defaultAccentColor: "#1a1a1a",
  },
];

const TEMPLATE_INDEX = new Map(TEMPLATE_SPECS.map((item) => [item.id, item]));

type MarkdownTextBlock = {
  kind: "text";
  lines: string[];
};

type MarkdownTableBlock = {
  kind: "table";
  rows: string[][];
  columnCount: number;
};

type MarkdownBlock = MarkdownTextBlock | MarkdownTableBlock;

type SvgTextItem = {
  kind: "text";
  text: string;
};

type SvgTableRow = {
  kind: "table-row";
  cells: string[][];
  header: boolean;
  height: number;
  columnCount: number;
  columnWidth: number;
};

type SvgPageItem = SvgTextItem | SvgTableRow;

const SVG_CJK_FONT_FAMILY = "PingFang SC, Heiti SC, Arial Unicode MS, Hiragino Sans GB, sans-serif";

function normalizeMetaKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

function frontmatterValueToText(value: MarkdownFrontmatterValue): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" ");
  if (value === null) return "";
  return String(value);
}

function extractMetaKey(line: string): string | null {
  const normalized = line
    .trim()
    .replace(/^>+\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();
  const keyMatch = normalized.match(/^([A-Za-z\u4E00-\u9FFF_][\w\u4E00-\u9FFF\s-]{0,60})\s*[：:]\s*(.*)$/);
  if (!keyMatch) return null;
  return keyMatch[1].trim().toLowerCase();
}

function isHorizontalRuleLine(line: string): boolean {
  return /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim());
}

function isSystemMetaLine(line: string): boolean {
  const key = extractMetaKey(line);
  if (!key) return false;
  return CARD_SYSTEM_META_KEYS.has(key);
}

function findSystemHeaderEnd(lines: string[], start: number): number {
  const probeEnd = Math.min(lines.length, start + 40);
  let cursor = start;
  let consumedSystem = false;

  while (cursor < probeEnd) {
    const trimmed = lines[cursor].trim();

    if (!trimmed || trimmed === ">" || trimmed === ">-") {
      cursor += 1;
      continue;
    }
    if (isHorizontalRuleLine(trimmed)) {
      consumedSystem = true;
      cursor += 1;
      continue;
    }
    if (isSystemMetaLine(trimmed)) {
      consumedSystem = true;
      cursor += 1;
      continue;
    }
    break;
  }

  return consumedSystem ? cursor : -1;
}

export function preprocessMarkdownForCard(markdown: string): string {
  const { body } = splitMarkdownDocument(markdown ?? "");
  const normalized = body.replace(/\r\n/g, "\n");
  if (!normalized) return "";

  const lines = normalized.split("\n");
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const keyMatch = trimmed.match(/^([A-Za-z\u4E00-\u9FFF_][\w\u4E00-\u9FFF-]{0,40})\s*[：:]\s*(.*)$/);
    if (!keyMatch) break;
    const key = keyMatch[1].toLowerCase();
    if (!NOTE_META_KEYS.has(key)) break;

    index += 1;
    if (key === "tags" || key === "tag" || key === "标签") {
      while (index < lines.length && lines[index].trim().match(/^[-*]\s+/)) {
        index += 1;
      }
    }
  }

  const headerEnd = findSystemHeaderEnd(lines, index);
  if (headerEnd !== -1) {
    index = headerEnd;
    while (index < lines.length && !lines[index].trim()) index += 1;
  }

  let contentLines = lines.slice(index);

  const strippedMetaLines: string[] = [];
  for (let cursor = 0; cursor < contentLines.length; cursor += 1) {
    const line = contentLines[cursor] || "";
    const trimmed = line.trim();
    const bare = trimmed.replace(/^[>|]\s*/, "").trim();
    const looksLikeMetaStart = META_CALLOUT_START_RE.test(trimmed) || META_CALLOUT_TITLE_RE.test(trimmed);
    if (!looksLikeMetaStart) {
      strippedMetaLines.push(line);
      continue;
    }

    cursor += 1;
    while (cursor < contentLines.length) {
      const probeLine = contentLines[cursor] || "";
      const probeTrimmed = probeLine.trim();
      const probeBare = probeTrimmed.replace(/^[>|]\s*/, "").trim();
      if (!probeBare) {
        cursor += 1;
        continue;
      }
      if (
        META_CALLOUT_INFO_RE.test(probeTrimmed) ||
        META_CALLOUT_TRAIL_RE.test(probeTrimmed) ||
        /^https?:\/\//i.test(probeBare) ||
        /^[>|]/.test(probeTrimmed) ||
        /^[-._~:/?#[\]@!$&'()*+,;=%A-Za-z0-9]+$/.test(probeBare)
      ) {
        cursor += 1;
        continue;
      }
      cursor -= 1;
      break;
    }
  }
  contentLines = strippedMetaLines;

  const footerStart = contentLines.findIndex((line) => {
    const heading = line.trim().match(/^#{1,6}\s+(.+)$/);
    if (!heading) return false;
    return CARD_SYSTEM_FOOTER_HEADING.test(heading[1].trim());
  });
  if (footerStart !== -1) {
    contentLines = contentLines.slice(0, footerStart);
  }

  while (contentLines.length > 0 && !contentLines[contentLines.length - 1].trim()) {
    contentLines.pop();
  }
  while (contentLines.length > 0 && isHorizontalRuleLine(contentLines[contentLines.length - 1])) {
    contentLines.pop();
    while (contentLines.length > 0 && !contentLines[contentLines.length - 1].trim()) {
      contentLines.pop();
    }
  }

  return contentLines.join("\n");
}

function cleanLine(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .trim();
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  const source = trimmed.startsWith("|") && trimmed.endsWith("|")
    ? trimmed.slice(1, -1)
    : trimmed;
  const cells: string[] = [];
  let current = "";
  let escaping = false;

  for (const char of source) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  if (cells.length < 2) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function isPotentialMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return splitMarkdownTableRow(trimmed).length >= 2;
}

function cleanTableCell(cell: string): string {
  return cleanLine(cell)
    .replace(/^<br\s*\/?>|<br\s*\/?>$/gi, "")
    .replace(/<br\s*\/?>/gi, " / ")
    .trim();
}

function parseMarkdownBlocksForLayout(markdown: string): MarkdownBlock[] {
  const normalized = preprocessMarkdownForCard(markdown)
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return [];

  const sourceLines = normalized.split("\n");
  const blocks: MarkdownBlock[] = [];
  let textLines: string[] = [];
  let index = 0;

  const flushText = () => {
    const cleaned = textLines.map((line) => cleanLine(line)).filter(Boolean);
    if (cleaned.length > 0) {
      blocks.push({ kind: "text", lines: cleaned });
    }
    textLines = [];
  };

  while (index < sourceLines.length) {
    const line = sourceLines[index] || "";
    const nextLine = sourceLines[index + 1] || "";
    const trimmed = line.trim();

    if (
      isPotentialMarkdownTableRow(trimmed) &&
      isMarkdownTableSeparator(nextLine)
    ) {
      flushText();
      const rows: string[][] = [splitMarkdownTableRow(trimmed).map(cleanTableCell)];
      index += 2;

      while (index < sourceLines.length && isPotentialMarkdownTableRow(sourceLines[index] || "")) {
        rows.push(splitMarkdownTableRow(sourceLines[index] || "").map(cleanTableCell));
        index += 1;
      }

      const columnCount = Math.max(2, ...rows.map((row) => row.length));
      blocks.push({
        kind: "table",
        columnCount,
        rows: rows.map((row) => Array.from({ length: columnCount }, (_, cellIndex) => row[cellIndex] || "")),
      });
      continue;
    }

    if (!trimmed) {
      flushText();
      index += 1;
      continue;
    }

    textLines.push(line);
    index += 1;
  }

  flushText();
  return blocks;
}

export function markdownToLayoutLines(markdown: string): string[] {
  return parseMarkdownBlocksForLayout(markdown).flatMap((block) => {
    if (block.kind === "text") return block.lines;
    return block.rows.map((row) => row.filter(Boolean).join(" "));
  });
}

function wrapLineByWidth(raw: string, maxChars = 20): string[] {
  const chars = Array.from(raw);
  if (chars.length <= maxChars) return [raw];
  const lines: string[] = [];
  for (let i = 0; i < chars.length; i += maxChars) {
    lines.push(chars.slice(i, i + maxChars).join(""));
  }
  return lines;
}

export function paginateLayoutLines(lines: string[], maxPageLines = 18): string[][] {
  if (lines.length === 0) return [[]];

  const wrapped: string[] = [];
  for (const line of lines) {
    const parts = wrapLineByWidth(line, 20);
    wrapped.push(...parts);
  }

  const pages: string[][] = [];
  for (let cursor = 0; cursor < wrapped.length; cursor += maxPageLines) {
    pages.push(wrapped.slice(cursor, cursor + maxPageLines));
  }
  return pages.length > 0 ? pages : [[]];
}

function estimateTextUnits(text: string): number {
  let units = 0;
  for (const char of Array.from(text)) {
    if (/\s/.test(char)) {
      units += 0.34;
    } else if (/[A-Za-z0-9]/.test(char)) {
      units += 0.58;
    } else if (/[,.!?;:'"(){}\[\]<>/\\|`~@#$%^&*_+=-]/.test(char)) {
      units += 0.42;
    } else {
      units += 1;
    }
  }
  return units;
}

function wrapTextByUnits(text: string, maxUnits: number): string[] {
  const normalized = String(text || "").trim();
  if (!normalized) return [""];

  const lines: string[] = [];
  let current = "";
  let currentUnits = 0;

  for (const char of Array.from(normalized)) {
    const charUnits = estimateTextUnits(char);
    if (current && currentUnits + charUnits > maxUnits) {
      lines.push(current);
      current = char;
      currentUnits = charUnits;
      continue;
    }
    current += char;
    currentUnits += charUnits;
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function paginateMarkdownBlocks(markdown: string, maxPageLines = 18): SvgPageItem[][] {
  const blocks = parseMarkdownBlocksForLayout(markdown);
  if (blocks.length === 0) return [[{ kind: "text", text: "暂无内容" }]];

  const pages: SvgPageItem[][] = [];
  let currentPage: SvgPageItem[] = [];
  let usedUnits = 0;
  const maxUnits = Math.max(1, maxPageLines);

  const flushPage = () => {
    if (currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [];
      usedUnits = 0;
    }
  };

  const pushItem = (item: SvgPageItem, units: number) => {
    if (currentPage.length > 0 && usedUnits + units > maxUnits) {
      flushPage();
    }
    currentPage.push(item);
    usedUnits += units;
  };

  for (const block of blocks) {
    if (block.kind === "text") {
      for (const line of block.lines) {
        for (const wrapped of wrapLineByWidth(line, 20)) {
          pushItem({ kind: "text", text: wrapped }, 1);
        }
      }
      continue;
    }

    const columnCount = Math.max(1, block.columnCount);
    const columnWidth = Math.floor(1002 / columnCount);
    const maxCellUnits = Math.max(4, Math.floor((columnWidth - 44) / 34));

    block.rows.forEach((row, rowIndex) => {
      const cells = Array.from({ length: columnCount }, (_, cellIndex) =>
        wrapTextByUnits(row[cellIndex] || "", maxCellUnits),
      );
      const maxLines = Math.max(1, ...cells.map((cellLines) => cellLines.length));
      const rowHeight = Math.max(64, 28 + maxLines * 44);
      pushItem({
        kind: "table-row",
        cells,
        header: rowIndex === 0,
        height: rowHeight,
        columnCount,
        columnWidth,
      }, rowHeight / 72 + (rowIndex === 0 ? 0.25 : 0));
    });
  }

  flushPage();
  return pages.length > 0 ? pages : [[{ kind: "text", text: "暂无内容" }]];
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveTemplate(templateId: CardTemplateId): TemplateSpec {
  return TEMPLATE_INDEX.get(templateId) || TEMPLATE_SPECS[0];
}

function getBackgroundPaint(template: TemplateSpec): { fill: string; defs: string } {
  if (template.defaultBgMode === "solid") {
    return {
      fill: template.defaultBgColor,
      defs: "",
    };
  }

  return {
    fill: "url(#bg-gradient)",
    defs: `<linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${template.defaultGradientStart}" /><stop offset="100%" stop-color="${template.defaultGradientEnd}" /></linearGradient>`,
  };
}

function getCoverStyleBackground(coverStyleId?: string): { start: string; end: string } {
  const id = String(coverStyleId || "").trim();
  switch (id) {
    case "image-focus":
      return { start: "#3d2f26", end: "#ccb18f" };
    case "grid-paper":
      return { start: "#f5f5f3", end: "#edf2f1" };
    case "rounded-gray-note":
      return { start: "#f3f3f3", end: "#dedede" };
    case "pastel-purple-cat":
      return { start: "#d8d2ee", end: "#c7bfe6" };
    case "warm-gray-dog":
      return { start: "#e6e4df", end: "#d9d7d1" };
    case "lined-notebook":
      return { start: "#f8f8f8", end: "#eceef2" };
    case "lime-question":
      return { start: "#e9ef97", end: "#d9e66e" };
    case "mint-splash":
      return { start: "#bde8ea", end: "#92d8db" };
    default:
      return { start: "#f7f0d5", end: "#e9d89a" };
  }
}

export function renderCardPageSvg(params: {
  templateId: CardTemplateId;
  title: string;
  pageLines?: string[];
  pageItems?: SvgPageItem[];
  pageIndex: number;
  totalPages: number;
  isCover: boolean;
  cover?: CoverConfig;
}): string {
  const template = resolveTemplate(params.templateId);
  const background = getBackgroundPaint(template);
  const width = 1242;
  const height = 1656;

  const title = escapeXml(params.title || "图文卡片");
  const pageItems: SvgPageItem[] = params.pageItems || (params.pageLines || []).map((text) => ({ kind: "text", text }));

  const pageLabel = `${params.pageIndex + 1}/${Math.max(params.totalPages, 1)}`;

  if (params.isCover) {
    const cover = params.cover || {};
    const coverTitle = escapeXml((cover.coverTitle || title || "图文卡片").trim());
    const coverSubtitle = escapeXml((cover.coverSubtitle || "").trim());
    const coverTextColor = (cover.coverTextColor || template.defaultTextColor || "#1a1a1a").trim();
    const coverAccentColor = (cover.coverHighlightColor || template.defaultAccentColor || "#d4af37").trim();
    const coverFontFamily = SVG_CJK_FONT_FAMILY;
    const coverRadius = Math.max(0, Math.min(64, Math.round(cover.coverCardRadius ?? 42)));
    const titleSize = Math.max(28, Math.min(220, Math.round(cover.coverFontSize ?? 92)));
    const subtitleSize = Math.max(22, Math.min(180, Math.round(cover.coverSubtitleFontSize ?? 46)));
    const lineHeight = Math.max(1.1, Math.min(2, Number(cover.coverLineHeight ?? 1.4)));
    const alignX = cover.coverTitleAlignX || "center";
    const alignY = cover.coverTitleAlignY || "center";
    const coverBg = getCoverStyleBackground(cover.coverStyleId);
    const textAnchor = alignX === "left" ? "start" : alignX === "right" ? "end" : "middle";
    const x = alignX === "left" ? 120 : alignX === "right" ? 1122 : 622;
    const baseY = alignY === "top" ? 420 : alignY === "bottom" ? 1180 : 760;
    const coverImageSvg = cover.coverImage
      ? `<image href="${escapeXml(cover.coverImage)}" x="88" y="116" width="1066" height="1424" preserveAspectRatio="xMidYMid slice" opacity="0.78" />`
      : "";
    const stickerSvg = cover.coverShowStickers
      ? `<circle cx="1046" cy="286" r="32" fill="${coverAccentColor}" opacity="0.88" /><circle cx="186" cy="1268" r="28" fill="${coverAccentColor}" opacity="0.22" />`
      : "";
    const subtitleSvg = coverSubtitle
      ? `<text x="${x}" y="${baseY + Math.round(titleSize * lineHeight) + 52}" font-size="${subtitleSize}" fill="${coverTextColor}" opacity="0.9" text-anchor="${textAnchor}" font-family="${coverFontFamily}">${coverSubtitle}</text>`
      : "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    ${background.defs}
    <linearGradient id="cover-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${coverBg.start}"/>
      <stop offset="100%" stop-color="${coverBg.end}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${background.fill}"/>
  <rect x="88" y="116" width="1066" height="1424" rx="${coverRadius}" fill="url(#cover-bg)" />
  ${coverImageSvg}
  <rect x="88" y="116" width="1066" height="1424" rx="${coverRadius}" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.16" stroke-width="2"/>
  ${stickerSvg}
  <text x="120" y="220" font-size="40" fill="${coverAccentColor}" font-family="${coverFontFamily}">${escapeXml(template.nameZh)}</text>
  <text x="${x}" y="${baseY}" font-size="${titleSize}" font-weight="700" fill="${coverTextColor}" text-anchor="${textAnchor}" font-family="${coverFontFamily}" line-height="${lineHeight}">${coverTitle}</text>
  ${subtitleSvg}
  <text x="1110" y="1508" text-anchor="end" font-size="30" fill="${coverTextColor}" opacity="0.72" font-family="${coverFontFamily}">内容工厂 · 图文卡片</text>
</svg>`;
  }

  let cursorY = 260;
  const contentBlocks = pageItems
    .map((item) => {
      if (item.kind === "text") {
        const block = `<text x="120" y="${cursorY}" font-size="42" fill="${template.defaultTextColor}" font-family="${SVG_CJK_FONT_FAMILY}">${escapeXml(item.text)}</text>`;
        cursorY += 72;
        return block;
      }

      const tableX = 120;
      const tableY = cursorY - 38;
      const tableWidth = item.columnCount * item.columnWidth;
      const borderColor = template.defaultTextColor;
      const fillColor = item.header ? template.defaultAccentColor : template.defaultTextColor;
      const fillOpacity = item.header ? "0.14" : "0.03";
      const cellsSvg = item.cells
        .map((cellLines, cellIndex) => {
          const x = tableX + cellIndex * item.columnWidth;
          const divider = cellIndex > 0
            ? `<line x1="${x}" y1="${tableY}" x2="${x}" y2="${tableY + item.height}" stroke="${borderColor}" stroke-opacity="0.24" stroke-width="2"/>`
            : "";
          const textSvg = cellLines
            .map((cellLine, lineIndex) => `<text x="${x + 22}" y="${tableY + 42 + lineIndex * 44}" font-size="34" font-weight="${item.header ? 700 : 500}" fill="${template.defaultTextColor}" font-family="${SVG_CJK_FONT_FAMILY}">${escapeXml(cellLine)}</text>`)
            .join("\n");
          return `${divider}\n${textSvg}`;
        })
        .join("\n");
      const block = `<g>
    <rect x="${tableX}" y="${tableY}" width="${tableWidth}" height="${item.height}" fill="${fillColor}" fill-opacity="${fillOpacity}" stroke="${borderColor}" stroke-opacity="0.28" stroke-width="2"/>
    ${cellsSvg}
  </g>`;
      cursorY += item.height;
      return block;
    })
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    ${background.defs}
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${background.fill}"/>
  <rect x="84" y="84" width="1074" height="1488" rx="30" fill="#ffffff" fill-opacity="0.04" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>
  <text x="120" y="176" font-size="56" font-weight="700" fill="${template.defaultAccentColor}" font-family="${SVG_CJK_FONT_FAMILY}">${title}</text>
  ${contentBlocks}
  <text x="1110" y="1540" text-anchor="end" font-size="30" fill="${template.defaultTextColor}" opacity="0.72" font-family="${SVG_CJK_FONT_FAMILY}">${escapeXml(pageLabel)}</text>
</svg>`;
}

export function styleKeyToTemplateId(styleKey?: string | null): CardTemplateId {
  const value = String(styleKey || "").trim().toLowerCase();
  if (value === "dark") return "deep-night";
  if (value === "gradient") return "aura-gradient";
  return "notion-style";
}

export function normalizeTemplateId(input?: string | null): CardTemplateId {
  const raw = String(input || "").trim();
  if (!raw) return "notion-style";
  if (TEMPLATE_INDEX.has(raw as CardTemplateId)) return raw as CardTemplateId;
  return styleKeyToTemplateId(raw);
}

export function buildRenderTitle(markdown: string, fallback = "图文卡片"): string {
  const { frontmatter } = splitMarkdownDocument(markdown || "");
  for (const entry of frontmatter) {
    const key = normalizeMetaKey(entry.key || "");
    if (key !== "title" && key !== "cover_title" && key !== "cover" && key !== "标题") continue;
    const value = frontmatterValueToText(entry.value).trim();
    if (value) return Array.from(value).slice(0, 28).join("");
  }

  const lines = markdownToLayoutLines(markdown);
  if (lines.length > 0) {
    const first = lines[0].trim();
    if (first) return Array.from(first).slice(0, 28).join("");
  }
  return fallback;
}

export function buildRenderSvgs(params: {
  markdown: string;
  templateId: CardTemplateId;
  title: string;
  includeCover?: boolean;
  maxPages?: number;
  cover?: CoverConfig;
}): string[] {
  const includeCover = params.includeCover !== false;
  const maxPages = Math.min(Math.max(params.maxPages ?? 8, 1), 12);

  const contentPages = paginateMarkdownBlocks(params.markdown, 18).slice(0, includeCover ? maxPages - 1 : maxPages);

  const svgs: string[] = [];
  if (includeCover) {
    svgs.push(
      renderCardPageSvg({
        templateId: params.templateId,
        title: params.title,
        pageItems: [],
        pageIndex: 0,
        totalPages: contentPages.length + 1,
        isCover: true,
        cover: params.cover,
      }),
    );
  }

  contentPages.forEach((pageItems, index) => {
    svgs.push(
      renderCardPageSvg({
        templateId: params.templateId,
        title: params.title,
        pageItems,
        pageIndex: includeCover ? index + 1 : index,
        totalPages: includeCover ? contentPages.length + 1 : contentPages.length,
        isCover: false,
        cover: params.cover,
      }),
    );
  });

  if (svgs.length === 0) {
    svgs.push(
      renderCardPageSvg({
        templateId: params.templateId,
        title: params.title,
        pageItems: [{ kind: "text", text: "暂无内容" }],
        pageIndex: 0,
        totalPages: 1,
        isCover: false,
        cover: params.cover,
      }),
    );
  }

  return svgs;
}
