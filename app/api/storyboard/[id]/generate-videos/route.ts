import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { resolveUserApiKey } from "@/lib/userApiKey";
import { resolveCanvasUpstreamEndpoint } from "@/lib/canvasUpstream";
import type { Prisma } from "@prisma/client";

/**
 * Batch trigger video generation for storyboard segments
 * POST /api/storyboard/[id]/generate-videos
 *
 * Calls yunwu.ai video API directly, then registers async polling.
 */

const VEO_MODELS = new Set(["veo3.1-fast", "veo3.1", "veo3", "veo3-fast"]);
const GROK_MODELS = new Set(["grok", "grok-video-3"]);

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

    // 1. Verify task exists and belongs to user (if user ownership is enforced)
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
        { error: allowTextOnly ? "No storyboard segments available for video generation" : "No segments with images ready found" },
        { status: 404 }
      );
    }

    const targetSegments = allowTextOnly ? segments.filter((s) => !s.generatedVideo) : segments;
    if (targetSegments.length === 0) {
      return NextResponse.json({ error: "All selected segments already have generated videos" }, { status: 404 });
    }

    // 3. Resolve API key and yunwu.ai endpoint
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

    const videoEndpoint = resolveCanvasUpstreamEndpoint("video");
    if (!videoEndpoint) {
      return NextResponse.json({ error: "Video generation service not configured" }, { status: 500 });
    }

    const callbackBase = (
      process.env.CANVAS_VIDEO_POLL_CALLBACK_BASE_URL ||
      process.env.N8N_CALLBACK_BASE_URL ||
      ""
    ).replace(/\/+$/, "");
    const webhookUrl = `${callbackBase}/api/webhook/storyboard-video`;

    // 4. Submit each segment to yunwu.ai + register polling
    const triggers = targetSegments.map(async (segment) => {
      try {
        const isVeo = VEO_MODELS.has(model);
        const isGrok = GROK_MODELS.has(model);

        let upstreamBody: Record<string, unknown> = { model };

        if (isVeo || isGrok) {
          upstreamBody = {
            model,
            prompt: segment.videoPrompt || segment.visualDescription || "",
            aspect_ratio: "9:16",
            enhance_prompt: true,
            enable_upsample: true,
            ...(segment.generatedImage ? { images: [segment.generatedImage] } : {}),
          };
        }

        // Submit to yunwu.ai
        const upstream = await fetch(videoEndpoint, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify(upstreamBody),
          cache: "no-store",
        });

        const responseText = await upstream.text();
        let parsed: any;
        try { parsed = JSON.parse(responseText); } catch { parsed = {}; }

        if (!upstream.ok) {
          throw new Error(`yunwu.ai error (${upstream.status}): ${parsed?.message || responseText}`);
        }

        const taskId = parsed?.task_id || parsed?.taskId || parsed?.id;
        if (!taskId) {
          throw new Error("yunwu.ai did not return a task_id");
        }

        console.log(`[generate-videos] Submitted segment ${segment.id}, yunwu task_id: ${taskId}`);

        // Register async polling
        try {
          await fetch("https://api.atomx.top/tools/veo/poll/async", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              task_id: taskId,
              api_key: apiKey,
              webhook_url: webhookUrl,
              context: {
                segment_id: segment.id,
                task_id: id,
                model,
              },
            }),
          });
          console.log(`[generate-videos] Polling registered for segment ${segment.id}, webhook: ${webhookUrl}`);
        } catch (pollError) {
          console.error(`[generate-videos] register polling failed for segment ${segment.id}:`, pollError);
        }

        // Update segment status
        await prisma.storyboardSegment.update({
          where: { id: segment.id },
          data: { status: "VIDEO_GENERATING", videoGenerationModel: model },
        });

        return { segment_id: segment.id, success: true, yunwu_task_id: taskId };
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
