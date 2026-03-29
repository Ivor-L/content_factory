import { NextRequest, NextResponse } from "next/server";
import {
  createRunningHubTask,
  fetchRunningHubOutputs,
  RunningHubNodePatch,
} from "@/lib/runninghub";

const GRID_SPLIT_WORKFLOW_ID =
  process.env.RUNNINGHUB_GRID_SPLIT_WORKFLOW_ID || "2025911236491218945";
const API_KEY = process.env.RUNNINGHUB_API_KEY || "d75f6f54beb14fee8b7379b35449332f";
const CALLBACK_BASE_URL = (process.env.CANVAS_VIDEO_POLL_CALLBACK_BASE_URL || "").replace(/\/+$/, "") || "https://atomx.top";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { imageUrl, nodeId } = body as Record<string, unknown>;
  if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.trim()) {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
  }
  if (!nodeId || typeof nodeId !== "string") {
    return NextResponse.json({ error: "nodeId is required" }, { status: 400 });
  }

  const nodeInfoList: RunningHubNodePatch[] = [
    { nodeId: "35", fieldName: "image", fieldValue: imageUrl.trim() },
  ];

  const webhookUrl = `${CALLBACK_BASE_URL}/api/canvas/grid/split/webhook`;

  try {
    const task = await createRunningHubTask({
      apiKey: API_KEY,
      workflowId: GRID_SPLIT_WORKFLOW_ID,
      nodeInfoList,
      webhookUrl,
      context: { nodeId },
    });
    return NextResponse.json({ data: { taskId: task.taskId } });
  } catch (error) {
    console.error("[canvas/grid/split] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create task" },
      { status: 500 },
    );
  }
}

