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
    const { subject_refs, video_refs, imagePrompt, videoPrompt, originalScript, rewrittenScript, push_image_url, generatedImage, generatedVideo, status } = body;

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

    if (video_refs !== undefined) {
      updatedParams.video_refs = video_refs;
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

    const updateData: Record<string, any> = {
      generationParams: updatedParams,
    };
    if (imagePrompt !== undefined) updateData.imagePrompt = imagePrompt;
    if (videoPrompt !== undefined) updateData.videoPrompt = videoPrompt;
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

