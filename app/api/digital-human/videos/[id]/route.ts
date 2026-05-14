import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

const SEGMENT_PREFIX_RE = /^第\s*(\d+)\s*\/\s*(\d+)\s*段\s*\n?/;

function inferSourceType(url: string | null | undefined): 'IMAGE' | 'VIDEO' {
  const normalized = String(url ?? '').trim().toLowerCase();
  if (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(normalized)) return 'VIDEO';
  return 'IMAGE';
}

function serializeVideo(video: Awaited<ReturnType<typeof prisma.digitalHumanVideo.findFirst>> & { id: string }) {
  const scriptContent = video.scriptContent ?? '';
  const segmentMatch = scriptContent.match(SEGMENT_PREFIX_RE);
  const segmentIndex = segmentMatch ? Number(segmentMatch[1]) : null;
  const segmentCount = segmentMatch ? Number(segmentMatch[2]) : null;
  return {
    id: video.id,
    type: video.type,
    status: video.status,
    sourceType: inferSourceType(video.imageUrl),
    imageUrl: video.imageUrl,
    audioUrl: video.audioUrl,
    scriptContent,
    resultUrl: video.resultUrl,
    durationSeconds: video.durationSeconds,
    sourceTaskId: video.sourceTaskId,
    workflowId: video.workflowId,
    segmentIndex,
    segmentCount,
    isSegmented: Boolean(segmentMatch),
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing task id" }, { status: 400 });
  }

  const video = await prisma.digitalHumanVideo.findFirst({
    where: { id, userId },
  });

  if (!video) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ data: serializeVideo(video) });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing task id" }, { status: 400 });
  }

  const deleted = await prisma.digitalHumanVideo.deleteMany({
    where: { id, userId },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
