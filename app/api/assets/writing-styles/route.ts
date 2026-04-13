import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 200)
    : 50;
  const mode = String(searchParams.get("mode") ?? "").trim().toLowerCase();

  if (mode === "selector") {
    const styles = await prisma.writingStyle.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        description: true,
        channel: true,
        currentProfileId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ data: styles });
  }

  const styles = await prisma.writingStyle.findMany({
    where: { userId },
    include: {
      currentProfile: {
        select: {
          id: true,
          status: true,
          sampleGaps: true,
          sampleImprovement: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          documents: true,
          chunks: true,
          profiles: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ data: styles });
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const description =
    typeof payload?.description === "string" ? payload.description.trim() : "";
  const channel =
    typeof payload?.channel === "string" ? payload.channel.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const style = await prisma.writingStyle.create({
    data: {
      userId,
      name,
      description: description || null,
      channel: channel || null,
      extractionStatus: "IDLE",
      metadata: {
        source: "manual",
      },
    },
  });

  return NextResponse.json({ data: style }, { status: 201 });
}
