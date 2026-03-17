import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { runPosterGeneration, markPosterJobFailed } from "@/lib/posterJobs";
import { clampPosterCount } from "@/lib/posterConfig";
import { parseMetadata } from "@/lib/creativeTaskService";
import { setTaskActionStatus } from "@/lib/creativeTaskUtils";
import { ensurePosterJobSchema } from "@/lib/posterJobSchema";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const copyText = typeof body.copyText === "string" ? body.copyText.trim() : "";
    const styleId = typeof body.styleId === "string" ? body.styleId : "";
    const title = typeof body.title === "string" ? body.title : "";
    const variations =
      typeof body.variations === "number" && Number.isFinite(body.variations)
        ? body.variations
        : undefined;
    const sourceTaskId =
      typeof body.sourceTaskId === "string" && body.sourceTaskId.trim().length > 0
        ? body.sourceTaskId.trim()
        : "";

    if (!copyText) {
      return NextResponse.json({ error: "copyText is required" }, { status: 400 });
    }
    if (!styleId) {
      return NextResponse.json({ error: "styleId is required" }, { status: 400 });
    }

    const style = await prisma.stylePreset.findFirst({
      where: {
        id: styleId,
        OR: [{ userId }, { userId: null }],
      },
    });

    if (!style) {
      return NextResponse.json({ error: "Style preset not found" }, { status: 404 });
    }

    let sourceTask: { id: string; metadata: any } | null = null;
    if (sourceTaskId) {
      sourceTask = await prisma.creativeTask.findFirst({
        where: { id: sourceTaskId, userId },
        select: { id: true, metadata: true },
      });
      if (!sourceTask) {
        return NextResponse.json({ error: "Creative task not found" }, { status: 404 });
      }
    }

    await ensurePosterJobSchema();

    const posterCount = clampPosterCount(variations);

    const job = await prisma.xhsPosterJob.create({
      data: {
        userId,
        title: title || null,
        copyText,
        styleId: style.id,
        styleName: style.name ?? null,
        styleSnapshot: {
          type: style.type,
          description: style.description,
          spec: style.spec,
          metadata: style.metadata,
        },
        status: "pending",
        variationCount: posterCount,
        sourceTaskId: sourceTask?.id ?? null,
      },
    });

    let sourceTaskMetadata = sourceTask ? parseMetadata(sourceTask.metadata) : null;
    const updateTaskStatus = async (
      status: "pending" | "ready" | "error",
      errorMessage?: string
    ) => {
      if (!sourceTask || !sourceTaskMetadata) return;
      try {
        sourceTaskMetadata = setTaskActionStatus(sourceTaskMetadata, "poster", {
          status,
          jobId: job.id,
          error: errorMessage,
        });
        await prisma.creativeTask.update({
          where: { id: sourceTask.id },
          data: { metadata: sourceTaskMetadata as Prisma.InputJsonValue },
        });
      } catch (metaError) {
        console.error("Failed to update poster action status", {
          taskId: sourceTask?.id,
          status,
          metaError,
        });
      }
    };

    if (sourceTask) {
      await updateTaskStatus("pending");
    }

    try {
      const completed = await runPosterGeneration({
        job,
        style,
        copyText,
        title,
        variations: posterCount,
      });
      if (sourceTask) {
        await updateTaskStatus("ready");
      }
      return NextResponse.json({ data: completed });
    } catch (generationError) {
      const errorMessage =
        generationError instanceof Error ? generationError.message : "Failed to generate images";
      const failedJob = await markPosterJobFailed(job.id, errorMessage);
      if (sourceTask) {
        await updateTaskStatus("error", errorMessage);
      }
      return NextResponse.json({ error: errorMessage, data: failedJob }, { status: 500 });
    }
  } catch (error) {
    console.error("Failed to generate XHS images", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate images",
      },
      { status: 500 }
    );
  }
}
