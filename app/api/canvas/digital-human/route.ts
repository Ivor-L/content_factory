import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { createDigitalHumanJobs } from "@/lib/digitalHumanJob";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const scriptContent = typeof body.scriptContent === "string" ? body.scriptContent.trim() : "";
  const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";

  if (!scriptContent || !audioUrl || !imageUrl) {
    return NextResponse.json(
      { error: "scriptContent, audioUrl, and imageUrl are required" },
      { status: 400 },
    );
  }

  try {
    const batch = await createDigitalHumanJobs({
      type: "VOICE_CLONE",
      imageUrl,
      audioUrl,
      script: scriptContent,
      userId,
      splitIfNeeded: false,
    });
    const job = batch.jobs[0];
    if (!job) {
      return NextResponse.json({ error: "Failed to create digital human job" }, { status: 500 });
    }

    return NextResponse.json({
      data: { id: job.id, status: job.status },
      videoIds: batch.jobs.map((item) => item.id),
      jobCount: batch.jobs.length,
      split: batch.isSplit,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create digital human job" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId")?.trim();
  if (!videoId) {
    return NextResponse.json({ error: "videoId is required" }, { status: 400 });
  }

  const record = await prisma.digitalHumanVideo.findFirst({
    where: { id: videoId, userId },
    select: { status: true, resultUrl: true },
  });

  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ status: record.status, resultUrl: record.resultUrl ?? null });
}
