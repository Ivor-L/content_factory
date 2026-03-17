import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getRequestUserContext } from "@/lib/authServer";
import { assertStageKey, loadTaskWithAssets, parseMetadata } from "@/lib/creativeTaskService";
import { ensureStageTransition, setStageMeta } from "@/lib/creativeTaskUtils";
import type { CreativeStageStatus, TopicUserSelections } from "@/types/creative";
import type { CreativeStageKey } from "@/lib/creativeStages";
import { serializeTaskDetail } from "@/lib/creativeTaskFormatter";

type Params = {
  params: Promise<{ taskId: string }>;
};

function normalizeTaskId(value?: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface StagePayload {
  stage: CreativeStageKey;
  status?: CreativeStageStatus;
  userNotes?: string;
  manualContent?: string;
  aiOutput?: any;
  nextStage?: CreativeStageKey | null;
  userSelections?: TopicUserSelections | null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId: paramTaskId } = await params;
  const taskId = normalizeTaskId(paramTaskId);
  if (!taskId) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  let payload: StagePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.stage) {
    return NextResponse.json({ error: "stage is required" }, { status: 400 });
  }
  const stage = assertStageKey(payload.stage);
  const nextStage = payload.nextStage
    ? assertStageKey(payload.nextStage)
    : undefined;

  const task = await loadTaskWithAssets(taskId, userId);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let metadata = parseMetadata(task.metadata);
  const patch: Parameters<typeof setStageMeta>[2] = {
    status: payload.status ?? "completed",
    userNotes: payload.userNotes,
    manualContent: payload.manualContent,
    aiOutput: payload.aiOutput ?? metadata.stages?.[stage]?.aiOutput,
  };
  if (Object.prototype.hasOwnProperty.call(payload, "userSelections")) {
    patch.userSelections = payload.userSelections ?? null;
  }
  metadata = setStageMeta(metadata, stage, patch);

  if (payload.status === "completed" && nextStage) {
    metadata = ensureStageTransition(metadata, stage, nextStage);
  }

  await prisma.$transaction([
    prisma.creativeTask.update({
      where: { id: task.id },
      data: {
        metadata: metadata as Prisma.InputJsonValue,
        stage: nextStage ?? task.stage,
        updatedAt: new Date(),
      },
    }),
    prisma.creativeEvent.create({
      data: {
        taskId: task.id,
        type: `stage:${stage}:manual`,
        payload: {
          status: payload.status,
          userNotes: payload.userNotes,
        },
      },
    }),
  ]);

  const updated = await loadTaskWithAssets(task.id, userId);
  if (!updated) {
    return NextResponse.json({ error: "Task not found after update" }, { status: 404 });
  }

  return NextResponse.json({ data: serializeTaskDetail(updated) });
}
