import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidAdminWebhookRequest } from "@/lib/webhookAuth";

/**
 * Webhook endpoint for receiving video merge results from n8n workflow
 * Called after video merging (with or without subtitles) is complete
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify admin token
    if (!isValidAdminWebhookRequest(req)) {
      console.error("[storyboard-merge] Unauthorized: Invalid admin token");
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      task_id,
      video_url,
      status,
      error,
      has_subtitles,
      subtitle_info,
    } = body;

    console.log("[storyboard-merge] Received webhook:", {
      task_id,
      status,
      has_video: !!video_url,
      has_subtitles,
    });

    if (!task_id) {
      return NextResponse.json(
        { error: "Missing task_id" },
        { status: 400 }
      );
    }

    // 2. Update task with final video
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (status === "success" && video_url) {
      updateData.finalVideoUrl = video_url;
      updateData.status = "COMPLETED";
      updateData.progress = 100;

      // Store subtitle info in timeline metadata
      if (has_subtitles && subtitle_info) {
        updateData.timeline = {
          ...(typeof updateData.timeline === 'object' ? updateData.timeline : {}),
          subtitles: subtitle_info,
        };
      }
    } else if (status === "failed") {
      updateData.status = "MERGE_FAILED";
      updateData.progress = 90;
    }

    await prisma.storyboardTask.update({
      where: { id: task_id },
      data: updateData,
    });

    console.log("[storyboard-merge] Updated task:", {
      task_id,
      newStatus: updateData.status,
      has_video: !!video_url,
    });

    return NextResponse.json({
      success: true,
      task_id,
    });
  } catch (error) {
    console.error("[storyboard-merge] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
