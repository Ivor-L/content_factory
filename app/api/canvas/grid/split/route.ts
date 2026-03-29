import { NextRequest, NextResponse } from "next/server";
import {
  createRunningHubTask,
  fetchRunningHubOutputs,
  RunningHubNodePatch,
} from "@/lib/runninghub";

const GRID_SPLIT_WORKFLOW_ID =
  process.env.RUNNINGHUB_GRID_SPLIT_WORKFLOW_ID || "2025911236491218945";
const API_KEY = process.env.RUNNINGHUB_API_KEY || "d75f6f54beb14fee8b7379b35449332f";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { imageUrl } = body as Record<string, unknown>;
  if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.trim()) {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
  }

  const nodeInfoList: RunningHubNodePatch[] = [
    { nodeId: "35", fieldName: "image", fieldValue: imageUrl.trim() },
  ];

  try {
    const task = await createRunningHubTask({
      apiKey: API_KEY,
      workflowId: GRID_SPLIT_WORKFLOW_ID,
      nodeInfoList,
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

export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("taskId")?.trim();
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  try {
    const outputs = await fetchRunningHubOutputs({ apiKey: API_KEY, taskId });
    const imageOutputs = outputs.filter((item) => {
      const ft = (item.fileType || "").toLowerCase();
      return ft === "jpg" || ft === "png" || ft === "jpeg" || ft === "webp" || ft === "image";
    });

    if (!imageOutputs.length) {
      return NextResponse.json({ status: "running", imageUrls: [] });
    }

    const imageUrls = imageOutputs
      .map((item) => item.fileUrl)
      .filter((url): url is string => typeof url === "string" && url.length > 0);

    return NextResponse.json({ status: "SUCCESS", imageUrls });
  } catch (error) {
    // RunningHub throws when task not done yet — treat as still running
    const msg = error instanceof Error ? error.message : "";
    if (msg.toLowerCase().includes("not") || msg.toLowerCase().includes("running") || msg.toLowerCase().includes("pending")) {
      return NextResponse.json({ status: "running", imageUrls: [] });
    }
    console.error("[canvas/grid/split] GET error:", error);
    return NextResponse.json(
      { error: msg || "Failed to fetch outputs" },
      { status: 500 },
    );
  }
}
