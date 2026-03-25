import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidAdminWebhookRequest } from "@/lib/webhookAuth";

/**
 * Webhook endpoint for receiving image generation results from n8n workflow
 * n8n workflow: YPzVxDvKVKPVmPuo (爆款复刻首帧图片生成-网页版-v4)
 * Called after each segment's first frame image is generated
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify admin token
    if (!isValidAdminWebhookRequest(req)) {
      console.error("[storyboard-image] Unauthorized: Invalid admin token");
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      segment_id,
      image_url,
      status,
      error,
      model,
      generation_params,
    } = body;

    console.log("[storyboard-image] Received webhook:", {
      segment_id,
      status,
      model,
      has_image: !!image_url,
    });

    if (!segment_id) {
      return NextResponse.json(
        { error: "Missing segment_id" },
        { status: 400 }
      );
    }

    // 2. Update segment with generated image
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (status === "success" && image_url) {
      updateData.generatedImage = image_url;
      updateData.status = "IMAGE_READY";
      updateData.imageGenerationModel = model || null;
      if (generation_params) {
        updateData.generationParams = generation_params;
      }
    } else if (status === "failed") {
      updateData.status = "IMAGE_FAILED";
      updateData.retryCount = {
        increment: 1,
      };
    }

    const segment = await prisma.storyboardSegment.update({
      where: { id: segment_id },
      data: updateData,
      include: { task: true },
    });

    console.log("[storyboard-image] Updated segment:", {
      segment_id,
      newStatus: updateData.status,
      task_id: segment.taskId,
    });

    // 3. Check if all segments have images ready, update task progress
    const allSegments = await prisma.storyboardSegment.findMany({
      where: { taskId: segment.taskId },
      select: { status: true },
    });

    const totalSegments = allSegments.length;
    const readySegments = allSegments.filter((s) =>
      s.status === "IMAGE_READY" || s.status.startsWith("VIDEO_")
    ).length;

    const progress = Math.floor(30 + (readySegments / totalSegments) * 30); // 30-60%

    await prisma.storyboardTask.update({
      where: { id: segment.taskId },
      data: {
        progress,
        status: readySegments === totalSegments ? "IMAGE_GENERATION_COMPLETED" : "IMAGE_GENERATING",
      },
    });

    // 4. Update task_summaries thumbnail if not yet set (use first generated image)
    if (status === "success" && image_url) {
      await prisma.taskSummary.updateMany({
        where: {
          taskId: segment.taskId,
          taskType: "storyboard",
          thumbnailUrl: null,
        },
        data: {
          thumbnailUrl: image_url,
          updatedAt: new Date(),
        },
      });
    }

    console.log("[storyboard-image] Updated task progress:", {
      task_id: segment.taskId,
      progress,
      ready: `${readySegments}/${totalSegments}`,
    });

    return NextResponse.json({
      success: true,
      segment_id,
      task_id: segment.taskId,
      progress,
    });
  } catch (error) {
    console.error("[storyboard-image] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
