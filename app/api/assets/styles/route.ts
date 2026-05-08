import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { getStylePreviewImageUrl } from "@/lib/stylePreviewImage";
import {
  ensureSystemStylePresetsSeeded,
  isDeprecatedDefaultStylePreset,
} from "@/lib/systemStylePresets";

const readMetadata = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const readThumbnailUrl = (meta: Record<string, any>) =>
  typeof meta.thumbnailUrl === "string" && meta.thumbnailUrl.trim()
    ? meta.thumbnailUrl
    : null;

const readSystemThumbnailUrl = (previewUrl?: string | null) => {
  if (!previewUrl) return null;
  const match = previewUrl.match(/^(.*\/system-style-previews\/)([^/?#]+)\.(?:png|jpe?g|webp)([?#].*)?$/i);
  if (!match) return null;
  return `${match[1]}thumbs/${match[2]}.webp${match[3] ?? ""}`;
};

const resolveThumbnailUrl = (previewUrl: string | null | undefined, meta: Record<string, any>) =>
  readThumbnailUrl(meta) ?? readSystemThumbnailUrl(previewUrl);

const resolveListPreviewUrl = (previewUrl: string | null | undefined, meta: Record<string, any>) =>
  getStylePreviewImageUrl({
    previewUrl: previewUrl ?? null,
    thumbnailUrl: resolveThumbnailUrl(previewUrl, meta),
    metadata: meta,
  }) ?? previewUrl ?? null;

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureSystemStylePresetsSeeded();

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || undefined;
  const includeShared = searchParams.get("includeShared") !== "0";
  const summary =
    searchParams.get("summary") === "1" ||
    searchParams.get("summary") === "true";
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;
  const where = {
    ...(type ? { type } : {}),
    ...(includeShared ? { OR: [{ userId }, { userId: null }] } : { userId }),
  };

  if (summary) {
    const styles = await prisma.stylePreset.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        name: true,
        type: true,
        previewUrl: true,
        metadata: true,
      },
    });

    const normalized = styles
      .filter((style) => !isDeprecatedDefaultStylePreset(style))
      .map((style) => {
        const meta = readMetadata(style.metadata);
        const status = meta.processingStatus ?? null;
        const thumbnailUrl = resolveThumbnailUrl(style.previewUrl, meta);
        return {
          id: style.id,
          name: style.name,
          type: style.type,
          previewUrl: summary ? resolveListPreviewUrl(style.previewUrl, meta) : style.previewUrl,
          thumbnailUrl,
          status,
        };
      });

    return NextResponse.json({ data: normalized });
  }

  const styles = await prisma.stylePreset.findMany({
    where,
    orderBy: [
      { createdAt: "desc" },
    ],
    take: limit,
  });

  const normalized = styles
    .filter((style) => !isDeprecatedDefaultStylePreset(style))
    .map((style) => {
      const meta = readMetadata(style.metadata);
      const status = (style as any).status ?? meta.processingStatus ?? null;
      return { ...style, thumbnailUrl: resolveThumbnailUrl(style.previewUrl, meta), status };
    });

  return NextResponse.json({ data: normalized });
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    name,
    type,
    description,
    spec,
    previewUrl,
    metadata,
  } = payload ?? {};

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const normalizedType =
    typeof type === "string" && type.trim().length > 0
      ? type.trim()
      : "xhs-visual";
  if (spec == null || typeof spec !== "object") {
    return NextResponse.json({ error: "spec must be an object" }, { status: 400 });
  }

  const preparedMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, any>), processingStatus: "PENDING" }
      : metadata ?? undefined;

  const style = await prisma.stylePreset.create({
    data: {
      userId,
      name,
      type: normalizedType,
      description,
      spec,
      previewUrl,
      metadata: preparedMetadata,
    },
  });

  return NextResponse.json({ data: style }, { status: 201 });
}
