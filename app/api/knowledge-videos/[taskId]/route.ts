import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import { serializeKnowledgeVideoTask } from "@/lib/knowledgeVideos";
import { syncTaskToSummary } from "@/lib/taskSummary";

const normalizeId = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId: rawTaskId } = await params;
  const taskId = normalizeId(rawTaskId);
  if (!taskId) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  const task = await prisma.knowledgeVideoTask.findFirst({ where: { id: taskId, userId } });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ data: serializeKnowledgeVideoTask(task) });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId: rawTaskId } = await params;
  const taskId = normalizeId(rawTaskId);
  if (!taskId) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: any = {};
  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    data.status = payload.status;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "error")) {
    data.error = payload.error;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "videoUrl")) {
    data.videoUrl = payload.videoUrl;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "videoStoragePath")) {
    data.videoStoragePath = payload.videoStoragePath;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "coverUrl")) {
    data.coverUrl = payload.coverUrl;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "coverStoragePath")) {
    data.coverStoragePath = payload.coverStoragePath;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "durationSeconds")) {
    data.durationSeconds = payload.durationSeconds;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "timeline")) {
    data.timeline = payload.timeline;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "metadata")) {
    data.metadata = payload.metadata;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "renderStats")) {
    data.renderStats = payload.renderStats;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "remotionComposition")) {
    data.remotionComposition = payload.remotionComposition;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "remotionProps")) {
    data.remotionProps = payload.remotionProps;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  data.updatedAt = new Date();

  const updated = await prisma.knowledgeVideoTask.update({
    where: { id: taskId, userId },
    data,
  });

  await syncTaskToSummary({
    taskType: 'knowledgeVideo',
    taskId: taskId,
    operation: 'update',
  });

  return NextResponse.json({ data: serializeKnowledgeVideoTask(updated) });
}
