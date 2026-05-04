import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";

const BREAKDOWN_WEBHOOK =
  process.env.N8N_STORYBOARD_BREAKDOWN_WEBHOOK ||
  "https://hooks.atomx.top/webhook/miniapp_viral_breakdown_grid";

async function resolveApiKey(userId: string): Promise<string> {
  const profile = await prisma.profiles.findUnique({
    where: { id: userId },
    select: { api_key: true },
  });
  return profile?.api_key || process.env.DEFAULT_USER_API_KEY || "";
}

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
  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";

  if (!videoUrl) {
    return NextResponse.json({ error: "videoUrl is required" }, { status: 400 });
  }

  const apiKey = await resolveApiKey(userId);
  const appUrl =
    process.env.N8N_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";

  const task = await (prisma as any).storyboardTask.create({
    data: {
      status: "BREAKDOWN_PENDING",
      videoUrl,
      replicationMode: "viral-clone",
      scriptContent: "",
      imageModel: "nanoBananapro",
      videoModel: "veo_3_1-fast",
      userId,
      coverImage: null,
    },
  });

  // Set taskId = task.id (used by webhook callback as task identifier)
  await (prisma as any).storyboardTask.update({
    where: { id: task.id },
    data: { taskId: task.id },
  });

  const webhookPayload = {
    taskId: task.id,
    task_id: task.id,
    record_id: task.id,
    video_url: videoUrl,
    videoUrl,
    script_content: "",
    scriptContent: "",
    api_key: apiKey,
    admin_token: process.env.ADMIN_TOKEN,
    app_url: appUrl,
    user_id: userId,
    userId,
    replicationMode: "viral-clone",
    imageModel: "nanoBananapro",
    videoModel: "veo_3_1-fast",
    workflow_id: "flow_storyboard_disassembly",
    workflow_name: "分镜拆解",
    callback_url: `${appUrl}/api/webhook/storyboard-breakdown`,
  };

  // Fire and forget
  fetch(BREAKDOWN_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookPayload),
  }).catch((err) => {
    console.error("[canvas/storyboard] webhook fire failed:", err);
  });

  return NextResponse.json({ data: { taskId: task.id, status: task.status } });
}

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId")?.trim();
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  const task = await (prisma as any).storyboardTask.findFirst({
    where: { id: taskId, userId },
    select: {
      id: true,
      status: true,
      progress: true,
      videoUrl: true,
      segments: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          duration: true,
          timeRange: true,
          originalScript: true,
          rewrittenScript: true,
          visualDescription: true,
          cameraNotes: true,
          lightingNotes: true,
          imagePrompt: true,
          videoPrompt: true,
          generatedImage: true,
          generatedVideo: true,
          status: true,
          generationParams: true,
        },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ status: task.status, progress: task.progress ?? 0, segments: task.segments });
}
