import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { getCreditCost } from "@/lib/creditCosts";
import { deductCredits } from "@/lib/credits";
import { logCreditUsage } from "@/lib/logCreditUsage";
import { createRunningHubTask, RunningHubNodePatch } from "@/lib/runninghub";
import { syncTaskToSummary } from "@/lib/taskSummary";

const GRID_SPLIT_WORKFLOW_ID =
  process.env.RUNNINGHUB_GRID_SPLIT_WORKFLOW_ID || "2025911236491218945";
const RUNNINGHUB_API_KEY = process.env.RUNNINGHUB_API_KEY || "";
const CALLBACK_BASE_URL =
  (process.env.CANVAS_VIDEO_POLL_CALLBACK_BASE_URL || "").replace(/\/+$/, "") || "https://atomx.top";
const SPLIT_NODE_ID = process.env.RUNNINGHUB_GRID_SPLIT_NODE_ID || "35";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

function normalizeJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { userId, apiKey } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskId: routeTaskId } = await context.params;
    const taskId = (routeTaskId || "").trim();
    if (!taskId) {
      return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
    }

    const gridTask = await prisma.storyboardTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        taskId: true,
        userId: true,
        videoType: true,
        status: true,
        scriptContent: true,
        referenceImage: true,
        storyboardImageUrl: true,
        coverImage: true,
        detailedBreakdown: true,
        replicationMode: true,
        imageModel: true,
        videoModel: true,
      },
    });

    if (!gridTask || gridTask.videoType !== "grid") {
      return NextResponse.json({ error: "Grid task not found" }, { status: 404 });
    }
    if (gridTask.userId && gridTask.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const detailedBreakdown = normalizeJsonRecord(gridTask.detailedBreakdown) || {};
    if (typeof detailedBreakdown.splitJobStatus === "string" && detailedBreakdown.splitJobStatus === "pending") {
      return NextResponse.json(
        {
          error: "Split already in progress",
          data: {
            splitJobId: detailedBreakdown.splitJobId,
          },
        },
        { status: 409 },
      );
    }

    if (typeof detailedBreakdown.splitStoryboardTaskId === "string") {
      return NextResponse.json({
        data: {
          storyboardId: detailedBreakdown.splitStoryboardTaskId,
          status: "completed",
        },
      });
    }

    const sourceImageUrl = gridTask.storyboardImageUrl || gridTask.coverImage;
    if (!sourceImageUrl) {
      return NextResponse.json({ error: "Grid image unavailable" }, { status: 400 });
    }

    if (!RUNNINGHUB_API_KEY) {
      return NextResponse.json({ error: "Grid split workflow not configured" }, { status: 500 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 403 });
    }

    const creditAmount = await getCreditCost("canvas_grid_split", 100);
    try {
      await deductCredits(apiKey, {
        amount: creditAmount,
        workflowId: process.env.CANVAS_GRID_SPLIT_WORKFLOW_ID || "flow_grid_split",
        workflowName: process.env.CANVAS_GRID_SPLIT_WORKFLOW_NAME || "Canvas Grid Split",
        reason: "canvas_grid_split",
      });
      logCreditUsage({ featureKey: "canvas_grid_split", userId, amount: creditAmount, success: true });
    } catch (error) {
      logCreditUsage({
        featureKey: "canvas_grid_split",
        userId,
        amount: creditAmount,
        success: false,
        errorMessage: error instanceof Error ? error.message : "Deduct credits failed",
      });
      return NextResponse.json({ error: "积分不足或扣费失败" }, { status: 402 });
    }

    const nodeInfoList: RunningHubNodePatch[] = [
      { nodeId: SPLIT_NODE_ID, fieldName: "image", fieldValue: sourceImageUrl },
    ];

    const webhookUrl = `${CALLBACK_BASE_URL}/api/canvas/grid/split/webhook`;
    const splitTask = await createRunningHubTask({
      apiKey: RUNNINGHUB_API_KEY,
      workflowId: GRID_SPLIT_WORKFLOW_ID,
      nodeInfoList,
      webhookUrl,
      context: { gridTaskId: gridTask.id, userId },
    });

    await prisma.storyboardTask.update({
      where: { id: gridTask.id },
      data: {
        status: "SPLIT_PENDING",
        progress: 0,
        detailedBreakdown: {
          ...detailedBreakdown,
          splitJobId: splitTask.taskId,
          splitJobStatus: "pending",
        },
      },
    });
    await syncTaskToSummary({ taskType: "grid", taskId: gridTask.id, operation: "update" });

    return NextResponse.json({
      data: {
        splitJobId: splitTask.taskId,
      },
    });
  } catch (error) {
    console.error("[grid-task/split] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to trigger split" },
      { status: 500 },
    );
  }
}
