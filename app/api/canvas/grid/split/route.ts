import { NextRequest, NextResponse } from "next/server";
import {
  createRunningHubTask,
  fetchRunningHubOutputs,
  RunningHubNodePatch,
} from "@/lib/runninghub";
import { getRequestUserContext } from "@/lib/authServer";
import { deductCredits } from "@/lib/credits";
import { getCreditCost } from "@/lib/creditCosts";

const GRID_SPLIT_WORKFLOW_ID =
  process.env.RUNNINGHUB_GRID_SPLIT_WORKFLOW_ID || "2025911236491218945";
const API_KEY = process.env.RUNNINGHUB_API_KEY || "d75f6f54beb14fee8b7379b35449332f";
const CALLBACK_BASE_URL = (process.env.CANVAS_VIDEO_POLL_CALLBACK_BASE_URL || "").replace(/\/+$/, "") || "https://atomx.top";

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  try {
    const creditCost = await getCreditCost("canvas_grid_split", 100);
    const deductResult = await deductCredits(userId, creditCost, "canvas_grid_split");
    if (!deductResult.success) {
      return NextResponse.json(
        { error: deductResult.message || "积分不足" },
        { status: 402 }
      );
    }

    const nodeInfoList: RunningHubNodePatch[] = [
      { nodeId: "35", fieldName: "image", fieldValue: imageUrl.trim() },
    ];

    const webhookUrl = `${CALLBACK_BASE_URL}/api/canvas/grid/split/webhook`;

    console.log("[canvas/grid/split] Request:", {
      userId,
      imageUrl: imageUrl.substring(0, 50),
      nodeId,
      creditCost,
    });

    const task = await createRunningHubTask({
      apiKey: API_KEY,
      workflowId: GRID_SPLIT_WORKFLOW_ID,
      nodeInfoList,
      webhookUrl,
      context: { nodeId, userId },
    });
    console.log("[canvas/grid/split] Task created:", { taskId: task.taskId, userId });
    return NextResponse.json({ data: { taskId: task.taskId } });
  } catch (error) {
    console.error("[canvas/grid/split] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create task" },
      { status: 500 },
    );
  }
}

