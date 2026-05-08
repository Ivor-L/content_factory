import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

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
    } = body;

    // Verify segment belongs to user's task
    const segment = await prisma.storyboardSegment.findFirst({
      where: { id: segmentId },
      include: { task: { select: { userId: true } } },
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
