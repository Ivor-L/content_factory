import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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

    const task = await prisma.storyboardTask.findUnique({
      where: { id },
      include: {
        segments: {
          orderBy: { order: "asc" },
        },
      },
    });

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
