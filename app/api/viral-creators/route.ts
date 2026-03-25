import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { hydrateViralReferenceMedia } from "@/lib/viralReferenceMedia";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function GET(request: Request) {
  const { userId, apiKey } = await getRequestUserContext(request);
  if (!userId && !apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const take = clamp(Number(searchParams.get("limit") ?? DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
  const cursor = searchParams.get("cursor");
  const q = safeTrim(searchParams.get("q"));
  const platforms = parseList(searchParams.get("platform"));
  const sort = safeTrim(searchParams.get("sort")) ?? "recent";
  const withSamples = searchParams.get("withSample") === "true";
  const withCounts = searchParams.get("withCounts") === "true";

  const where: Prisma.ViralCreatorWhereInput = {};
  if (platforms.length > 0) {
    where.platform = { in: platforms };
  }
  if (q) {
    where.OR = [
      { displayName: { contains: q, mode: "insensitive" } },
      { creatorHandle: { contains: q, mode: "insensitive" } },
    ];
  }

  const orderBy = buildOrder(sort);

  const creators = await prisma.viralCreator.findMany({
    where,
    take: take + 1,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy,
    include: withSamples
      ? {
          referenceItems: {
            take: 1,
            orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          },
        }
      : undefined,
  });

  let nextCursor: string | null = null;
  let items = creators;
  if (creators.length > take) {
    const nextItem = creators.pop();
    nextCursor = nextItem?.id ?? null;
    items = creators;
  }

  let counts: Record<string, number> | undefined;
  if (withCounts && items.length > 0) {
    const grouped = await prisma.viralReferenceItem.groupBy({
      by: ["creatorId"],
      where: {
        creatorId: { in: items.map((item) => item.id) },
      },
      _count: {
        _all: true,
      },
    });

    counts = grouped.reduce<Record<string, number>>((acc, entry) => {
      if (entry.creatorId) {
        acc[entry.creatorId] = entry._count._all;
      }
      return acc;
    }, {});
  }

  const data = items.map((creator) => ({
    ...creator,
    referenceCount: counts?.[creator.id] ?? 0,
    recentReference: withSamples
      ? (creator as any).referenceItems?.[0]
        ? hydrateViralReferenceMedia((creator as any).referenceItems[0])
        : null
      : null,
  }));

  return NextResponse.json({
    data,
    nextCursor,
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
    console.error("[viral-creators] Failed to parse DELETE body", error);
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

  const result = await prisma.$transaction(async (tx) => {
    await tx.viralReferenceItem.updateMany({
      where: { creatorId: { in: ids } },
      data: { creatorId: null },
    });
    const deleted = await tx.viralCreator.deleteMany({
      where: { id: { in: ids } },
    });
    return deleted.count;
  });

  return NextResponse.json({
    success: true,
    deleted: result,
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

function buildOrder(sort: string | null): Prisma.ViralCreatorOrderByWithRelationInput[] {
  switch (sort) {
    case "alphabetical":
      return [{ displayName: "asc" }, { creatorHandle: "asc" }, { id: "asc" }];
    case "oldest":
      return [{ createdAt: "asc" }, { id: "asc" }];
    default:
      return [{ updatedAt: "desc" }, { id: "desc" }];
  }
}
