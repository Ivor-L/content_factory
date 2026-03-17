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
  const status = searchParams.get("status") || undefined;
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

  try {
    const docs = await prisma.historyDoc.findMany({
      where: {
        userId,
        ...(channel ? { channel } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ data: docs });
  } catch (error) {
    console.error("[assets][history] fetch failed", error);
    const message =
      error instanceof Error && /latest_derivative_id/i.test(error.message)
        ? "history_docs 缺少 latest_derivative_id 列，请执行 supabase/migrations/20260317095500_add_history_doc_derivatives.sql 并重新跑 Prisma generate。"
        : error instanceof Error
          ? error.message
          : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
    channel,
    description,
    sourceType,
    originalPath,
    insightsPath,
    metadata,
    voiceProfileId,
    status = "PENDING",
  } = payload ?? {};

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!originalPath || typeof originalPath !== "string") {
    return NextResponse.json({ error: "originalPath is required" }, { status: 400 });
  }

  if (voiceProfileId && typeof voiceProfileId === "string") {
    const ownedProfile = await prisma.voiceProfile.findFirst({
      where: { id: voiceProfileId, userId },
      select: { id: true },
    });
    if (!ownedProfile) {
      return NextResponse.json({ error: "voiceProfileId not found" }, { status: 404 });
    }
  }

  const preparedMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, any>), processingStatus: status }
      : metadata ?? undefined;

  const doc = await prisma.historyDoc.create({
    data: {
      userId,
      title,
      channel,
      description,
      sourceType,
      originalPath,
      insightsPath,
      status,
      metadata: preparedMetadata,
      voiceProfile: voiceProfileId ? { connect: { id: voiceProfileId } } : undefined,
    },
  });

  return NextResponse.json({ data: doc }, { status: 201 });
}
