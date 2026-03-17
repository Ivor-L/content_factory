import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import { createKnowledgeVideoTask } from "@/lib/knowledgeVideos";
import { enqueueKnowledgeVideoJob } from "@/lib/knowledgeVideoQueue";

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;
  const status = searchParams.get("status") || undefined;
  const videoType = searchParams.get("videoType") || undefined;

  const tasks = await prisma.knowledgeVideoTask.findMany({
    where: {
      userId,
      ...(status ? { status } : {}),
      ...(videoType ? { videoType } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ data: tasks });
}

const ALLOWED_TYPES = new Set(["subtitle_wrap", "knowledge_animation"]);

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

  const videoType = typeof payload.videoType === "string" ? payload.videoType.trim() : "";
  if (!ALLOWED_TYPES.has(videoType)) {
    return NextResponse.json({ error: "videoType must be subtitle_wrap or knowledge_animation" }, { status: 400 });
  }

  try {
    const task = await createKnowledgeVideoTask({
      userId,
      title: typeof payload.title === "string" ? payload.title : null,
      videoType: videoType as "subtitle_wrap" | "knowledge_animation",
      scriptContent: typeof payload.scriptContent === "string" ? payload.scriptContent : null,
      audioUrl: typeof payload.audioUrl === "string" ? payload.audioUrl : null,
      audioDuration:
        typeof payload.audioDuration === "number" && Number.isFinite(payload.audioDuration)
          ? payload.audioDuration
          : null,
      themeKey: typeof payload.themeKey === "string" ? payload.themeKey : null,
      timeline: payload.timeline && typeof payload.timeline === "object" ? payload.timeline : null,
      metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : null,
      sourceTaskId: typeof payload.sourceTaskId === "string" ? payload.sourceTaskId : undefined,
    });
    await enqueueKnowledgeVideoJob(task.id);
    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    console.error("Failed to create knowledge video task", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create knowledge video task" },
      { status: 400 }
    );
  }
}
