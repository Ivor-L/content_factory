import { NextRequest, NextResponse } from "next/server";
import { getApiKeyForUser } from "@/lib/authServer";
import { CanvasCreditsError, deductCanvasCredits } from "@/lib/canvasCredits";
import prisma from "@/lib/prisma";

const CANVAS_VIDEO_TASK_TYPE = "canvas_video";
const RETRYABLE_CREDITS_CODES = new Set(["CANVAS_CREDITS_SERVICE_UNAVAILABLE"]);

function resolveDefaultCanvasCreditsApiKey() {
  const candidates = [
    process.env.CANVAS_CREDITS_DEFAULT_API_KEY,
    process.env.CANVAS_UPSTREAM_DEFAULT_API_KEY,
    process.env.DEFAULT_USER_API_KEY,
    process.env.CLOUD_API_KEY,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function normalizeStatus(raw: unknown, hasVideoUrl: boolean) {
  if (hasVideoUrl) return "succeeded";
  const value = String(raw || "").trim().toLowerCase();
  if (["success", "succeed", "succeeded", "done", "completed", "finished"].includes(value)) {
    return "succeeded";
  }
  if (["failed", "error", "cancelled", "canceled", "timeout"].includes(value)) {
    return "failed";
  }
  return "processing";
}

function extractVideoUrl(payload: Record<string, any>) {
  const taskResultVideos = payload?.task_result?.videos;
  const taskResultUrl = Array.isArray(taskResultVideos) ? taskResultVideos[0]?.url : "";
  return (
    payload.video_url ||
    payload.url ||
    payload?.data?.video_url ||
    payload?.data?.url ||
    payload?.result?.video_url ||
    payload?.task_result?.video_url ||
    taskResultUrl ||
    ""
  );
}

function extractTaskId(payload: Record<string, any>, searchParams: URLSearchParams) {
  return String(
    searchParams.get("task_id") ||
    payload.task_id ||
    payload.taskId ||
    payload.id ||
    payload?.data?.task_id ||
    payload?.context?.task_id ||
    "",
  ).trim();
}

function extractUserId(payload: Record<string, any>, searchParams: URLSearchParams) {
  return String(
    searchParams.get("user_id") ||
    payload.user_id ||
    payload.userId ||
    payload?.context?.user_id ||
    payload?.context?.userId ||
    "",
  ).trim();
}

function hasCreditsDeducted(metadata: Record<string, unknown>) {
  const deductedAt = metadata.canvas_credits_deducted_at;
  if (typeof deductedAt === "string" && deductedAt.trim()) return true;

  const deductedFlag = metadata.canvas_credits_deducted;
  if (typeof deductedFlag === "boolean") return deductedFlag;
  if (typeof deductedFlag === "string") {
    const normalized = deductedFlag.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function resolveModelForCredits(payload: Record<string, any>, previousMetadata: Record<string, unknown>) {
  const candidates = [
    payload.model,
    payload.model_name,
    payload.modelName,
    payload.video_model,
    payload.videoModel,
    payload?.data?.model,
    payload?.data?.video_model,
    payload?.context?.model,
    previousMetadata.model,
    previousMetadata.model_name,
    previousMetadata.modelName,
    previousMetadata.video_model,
    previousMetadata.videoModel,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CANVAS_VIDEO_POLL_WEBHOOK_SECRET?.trim();
  if (expectedSecret) {
    const receivedSecret = request.nextUrl.searchParams.get("secret")?.trim() || "";
    if (receivedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const payload = await request.json().catch(() => null) as Record<string, any> | null;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const taskId = extractTaskId(payload, request.nextUrl.searchParams);
  if (!taskId) {
    return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
  }

  const videoUrl = extractVideoUrl(payload);
  const status = normalizeStatus(payload.status || payload.state || payload.task_status, Boolean(videoUrl));

  const existing = await prisma.taskSummary.findUnique({
    where: {
      taskType_taskId: {
        taskType: CANVAS_VIDEO_TASK_TYPE,
        taskId,
      },
    },
  });

  const userId = extractUserId(payload, request.nextUrl.searchParams) || existing?.userId || "";
  if (!userId) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  const previousMetadata = (existing?.metadata && typeof existing.metadata === "object")
    ? (existing.metadata as Record<string, unknown>)
    : {};

  const alreadyDeducted = hasCreditsDeducted(previousMetadata);
  let finalStatus = status;
  let creditsMetadataPatch: Record<string, unknown> = {};

  if (status === "succeeded" && !alreadyDeducted) {
    const pointsApiKey = (await getApiKeyForUser(userId)) || resolveDefaultCanvasCreditsApiKey();
    if (!pointsApiKey) {
      finalStatus = "failed";
      creditsMetadataPatch = {
        canvas_credits_deducted: false,
        canvas_credits_deduct_error: {
          code: "CANVAS_POINTS_API_KEY_REQUIRED",
          message: "系统未配置积分服务凭据，请联系管理员处理。",
          at: new Date().toISOString(),
        },
      };
    } else {
      const creditsModel = resolveModelForCredits(payload, previousMetadata);
      const creditsRequestBody: Record<string, unknown> = { ...payload };
      if (creditsModel) {
        creditsRequestBody.model = creditsModel;
      }

      try {
        await deductCanvasCredits(pointsApiKey, "video", creditsRequestBody);
        creditsMetadataPatch = {
          canvas_credits_deducted: true,
          canvas_credits_deducted_at: new Date().toISOString(),
        };
      } catch (error) {
        if (error instanceof CanvasCreditsError && RETRYABLE_CREDITS_CODES.has(error.code)) {
          return NextResponse.json(
            {
              error: {
                code: error.code,
                message: error.message,
              },
            },
            { status: 502 },
          );
        }

        const errorCode = error instanceof CanvasCreditsError ? error.code : "CANVAS_CREDITS_DEDUCT_FAILED";
        const errorMessage = error instanceof CanvasCreditsError
          ? error.message
          : (error instanceof Error ? error.message : "积分扣除失败");
        finalStatus = "failed";
        creditsMetadataPatch = {
          canvas_credits_deducted: false,
          canvas_credits_deduct_error: {
            code: errorCode,
            message: errorMessage,
            at: new Date().toISOString(),
          },
        };
      }
    }
  } else if (alreadyDeducted) {
    creditsMetadataPatch = {
      canvas_credits_deducted: true,
      canvas_credits_deducted_at: previousMetadata.canvas_credits_deducted_at || new Date().toISOString(),
    };
  }

  const mergedMetadata = {
    ...previousMetadata,
    ...payload,
    callback_received_at: new Date().toISOString(),
    callback_url: request.nextUrl.toString(),
    ...creditsMetadataPatch,
  };

  await prisma.taskSummary.upsert({
    where: {
      taskType_taskId: {
        taskType: CANVAS_VIDEO_TASK_TYPE,
        taskId,
      },
    },
    create: {
      userId,
      taskType: CANVAS_VIDEO_TASK_TYPE,
      taskId,
      title: "Canvas 视频任务",
      status: finalStatus,
      preview: finalStatus === "succeeded" ? (videoUrl || null) : null,
      metadata: mergedMetadata,
    },
    update: {
      userId,
      status: finalStatus,
      preview: finalStatus === "succeeded" ? (videoUrl || existing?.preview || null) : (existing?.preview || null),
      metadata: mergedMetadata,
    },
  });

  return NextResponse.json({
    success: true,
    task_id: taskId,
    user_id: userId,
    status: finalStatus,
    video_url: finalStatus === "succeeded" ? (videoUrl || null) : null,
  });
}
