import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { Prisma, type ViralCreator } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { extractViralReferenceMedia } from "@/lib/viralReferenceMedia";
import { cacheReferenceMediaAssets } from "@/lib/remoteMediaCache";

type RawQueueItem = {
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

const DEFAULT_PLATFORM = "xiaohongshu";
const MAX_BATCH_SIZE = 200;

const toNullableJsonInput = (
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value;
};

export async function POST(request: Request) {
  const headerApiKey = request.headers.get('x-user-api-key')?.trim() ?? null;
  const { userId, apiKey } = await getRequestUserContext(request);
  if (!userId && !apiKey) {
    if (headerApiKey) {
      // API Key was provided but didn't match any user in the database
      console.warn("[viral-reference-import] Invalid API Key provided:", headerApiKey.slice(0, 8) + "...");
      return NextResponse.json(
        { error: "Invalid API Key. Please check your API Key in the plugin settings. Go to Settings page in the app to find your API Key." },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: "Unauthorized. Please configure your API Key in the plugin settings." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.warn("[viral-reference-import] Invalid JSON body", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = Array.isArray(body) ? body : [body];
  if (payload.length === 0) {
    return NextResponse.json({ error: "Body is empty" }, { status: 400 });
  }

  if (payload.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Batch too large (max ${MAX_BATCH_SIZE})` },
      { status: 413 },
    );
  }

  const ingestionOwner = userId ?? apiKey!;
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<{ index: number; reason: string }> = [];

  for (let index = 0; index < payload.length; index += 1) {
    const raw = payload[index] as RawQueueItem | undefined;
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

      let cachedReference = normalized;
      cachedReference = await applyMediaCaching(cachedReference);

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
      console.error("[viral-reference-import] Failed to upsert item", { index, error });
      errors.push({ index, reason: "Database error" });
    }
  }

  if (results.length === 0) {
    return NextResponse.json({ error: "No items saved", errors }, { status: 400 });
  }

  return NextResponse.json({ data: results, errors });
}

function normalizeQueueItem(raw: RawQueueItem): NormalizedResult | null {
  const sourceType = normalizeSourceType(raw.sourceType);
  const platform = normalizePlatform(raw.platform);
  const data = raw.data ?? {};
  const media = extractViralReferenceMedia(data);

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
    rawPayload: enrichRawPayload(data),
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
    safeTrim((data as Record<string, unknown>).creatorId as string | undefined);

  if (!creatorHandle) return null;

  return {
    platform,
    creatorHandle: truncate(creatorHandle, 120),
    displayName: safeTrim(author?.name as string | undefined) ?? safeTrim((data as Record<string, unknown>).title as string | undefined),
    avatarUrl: safeTrim(author?.avatar as string | undefined) ?? media.coverUrl,
    coverUrl: media.coverUrl,
    profileUrl: cleanUrl(
      safeTrim(author?.profileUrl as string | undefined) ??
        safeTrim((data as Record<string, unknown>).profileUrl as string | undefined) ??
        extractUrl(data),
    ),
    stats: toJson((data as Record<string, unknown>).stats),
    bio: safeTrim((data as Record<string, unknown>).desc as string | undefined),
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
  if (["note", "profile", "blogger_note"].includes(normalized)) {
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

function extractSourceId(data: Record<string, unknown>): string | null {
  const candidates = [
    data.noteId,
    data.note_id,
    (data.note as Record<string, unknown> | undefined)?.noteId,
    (data.note as Record<string, unknown> | undefined)?.note_id,
    data.id,
    data.sourceId,
    data.source_id,
    (data.data as Record<string, unknown> | undefined)?.sourceId,
  ].map((candidate) => (typeof candidate === "string" ? candidate : null)).filter(Boolean) as string[];

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
  const candidates = [data.title, data.desc, data.description];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return truncate(candidate.trim(), 400);
    }
  }
  return null;
}

function extractDescription(data: Record<string, unknown>): string | null {
  const candidates = [data.desc, data.description];
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

// Infer content type from XHS CDN cover URL when the plugin doesn't send a `type` field.
// XHS video note covers use file IDs prefixed with "1040g0k0"; image note covers use "1040g34o" etc.
function inferTypeFromCoverUrl(coverUrl: string | null | undefined): "video" | "image" | null {
  if (!coverUrl) return null;
  if (/\/spectrum\/1040g0k0/i.test(coverUrl)) return "video";
  if (/\/spectrum\/1040g34o/i.test(coverUrl)) return "image";
  return null;
}

// Enrich rawPayload with an inferred `type` field when the original data doesn't include one.
function enrichRawPayload(data: Record<string, unknown>): Prisma.InputJsonValue | null {
  const base = toJson(data);
  if (!base || typeof base !== "object" || Array.isArray(base)) return base;
  const existing = (base as Record<string, unknown>).type;
  if (existing) return base; // already has type, don't override
  const coverUrl = extractViralReferenceMedia(data).coverUrl;
  const inferred = inferTypeFromCoverUrl(coverUrl);
  if (!inferred) return base;
  return { ...(base as Record<string, unknown>), type: inferred } as Prisma.InputJsonValue;
}
