import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { syncTaskToSummary } from "@/lib/taskSummary";
import { emitStoryboardTaskUpsert } from "@/lib/storyboardEvents";

export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("taskId");
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  try {
    const task = await (prisma as any).storyboardTask.findFirst({
      where: { taskId },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({
      status: task.status,
      progress: task.progress ?? 0,
      storyboard_image_url: task.storyboardImageUrl || task.coverImage,
    });
  } catch (error) {
    console.error("[canvas/grid] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { contentType, scriptContent, imageUrl, aspectRatio } = body as Record<string, unknown>;

  if (!scriptContent || typeof scriptContent !== "string" || !scriptContent.trim()) {
    return NextResponse.json({ error: "scriptContent is required" }, { status: 400 });
  }
  if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.trim()) {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
  }

  const contentTypeMap: Record<string, string> = {
    "产品展示": "产品展示",
    "卖点展示": "产品卖点展示",
    "剧情故事": "剧情故事",
  };
  const mappedContentType = contentTypeMap[String(contentType || "产品展示")] || "产品展示";

  try {
    const task = await (prisma as any).storyboardTask.create({
      data: {
        status: "GENERATING_GRID",
        videoUrl: "",
        scriptContent: scriptContent.trim(),
        referenceImage: imageUrl.trim(),
        videoType: "grid",
        imageModel: "nanoBananapro",
        videoModel: "veo_3_1-fast",
        userId,
        progress: 5,
      },
    });

    const syncedTask = await (prisma as any).storyboardTask.update({
      where: { id: task.id },
      data: { taskId: task.id },
    });

    emitStoryboardTaskUpsert(syncedTask);
    await syncTaskToSummary({ taskType: "storyboard", taskId: syncedTask.id, operation: "create" });

    const webhookUrl =
      process.env.N8N_STORYBOARD_GEN_WEBHOOK?.trim() ||
      "https://hooks.atomx.top/webhook/storyboard_Plot_web";

    const callbackBase = (process.env.CANVAS_VIDEO_POLL_CALLBACK_BASE_URL || "").replace(/\/+$/, "") || "https://atomx.top";

    const payload = {
      taskId: task.id,
      task_id: task.id,
      record_id: task.id,
      script: scriptContent.trim(),
      scriptContent: scriptContent.trim(),
      imageUrl: imageUrl.trim(),
      content_type: mappedContentType,
      aspectRatio: String(aspectRatio || "9:16"),
      style_mode: "auto",
      callback_url: `${callbackBase}/api/canvas/grid/webhook?taskId=${task.id}`,
      admin_token: process.env.ADMIN_TOKEN,
    };

    console.log("[canvas/grid] Calling n8n webhook:", webhookUrl);
    console.log("[canvas/grid] Payload:", JSON.stringify(payload, null, 2));

    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.error("[canvas/grid] webhook fire failed:", err);
    });

    return NextResponse.json({ data: { taskId: syncedTask.id } });
  } catch (error) {
    console.error("[canvas/grid] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
