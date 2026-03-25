import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidAdminWebhookRequest } from "@/lib/webhookAuth";

/**
 * Webhook endpoint for receiving video generation results from n8n workflows
 * Supports multiple video generation models:
 * - Veo3: Kyo4XHbYfxMPSTQQ + 6b81dOqinw023oAa
 * - Grok: TBD
 * - Digital Human: TBD
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify admin token
    if (!isValidAdminWebhookRequest(req)) {
      console.error("[storyboard-video] Unauthorized: Invalid admin token");
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      segment_id,
      video_url,
      status,
      error,
      model,
      generation_params,
    } = body;

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
