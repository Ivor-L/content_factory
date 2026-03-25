import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { resolveUserApiKey } from "@/lib/userApiKey";
import type { Prisma } from "@prisma/client";

/**
 * Batch trigger video generation for storyboard segments
 * POST /api/storyboard/[id]/generate-videos
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, apiKey: contextApiKey } = await getRequestUserContext(req, {
      allowDefaultApiKey: false,
    });
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const {
      segmentIds,
      model = "veo_3_1-fast",
      allowTextVideo = false,
    } = body;

    console.log("[generate-videos] Request:", {
      task_id: id,
      segmentIds,
      model,
      userId,
    });

    // 1. Verify task exists and belongs to user
    const task = await prisma.storyboardTask.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        product: true,
        character: true,
      },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found or unauthorized" },
        { status: 404 }
      );
    }

    // 2. Get segments to generate videos for
    const hasSpecificSegments = Array.isArray(segmentIds) && segmentIds.length > 0;
    const allowTextOnly = Boolean(allowTextVideo);
    const whereClause: Prisma.StoryboardSegmentWhereInput = { taskId: id };

    if (hasSpecificSegments) {
      whereClause.id = { in: segmentIds };
      if (!allowTextOnly) {
        whereClause.generatedImage = { not: null };
        whereClause.status = { in: ["IMAGE_READY", "VIDEO_READY", "VIDEO_FAILED"] };
      } else {
        whereClause.status = { not: "VIDEO_READY" };
      }
    } else {
      whereClause.status = allowTextOnly ? { not: "VIDEO_READY" } : "IMAGE_READY";
    }

    const segments = await prisma.storyboardSegment.findMany({
      where: whereClause,
      orderBy: { order: "asc" },
    });

    if (segments.length === 0) {
      return NextResponse.json(
        {
          error: allowTextOnly
            ? "No storyboard segments available for video generation"
            : "No segments with images ready found",
        },
        { status: 404 }
      );
    }

    const targetSegments = allowTextOnly
      ? segments.filter((segment) => !segment.generatedVideo)
      : segments;

    if (targetSegments.length === 0) {
      return NextResponse.json(
        { error: "All selected segments already have generated videos" },
        { status: 404 }
      );
    }

    console.log("[generate-videos] Triggering generation for segments:", {
      count: targetSegments.length,
      model,
      allowTextVideo: allowTextOnly,
    });

    // 3. Get webhook URL based on model
    let webhookUrl: string | undefined;
    switch (model) {
      case "veo3":
      case "veo_3_1-fast":
        webhookUrl = process.env.N8N_VEO3_WEBHOOK;
        break;
      case "grok":
        webhookUrl = process.env.N8N_GROK_WEBHOOK;
        break;
      case "digital-human":
        webhookUrl = process.env.N8N_DH_VIDEO_WEBHOOK;
        break;
      default:
        return NextResponse.json(
          { error: `Unsupported model: ${model}` },
          { status: 400 }
        );
    }

    if (!webhookUrl) {
      console.error(`[generate-videos] Webhook not configured for model: ${model}`);
      return NextResponse.json(
        { error: `Video generation service not configured for ${model}` },
        { status: 500 }
      );
    }

    // 4. Trigger video generation for each segment
    const callbackUrl = `${process.env.N8N_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL}/api/webhook/storyboard-video`;
    const apiKey = await resolveUserApiKey({
      userId,
      explicitApiKey: contextApiKey,
      allowDefaultFallback: false,
    });
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "API key not configured",
          message: "请先在个人资料中绑定 API Key 后再发起生视频任务。",
        },
        { status: 400 }
      );
    }

    const triggers = targetSegments.map(async (segment) => {
      let payload: any = {
        segment_id: segment.id,
        task_id: id,
        callback_url: callbackUrl,
        api_key: apiKey,
        admin_token: process.env.ADMIN_TOKEN,
        model,
      };

      // Model-specific payload
      if (model === "veo3" || model === "veo_3_1-fast" || model === "grok") {
        payload = {
          ...payload,
          prompt: segment.videoPrompt || segment.visualDescription,
          first_frame_url: segment.generatedImage,
          duration: segment.duration,
          aspect_ratio: "9:16",
        };
      } else if (model === "digital-human") {
        payload = {
          ...payload,
          script: segment.rewrittenScript || segment.originalScript,
          character_image_url: task.character?.avatar,
          voice_id: task.character?.voiceId,
          duration: segment.duration,
        };
      }

      try {
        const response = await fetch(webhookUrl!, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Webhook failed: ${response.status}`);
        }

        // Update segment status to indicate generation started
        await prisma.storyboardSegment.update({
          where: { id: segment.id },
          data: {
            status: "VIDEO_GENERATING",
            videoGenerationModel: model,
          },
        });

        return { segment_id: segment.id, success: true };
      } catch (error) {
        console.error(`[generate-videos] Failed for segment ${segment.id}:`, error);
        return {
          segment_id: segment.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    const results = await Promise.all(triggers);
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    if (successCount > 0) {
      await prisma.storyboardTask.update({
        where: { id },
        data: {
          status: "VIDEO_GENERATING",
          progress: 65,
        },
      });
    }

    console.log("[generate-videos] Batch trigger complete:", {
      task_id: id,
      total: targetSegments.length,
      success: successCount,
      failures: failureCount,
      model,
    });

    const payload = {
      success: failureCount === 0,
      partial: successCount > 0 && failureCount > 0,
      task_id: id,
      total: targetSegments.length,
      triggered: successCount,
      failed: failureCount,
      model,
      results,
      message:
        successCount === 0
          ? "所有分镜生视频触发失败"
          : failureCount > 0
            ? "部分分镜触发失败"
            : undefined,
    };

    return NextResponse.json(payload, { status: successCount === 0 ? 502 : 200 });
  } catch (error) {
    console.error("[generate-videos] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
