import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import {
  buildStyleFallback,
  clearPosterImages,
  markPosterJobFailed,
  runPosterGeneration,
  serializePosterJob,
} from "@/lib/posterJobs";
import { clampPosterCount } from "@/lib/posterConfig";
import { ensurePosterJobSchema } from "@/lib/posterJobSchema";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await context.params;
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    await ensurePosterJobSchema();

    const job = await prisma.xhsPosterJob.findFirst({
      where: { id: jobId, userId },
      include: { images: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Poster job not found" }, { status: 404 });
    }

    if (job.images.length > 0) {
      await clearPosterImages(job.images);
    }

    const style = await prisma.stylePreset.findFirst({
      where: {
        id: job.styleId,
        OR: [{ userId }, { userId: null }],
      },
    });

    const updatedJob = await prisma.xhsPosterJob.update({
      where: { id: job.id },
      data: { status: "pending", error: null },
    });

    const styleSnapshotRecord =
      job.styleSnapshot && typeof job.styleSnapshot === "object" && !Array.isArray(job.styleSnapshot)
        ? (job.styleSnapshot as Record<string, any>)
        : null;

    try {
      const result = await runPosterGeneration({
        job: updatedJob,
        style: buildStyleFallback(updatedJob, styleSnapshotRecord, style),
        copyText: job.copyText,
        title: job.title ?? undefined,
        variations: clampPosterCount(job.variationCount ?? undefined),
      });
      return NextResponse.json({ data: result });
    } catch (generationError) {
      const errorMessage =
        generationError instanceof Error ? generationError.message : "Failed to generate images";
      const failedJob = await markPosterJobFailed(job.id, errorMessage);
      return NextResponse.json({ error: errorMessage, data: failedJob }, { status: 500 });
    }
  } catch (error) {
    console.error("Failed to retry poster job", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retry poster job" },
      { status: 500 }
    );
  }
}
