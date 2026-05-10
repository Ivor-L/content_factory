import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { syncTaskToSummary } from "@/lib/taskSummary";
import type { Prisma } from "@prisma/client";

const VOLCENGINE_TASK_POLL_INTERVAL_MS = 15_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isVideoCountingSegment(segment: { status: string; generatedVideo?: string | null; generationParams?: unknown }) {
  const params = asRecord(segment.generationParams);
  const status = cleanText(segment.status).toUpperCase();
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

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveVolcengineArkApiKey(): string {
  return (
    process.env.VOLCENGINE_ARK_API_KEY?.trim() ||
    process.env.SEEDANCE_ARK_API_KEY?.trim() ||
    process.env.ARK_API_KEY?.trim() ||
    ""
  );
}

function pickVolcengineVideoUrl(body: Record<string, unknown>): string {
  const content = asRecord(body.content);
  const data = asRecord(body.data);
  const dataContent = asRecord(data.content);
  return (
    cleanText(content.video_url) ||
    cleanText(content.videoUrl) ||
    cleanText(body.video_url) ||
    cleanText(body.videoUrl) ||
    cleanText(dataContent.video_url) ||
    cleanText(dataContent.videoUrl) ||
    cleanText(data.video_url) ||
    cleanText(data.videoUrl)
  );
}

function normalizeVolcengineTaskStatus(body: Record<string, unknown>): string {
  const data = asRecord(body.data);
  const raw = cleanText(body.status || data.status || body.state || data.state).toLowerCase();
  if (["success", "succeeded", "completed", "done"].includes(raw)) return "success";
  if (["fail", "failed", "failure", "error", "errored"].includes(raw)) return "failed";
  return raw;
}

function pickVolcengineTaskError(body: Record<string, unknown>): string {
  const error = asRecord(body.error);
  const data = asRecord(body.data);
  const taskError = asRecord(body.task_error || data.task_error);
  return cleanText(
    error.message ||
    taskError.message ||
    data.message ||
    body.message ||
    body.error_message ||
    body.errorMessage,
  );
}

async function getVolcengineTaskResult(providerTaskId: string, apiKey: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${encodeURIComponent(providerTaskId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("[storyboard-status] Volcengine task query failed", {
      providerTaskId,
      status: response.status,
      result,
    });
    return null;
  }
  return asRecord(result);
}

function shouldPollVolcengineTask(generationParams: Record<string, unknown>): boolean {
  const lastPollAt = Date.parse(cleanText(generationParams.provider_last_poll_at));
  return !Number.isFinite(lastPollAt) || Date.now() - lastPollAt >= VOLCENGINE_TASK_POLL_INTERVAL_MS;
}

function shouldForceRefresh(request: NextRequest): boolean {
  const force = request.nextUrl.searchParams.get("force");
  return force === "1" || force === "true";
}

async function syncVolcengineVideoResults(task: { id: string; segments: any[] }, options?: { forceRefresh?: boolean }): Promise<boolean> {
  const apiKey = resolveVolcengineArkApiKey();
  if (!apiKey) return false;
  const forceRefresh = options?.forceRefresh === true;

  let changed = false;
  for (const segment of task.segments) {
    const generationParams = asRecord(segment.generationParams);
    const provider = cleanText(generationParams.provider).toLowerCase();
    const providerTaskId = cleanText(generationParams.provider_task_id || generationParams.providerTaskId);
    const status = cleanText(segment.status).toUpperCase();
    const isGenerating = status === "VIDEO_GENERATING" || status === "VIDEO_QUEUED" || status === "VIDEO_PROCESSING";
    if (provider !== "volcengine" || !providerTaskId || segment.generatedVideo || !isGenerating) continue;
    if (!forceRefresh && !shouldPollVolcengineTask(generationParams)) continue;

    const result = await getVolcengineTaskResult(providerTaskId, apiKey);
    const providerStatus = result ? normalizeVolcengineTaskStatus(result) : "";
    const videoUrl = result ? pickVolcengineVideoUrl(result) : "";
    const now = new Date().toISOString();

    if (providerStatus === "success" && videoUrl) {
      await prisma.storyboardSegment.update({
        where: { id: segment.id },
        data: {
          generatedVideo: videoUrl,
          status: "VIDEO_READY",
          generationParams: {
            ...generationParams,
            provider_state: "success",
            provider_task_result: result,
            provider_last_poll_at: now,
          } as Prisma.InputJsonValue,
        },
      });
      changed = true;
      continue;
    }

    if (providerStatus === "failed") {
      await prisma.storyboardSegment.update({
        where: { id: segment.id },
        data: {
          status: "VIDEO_FAILED",
          retryCount: { increment: 1 },
          generationParams: {
            ...generationParams,
            provider_state: "failed",
            provider_error: pickVolcengineTaskError(result || {}) || null,
            provider_task_result: result,
            provider_last_poll_at: now,
          } as Prisma.InputJsonValue,
        },
      });
      changed = true;
      continue;
    }

    await prisma.storyboardSegment.update({
      where: { id: segment.id },
      data: {
        generationParams: {
          ...generationParams,
          provider_state: providerStatus || generationParams.provider_state || "running",
          provider_task_result: result,
          provider_last_poll_at: now,
        } as Prisma.InputJsonValue,
      },
    });
  }

  if (changed) {
    const allSegments = await prisma.storyboardSegment.findMany({
      where: { taskId: task.id },
      select: { status: true, generatedVideo: true, generationParams: true },
    });
    const videoSegments = pickVideoCountingSegments(allSegments);
    const totalSegments = videoSegments.length || 1;
    const readySegments = videoSegments.filter((segment) => segment.status === "VIDEO_READY").length;
    const failedSegments = videoSegments.filter((segment) => segment.status === "VIDEO_FAILED").length;
    const generatingSegments = videoSegments.filter((segment) =>
      segment.status === "VIDEO_GENERATING" || segment.status === "VIDEO_QUEUED" || segment.status === "VIDEO_PROCESSING"
    ).length;
    await prisma.storyboardTask.update({
      where: { id: task.id },
      data: {
        progress: Math.floor(60 + (readySegments / totalSegments) * 30),
        status: readySegments === totalSegments
          ? "VIDEO_GENERATION_COMPLETED"
          : generatingSegments > 0
            ? "VIDEO_GENERATING"
            : failedSegments > 0
              ? "VIDEO_GENERATION_FAILED"
              : "VIDEO_GENERATING",
      },
    });
    await syncTaskToSummary({ taskType: "storyboard", taskId: task.id, operation: "update" });
  }

  return changed;
}

function extractFirstProductImage(images: string | null | undefined): string | null {
  if (!images) return null;
  try {
    const parsed = JSON.parse(images);
    if (Array.isArray(parsed)) {
      const first = parsed.find((item) => typeof item === "string" && item.trim());
      return typeof first === "string" ? first.trim() : null;
    }
    if (typeof parsed === "string" && parsed.trim()) return parsed.trim();
  } catch {
    const first = images.split(",").map((item) => item.trim()).find(Boolean);
    if (first) return first;
  }
  return images.trim() || null;
}

async function findStoryboardTask(id: string) {
  const task = await prisma.storyboardTask.findFirst({
    where: {
      OR: [
        { id },
        { taskId: id },
      ],
    },
    include: {
      product: true,
      character: true,
      segments: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (task) return task;

  const summary = await prisma.taskSummary.findFirst({
    where: {
      id,
      taskType: "storyboard",
    },
    select: { taskId: true },
  });
  if (!summary?.taskId) return null;

  return prisma.storyboardTask.findFirst({
    where: {
      OR: [
        { id: summary.taskId },
        { taskId: summary.taskId },
      ],
    },
    include: {
      product: true,
      character: true,
      segments: {
        orderBy: { order: "asc" },
      },
    },
  });
}

/**
 * GET /api/storyboard/[id]/status
 * Poll storyboard task status and segments for ViralCloneStoryboardPage
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const forceRefresh = shouldForceRefresh(req);

    let task = await findStoryboardTask(id);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (await syncVolcengineVideoResults(task, { forceRefresh })) {
      task = await findStoryboardTask(id);
      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
    }

    return NextResponse.json({
      data: {
        id: task.id,
        status: task.status,
        progress: task.progress,
        replicationMode: (task as any).replicationMode,
        imageModel: (task as any).imageModel,
        videoModel: (task as any).videoModel,
        finalVideoUrl: (task as any).finalVideoUrl,
        storyboardImageUrl: (task as any).storyboardImageUrl,
        coverImage: (task as any).coverImage,
        detailedBreakdown: (task as any).detailedBreakdown ?? null,
        references: [
          task.product
            ? {
                id: task.product.id,
                type: "product",
                name: task.product.name,
                imageUrl: extractFirstProductImage(task.product.images),
              }
            : null,
          task.character
            ? {
                id: task.character.id,
                type: "character",
                name: task.character.name,
                imageUrl: task.character.avatar || null,
              }
            : null,
        ].filter(Boolean),
        segments: task.segments.map((s) => ({
          id: s.id,
          order: s.order,
          duration: s.duration,
          timeRange: s.timeRange,
          imagePrompt: s.imagePrompt,
          videoPrompt: s.videoPrompt,
          generatedImage: s.generatedImage,
          generatedVideo: s.generatedVideo,
          status: s.status,
          originalScript: (s as any).originalScript,
          rewrittenScript: (s as any).rewrittenScript,
          visualDescription: (s as any).visualDescription,
          cameraNotes: (s as any).cameraNotes,
          lightingNotes: (s as any).lightingNotes,
          imageGenerationModel: (s as any).imageGenerationModel,
          videoGenerationModel: (s as any).videoGenerationModel,
          retryCount: (s as any).retryCount || 0,
          generationParams: (s as any).generationParams ?? null,
        })),
      },
    });
  } catch (error) {
    console.error("[storyboard-status] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
