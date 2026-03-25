import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import {
  buildCanvasUpstreamHeaders,
  canvasMissingEndpointResponse,
  resolveCanvasUpstreamApiKey,
  relayUpstreamResponse,
  resolveCanvasUpstreamEndpoint,
} from "@/lib/canvasUpstream";

const CANVAS_VIDEO_TASK_TYPE = "canvas_video";

function extractVideoUrlFromMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const payload = metadata as Record<string, any>;
  const taskResultVideos = payload?.task_result?.videos;
  const taskResultUrl = Array.isArray(taskResultVideos) ? taskResultVideos[0]?.url : "";
  return (
    payload.video_url ||
    payload.url ||
    payload?.data?.video_url ||
    payload?.data?.url ||
    payload?.result?.video_url ||
    taskResultUrl ||
    ""
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { userId, apiKey } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  const upstreamApiKey = resolveCanvasUpstreamApiKey(apiKey);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!upstreamApiKey) {
    return NextResponse.json(
      { error: { code: "CANVAS_API_KEY_REQUIRED", message: "画布服务尚未配置，请联系管理员处理。" } },
      { status: 400 },
    );
  }

  const { taskId } = await params;
  const normalizedTaskId = String(taskId || "").trim();
  if (!normalizedTaskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  const taskSummary = await prisma.taskSummary.findUnique({
    where: {
      taskType_taskId: {
        taskType: CANVAS_VIDEO_TASK_TYPE,
        taskId: normalizedTaskId,
      },
    },
  });

  if (taskSummary && taskSummary.userId === userId) {
    const metadata = (taskSummary.metadata && typeof taskSummary.metadata === "object")
      ? (taskSummary.metadata as Record<string, unknown>)
      : {};
    const videoUrl = taskSummary.status === "succeeded"
      ? (extractVideoUrlFromMetadata(metadata) || taskSummary.preview || "")
      : "";

    return NextResponse.json({
      id: normalizedTaskId,
      task_id: normalizedTaskId,
      status: taskSummary.status,
      state: taskSummary.status,
      url: videoUrl || "",
      video_url: videoUrl || "",
      data: videoUrl ? { url: videoUrl, video_url: videoUrl } : {},
      metadata,
    });
  }

  const endpoint = resolveCanvasUpstreamEndpoint("videoTask", normalizedTaskId);
  if (!endpoint) {
    return canvasMissingEndpointResponse("videoTask");
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "GET",
      headers: buildCanvasUpstreamHeaders({
        userId,
        apiKey: upstreamApiKey,
      }),
      cache: "no-store",
    });
    return relayUpstreamResponse(upstream);
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "CANVAS_VIDEO_TASK_PROXY_FAILED",
          message: error instanceof Error ? error.message : "Canvas video task proxy failed",
        },
      },
      { status: 502 },
    );
  }
}
