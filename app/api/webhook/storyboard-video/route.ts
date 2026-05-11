import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidAdminWebhookRequest } from "@/lib/webhookAuth";
import { resolveUserApiKey } from "@/lib/userApiKey";
import {
  deductStoryboardVideoCreditCharge,
  refundStoryboardVideoCreditCharge,
} from "@/lib/storyboardVideoCredits";
import { syncTaskToSummary } from "@/lib/taskSummary";
import type { Prisma } from "@prisma/client";

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
  if (typeof body.resultUrl === "string" && body.resultUrl.trim()) return body.resultUrl.trim();
  if (typeof body.result_url === "string" && body.result_url.trim()) return body.result_url.trim();
  const taskResult = body.task_result && typeof body.task_result === "object" ? body.task_result as Record<string, unknown> : null;
  const taskResultVideos = Array.isArray(taskResult?.videos) ? taskResult.videos : [];
  const taskResultVideo = taskResultVideos.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  if (typeof taskResultVideo?.url === "string" && taskResultVideo.url.trim()) return taskResultVideo.url.trim();
  if (typeof taskResultVideo?.video_url === "string" && taskResultVideo.video_url.trim()) return taskResultVideo.video_url.trim();
  const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : null;
  if (typeof data?.video_url === "string" && data.video_url.trim()) return data.video_url.trim();
  if (typeof data?.result_url === "string" && data.result_url.trim()) return data.result_url.trim();
  if (typeof data?.resultUrl === "string" && data.resultUrl.trim()) return data.resultUrl.trim();
  const dataTaskResult = data?.task_result && typeof data.task_result === "object" ? data.task_result as Record<string, unknown> : null;
  const dataTaskResultVideos = Array.isArray(dataTaskResult?.videos) ? dataTaskResult.videos : [];
  const dataTaskResultVideo = dataTaskResultVideos.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  if (typeof dataTaskResultVideo?.url === "string" && dataTaskResultVideo.url.trim()) return dataTaskResultVideo.url.trim();
  if (typeof dataTaskResultVideo?.video_url === "string" && dataTaskResultVideo.video_url.trim()) return dataTaskResultVideo.video_url.trim();
  const resultJson = parseJsonSafe(data?.resultJson ?? body.resultJson);
  const resultUrls = Array.isArray(resultJson?.resultUrls) ? resultJson.resultUrls : [];
  const first = resultUrls.find((url) => typeof url === "string" && url.trim());
  return typeof first === "string" ? first.trim() : "";
}

function pickProviderTaskId(body: Record<string, any>): string {
  const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : null;
  const context = body.context && typeof body.context === "object" ? body.context as Record<string, unknown> : null;
  const metadata = body.metadata && typeof body.metadata === "object"
    ? body.metadata as Record<string, unknown>
    : data?.metadata && typeof data.metadata === "object"
      ? data.metadata as Record<string, unknown>
      : null;
  const candidates = [
    body.provider_task_id,
    body.providerTaskId,
    body.volcengine_task_id,
    body.volcengineTaskId,
    body.task_id,
    body.taskId,
    body.id,
    data?.provider_task_id,
    data?.providerTaskId,
    data?.task_id,
    data?.taskId,
    data?.id,
    context?.provider_task_id,
    context?.providerTaskId,
    context?.task_id,
    context?.taskId,
    metadata?.provider_task_id,
    metadata?.providerTaskId,
  ];
  return candidates
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value.startsWith("cgt-")) || "";
}

function normalizeStatus(body: Record<string, any>): string {
  const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : null;
  const raw = String(
    body.status ||
    body.task_status ||
    body.state ||
    data?.state ||
    data?.status ||
    data?.task_status ||
    body.successFlag ||
    data?.successFlag ||
    "",
  ).toLowerCase();
  if (body.code === 200 || body.code === "200") {
    return pickVideoUrl(body) ? "success" : raw || "success";
  }
  if (body.code && Number(body.code) >= 400) return "failed";
  if (["success", "succeeded", "completed", "done"].includes(raw)) return "success";
  if (["fail", "failed", "failure", "error", "errored"].includes(raw)) return "failed";
  return raw;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isVideoCountingSegment(segment: { status: string; generatedVideo?: string | null; generationParams?: unknown }) {
  const params = asRecord(segment.generationParams);
  const status = String(segment.status || "").toUpperCase();
  return Boolean(params.clip_index || params.clipIndex || params.clip_video_prompt || params.clipVideoPrompt) ||
    Boolean(segment.generatedVideo) ||
    status === "VIDEO_READY" ||
    status === "VIDEO_GENERATING" ||
    status === "VIDEO_QUEUED" ||
    status === "VIDEO_PROCESSING" ||
    status === "VIDEO_FAILED" ||
    status === "VIDEO_BILLING_FAILED";
}

function pickVideoCountingSegments<T extends { status: string; generatedVideo?: string | null; generationParams?: unknown }>(segments: T[]): T[] {
  const videoSegments = segments.filter(isVideoCountingSegment);
  return videoSegments.length > 0 ? videoSegments : segments;
}

async function updateStoryboardVideoAggregate(taskId: string) {
  const allSegments = await prisma.storyboardSegment.findMany({
    where: { taskId },
    select: { status: true, generatedVideo: true, generationParams: true },
  });
  const videoSegments = pickVideoCountingSegments(allSegments);
  const totalSegments = videoSegments.length || 1;
  const readySegments = videoSegments.filter((segment) => segment.status === "VIDEO_READY").length;
  const failedSegments = videoSegments.filter((segment) => segment.status === "VIDEO_FAILED" || segment.status === "VIDEO_BILLING_FAILED").length;
  const generatingSegments = videoSegments.filter((segment) =>
    segment.status === "VIDEO_GENERATING" || segment.status === "VIDEO_QUEUED" || segment.status === "VIDEO_PROCESSING"
  ).length;
  const status = readySegments === totalSegments
    ? "VIDEO_GENERATION_COMPLETED"
    : generatingSegments > 0
      ? "VIDEO_GENERATING"
      : failedSegments > 0
        ? "VIDEO_GENERATION_FAILED"
        : "VIDEO_GENERATING";
  const progress = Math.floor(60 + (readySegments / totalSegments) * 30);

  await prisma.storyboardTask.update({
    where: { id: taskId },
    data: { progress, status },
  });
  await syncTaskToSummary({ taskType: "storyboard", taskId, operation: "update" });

  return {
    progress,
    readySegments,
    totalSegments,
    allVideosReady: readySegments === totalSegments,
  };
}

function pickErrorMessage(body: Record<string, any>): string {
  const data = asRecord(body.data);
  const error = asRecord(body.error);
  const taskError = asRecord(body.task_error || data.task_error);
  return String(
    body.errorMessage ||
    body.error_message ||
    body.message ||
    body.msg ||
    taskError.message ||
    taskError.msg ||
    data.failMsg ||
    data.errorMessage ||
    data.message ||
    error.message ||
    "",
  ).trim();
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
    const metadata = body.metadata && typeof body.metadata === "object"
      ? body.metadata
      : body.data?.metadata && typeof body.data.metadata === "object"
        ? body.data.metadata
        : null;
    const isPollingCallback = Boolean(context?.segment_id);
    const isQueryCallback = Boolean(queryAdminToken && queryAdminToken === (process.env.ADMIN_TOKEN || "").trim());

    // Auth: accept admin token OR valid polling callback with segment_id in context
    if (!isPollingCallback && !isQueryCallback && !isValidAdminWebhookRequest(req)) {
      console.error("[storyboard-video] Unauthorized: Invalid admin token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerTaskId = pickProviderTaskId(body) || queryTaskId;
    let segment_id = body.segment_id || context?.segment_id || metadata?.segment_id || querySegmentId;
    const video_url = pickVideoUrl(body);
    const status = normalizeStatus(body);
    const error = pickErrorMessage(body);
    const model = body.model || context?.model || metadata?.model || body.data?.model || queryModel;
    const generation_params = body.generation_params;

    console.log("[storyboard-video] Received webhook:", {
      segment_id,
      status,
      model,
      providerTaskId,
      has_video: !!video_url,
    });

    if (!segment_id) {
      const matchedSegment = providerTaskId
        ? await prisma.storyboardSegment.findFirst({
            where: {
              generationParams: {
                path: ["provider_task_id"],
                equals: providerTaskId,
              },
            },
            select: { id: true },
          })
        : null;
      segment_id = matchedSegment?.id || "";
    }

    if (!segment_id) {
      return NextResponse.json({ error: "Missing segment_id", provider_task_id: providerTaskId || null }, { status: 400 });
    }

    const existingSegment = await prisma.storyboardSegment.findUnique({
      where: { id: segment_id },
      include: { task: true },
    });
    if (!existingSegment) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    }

    const existingGenerationParams = asRecord(existingSegment.generationParams);
    const incomingGenerationParams = asRecord(generation_params);
    if (existingGenerationParams.video_generation_cancelled === true) {
      await prisma.storyboardSegment.update({
        where: { id: segment_id },
        data: {
          generationParams: {
            ...existingGenerationParams,
            ...incomingGenerationParams,
            provider_state: "cancelled_ignored",
            provider_ignored_status: status || null,
            provider_ignored_video_url: video_url || null,
            provider_ignored_error: error || null,
            provider_ignored_at: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      }).catch(() => {});
      console.log("[storyboard-video] Ignored cancelled segment callback:", {
        segment_id,
        status,
        has_video: !!video_url,
      });
      return NextResponse.json({
        success: true,
        ignored: true,
        reason: "video_generation_cancelled",
        segment_id,
      });
    }

    // 2. Update segment with generated video
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (status === "success" && video_url) {
      updateData.generatedVideo = video_url;
      updateData.status = "VIDEO_READY";
      updateData.videoGenerationModel = model || null;
      updateData.generationParams = {
        ...existingGenerationParams,
        ...incomingGenerationParams,
        provider_state: status,
      } as Prisma.InputJsonValue;
    } else if (status === "failed") {
      updateData.status = "VIDEO_FAILED";
      updateData.retryCount = {
        increment: 1,
      };
      updateData.generationParams = {
        ...existingGenerationParams,
        ...incomingGenerationParams,
        provider_state: status,
        provider_error: error || null,
      } as Prisma.InputJsonValue;
    }

    const segment = await prisma.storyboardSegment.update({
      where: { id: segment_id },
      data: updateData,
      include: { task: true },
    });

    let billingResult: { deducted: boolean; amount: number; reason?: string } | null = null;
    let refundResult: { refunded: boolean; amount: number; reason?: string } | null = null;
    const apiKey = status === "success" || status === "failed"
      ? await resolveUserApiKey({
          userId: segment.task.userId,
          allowDefaultFallback: true,
        })
      : "";

    if (status === "success" && video_url) {
      if (apiKey) {
        try {
          billingResult = await deductStoryboardVideoCreditCharge({
            segmentId: segment.id,
            apiKey,
            userId: segment.task.userId,
            reason: "storyboard_video_success",
          });
        } catch (billingError) {
          console.error("[storyboard-video] Failed to deduct successful segment:", billingError);
          await prisma.storyboardSegment.update({
            where: { id: segment.id },
            data: {
              status: "VIDEO_BILLING_FAILED",
              generationParams: {
                ...asRecord(segment.generationParams),
                video_billing_error: billingError instanceof Error ? billingError.message : "Unknown billing error",
                video_billing_failed_at: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          }).catch(() => {});
        }
      } else {
        console.error("[storyboard-video] Missing apiKey for successful segment billing:", { segment_id });
      }
    }

    if (status === "failed") {
      if (apiKey) {
        try {
          refundResult = await refundStoryboardVideoCreditCharge({
            segmentId: segment.id,
            apiKey,
            userId: segment.task.userId,
            reason: "storyboard_video_provider_failed",
            errorMessage: error || "Provider returned failed status",
          });
        } catch (refundError) {
          console.error("[storyboard-video] Failed to refund failed segment:", refundError);
        }
      } else {
        console.error("[storyboard-video] Missing apiKey for failed segment refund:", { segment_id });
      }
    }

    console.log("[storyboard-video] Updated segment:", {
      segment_id,
      newStatus: updateData.status,
      task_id: segment.taskId,
    });

    // 3. Check if all video-target segments are ready, update task progress.
    const aggregate = await updateStoryboardVideoAggregate(segment.taskId);

    console.log("[storyboard-video] Updated task progress:", {
      task_id: segment.taskId,
      progress: aggregate.progress,
      ready: `${aggregate.readySegments}/${aggregate.totalSegments}`,
      allReady: aggregate.allVideosReady,
    });

    return NextResponse.json({
      success: true,
      segment_id,
      task_id: segment.taskId,
      progress: aggregate.progress,
      refunded: refundResult?.refunded ?? false,
      refund_amount: refundResult?.amount ?? 0,
      deducted: billingResult?.deducted ?? false,
      deducted_amount: billingResult?.amount ?? 0,
      all_videos_ready: aggregate.allVideosReady,
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
