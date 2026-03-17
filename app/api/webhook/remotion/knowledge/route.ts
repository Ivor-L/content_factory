import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const taskId = typeof payload.taskId === "string" ? payload.taskId.trim() : "";
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  const status = typeof payload.status === "string" ? payload.status : undefined;
  const videoUrl = typeof payload.videoUrl === "string" ? payload.videoUrl : undefined;
  const coverUrl = typeof payload.coverUrl === "string" ? payload.coverUrl : undefined;
  const durationSeconds =
    typeof payload.durationSeconds === "number" && Number.isFinite(payload.durationSeconds)
      ? payload.durationSeconds
      : undefined;

  const remotionComposition = typeof payload.composition === "string" ? payload.composition : undefined;
  const remotionProps = payload.props && typeof payload.props === "object" ? payload.props : undefined;
  const renderStats = payload.renderStats && typeof payload.renderStats === "object" ? payload.renderStats : undefined;

  try {
    const updated = await prisma.knowledgeVideoTask.update({
      where: { id: taskId },
      data: {
        status: status ?? "READY",
        videoUrl: videoUrl ?? null,
        coverUrl: coverUrl ?? null,
        durationSeconds: durationSeconds ?? null,
        remotionComposition,
        remotionProps,
        renderStats,
        error: status && status.toUpperCase() === "FAILED" ? (payload.error as string | null) : null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Failed to update knowledge video task", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
