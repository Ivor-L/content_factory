import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { resolveCanvasUpstreamApiKey } from "@/lib/canvasUpstream";
import prisma from "@/lib/prisma";

const CANVAS_VIDEO_TASK_TYPE = "canvas_video";
const DEFAULT_POLL_REGISTER_URL = "https://api.atomx.top/tools/veo/poll/async";
const DEFAULT_CALLBACK_PATH = "/api/webhook/canvas-video-poll";

function normalizeBaseUrl(base: string) {
  return base.replace(/\/+$/, "");
}

function resolveCallbackBaseUrl(request: NextRequest) {
  const fromEnv =
    process.env.CANVAS_VIDEO_POLL_CALLBACK_BASE_URL?.trim() ||
    process.env.N8N_CALLBACK_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (fromEnv) return normalizeBaseUrl(fromEnv);
  return normalizeBaseUrl(request.nextUrl.origin);
}

function buildCallbackUrl(request: NextRequest, taskId: string, userId: string) {
  const base = resolveCallbackBaseUrl(request);
  const url = new URL(DEFAULT_CALLBACK_PATH, `${base}/`);
  url.searchParams.set("task_id", taskId);
  url.searchParams.set("user_id", userId);

  const webhookSecret = process.env.CANVAS_VIDEO_POLL_WEBHOOK_SECRET?.trim();
  if (webhookSecret) {
    url.searchParams.set("secret", webhookSecret);
  }

  return url.toString();
}

function normalizeStatus(raw: unknown) {
  const value = String(raw || "").trim().toLowerCase();
  if (["success", "succeed", "succeeded", "done", "completed", "finished"].includes(value)) {
    return "succeeded";
  }
  if (["failed", "error", "cancelled", "canceled", "timeout"].includes(value)) {
    return "failed";
  }
  return "processing";
}

export async function POST(request: NextRequest) {
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

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const taskId = String(payload.task_id || payload.taskId || payload.id || "").trim();
  if (!taskId) {
    return NextResponse.json({ error: "task_id is required" }, { status: 400 });
  }

  const model = String(payload.model || "").trim() || null;
  const pollRegisterUrl = process.env.CANVAS_VIDEO_POLL_REGISTER_URL?.trim() || DEFAULT_POLL_REGISTER_URL;
  const webhookUrl = buildCallbackUrl(request, taskId, userId);

  const registerBody: Record<string, unknown> = {
    task_id: taskId,
    api_key: upstreamApiKey,
    webhook_url: webhookUrl,
    context: {
      task_id: taskId,
      user_id: userId,
      model,
    },
  };

  try {
    const upstream = await fetch(pollRegisterUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registerBody),
      cache: "no-store",
    });

    const text = await upstream.text();
    let responseData: any = {};
    try {
      responseData = text ? JSON.parse(text) : {};
    } catch {
      responseData = { raw: text };
    }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: {
            code: "CANVAS_VIDEO_POLL_REGISTER_FAILED",
            message: "注册轮询任务失败",
            upstreamStatus: upstream.status,
            upstream: responseData,
          },
        },
        { status: 502 },
      );
    }

    const status = normalizeStatus((responseData as Record<string, unknown>).status || "processing");

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
        status,
        metadata: {
          model,
          webhook_url: webhookUrl,
          poll_register_url: pollRegisterUrl,
          poll_registered_at: new Date().toISOString(),
          register_response: responseData,
        },
      },
      update: {
        userId,
        status,
        metadata: {
          model,
          webhook_url: webhookUrl,
          poll_register_url: pollRegisterUrl,
          poll_registered_at: new Date().toISOString(),
          register_response: responseData,
        },
      },
    });

    return NextResponse.json({
      success: true,
      task_id: taskId,
      status,
      webhook_url: webhookUrl,
      register_url: pollRegisterUrl,
      data: responseData,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "CANVAS_VIDEO_POLL_REGISTER_EXCEPTION",
          message: error instanceof Error ? error.message : "注册轮询任务异常",
        },
      },
      { status: 500 },
    );
  }
}
