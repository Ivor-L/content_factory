import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import {
  createCreativeTaskWithAssets,
  type CreateCreativeTaskPayload,
} from "@/lib/creativeTaskCreation";
import { autoGenerateCreativeTask } from "@/lib/creativeTaskAutoRunner";
import { loadTaskWithAssets } from "@/lib/creativeTaskService";
import { serializeTaskDetail } from "@/lib/creativeTaskFormatter";
import type { CreativeStageKey } from "@/lib/creativeStages";

type DirectCreateBody = CreateCreativeTaskPayload & {
  targetStage?: CreativeStageKey;
};

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: DirectCreateBody;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.ideaText || typeof payload.ideaText !== "string") {
    return NextResponse.json({ error: "ideaText is required" }, { status: 400 });
  }

  if (!payload.styleIds || payload.styleIds.length === 0) {
    return NextResponse.json({ error: "styleIds is required" }, { status: 400 });
  }

  const createPayload: CreateCreativeTaskPayload = {
    ...payload,
    channel: payload.channel ?? "xhs",
    targetOutput: payload.targetOutput ?? "图文",
  };

  let task;
  try {
    task = await createCreativeTaskWithAssets({ userId, payload: createPayload });
  } catch (error) {
    console.error("Failed to create direct creative task", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create task" },
      { status: 400 }
    );
  }

  try {
    await autoGenerateCreativeTask({
      taskId: task.id,
      userId,
      startStage: task.stage as CreativeStageKey,
      targetStage: payload.targetStage ?? "draft",
    });
  } catch (error) {
    console.error("Auto generation failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auto generation failed" },
      { status: 400 }
    );
  }

  const detail = await loadTaskWithAssets(task.id, userId);
  return NextResponse.json({ data: detail ? serializeTaskDetail(detail) : null }, { status: 201 });
}
