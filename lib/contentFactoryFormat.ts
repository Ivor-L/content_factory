import { splitMarkdownDocument, type MarkdownFrontmatterValue } from "@/lib/markdown-frontmatter";

export type ContentFactoryPackage = {
  coverTitle: string;
  subTitle: string;
  title: string;
  imageCopy: string;
  body: string;
  tags: string[];
};

type ContentFactorySectionKey = "封面标题" | "副标题" | "标题" | "图文正文" | "正文" | "标签";

const SECTION_KEYS: ContentFactorySectionKey[] = ["封面标题", "副标题", "标题", "图文正文", "正文", "标签"];
const SECTION_KEY_SET = new Set<string>(SECTION_KEYS);
const BODY_HEADING_HINTS = new Set([
  "封面",
  "互动",
  "填写公式",
  "可套用模板",
  "先改认知",
  "扣分点",
  "5段结构",
  "三段结构",
]);
const RISKY_ENGAGEMENT_LINE_RE = /(评论区|留言|私信|点赞|收藏|转发|关注(我|一下)?|扣\s*1|留\s*[“\"'「『]?|领取|进群|加v|加微|加vx)/i;
const PAGE_SCRIPT_TITLE_RE = /^图文页脚本(?:\s*[（(][^）)]*[)）])?\s*$/i;
const PAGE_MARKER_RE = /^第\s*[0-9一二三四五六七八九十百]+\s*页(?:\s*[（(][^）)]*[)）])?\s*$/i;
const CARD_META_LINE_RE = /^(大字|副标题|角标|封面文案|封面标题|页脚|配图|图片提示|画面|镜头|旁白)\s*[：:]/i;

const FRONTMATTER_ALIASES: Record<Exclude<keyof ContentFactoryPackage, "tags">, string[]> = {
  coverTitle: ["cover_title", "covertitle", "封面标题"],
  subTitle: ["sub_title", "subtitle", "副标题"],
  title: ["title", "标题", "xhs_title"],
  imageCopy: ["image_copy", "imagecopy", "图文正文", "xhs_image_copy"],
  body: ["body", "正文", "xhs_body"],
};

const TAG_ALIASES = ["tags", "tag", "标签", "xhs_tags"];

function normalizeMetaKey(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

function looksLikeLooseYamlFrontmatter(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return /^[A-Za-z_][A-Za-z0-9_-]*\s*:\s*(.*)$/.test(trimmed);
}

function frontmatterValueToText(value: MarkdownFrontmatterValue | undefined): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeScalarPlaceholder(input: string) {
  const text = (input || "").trim();
  if (!text) return "";
  if (text === "|" || text === ">" || text === "~") return "";
  if (text.toLowerCase() === "null") return "";
  return text;
}

function parseTags(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .split(/[\n，,]/)
    .flatMap((part) => part.split(/\s+/))
    .map((item) => item.trim().replace(/^#+/, ""))
    .filter(Boolean)
    .slice(0, 20);
}

function dedupeTags(tags: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(tag);
    if (next.length >= 12) break;
  }
  return next;
}

function parseBodySections(rawBody: string) {
  const lines = rawBody.replace(/\r\n/g, "\n").split("\n");
  const buffers: Record<ContentFactorySectionKey, string[]> = {
    封面标题: [],
    副标题: [],
    标题: [],
    图文正文: [],
    正文: [],
    标签: [],
  };

  let currentSection: ContentFactorySectionKey | null = null;
  let hasStructuredSections = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^#{1,6}\s*(封面标题|副标题|标题|图文正文|正文|标签)\s*$/);
    if (headingMatch) {
      currentSection = headingMatch[1] as ContentFactorySectionKey;
      hasStructuredSections = true;
      continue;
    }

    // Support plain label blocks:
    // 封面标题
    // xxx
    if (SECTION_KEY_SET.has(trimmed)) {
      currentSection = trimmed as ContentFactorySectionKey;
      hasStructuredSections = true;
      continue;
    }

    const inlineMatch = trimmed.match(/^(封面标题|副标题|标题|图文正文|正文|标签)\s*[：:]\s*(.*)$/);
    if (inlineMatch) {
      currentSection = inlineMatch[1] as ContentFactorySectionKey;
      hasStructuredSections = true;
      if (inlineMatch[2]) {
        buffers[currentSection].push(inlineMatch[2]);
      }
      continue;
    }

    if (!currentSection) continue;
    buffers[currentSection].push(line);
  }

  const sections = {
    coverTitle: buffers.封面标题.join("\n").trim(),
    subTitle: buffers.副标题.join("\n").trim(),
    title: buffers.标题.join("\n").trim(),
    imageCopy: buffers.图文正文.join("\n").trim(),
    body: buffers.正文.join("\n").trim(),
    tagsText: buffers.标签.join("\n").trim(),
  };

  return {
    ...sections,
    tags: parseTags(sections.tagsText),
    hasStructuredSections,
  };
}

function normalizeImageCopyLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (RISKY_ENGAGEMENT_LINE_RE.test(trimmed)) return "";
  if (PAGE_SCRIPT_TITLE_RE.test(trimmed)) return "";
  if (PAGE_MARKER_RE.test(trimmed)) return "";
  if (CARD_META_LINE_RE.test(trimmed)) return "";
  const markerMatch = trimmed.match(/^图\s*([0-9一二三四五六七八九十百]+)\s*[：:、.\-]?\s*(.*)$/i);
  if (!markerMatch) return line;
  const tail = (markerMatch[2] || "").trim();
  return tail;
}

export function sanitizeImageCopyPlainText(input: string) {
  if (!input) return "";
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  for (const line of lines) {
    const normalized = normalizeImageCopyLine(line);
    const trimmed = normalized.trim();
    if (!trimmed) {
      output.push("");
      continue;
    }
    output.push(normalized);
  }
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isLikelyBodyHeadingLine(line: string, nextLine?: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Keep user-authored Markdown headings (e.g. #/##/###) in body text.
  if (/^#{1,6}\s+/.test(trimmed)) return false;
  if (PAGE_SCRIPT_TITLE_RE.test(trimmed)) return true;
  if (PAGE_MARKER_RE.test(trimmed)) return true;
  if (CARD_META_LINE_RE.test(trimmed)) return true;
  if (SECTION_KEY_SET.has(trimmed)) return true;
  if (BODY_HEADING_HINTS.has(trimmed)) return true;
  if (/^图\s*[0-9一二三四五六七八九十百]+/.test(trimmed)) return true;
  if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(trimmed)) return true;
  if (/^\d+\s*[）\).]/.test(trimmed)) return false;
  if (/[。！？!?；;：:]/.test(trimmed)) return false;
  if (trimmed.length <= 14 && (nextLine || "").trim()) return true;
  return false;
}

export function sanitizeFactoryBodyText(input: string) {
  if (!input) return "";
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || "";
    const trimmed = line.trim();
    if (!trimmed) {
      output.push("");
      continue;
    }
    if (RISKY_ENGAGEMENT_LINE_RE.test(trimmed)) continue;
    if (PAGE_SCRIPT_TITLE_RE.test(trimmed)) continue;
    if (PAGE_MARKER_RE.test(trimmed)) continue;
    if (CARD_META_LINE_RE.test(trimmed)) continue;
    if (SECTION_KEY_SET.has(trimmed)) continue;
    if (/^[A-Za-z_][A-Za-z0-9_-]*\s*:\s*$/.test(trimmed)) continue;
    if (/^[A-Za-z_][A-Za-z0-9_-]*\s*:\s*\|$/.test(trimmed)) continue;
    if (isLikelyBodyHeadingLine(trimmed, lines[index + 1])) continue;

    output.push(line);
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function guessTitleFromBody(rawBody: string) {
  const lines = rawBody.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const title = trimmed
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .trim();
    if (!title) continue;
    return title.slice(0, 80);
  }
  return "";
}

function readFrontmatterValue(frontmatterMap: Map<string, MarkdownFrontmatterValue>, aliases: string[]) {
  for (const key of aliases) {
    const value = frontmatterMap.get(normalizeMetaKey(key));
    const text = frontmatterValueToText(value).trim();
    if (text) return text;
  }
  return "";
}

function readFrontmatterTags(frontmatterMap: Map<string, MarkdownFrontmatterValue>) {
  for (const key of TAG_ALIASES) {
    const value = frontmatterMap.get(normalizeMetaKey(key));
    if (Array.isArray(value)) {
      const tags = value.map((item) => String(item).trim()).filter(Boolean);
      if (tags.length) return tags;
      continue;
    }
    const text = frontmatterValueToText(value).trim();
    if (text) return parseTags(text);
  }
  return [];
}

export function parseContentFactoryPackage(markdown: string): ContentFactoryPackage {
  const raw = (markdown || "").replace(/\r\n/g, "\n").trim();
  if (!raw) {
    return { coverTitle: "", subTitle: "", title: "", imageCopy: "", body: "", tags: [] };
  }

  let normalizedRaw = raw;
  if (!/^---\n[\s\S]*?\n---\n?/m.test(raw)) {
    const lines = raw.split("\n");
    let idx = 0;
    let seenLooseYaml = false;
    while (idx < lines.length) {
      const line = lines[idx];
      const trimmed = line.trim();
      if (!trimmed) {
        idx += 1;
        continue;
      }
      if (looksLikeLooseYamlFrontmatter(line)) {
        seenLooseYaml = true;
        idx += 1;
        continue;
      }
      if (/^\s+-\s+/.test(line) && seenLooseYaml) {
        idx += 1;
        continue;
      }
      if (/^\s{2,}[A-Za-z_][A-Za-z0-9_-]*\s*:\s*(.*)$/.test(line) && seenLooseYaml) {
        idx += 1;
        continue;
      }
      break;
    }
    if (seenLooseYaml && idx > 0) {
      const looseHead = lines.slice(0, idx).join("\n").trim();
      const tail = lines.slice(idx).join("\n").trimStart();
      normalizedRaw = `---\n${looseHead}\n---\n${tail}`;
    }
  }

  const { frontmatter, body: rawBody } = splitMarkdownDocument(normalizedRaw);
  const frontmatterMap = new Map<string, MarkdownFrontmatterValue>();
  for (const entry of frontmatter) {
    frontmatterMap.set(normalizeMetaKey(entry.key), entry.value);
  }

  const sections = parseBodySections(rawBody);
  const fmCoverTitle = readFrontmatterValue(frontmatterMap, FRONTMATTER_ALIASES.coverTitle);
  const fmSubTitle = readFrontmatterValue(frontmatterMap, FRONTMATTER_ALIASES.subTitle);
  const fmTitle = readFrontmatterValue(frontmatterMap, FRONTMATTER_ALIASES.title);
  const fmImageCopy = readFrontmatterValue(frontmatterMap, FRONTMATTER_ALIASES.imageCopy);
  const fmBody = readFrontmatterValue(frontmatterMap, FRONTMATTER_ALIASES.body);
  const fmTags = readFrontmatterTags(frontmatterMap);

  const title = normalizeScalarPlaceholder(fmTitle) || normalizeScalarPlaceholder(sections.title) || guessTitleFromBody(rawBody);
  const coverTitle = normalizeScalarPlaceholder(fmCoverTitle) || normalizeScalarPlaceholder(sections.coverTitle) || title;
  const subTitle = normalizeScalarPlaceholder(fmSubTitle) || normalizeScalarPlaceholder(sections.subTitle);

  const plainBody = sections.hasStructuredSections ? "" : rawBody.trim();
  const normalizedFmBody = normalizeScalarPlaceholder(fmBody);
  const normalizedSectionBody = normalizeScalarPlaceholder(sections.body);
  const normalizedPlainBody = normalizeScalarPlaceholder(plainBody);
  let body = sanitizeFactoryBodyText(normalizedFmBody || normalizedSectionBody || normalizedPlainBody);
  if (!body) {
    body = sanitizeFactoryBodyText(rawBody);
  }

  const imageCopy = sanitizeImageCopyPlainText(
    normalizeScalarPlaceholder(fmImageCopy) ||
      normalizeScalarPlaceholder(sections.imageCopy) ||
      body ||
      normalizedPlainBody,
  );
  const tags = dedupeTags([...fmTags, ...sections.tags]);

  return {
    coverTitle: coverTitle.trim(),
    subTitle: subTitle.trim(),
    title: title.trim(),
    imageCopy: imageCopy.trim(),
    body: body.trim(),
    tags,
  };
}

export function formatContentFactoryFixedBody(input: ContentFactoryPackage) {
  const lines: string[] = [];
  const tagsLine = input.tags.map((tag) => `#${tag.replace(/^#+/, "")}`).join(" ").trim();
  const sections: Array<{ label: string; value: string }> = [
    { label: "封面标题", value: input.coverTitle.trim() },
    { label: "副标题", value: input.subTitle.trim() },
    { label: "标题", value: input.title.trim() },
    { label: "图文正文", value: input.imageCopy.trim() },
    { label: "正文", value: input.body.trim() },
    { label: "标签", value: tagsLine },
  ];

  sections.forEach((section, index) => {
    lines.push(`## ${section.label}`);
    if (section.value) lines.push(section.value);
    if (index < sections.length - 1) lines.push("");
  });

  return lines.join("\n").trim();
}
