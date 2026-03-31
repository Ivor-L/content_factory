import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { resolveUserApiKey } from "@/lib/userApiKey";
import type { Prisma } from "@prisma/client";

/**
 * Batch trigger video generation for storyboard segments
 * POST /api/storyboard/[id]/generate-videos
 *
 * Calls n8n webhook which generates the video and POSTs back via callback_url.
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
      model = "veo3.1-fast",
      allowTextVideo = false,
    } = body;

    console.log("[generate-videos] Request:", { task_id: id, segmentIds, model, userId });

    // 1. Verify task
    const task = await prisma.storyboardTask.findUnique({
      where: { id },
      include: { product: true, character: true },
    });
    if (!task || (task.userId && task.userId !== userId)) {
      return NextResponse.json({ error: "Task not found or unauthorized" }, { status: 404 });
    }

    // 2. Get segments
    const hasSpecificSegments = Array.isArray(segmentIds) && segmentIds.length > 0;
    const allowTextOnly = Boolean(allowTextVideo);
    const whereClause: Prisma.StoryboardSegmentWhereInput = { taskId: id };
    if (hasSpecificSegments) {
      whereClause.id = { in: segmentIds };
    } else {
      whereClause.status = allowTextOnly ? { not: "VIDEO_READY" } : "IMAGE_READY";
    }

    const segments = await prisma.storyboardSegment.findMany({
      where: whereClause,
      orderBy: { order: "asc" },
    });

    if (segments.length === 0) {
      return NextResponse.json(
        { error: allowTextOnly ? "No storyboard segments available for video generation" : "No segments with images ready found" },
        { status: 404 }
      );
    }

    const targetSegments = allowTextOnly ? segments.filter((s) => !s.generatedVideo) : segments;
    if (targetSegments.length === 0) {
      return NextResponse.json({ error: "All selected segments already have generated videos" }, { status: 404 });
    }

    // 3. Resolve API key
    const apiKey = await resolveUserApiKey({
      userId,
      explicitApiKey: contextApiKey,
      allowDefaultFallback: true,
    });
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key not configured", message: "请先在个人资料中绑定 API Key 后再发起生视频任务。" },
        { status: 400 }
      );
    }

    // 4. Resolve webhook + callback URLs
    const webhookUrl =
      process.env.N8N_VIDEO_GEN_WEBHOOK?.trim() ||
      "https://hooks.atomx.top/webhook/storyboard_video";

    const callbackBase = (
      process.env.N8N_CALLBACK_BASE_URL ||
      process.env.CANVAS_VIDEO_POLL_CALLBACK_BASE_URL ||
      "https://atomx.top"
    ).replace(/\/+$/, "");
    const callbackUrl = `${callbackBase}/api/webhook/storyboard-video`;

    // 5. Fire n8n for each segment
    const triggers = targetSegments.map(async (segment) => {
      const payload = {
        segment_id: segment.id,
        task_id: id,
        prompt: segment.videoPrompt || segment.visualDescription || "",
        image_url: segment.generatedImage || null,
        model,
        aspect_ratio: "9:16",
        callback_url: callbackUrl,
        api_key: apiKey,
        admin_token: process.env.ADMIN_TOKEN,
      };

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`n8n webhook failed: ${response.status}`);
        }

        await prisma.storyboardSegment.update({
          where: { id: segment.id },
          data: { status: "VIDEO_GENERATING", videoGenerationModel: model },
        });

        console.log(`[generate-videos] Triggered n8n for segment ${segment.id}`);
        return { segment_id: segment.id, success: true };
      } catch (error) {
        console.error(`[generate-videos] Failed for segment ${segment.id}:`, error);
        await prisma.storyboardSegment.update({
          where: { id: segment.id },
          data: { status: "VIDEO_FAILED" },
        }).catch(() => {});
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
        data: { status: "VIDEO_GENERATING", progress: 65 },
      });
    }

    console.log("[generate-videos] Batch complete:", {
      task_id: id,
      total: targetSegments.length,
      success: successCount,
      failures: failureCount,
      model,
    });

    return NextResponse.json(
      {
        success: failureCount === 0,
        partial: successCount > 0 && failureCount > 0,
        task_id: id,
        total: targetSegments.length,
        triggered: successCount,
        failed: failureCount,
        model,
        results,
        message:
          successCount === 0 ? "所有分镜生视频触发失败" : failureCount > 0 ? "部分分镜触发失败" : undefined,
      },
      { status: successCount === 0 ? 502 : 200 }
    );
  } catch (error) {
    console.error("[generate-videos] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
