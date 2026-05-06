import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { loadTaskWithAssets, parseMetadata } from "@/lib/creativeTaskService";
import { serializeTaskDetail } from "@/lib/creativeTaskFormatter";
import { sanitizeStyleRules } from "@/lib/styleRules";
import { syncTaskToSummary } from "@/lib/taskSummary";
import { deleteShortTtlCache } from "@/lib/shortTtlCache";

function invalidateTaskListCaches(userId: string) {
  deleteShortTtlCache("api:creative-tasks:list", (key) => key.includes(userId));
  deleteShortTtlCache("api:tasks:list", (key) => key.includes(userId));
}

type Params = {
  params: Promise<{ taskId: string }>;
};

function normalizeTaskId(value?: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(_request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId: paramTaskId } = await params;
  const taskId = normalizeTaskId(paramTaskId);
  if (!taskId) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  const task = await loadTaskWithAssets(taskId, userId);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ data: serializeTaskDetail(task) });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId: paramTaskId } = await params;
  const taskId = normalizeTaskId(paramTaskId);
  if (!taskId) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const task = await prisma.creativeTask.findFirst({
    where: { id: taskId, userId },
    select: { id: true, metadata: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const data: any = {};
  if (payload.title !== undefined) data.title = payload.title;
  if (payload.ideaText !== undefined) data.ideaText = payload.ideaText;
  if (payload.channel !== undefined) data.channel = payload.channel;
  if (payload.targetOutput !== undefined) data.targetOutput = payload.targetOutput;
  if (payload.goal !== undefined) data.goal = payload.goal;
  if (payload.status !== undefined) data.status = payload.status;

  let metadata = parseMetadata(task.metadata as any);
  let metadataChanged = false;

  if (Object.prototype.hasOwnProperty.call(payload, "styleRules")) {
    const sanitizedStyleRules = sanitizeStyleRules(payload.styleRules);
    metadata.custom = metadata.custom ?? {};
    if (sanitizedStyleRules === undefined) {
      delete metadata.custom.styleRules;
    } else {
      metadata.custom.styleRules = sanitizedStyleRules;
    }
    metadataChanged = true;
  }

  if (payload.voiceProfileId !== undefined) {
    if (!payload.voiceProfileId) {
      data.voiceProfile = { disconnect: true };
    } else {
      const voiceProfile = await prisma.voiceProfile.findFirst({
        where: { id: payload.voiceProfileId, userId },
        select: { id: true },
      });
      if (!voiceProfile) {
        return NextResponse.json({ error: "Voice profile not found" }, { status: 404 });
      }
      data.voiceProfile = { connect: { id: voiceProfile.id } };
    }
  }

  if (metadataChanged) {
    data.metadata = metadata;
  }

  await prisma.creativeTask.update({
    where: { id: taskId },
    data,
  });

  await syncTaskToSummary({
    taskType: 'creative',
    taskId: taskId,
    operation: 'update',
  });
  invalidateTaskListCaches(userId);

  const updated = await loadTaskWithAssets(taskId, userId);
  return NextResponse.json({ data: serializeTaskDetail(updated!) });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId: paramTaskId } = await params;
  const urlTaskId = request.nextUrl?.pathname
    ?.split("/")
    .filter(Boolean)
    .pop();
  const taskId = normalizeTaskId(paramTaskId ?? urlTaskId ?? null);
  if (!taskId) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  const task = await prisma.creativeTask.findFirst({
    where: { id: taskId, userId },
    select: { id: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  try {
    await prisma.$transaction([
      prisma.creativeTaskHistoryDoc.deleteMany({ where: { taskId } }),
      prisma.creativeTaskStory.deleteMany({ where: { taskId } }),
      prisma.creativeTaskStyle.deleteMany({ where: { taskId } }),
      prisma.creativeEvent.deleteMany({ where: { taskId } }),
      prisma.creativeTask.delete({ where: { id: taskId } }),
    ]);
  } catch (error) {
    console.error("Failed to delete creative task", { taskId, error });
    const message = error instanceof Error ? error.message : "Failed to delete task";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await syncTaskToSummary({
    taskType: 'creative',
    taskId: taskId,
    operation: 'delete',
  });
  invalidateTaskListCaches(userId);

  return NextResponse.json({ ok: true });
}
