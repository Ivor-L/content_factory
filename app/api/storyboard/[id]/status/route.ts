import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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

    const task = await findStoryboardTask(id);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
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
