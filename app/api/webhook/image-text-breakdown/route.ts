import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toInputJson } from "@/lib/jsonUtils";

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get("x-admin-token");
  if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    task_id?: string;
    taskId?: string;
    id?: string;
    status?: string;
    analysis_result?: unknown;
    analysisResult?: unknown;
    error?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const taskId = body.task_id || body.taskId || body.id;
  const status = body.status;
  const analysisResult = body.analysis_result ?? body.analysisResult;
  const error = body.error;

  if (!taskId) {
    return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
  }

  const task = await prisma.creativeTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (status === "completed" && analysisResult) {
    const metadata = parseObject(task.metadata) ?? {};
    const custom = parseObject(metadata.custom) ?? {};
    const replication = parseObject(custom.replication) ?? {};

    const nextMetadata = {
      ...metadata,
      custom: {
        ...custom,
        posterMode: "text2image",
        source: "image_text_replication",
        replication: {
          ...replication,
          phase: "generate",
          analysisResult,
          error: null,
        },
      },
    };

    await prisma.$transaction([
      prisma.creativeTask.update({
        where: { id: taskId },
        data: {
          status: "BREAKDOWN_COMPLETED",
          progress: 15,
          layoutResultJson: toInputJson(analysisResult) ?? undefined,
          errorMessage: null,
          metadata: toInputJson(nextMetadata) ?? undefined,
        },
      }),
      prisma.taskSummary.updateMany({
        where: { taskType: "poster", taskId },
        data: {
          status: "PROCESSING",
          progress: 15,
          updatedAt: new Date(),
        },
      }),
    ]);
  } else if (status === "failed" || status === "error" || error) {
    const errorMessage = error ?? "Breakdown failed";
    await prisma.$transaction([
      prisma.creativeTask.update({
        where: { id: taskId },
        data: {
          status: "BREAKDOWN_FAILED",
          errorMessage,
        },
      }),
      prisma.taskSummary.updateMany({
        where: { taskType: "poster", taskId },
        data: {
          status: "FAILED",
          preview: errorMessage.slice(0, 140),
          updatedAt: new Date(),
        },
      }),
    ]);
  } else {
    // 其他状态（如 processing/pending）忽略，不更新状态
    console.log(`[image-text-breakdown] Ignoring intermediate status: ${status} for task ${taskId}`);
  }

  return NextResponse.json({ success: true, task_id: taskId });
}
