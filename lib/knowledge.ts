import { Buffer } from "node:buffer";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "log",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
]);

export function sanitizeKnowledgeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

export function knowledgeAssetPath(
  userId: string,
  folderId: string,
  filename: string,
) {
  const safeUserId = sanitizeKnowledgeFilename(userId);
  const safeFolderId = sanitizeKnowledgeFilename(folderId);
  const safeFilename = sanitizeKnowledgeFilename(filename);
  return `knowledge/${safeUserId}/${safeFolderId}/${Date.now()}-${safeFilename}`;
}

function getExtension(filename: string) {
  const idx = filename.lastIndexOf(".");
  if (idx < 0) return "";
  return filename.slice(idx + 1).toLowerCase();
}

export function isTextLikeKnowledgeFile(filename: string, contentType?: string | null) {
  const normalizedType = (contentType || "").toLowerCase();
  if (normalizedType.startsWith("text/")) return true;
  if (normalizedType === "application/json") return true;
  if (normalizedType === "application/xml") return true;
  return TEXT_EXTENSIONS.has(getExtension(filename));
}

export function decodeTextContent(buffer: Buffer) {
  // Browser-like UTF-8 decode is enough for current MVP text files.
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

function normalizeText(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitTextToChunks(
  input: string,
  options?: { chunkSize?: number; overlap?: number; maxChunks?: number },
) {
  const chunkSize = Math.max(300, options?.chunkSize ?? 1200);
  const overlap = Math.max(0, Math.min(chunkSize - 50, options?.overlap ?? 180));
  const maxChunks = Math.max(1, options?.maxChunks ?? 200);
  const text = normalizeText(input);
  if (!text) return [];

  const chunks: Array<{ chunkIndex: number; content: string; contentLength: number }> = [];
  let start = 0;
  let index = 0;

  while (start < text.length && chunks.length < maxChunks) {
    const end = Math.min(text.length, start + chunkSize);
    const raw = text.slice(start, end).trim();
    if (raw) {
      chunks.push({
        chunkIndex: index,
        content: raw,
        contentLength: raw.length,
      });
      index += 1;
    }
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

export function buildFallbackKnowledgeChunk(title: string, filename: string, mimeType?: string | null) {
  const content = [
    `文件名: ${filename}`,
    `标题: ${title}`,
    mimeType ? `类型: ${mimeType}` : "",
    "说明: 当前文件不是纯文本类型，系统仅记录了基础信息。建议补充 TXT/MD 版本以提升检索与对话效果。",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    chunkIndex: 0,
    content,
    contentLength: content.length,
  };
}
