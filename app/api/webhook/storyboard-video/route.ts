import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidAdminWebhookRequest } from "@/lib/webhookAuth";

/**
 * Webhook endpoint for receiving video generation results.
 * Accepts callbacks from:
 *   - Legacy: admin-token authenticated requests (direct / n8n)
 *   - Poll service: api.atomx.top/tools/veo/poll/async — sends { status, task_id, video_url, context: { segment_id, ... } }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Support poll-service callback format: segment_id lives in context
    const context = body.context && typeof body.context === "object" ? body.context : null;
    const isPollingCallback = Boolean(context?.segment_id);

    // Auth: accept admin token OR valid polling callback with segment_id in context
    if (!isPollingCallback && !isValidAdminWebhookRequest(req)) {
      console.error("[storyboard-video] Unauthorized: Invalid admin token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const segment_id = body.segment_id || context?.segment_id;
    const video_url = body.video_url;
    const status = body.status;
    const error = body.error || body.message;
    const model = body.model || context?.model;
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
