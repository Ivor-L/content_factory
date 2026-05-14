import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { syncTaskToSummary } from "@/lib/taskSummary";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeReferenceImageUri(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || /^(undefined|null|nan)$/i.test(text)) return "";
  const normalizedAsset = text.replace(/^asset:\s*\/\//i, "asset://");
  if (/^asset:\/\/[A-Za-z0-9._:-]+$/.test(normalizedAsset)) return normalizedAsset;
  if (/^asset-[A-Za-z0-9._:-]+$/.test(text)) return `asset://${text}`;
  if (text.startsWith("//")) return `https:${text}`;
  return /^https?:\/\//i.test(text) ? text : "";
}

function normalizeReferenceImageUris(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const result: string[] = [];
  for (const item of raw) {
    const uri = normalizeReferenceImageUri(item);
    if (uri && !result.includes(uri) && result.length < 9) result.push(uri);
  }
  return result;
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

async function updateTaskAfterVideoCancel(taskId: string) {
  const segments = await prisma.storyboardSegment.findMany({
    where: { taskId },
    select: { status: true, generatedImage: true, generatedVideo: true, generationParams: true },
  });
  const videoSegments = segments.filter(isVideoCountingSegment);
  const totalVideoSegments = videoSegments.length;
  const readyVideoSegments = videoSegments.filter((segment) => segment.status === "VIDEO_READY").length;
  const failedVideoSegments = videoSegments.filter((segment) => segment.status === "VIDEO_FAILED" || segment.status === "VIDEO_BILLING_FAILED").length;
  const generatingVideoSegments = videoSegments.filter((segment) =>
    segment.status === "VIDEO_GENERATING" || segment.status === "VIDEO_QUEUED" || segment.status === "VIDEO_PROCESSING"
  ).length;
  const imageReadySegments = segments.filter((segment) =>
    Boolean(segment.generatedImage) || segment.status === "IMAGE_READY" || segment.status === "VIDEO_READY"
  ).length;

  const nextStatus = totalVideoSegments > 0 && readyVideoSegments === totalVideoSegments
    ? "VIDEO_GENERATION_COMPLETED"
    : generatingVideoSegments > 0
      ? "VIDEO_GENERATING"
      : totalVideoSegments > 0 && failedVideoSegments > 0
        ? "VIDEO_GENERATION_FAILED"
        : imageReadySegments === segments.length && segments.length > 0
          ? "IMAGE_GENERATION_COMPLETED"
          : "BREAKDOWN_COMPLETED";
  const nextProgress = nextStatus === "VIDEO_GENERATION_COMPLETED"
    ? 90
    : nextStatus === "VIDEO_GENERATING"
      ? 65
      : imageReadySegments === segments.length && segments.length > 0
        ? 60
        : 50;

  await prisma.storyboardTask.update({
    where: { id: taskId },
    data: { status: nextStatus, progress: nextProgress },
  });
  await syncTaskToSummary({ taskType: "storyboard", taskId, operation: "update" });
}

/**
 * PATCH /api/storyboard/segments/[segmentId]
 * Update segment subject_refs, imagePrompt, videoPrompt, or push to image_history
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ segmentId: string }> }
) {
  try {
    const { userId } = await getRequestUserContext(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { segmentId } = await params;
    const body = await req.json();
    const {
      subject_refs,
      video_refs,
      subject_replace_mode,
      selected_image_url,
      selectedImageUrl,
      selected_video_url,
      selectedVideoUrl,
      clip_video_prompt,
      clipVideoPrompt,
      clip_index,
      clipIndex,
      clip_time_range,
      clipTimeRange,
      imagePrompt,
      videoPrompt,
      duration,
      duration_sec,
      durationSec,
      originalScript,
      rewrittenScript,
      push_image_url,
      push_video_url,
      generatedImage,
      generatedVideo,
      status,
      video_generation_cancelled,
      videoGenerationCancelled,
      reference_image_urls,
      referenceImageUrls,
      seedance_extend_from_previous_clip,
      seedanceExtendFromPreviousClip,
    } = body;

    // Verify segment belongs to user's task
    const segment = await prisma.storyboardSegment.findFirst({
      where: { id: segmentId },
      include: { task: { select: { userId: true, id: true } } },
    });

    if (!segment) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    }
    if (segment.task.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const currentParams = (segment.generationParams as Record<string, any>) || {};

    // Build updated generationParams
    const updatedParams: Record<string, any> = { ...currentParams };

    if (subject_refs !== undefined) {
      updatedParams.subject_refs = subject_refs;
    }
    if (subject_replace_mode !== undefined) {
      updatedParams.subject_replace_mode = subject_replace_mode;
    }

    if (video_refs !== undefined) {
      updatedParams.video_refs = video_refs;
    }
    if (selected_image_url !== undefined || selectedImageUrl !== undefined) {
      updatedParams.selected_image_url = selected_image_url ?? selectedImageUrl ?? null;
    }
    if (selected_video_url !== undefined || selectedVideoUrl !== undefined) {
      updatedParams.selected_video_url = selected_video_url ?? selectedVideoUrl ?? null;
    }
    if (clip_video_prompt !== undefined || clipVideoPrompt !== undefined) {
      updatedParams.clip_video_prompt = clip_video_prompt ?? clipVideoPrompt ?? null;
    }
    if (clip_index !== undefined || clipIndex !== undefined) {
      updatedParams.clip_index = clip_index ?? clipIndex ?? null;
    }
    if (clip_time_range !== undefined || clipTimeRange !== undefined) {
      updatedParams.clip_time_range = clip_time_range ?? clipTimeRange ?? null;
    }
    if (reference_image_urls !== undefined || referenceImageUrls !== undefined) {
      updatedParams.reference_image_urls = normalizeReferenceImageUris(reference_image_urls ?? referenceImageUrls);
    }
    if (seedance_extend_from_previous_clip !== undefined || seedanceExtendFromPreviousClip !== undefined) {
      updatedParams.seedance_extend_from_previous_clip = Boolean(seedance_extend_from_previous_clip ?? seedanceExtendFromPreviousClip);
    }
    if (video_generation_cancelled !== undefined || videoGenerationCancelled !== undefined) {
      updatedParams.video_generation_cancelled = Boolean(video_generation_cancelled ?? videoGenerationCancelled);
      updatedParams.video_cancelled_at = new Date().toISOString();
    }

    if (push_image_url) {
      const history: string[] = Array.isArray(currentParams.image_history)
        ? currentParams.image_history
        : [];
      // Add current generated image to history before replacing
      if (segment.generatedImage && !history.includes(segment.generatedImage)) {
        history.unshift(segment.generatedImage);
      }
      updatedParams.image_history = history.slice(0, 20); // keep max 20
    }

    if (push_video_url) {
      const history: string[] = Array.isArray(currentParams.video_history)
        ? currentParams.video_history
        : [];
      if (segment.generatedVideo && !history.includes(segment.generatedVideo)) {
        history.unshift(segment.generatedVideo);
      }
      updatedParams.video_history = history.slice(0, 20);
    }

    const updateData: Record<string, any> = {
      generationParams: updatedParams,
    };
    if (imagePrompt !== undefined) updateData.imagePrompt = imagePrompt;
    if (videoPrompt !== undefined) updateData.videoPrompt = videoPrompt;
    const nextDuration = Number(duration ?? duration_sec ?? durationSec);
    if (Number.isFinite(nextDuration) && nextDuration > 0) {
      updateData.duration = Math.round(nextDuration * 1000) / 1000;
    }
    if (originalScript !== undefined) updateData.originalScript = originalScript;
    if (rewrittenScript !== undefined) updateData.rewrittenScript = rewrittenScript;
    if (generatedImage !== undefined) updateData.generatedImage = generatedImage;
    if (generatedVideo !== undefined) updateData.generatedVideo = generatedVideo;
    if (status !== undefined) updateData.status = status;

    const updated = await prisma.storyboardSegment.update({
      where: { id: segmentId },
      data: updateData,
    });
    if ((video_generation_cancelled !== undefined || videoGenerationCancelled !== undefined) && updatedParams.video_generation_cancelled === true) {
      await updateTaskAfterVideoCancel(segment.task.id);
    }

    return NextResponse.json({ success: true, segment: updated });
  } catch (error) {
    console.error("[segment-patch] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/storyboard/segments/[segmentId]
 * Delete a segment and compact the order of remaining segments.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ segmentId: string }> }
) {
  try {
    const { userId } = await getRequestUserContext(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { segmentId } = await params;

    const segment = await prisma.storyboardSegment.findFirst({
      where: { id: segmentId },
      include: { task: { select: { userId: true, id: true } } },
    });

    if (!segment) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    }
    if (segment.task.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.storyboardSegment.delete({ where: { id: segmentId } });
      // Compact order of remaining segments
      const remaining = await tx.storyboardSegment.findMany({
        where: { taskId: segment.task.id },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      for (let i = 0; i < remaining.length; i++) {
        await tx.storyboardSegment.update({
          where: { id: remaining[i].id },
          data: { order: i },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[segment-delete] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
