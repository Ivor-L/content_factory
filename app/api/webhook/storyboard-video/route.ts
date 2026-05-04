import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidAdminWebhookRequest } from "@/lib/webhookAuth";

function parseJsonSafe(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function pickVideoUrl(body: Record<string, any>): string {
  if (typeof body.video_url === "string" && body.video_url.trim()) return body.video_url.trim();
  if (typeof body.videoUrl === "string" && body.videoUrl.trim()) return body.videoUrl.trim();
  const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : null;
  const resultJson = parseJsonSafe(data?.resultJson ?? body.resultJson);
  const resultUrls = Array.isArray(resultJson?.resultUrls) ? resultJson.resultUrls : [];
  const first = resultUrls.find((url) => typeof url === "string" && url.trim());
  return typeof first === "string" ? first.trim() : "";
}

function normalizeStatus(body: Record<string, any>): string {
  const raw = String(body.status || body.state || body.data?.state || "").toLowerCase();
  if (["success", "succeeded", "completed", "done"].includes(raw)) return "success";
  if (["fail", "failed", "error", "errored"].includes(raw)) return "failed";
  return raw;
}

/**
 * Webhook endpoint for receiving video generation results.
 * Accepts callbacks from:
 *   - Legacy: admin-token authenticated requests (direct / n8n)
 *   - Poll service: api.atomx.top/tools/veo/poll/async — sends { status, task_id, video_url, context: { segment_id, ... } }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const querySegmentId = req.nextUrl.searchParams.get("segment_id") || "";
    const queryTaskId = req.nextUrl.searchParams.get("task_id") || "";
    const queryModel = req.nextUrl.searchParams.get("model") || "";
    const queryAdminToken = req.nextUrl.searchParams.get("admin_token") || "";

    // Support poll-service callback format: segment_id lives in context
    const context = body.context && typeof body.context === "object" ? body.context : null;
    const isPollingCallback = Boolean(context?.segment_id);
    const isQueryCallback = Boolean(querySegmentId && queryAdminToken && queryAdminToken === (process.env.ADMIN_TOKEN || "").trim());

    // Auth: accept admin token OR valid polling callback with segment_id in context
    if (!isPollingCallback && !isQueryCallback && !isValidAdminWebhookRequest(req)) {
      console.error("[storyboard-video] Unauthorized: Invalid admin token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const segment_id = body.segment_id || context?.segment_id || querySegmentId;
    const video_url = pickVideoUrl(body);
    const status = normalizeStatus(body);
    const error = body.error || body.message;
    const model = body.model || context?.model || body.data?.model || queryModel;
    const generation_params = body.generation_params;

    console.log("[storyboard-video] Received webhook:", {
      segment_id,
      status,
      model,
      has_video: !!video_url,
    });

    if (!segment_id) {
      return NextResponse.json(
        { error: "Missing segment_id" },
        { status: 400 }
      );
    }

    // 2. Update segment with generated video
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (status === "success" && video_url) {
      updateData.generatedVideo = video_url;
      updateData.status = "VIDEO_READY";
      updateData.videoGenerationModel = model || null;
      if (generation_params) {
        updateData.generationParams = generation_params;
      }
    } else if (status === "failed") {
      updateData.status = "VIDEO_FAILED";
      updateData.retryCount = {
        increment: 1,
      };
    }

    const segment = await prisma.storyboardSegment.update({
      where: { id: segment_id },
      data: updateData,
      include: { task: true },
    });

    console.log("[storyboard-video] Updated segment:", {
      segment_id,
      newStatus: updateData.status,
      task_id: segment.taskId,
    });

    // 3. Check if all segments have videos ready, update task progress
    const allSegments = await prisma.storyboardSegment.findMany({
      where: { taskId: segment.taskId },
      select: { status: true },
    });

    const totalSegments = allSegments.length;
    const readySegments = allSegments.filter((s) =>
      s.status === "VIDEO_READY"
    ).length;

    const progress = Math.floor(60 + (readySegments / totalSegments) * 30); // 60-90%

    const allVideosReady = readySegments === totalSegments;

    await prisma.storyboardTask.update({
      where: { id: segment.taskId },
      data: {
        progress,
        status: allVideosReady ? "VIDEO_GENERATION_COMPLETED" : "VIDEO_GENERATING",
      },
    });

    console.log("[storyboard-video] Updated task progress:", {
      task_id: segment.taskId,
      progress,
      ready: `${readySegments}/${totalSegments}`,
      allReady: allVideosReady,
    });

    return NextResponse.json({
      success: true,
      segment_id,
      task_id: segment.taskId,
      progress,
      all_videos_ready: allVideosReady,
    });
  } catch (error) {
    console.error("[storyboard-video] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
