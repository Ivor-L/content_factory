import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import type { TaskType } from "@/lib/taskSummary";
import type { Prisma } from "@prisma/client";

function isText2ImagePoster(metadata: Prisma.JsonValue | null | undefined): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  return (metadata as Record<string, unknown>).posterMode === "text2image";
}

async function deleteUnderlyingTask(
  summary: { taskType: TaskType; taskId: string; metadata: Prisma.JsonValue | null },
  userId: string
) {
  const { taskType, taskId, metadata } = summary;
  const isText2Image = taskType === "poster" && isText2ImagePoster(metadata);

  switch (taskType) {
    case "creative":
      await prisma.creativeTask.deleteMany({ where: { id: taskId, userId } });
      break;
    case "poster":
      if (isText2Image) {
        await prisma.creativeTask.deleteMany({ where: { id: taskId, userId } });
      } else {
        await prisma.xhsPosterJob.deleteMany({ where: { id: taskId, userId } });
      }
      break;
    case "digitalHuman":
      await prisma.digitalHumanVideo.deleteMany({ where: { id: taskId, userId } });
      break;
    case "replication":
      await prisma.replication.deleteMany({
        where: {
          id: taskId,
          OR: [
            { product: { is: { userId } } },
            { script: { is: { userId } } },
          ],
        },
      });
      break;
    case "storyboard":
    case "grid":
      await prisma.storyboardTask.deleteMany({ where: { id: taskId, userId } });
      break;
    case "knowledgeVideo":
      await prisma.knowledgeVideoTask.deleteMany({ where: { id: taskId, userId } });
      break;
    case "replicationShot":
      await prisma.replicationShotTask.deleteMany({
        where: {
          id: taskId,
          OR: [
            { product: { is: { userId } } },
            { script: { is: { userId } } },
          ],
        },
      });
      break;
    default:
      break;
  }
}

type DeleteContext = {
  params: Promise<{ taskId: string }>;
};

type PatchContext = {
  params: Promise<{ taskId: string }>;
};

function normalizeTaskId(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function DELETE(request: NextRequest, context: DeleteContext) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId: routeTaskId } = await context.params;
  const taskId = normalizeTaskId(routeTaskId);
  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  const summary = await prisma.taskSummary.findUnique({
    where: { id: taskId },
  });

  if (!summary || summary.userId !== userId) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  try {
    await deleteUnderlyingTask(
      { taskType: summary.taskType as TaskType, taskId: summary.taskId, metadata: summary.metadata },
      userId
    );
    await prisma.taskSummary.delete({ where: { id: taskId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete task", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: PatchContext) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId: routeTaskId } = await context.params;
  const taskId = normalizeTaskId(routeTaskId);
  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  const summary = await prisma.taskSummary.findUnique({
    where: { id: taskId },
  });

  if (!summary || summary.userId !== userId) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
  const rawTitle = typeof body?.title === "string" ? body.title : null;
  const title = rawTitle?.trim() ?? "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (title.length > 120) {
    return NextResponse.json({ error: "Title must be 120 characters or fewer" }, { status: 400 });
  }

  try {
    await prisma.taskSummary.update({
      where: { id: taskId },
      data: { title },
    });
    return NextResponse.json({ success: true, data: { id: taskId, title } });
  } catch (error) {
    console.error("Failed to rename task", error);
    return NextResponse.json({ error: "Failed to rename task" }, { status: 500 });
  }
}
