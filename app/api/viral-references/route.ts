import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { hydrateViralReferenceMedia } from "@/lib/viralReferenceMedia";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

export async function GET(request: Request) {
  const { userId, apiKey } = await getRequestUserContext(request);
  if (!userId && !apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const limitParam = Number(searchParams.get("limit") ?? DEFAULT_PAGE_SIZE);
  const take = clamp(limitParam, 1, MAX_PAGE_SIZE);
  const cursor = searchParams.get("cursor");
  const category = safeTrim(searchParams.get("category"));
  const creatorId = safeTrim(searchParams.get("creatorId"));
  const sourceType = safeTrim(searchParams.get("sourceType"));
  const platformList = parseList(searchParams.get("platform"));
  const q = safeTrim(searchParams.get("q"));
  const sort = safeTrim(searchParams.get("sort")) ?? "recent";
  const includeCounts = searchParams.get("includeCounts") === "true";
  const publishedAfter = parseDate(searchParams.get("publishedAfter"));
  const contentType = safeTrim(searchParams.get("contentType")); // 'video' | 'image' | null

  const currentOwner = userId ?? apiKey!;
  const where: Prisma.ViralReferenceItemWhereInput = {
    ingestedBy: currentOwner,
  };
  if (platformList.length > 0) {
    where.platform = { in: platformList };
  }
  if (category) {
    where.category = category;
  }
  if (creatorId) {
    where.creatorId = creatorId;
  }
  if (sourceType) {
    where.sourceType = sourceType;
  }
  if (publishedAfter) {
    where.publishedAt = { gte: publishedAfter };
  }
  if (contentType === "video") {
    where.videoUrl = { not: null };
  } else if (contentType === "image") {
    where.videoUrl = null;
  }
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  }

  const orderBy = buildOrder(sort);

  const records = await prisma.viralReferenceItem.findMany({
    where,
    take: take + 1,
    orderBy,
    cursor: cursor ? { id: cursor } : undefined,
    include: {
      creator: true,
    },
  });

  let nextCursor: string | null = null;
  let items = records;
  if (records.length > take) {
    const nextItem = records.pop();
    nextCursor = nextItem?.id ?? null;
    items = records;
  }

  let total: number | undefined;
  if (includeCounts) {
    total = await prisma.viralReferenceItem.count({ where });
  }

  return NextResponse.json({
    data: items.map((item) => hydrateViralReferenceMedia(item)),
    nextCursor,
    total,
  });
}

export async function DELETE(request: Request) {
  const { userId, apiKey } = await getRequestUserContext(request);
  if (!userId && !apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    console.error("[viral-references] Failed to parse DELETE body", error);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray((payload as any)?.ids)
    ? ((payload as any).ids as unknown[])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  }

  const currentOwner = userId ?? apiKey!;
  const result = await prisma.viralReferenceItem.deleteMany({
    where: { id: { in: ids }, ingestedBy: currentOwner },
  });

  return NextResponse.json({
    success: true,
    deleted: result.count,
  });
}

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => safeTrim(item))
    .filter((item): item is string => Boolean(item));
}

function safeTrim(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

function buildOrder(sort?: string | null): Prisma.ViralReferenceItemOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ publishedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }];
    case "benchmark":
      return [
        { benchmarkScore: "desc" },
        { publishedAt: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ];
    case "likes":
      return [
        { benchmarkScore: "desc" },
        { publishedAt: "desc" },
        { id: "desc" },
      ];
    case "collects":
      return [
        { benchmarkScore: "desc" },
        { publishedAt: "desc" },
        { id: "desc" },
      ];
    case "comments":
      return [
        { benchmarkScore: "desc" },
        { publishedAt: "desc" },
        { id: "desc" },
      ];
    default:
      return [
        { publishedAt: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ];
  }
}
