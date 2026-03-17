import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel") || undefined;
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

  const stories = await prisma.storyAsset.findMany({
    where: {
      userId,
      ...(channel ? { channel } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const normalized = stories.map((story) => {
    const meta = (story.metadata && typeof story.metadata === "object" && !Array.isArray(story.metadata))
      ? (story.metadata as Record<string, any>)
      : {};
    const status = (story as any).status ?? meta.processingStatus ?? null;
    return { ...story, status };
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
    title,
    summary,
    channel,
    tags,
    contentPath,
    structure,
    metadata,
  } = payload ?? {};

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  let normalizedTags: string[] | undefined = undefined;
  if (Array.isArray(tags)) {
    normalizedTags = tags
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter(Boolean);
  }

  const preparedMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, any>), processingStatus: "PENDING" }
      : metadata ?? undefined;

  const story = await prisma.storyAsset.create({
    data: {
      userId,
      title,
      summary,
      channel,
      tags: normalizedTags ?? undefined,
      contentPath,
      structure: structure ?? undefined,
      metadata: preparedMetadata,
    },
  });

  return NextResponse.json({ data: story }, { status: 201 });
}
