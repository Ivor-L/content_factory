import { createHash } from "crypto";
import { Prisma, type ViralCreator } from "@prisma/client";
import prisma from "@/lib/prisma";
import { extractViralReferenceMedia } from "@/lib/viralReferenceMedia";
import { cacheReferenceMediaAssets } from "@/lib/remoteMediaCache";

export type RawQueueItem = {
  sourceType?: string;
  platform?: string;
  collectorVersion?: string;
  data?: Record<string, unknown>;
  userTags?: {
    category?: string;
    rank?: string | number;
    remark?: string;
  };
};

type NormalizedCreatorCandidate = {
  platform: string;
  creatorHandle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  profileUrl?: string | null;
  stats?: Prisma.InputJsonValue | null;
  bio?: string | null;
  tags?: Prisma.InputJsonValue | null;
  rawPayload?: Prisma.InputJsonValue | null;
  ingestedAt?: Date | null;
};

type NormalizedReference = {
  kind: "reference";
  platform: string;
  sourceType: string;
  sourceId: string;
  sourceUrl?: string | null;
  title?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  videoUrl?: string | null;
  mediaUrls?: string[] | null;
  stats?: Prisma.InputJsonValue | null;
  author?: Prisma.InputJsonValue | null;
  userTags?: Prisma.InputJsonValue | null;
  category?: string | null;
  rankLabel?: string | null;
  benchmarkScore?: number | null;
  remark?: string | null;
  publishedAt?: Date | null;
  rawPayload?: Prisma.InputJsonValue | null;
  collectorVersion?: string | null;
  referenceHash?: string | null;
  creatorCandidate?: NormalizedCreatorCandidate | null;
};

type NormalizedCreatorOnly = {
  kind: "creator";
  creator: NormalizedCreatorCandidate;
};

type NormalizedResult = NormalizedReference | NormalizedCreatorOnly;

export type ViralReferenceImportResult = {
  results: Array<Record<string, unknown>>;
  errors: Array<{ index: number; reason: string }>;
};

const DEFAULT_PLATFORM = "xiaohongshu";

const toNullableJsonInput = (
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value;
};

export async function importViralReferenceQueueItems(
  payload: RawQueueItem[],
  ingestionOwner: string,
): Promise<ViralReferenceImportResult> {
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<{ index: number; reason: string }> = [];

  for (let index = 0; index < payload.length; index += 1) {
    const raw = payload[index];
    if (!raw || typeof raw !== "object") {
      errors.push({ index, reason: "Item is not an object" });
      continue;
    }

    const normalized = normalizeQueueItem(raw);
    if (!normalized) {
      errors.push({ index, reason: "Missing source id or unsupported sourceType" });
      continue;
    }

    try {
      if (normalized.kind === "creator") {
        const creator = await upsertCreator(normalized.creator, ingestionOwner);
        if (creator) {
          results.push({
            type: "creator",
            id: creator.id,
            platform: creator.platform,
            handle: creator.creatorHandle,
          });
        } else {
          errors.push({ index, reason: "Creator handle missing" });
        }
        continue;
      }

      let creatorId: string | null = null;
      if (normalized.creatorCandidate) {
        const creator = await upsertCreator(normalized.creatorCandidate, ingestionOwner);
        creatorId = creator?.id ?? null;
      }

      const cachedReference = await applyMediaCaching(normalized);

      const saved = await prisma.viralReferenceItem.upsert({
        where: {
          platform_sourceId: {
            platform: cachedReference.platform,
            sourceId: cachedReference.sourceId,
          },
        },
        update: {
          title: cachedReference.title ?? undefined,
          description: cachedReference.description ?? undefined,
          sourceType: cachedReference.sourceType,
          sourceUrl: cachedReference.sourceUrl ?? undefined,
          coverUrl: cachedReference.coverUrl ?? undefined,
          videoUrl: cachedReference.videoUrl ?? undefined,
          mediaUrls: toNullableJsonInput(
            cachedReference.mediaUrls as Prisma.InputJsonValue | null,
          ),
          stats: cachedReference.stats ?? undefined,
          author: cachedReference.author ?? undefined,
          userTags: cachedReference.userTags ?? undefined,
          category: cachedReference.category ?? undefined,
          rankLabel: cachedReference.rankLabel ?? undefined,
          benchmarkScore: cachedReference.benchmarkScore ?? undefined,
          remark: cachedReference.remark ?? undefined,
          publishedAt: cachedReference.publishedAt ?? undefined,
          rawPayload: cachedReference.rawPayload ?? undefined,
          collectorVersion: cachedReference.collectorVersion ?? undefined,
          referenceHash: cachedReference.referenceHash ?? undefined,
          ingestedBy: ingestionOwner,
          ingestedAt: new Date(),
          creatorId,
        },
        create: {
          platform: cachedReference.platform,
          sourceType: cachedReference.sourceType,
          sourceId: cachedReference.sourceId,
          sourceUrl: cachedReference.sourceUrl ?? null,
          title: cachedReference.title ?? null,
          description: cachedReference.description ?? null,
          coverUrl: cachedReference.coverUrl ?? null,
          videoUrl: cachedReference.videoUrl ?? null,
          mediaUrls: toNullableJsonInput(cachedReference.mediaUrls as Prisma.InputJsonValue | null),
          stats: toNullableJsonInput(cachedReference.stats),
          author: toNullableJsonInput(cachedReference.author),
          userTags: toNullableJsonInput(cachedReference.userTags),
          category: cachedReference.category ?? null,
          rankLabel: cachedReference.rankLabel ?? null,
          benchmarkScore: cachedReference.benchmarkScore ?? null,
          remark: cachedReference.remark ?? null,
          publishedAt: cachedReference.publishedAt ?? null,
          rawPayload: toNullableJsonInput(cachedReference.rawPayload),
          collectorVersion: cachedReference.collectorVersion ?? null,
          referenceHash: cachedReference.referenceHash ?? null,
          ingestedBy: ingestionOwner,
          ingestedAt: new Date(),
          creatorId,
        },
      });

      results.push({
        type: "reference",
        id: saved.id,
        platform: saved.platform,
        sourceId: saved.sourceId,
        creatorId: saved.creatorId,
      });
    } catch (error) {
      console.error("[viral-reference-importer] Failed to upsert item", { index, error });
      errors.push({ index, reason: "Database error" });
    }
  }

  return { results, errors };
}

function normalizeQueueItem(raw: RawQueueItem): NormalizedResult | null {
  const sourceType = normalizeSourceType(raw.sourceType);
  const platform = normalizePlatform(raw.platform);
  const data = raw.data ?? {};
  const media = extractViralReferenceMedia(data);
  const recognizedScriptText = extractRecognizedScriptText(data);

  if (sourceType === "profile") {
    const creatorCandidate = normalizeCreatorCandidate(platform, data, raw);
    if (!creatorCandidate) return null;
    return { kind: "creator", creator: creatorCandidate };
  }

  const sourceId = extractSourceId(data);
  if (!sourceId) return null;

  const userTags = toJson(raw.userTags);
  const category = safeTrim(raw.userTags?.category);
  const rankLabel = raw.userTags?.rank != null ? String(raw.userTags.rank) : null;
  const benchmarkScore = parseBenchmarkScore(raw.userTags?.rank);
  const remark = safeTrim(raw.userTags?.remark);
  const creatorCandidate = normalizeCreatorCandidate(platform, data, raw);

  const normalized: NormalizedReference = {
    kind: "reference",
    platform,
    sourceType,
    sourceId,
    sourceUrl: cleanUrl(extractUrl(data)),
    title: safeTrim(extractTitle(data)),
    description: safeTrim(extractDescription(data)),
    coverUrl: media.coverUrl,
    videoUrl: media.videoUrl,
    mediaUrls: media.mediaUrls,
    stats: toJson((data as Record<string, unknown>).stats),
    author: toJson((data as Record<string, unknown>).author),
    userTags,
    category,
    rankLabel,
    benchmarkScore,
    remark,
    publishedAt: extractPublishedAt(data),
    rawPayload: enrichRawPayload(data, recognizedScriptText),
    collectorVersion: safeTrim(
      raw.collectorVersion ??
        ((data as Record<string, unknown>).collectorVersion as string | undefined),
    ),
    referenceHash: computeReferenceHash(platform, sourceId, extractTitle(data), media.videoUrl),
    creatorCandidate,
  };

  return normalized;
}

async function applyMediaCaching(reference: NormalizedReference): Promise<NormalizedReference> {
  const cached = await cacheReferenceMediaAssets(
    {
      coverUrl: reference.coverUrl ?? null,
      videoUrl: reference.videoUrl ?? null,
      mediaUrls: reference.mediaUrls ?? null,
    },
    { platform: reference.platform, sourceId: reference.sourceId },
  );

  return {
    ...reference,
    coverUrl: cached.coverUrl ?? reference.coverUrl ?? null,
    videoUrl: cached.videoUrl ?? reference.videoUrl ?? null,
    mediaUrls: cached.mediaUrls ?? reference.mediaUrls ?? null,
  };
}

function normalizeCreatorCandidate(
  platform: string,
  data: Record<string, unknown>,
  raw: RawQueueItem,
): NormalizedCreatorCandidate | null {
  const author = (data as Record<string, unknown>).author as Record<string, unknown> | undefined;
  const media = extractViralReferenceMedia(data);
  const creatorHandle =
    safeTrim((data as Record<string, unknown>).bloggerId as string | undefined) ||
    safeTrim(author?.id as string | undefined) ||
    safeTrim(author?.userId as string | undefined) ||
    safeTrim(author?.username as string | undefined) ||
    safeTrim(author?.handle as string | undefined) ||
    safeTrim(author?.uniqueId as string | undefined) ||
    safeTrim((data as Record<string, unknown>).creatorId as string | undefined) ||
    safeTrim((data as Record<string, unknown>).author_username as string | undefined) ||
    safeTrim((data as Record<string, unknown>).author_handle as string | undefined) ||
    safeTrim((data as Record<string, unknown>).page_name as string | undefined);

  if (!creatorHandle) return null;

  const profileUrl =
    safeTrim(author?.profileUrl as string | undefined) ??
    safeTrim((data as Record<string, unknown>).profileUrl as string | undefined) ??
    safeTrim((data as Record<string, unknown>).author_profile_url as string | undefined) ??
    extractUrl(data);

  return {
    platform,
    creatorHandle: truncate(creatorHandle, 120),
    displayName:
      safeTrim(author?.name as string | undefined) ??
      safeTrim((data as Record<string, unknown>).author_name as string | undefined) ??
      safeTrim((data as Record<string, unknown>).page_name as string | undefined) ??
      safeTrim((data as Record<string, unknown>).title as string | undefined),
    avatarUrl:
      safeTrim(author?.avatar as string | undefined) ??
      safeTrim((data as Record<string, unknown>).author_avatar as string | undefined) ??
      media.coverUrl,
    coverUrl: media.coverUrl,
    profileUrl: cleanUrl(profileUrl),
    stats: toJson((data as Record<string, unknown>).stats),
    bio:
      safeTrim((data as Record<string, unknown>).desc as string | undefined) ??
      safeTrim((data as Record<string, unknown>).author_signature as string | undefined) ??
      safeTrim(author?.bio as string | undefined),
    tags: toJson(raw.userTags),
    rawPayload: toJson(data),
    ingestedAt: extractPublishedAt(data),
  };
}

async function upsertCreator(candidate: NormalizedCreatorCandidate, ingestedBy: string): Promise<ViralCreator | null> {
  if (!candidate.creatorHandle) return null;

  return prisma.viralCreator.upsert({
    where: {
      platform_creatorHandle: {
        platform: candidate.platform,
        creatorHandle: candidate.creatorHandle,
      },
    },
    update: {
      displayName: candidate.displayName ?? undefined,
      avatarUrl: candidate.avatarUrl ?? undefined,
      coverUrl: candidate.coverUrl ?? undefined,
      profileUrl: candidate.profileUrl ?? undefined,
      stats: candidate.stats ?? undefined,
      bio: candidate.bio ?? undefined,
      tags: candidate.tags ?? undefined,
      rawPayload: candidate.rawPayload ?? undefined,
      ingestedBy,
      ingestedAt: candidate.ingestedAt ?? new Date(),
    },
    create: {
      platform: candidate.platform,
      creatorHandle: candidate.creatorHandle,
      displayName: candidate.displayName ?? null,
      avatarUrl: candidate.avatarUrl ?? null,
      coverUrl: candidate.coverUrl ?? null,
      profileUrl: candidate.profileUrl ?? null,
      stats: toNullableJsonInput(candidate.stats),
      bio: candidate.bio ?? null,
      tags: toNullableJsonInput(candidate.tags),
      rawPayload: toNullableJsonInput(candidate.rawPayload),
      ingestedBy,
      ingestedAt: candidate.ingestedAt ?? new Date(),
    },
  });
}

function normalizeSourceType(value?: string): string {
  const normalized = safeTrim(value)?.toLowerCase();
  if (!normalized) return "note";
  if (["note", "profile", "blogger_note", "post"].includes(normalized)) {
    return normalized;
  }
  return "note";
}

function normalizePlatform(value?: string): string {
  const normalized = safeTrim(value)?.toLowerCase();
  return normalized || DEFAULT_PLATFORM;
}

function safeTrim(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function extractRecognizedScriptText(data: Record<string, unknown>): string | null {
  const note = data.note as Record<string, unknown> | undefined;
  const nestedData = data.data as Record<string, unknown> | undefined;
  const raw = data.raw as Record<string, unknown> | undefined;

  const candidates: unknown[] = [
    data.scriptText,
    data.script_text,
    note?.scriptText,
    note?.script_text,
    nestedData?.scriptText,
    nestedData?.script_text,
    raw?.scriptText,
    raw?.script_text,
    data.ocrText,
    data.ocr_text,
    nestedData?.ocrText,
    nestedData?.ocr_text,
    raw?.ocrText,
    raw?.ocr_text,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return normalizeMarkdownText(candidate);
    }
    if (Array.isArray(candidate)) {
      const lines = candidate
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
      if (lines.length > 0) {
        return normalizeMarkdownText(lines.join("\n"));
      }
    }
  }

  return null;
}

function normalizeMarkdownText(raw: string): string {
  const normalizedLines = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .split("\n")
    .map((line) => normalizeMarkdownLine(line));

  const compacted: string[] = [];
  let emptyCount = 0;
  for (const line of normalizedLines) {
    if (!line.trim()) {
      emptyCount += 1;
      if (emptyCount > 2) continue;
      compacted.push("");
      continue;
    }
    emptyCount = 0;
    compacted.push(line);
  }

  return compacted.join("\n").trim();
}

function normalizeMarkdownLine(rawLine: string): string {
  const line = rawLine.replace(/\s+$/g, "");
  const trimmed = line.trim();
  if (!trimmed) return "";

  const headingNoSpace = trimmed.match(/^(#{1,6})([^#\s].*)$/);
  if (headingNoSpace) {
    return `${headingNoSpace[1]} ${headingNoSpace[2].trim()}`;
  }

  const unorderedSymbol = trimmed.match(/^[•●▪◦◆◇·]\s*(.+)$/);
  if (unorderedSymbol) {
    return `- ${unorderedSymbol[1].trim()}`;
  }

  const unorderedMarkdown = trimmed.match(/^([-*+])\s*(.+)$/);
  if (unorderedMarkdown) {
    return `- ${unorderedMarkdown[2].trim()}`;
  }

  const orderedList = trimmed.match(/^(\d+)\s*[、.）)]\s*(.+)$/);
  if (orderedList) {
    return `${orderedList[1]}. ${orderedList[2].trim()}`;
  }

  if (trimmed.startsWith(">")) {
    const quote = trimmed.replace(/^>\s*/, "").trim();
    return quote ? `> ${quote}` : ">";
  }

  return trimmed;
}

function extractSourceId(data: Record<string, unknown>): string | null {
  const candidates = [
    data.noteId,
    data.note_id,
    (data.note as Record<string, unknown> | undefined)?.noteId,
    (data.note as Record<string, unknown> | undefined)?.note_id,
    data.id,
    data.sourceId,
    data.source_id,
    data.post_id,
    data.postId,
    data.shortcode,
    data.source_key,
    data.sourceKey,
    (data.data as Record<string, unknown> | undefined)?.sourceId,
  ]
    .map((candidate) => (typeof candidate === "string" ? candidate : null))
    .filter(Boolean) as string[];

  const explicit = candidates[0];
  if (explicit) return truncate(explicit, 160);

  const urlCandidate = extractUrl(data);
  if (!urlCandidate) return null;
  const sourceFromUrl = extractIdFromUrl(urlCandidate);
  return sourceFromUrl ? truncate(sourceFromUrl, 160) : truncate(urlCandidate, 160);
}

function extractUrl(data: Record<string, unknown>): string | null {
  const note = data.note as Record<string, unknown> | undefined;
  const nestedData = data.data as Record<string, unknown> | undefined;
  const candidates = [
    data.url,
    data.link,
    data.pageUrl,
    data.post_url,
    data.display_url,
    note?.url,
    note?.link,
    nestedData?.url,
    nestedData?.link,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function extractTitle(data: Record<string, unknown>): string | null {
  const candidates = [data.title, data.desc, data.description, data.text];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return truncate(candidate.trim(), 400);
    }
  }
  return null;
}

function extractDescription(data: Record<string, unknown>): string | null {
  const candidates = [data.desc, data.description, data.text, data.caption];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return truncate(candidate.trim(), 2000);
    }
  }
  return null;
}

function toJson(value: unknown): Prisma.InputJsonValue | null {
  if (value == null) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms);
  }
  if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      const ms = asNumber > 10_000_000_000 ? asNumber : asNumber * 1000;
      return new Date(ms);
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }
  return null;
}

function parseBenchmarkScore(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value);
  if (Number.isFinite(num)) {
    return Math.max(0, Math.round(num));
  }
  return null;
}

function computeReferenceHash(platform: string, sourceId: string, title?: string | null, videoUrl?: string | null): string {
  const hash = createHash("sha256");
  hash.update(platform);
  hash.update(sourceId);
  if (title) hash.update(title);
  if (videoUrl) hash.update(videoUrl);
  return hash.digest("hex");
}

function extractIdFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length === 0) return null;
    return segments[segments.length - 1] ?? null;
  } catch {
    return null;
  }
}

function extractPublishedAt(data: Record<string, unknown>): Date | null {
  const note = data.note as Record<string, unknown> | undefined;
  const nestedData = data.data as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    data.publishDate,
    data.publishedAt,
    data.published_at,
    data.time,
    data.timestamp,
    data.createTime,
    data.create_time,
    note?.publishDate,
    note?.publishedAt,
    note?.time,
    nestedData?.publishDate,
    nestedData?.publishedAt,
    nestedData?.time,
  ];
  for (const candidate of candidates) {
    const parsed = parseDate(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function cleanUrl(urlStr: string | null): string | null {
  if (!urlStr) return null;
  try {
    const url = new URL(urlStr);
    url.searchParams.delete("_m_ac");
    url.searchParams.delete("_m_t");
    return url.toString();
  } catch {
    return urlStr;
  }
}

function inferTypeFromCoverUrl(coverUrl: string | null | undefined): "video" | "image" | null {
  if (!coverUrl) return null;
  if (/\/spectrum\/1040g0k0/i.test(coverUrl)) return "video";
  if (/\/spectrum\/1040g34o/i.test(coverUrl)) return "image";
  return null;
}

function enrichRawPayload(
  data: Record<string, unknown>,
  recognizedScriptText?: string | null,
): Prisma.InputJsonValue | null {
  const base = toJson(data);
  if (!base || typeof base !== "object" || Array.isArray(base)) return base;
  const baseObj = base as Record<string, unknown>;
  const withScriptText = recognizedScriptText
    ? {
        ...baseObj,
        scriptText: recognizedScriptText,
        script_text: recognizedScriptText,
      }
    : baseObj;
  const existing = withScriptText.type;
  if (existing) return withScriptText as Prisma.InputJsonValue;

  // Try to infer type from nested raw.type (e.g. Instagram Apify: raw.type = "Video")
  // or from media_type field, before falling back to XHS CDN URL heuristic
  const rawNested = withScriptText.raw;
  const nestedType =
    typeof rawNested === "object" && rawNested !== null
      ? (rawNested as Record<string, unknown>).type
      : null;
  const mediaType = withScriptText.media_type;

  if (typeof nestedType === "string" && nestedType) {
    const normalized = nestedType.toLowerCase();
    const mappedType = normalized === "video" ? "video" : normalized === "image" ? "image" : null;
    if (mappedType) return { ...withScriptText, type: mappedType } as Prisma.InputJsonValue;
  }
  if (typeof mediaType === "string" && mediaType) {
    const normalized = mediaType.toLowerCase();
    const mappedType = normalized.includes("video") ? "video" : normalized.includes("image") ? "image" : null;
    if (mappedType) return { ...withScriptText, type: mappedType } as Prisma.InputJsonValue;
  }

  // Instagram: media_type is a number (1=image, 2=video, 8=carousel/album)
  if (typeof mediaType === "number") {
    if (mediaType === 2) return { ...withScriptText, type: "video" } as Prisma.InputJsonValue;
    if (mediaType === 1 || mediaType === 8) return { ...withScriptText, type: "image" } as Prisma.InputJsonValue;
  }

  // Instagram: is_video boolean
  const isVideoFlag = withScriptText.is_video;
  if (isVideoFlag === true) return { ...withScriptText, type: "video" } as Prisma.InputJsonValue;
  if (isVideoFlag === false) return { ...withScriptText, type: "image" } as Prisma.InputJsonValue;

  // Instagram GraphQL: __typename field ("GraphVideo", "GraphImage", "GraphSidecar")
  const typename = withScriptText.__typename;
  if (typeof typename === "string") {
    const tn = typename.toLowerCase();
    if (tn.includes("video")) return { ...withScriptText, type: "video" } as Prisma.InputJsonValue;
    if (tn.includes("image") || tn.includes("sidecar")) return { ...withScriptText, type: "image" } as Prisma.InputJsonValue;
  }

  const coverUrl = extractViralReferenceMedia(data).coverUrl;
  const inferred = inferTypeFromCoverUrl(coverUrl);
  if (!inferred) return withScriptText as Prisma.InputJsonValue;
  return { ...withScriptText, type: inferred } as Prisma.InputJsonValue;
}
