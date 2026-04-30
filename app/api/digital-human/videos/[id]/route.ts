import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

function serializeVideo(video: Awaited<ReturnType<typeof prisma.digitalHumanVideo.findFirst>> & { id: string }) {
  return {
    id: video.id,
    type: video.type,
    status: video.status,
    imageUrl: video.imageUrl,
    audioUrl: video.audioUrl,
    scriptContent: video.scriptContent,
    resultUrl: video.resultUrl,
    durationSeconds: video.durationSeconds,
    sourceTaskId: video.sourceTaskId,
    workflowId: video.workflowId,
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

