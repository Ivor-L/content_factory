import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { ensureSystemStylePresetsSeeded } from "@/lib/systemStylePresets";

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

    const normalized = styles.map((style) => {
      const meta =
        style.metadata && typeof style.metadata === "object" && !Array.isArray(style.metadata)
          ? (style.metadata as Record<string, any>)
          : {};
      const status = meta.processingStatus ?? null;
      return {
        id: style.id,
        name: style.name,
        type: style.type,
        previewUrl: style.previewUrl,
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

  const normalized = styles.map((style) => {
    const meta = (style.metadata && typeof style.metadata === "object" && !Array.isArray(style.metadata))
      ? (style.metadata as Record<string, any>)
      : {};
    const status = (style as any).status ?? meta.processingStatus ?? null;
    return { ...style, status };
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
