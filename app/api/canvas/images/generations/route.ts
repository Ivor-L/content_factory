import { after, NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { getProfileApiKeyForUser, getRequestUserContext } from "@/lib/authServer";
import {
  CanvasCreditsError,
  ensureCanvasCreditsAvailable,
  resolveCanvasCreditsApiKey,
} from "@/lib/canvasCredits";
import { resolveCanvasUpstreamApiKey } from "@/lib/canvasUpstream";
import { toInputJson } from "@/lib/jsonUtils";
import { generateCanvasImageOnServer } from "@/lib/canvasImageGenerationServer";

const GEMINI_ENDPOINT_MAP: Record<string, string> = {
  "nano-banana": "/v1beta/models/gemini-3.1-flash-image-preview:generateContent",
  "nano-banana-pro": "/v1beta/models/gemini-3.1-pro-image-preview:generateContent",
  "gemini-3.1-pro-preview": "/v1beta/models/gemini-3.1-pro-image-preview:generateContent",
  "nano-banana-2": "/v1beta/models/gemini-3.1-flash-image-preview:generateContent",
  "gemini-3-pro-image-preview": "/v1beta/models/gemini-3.1-pro-image-preview:generateContent",
  "gemini-3.1-flash-image-preview": "/v1beta/models/gemini-3.1-flash-image-preview:generateContent",
};
const MODEL_ALIAS_MAP: Record<string, string> = {
  image2: "gpt-image-2-all",
};
const DEFAULT_GEMINI_ENDPOINT = "/v1beta/models/gemini-3.1-flash-image-preview:generateContent";
const CANVAS_IMAGE_TASK_TYPE = "poster";

function readEnv(name: string) {
  return String(process.env[name] || "").trim();
}

function hasStaticUpstreamAuth() {
  return Boolean(readEnv("CANVAS_UPSTREAM_BEARER_TOKEN"));
}

function resolveEffectiveUserId({
  request,
  userId,
  upstreamApiKey,
}: {
  request: NextRequest;
  userId: string | null;
  upstreamApiKey: string | null;
}) {
  if (userId) return userId;

  const headerUserId =
    request.headers.get("x-user-id")?.trim() ||
    request.headers.get("x-canvas-user-id")?.trim() ||
    "";
  if (headerUserId) return headerUserId;

  if (upstreamApiKey) {
    const digest = createHash("sha256")
      .update(upstreamApiKey)
      .digest("hex")
      .slice(0, 16);
    return `canvas-key-${digest}`;
  }

  return "";
}

function summarizeRequestBody(body: Record<string, unknown>) {
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const imageValue = body.image ?? body.images;
  const imageCount = Array.isArray(imageValue) ? imageValue.length : imageValue ? 1 : 0;
  return {
    model: typeof body.model === "string" ? body.model : null,
    promptLength: prompt.length,
    imageCount,
    aspectRatio: typeof body.aspect_ratio === "string" ? body.aspect_ratio : null,
    size: typeof body.size === "string" ? body.size : null,
    quality: typeof body.quality === "string" ? body.quality : null,
  };
}

function resolveModelName(payload: Record<string, unknown>): string {
  const direct = payload.model;
  if (typeof direct === "string" && direct.trim()) {
    const trimmed = direct.trim();
    return MODEL_ALIAS_MAP[trimmed.toLowerCase()] || trimmed;
  }
  const nested = payload.data;
  if (nested && typeof nested === "object") {
    const model = (nested as Record<string, unknown>).model;
    if (typeof model === "string" && model.trim()) {
      const trimmed = model.trim();
      return MODEL_ALIAS_MAP[trimmed.toLowerCase()] || trimmed;
    }
  }
  return "";
}

function extractImageUrls(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return extractImageUrls(JSON.parse(trimmed), depth + 1);
      } catch {
        return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:") ? [trimmed] : [];
      }
    }
    return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:") ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return Array.from(new Set(value.flatMap((item) => extractImageUrls(item, depth + 1))));
  }
  if (typeof value !== "object") return [];
  const obj = value as Record<string, unknown>;
  const preferred = [
    obj.url,
    obj.imageUrl,
    obj.image_url,
    obj.publicUrl,
    obj.public_url,
    obj.src,
    obj.inline_url,
    obj.b64_json,
    obj.b64Json,
    obj.data,
    obj.image,
    obj.images,
    obj.output,
    obj.result,
    obj.results,
    obj.generatedImages,
    obj.generated_images,
  ].flatMap((item) => extractImageUrls(item, depth + 1));
  if (preferred.length > 0) return Array.from(new Set(preferred));
  return Array.from(new Set(Object.values(obj).flatMap((item) => extractImageUrls(item, depth + 1))));
}

async function persistCanvasImageTask(params: {
  taskId: string;
  userId: string;
  requestBody: Record<string, unknown>;
  result: Awaited<ReturnType<typeof generateCanvasImageOnServer>>;
}) {
  const imageUrls = extractImageUrls(params.result.parsedJson ?? params.result.bodyText);
  const title = String(params.requestBody.prompt || "AI作图").trim().slice(0, 60) || "AI作图";
  const metadata = {
    posterMode: "text2image",
    source: "canvas",
    canvasImage: {
      prompt: typeof params.requestBody.prompt === "string" ? params.requestBody.prompt : "",
      model: typeof params.requestBody.model === "string" ? params.requestBody.model : "",
      size: typeof params.requestBody.size === "string" ? params.requestBody.size : null,
      aspectRatio: typeof params.requestBody.aspect_ratio === "string" ? params.requestBody.aspect_ratio : null,
      quality: typeof params.requestBody.quality === "string" ? params.requestBody.quality : null,
      images: imageUrls,
      rawResult: params.result.parsedJson ?? params.result.bodyText,
    },
    xhsLayout: {
      title,
      images: imageUrls,
    },
  };

  await prisma.$transaction([
    prisma.creativeTask.update({
      where: { id: params.taskId },
      data: {
        status: "COMPLETED",
        progress: 100,
        generatedImagesJson: toInputJson(imageUrls) ?? undefined,
        errorMessage: null,
        metadata: toInputJson(metadata) ?? undefined,
      },
    }),
    prisma.taskSummary.updateMany({
      where: { taskType: CANVAS_IMAGE_TASK_TYPE, taskId: params.taskId, userId: params.userId },
      data: {
        status: "COMPLETED",
        progress: 100,
        thumbnailUrl: imageUrls[0] || null,
        metadata: toInputJson(metadata) ?? undefined,
        updatedAt: new Date(),
      },
    }),
  ]);
}

async function markCanvasImageTaskFailed(params: {
  taskId: string;
  userId: string;
  requestBody: Record<string, unknown>;
  message: string;
}) {
  const title = String(params.requestBody.prompt || "AI作图").trim().slice(0, 60) || "AI作图";
  const metadata = {
    posterMode: "text2image",
    source: "canvas",
    xhsLayout: { title, images: [] },
    canvasImage: {
      prompt: typeof params.requestBody.prompt === "string" ? params.requestBody.prompt : "",
      model: typeof params.requestBody.model === "string" ? params.requestBody.model : "",
      errorMessage: params.message,
      images: [],
    },
  };

  await prisma.$transaction([
    prisma.creativeTask.update({
      where: { id: params.taskId },
      data: {
        status: "FAILED",
        errorMessage: params.message,
        metadata: toInputJson(metadata) ?? undefined,
      },
    }),
    prisma.taskSummary.updateMany({
      where: { taskType: CANVAS_IMAGE_TASK_TYPE, taskId: params.taskId, userId: params.userId },
      data: {
        status: "FAILED",
        preview: params.message.slice(0, 140),
        metadata: toInputJson(metadata) ?? undefined,
        updatedAt: new Date(),
      },
    }),
  ]);
}

export async function POST(request: NextRequest) {
  const { userId, apiKey } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  const upstreamApiKey = resolveCanvasUpstreamApiKey(apiKey);
  const effectiveUserId = resolveEffectiveUserId({ request, userId, upstreamApiKey });

  // 防止匿名请求在启用静态上游凭证时成为开放代理
  if (!effectiveUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!upstreamApiKey && !hasStaticUpstreamAuth()) {
    return NextResponse.json(
      { error: { code: "CANVAS_API_KEY_REQUIRED", message: "画布服务尚未配置，请联系管理员处理。" } },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const requestBody = body as Record<string, unknown>;
  const modelName = resolveModelName(requestBody);
  const profileApiKey = await getProfileApiKeyForUser(effectiveUserId);
  const creditsApiKey = resolveCanvasCreditsApiKey(profileApiKey ?? apiKey ?? upstreamApiKey);
  if (!creditsApiKey) {
    return NextResponse.json(
      {
        error: {
          code: "CANVAS_CREDITS_NOT_CONFIGURED",
          message: "积分服务未配置，请联系管理员。",
        },
      },
      { status: 500 },
    );
  }
  const creditsRequestBody: Record<string, unknown> = {
    ...requestBody,
    model: modelName || requestBody.model,
  };
  const requestId = createHash("sha256")
    .update(`${Date.now()}-${Math.random()}-${effectiveUserId}`)
    .digest("hex")
    .slice(0, 12);
  const taskId = randomUUID();
  const title = String(requestBody.prompt || "AI作图").trim().slice(0, 60) || "AI作图";

  await prisma.$transaction([
    prisma.creativeTask.create({
      data: {
        id: taskId,
        userId: effectiveUserId,
        title,
        channel: "canvas",
        targetOutput: "poster",
        ideaText: typeof requestBody.prompt === "string" ? requestBody.prompt : "",
        status: "PROCESSING",
        progress: 10,
        metadata: toInputJson({
          posterMode: "text2image",
          source: "canvas",
          canvasImage: {
            prompt: typeof requestBody.prompt === "string" ? requestBody.prompt : "",
            model: modelName || String(requestBody.model || ""),
            size: typeof requestBody.size === "string" ? requestBody.size : null,
            aspectRatio: typeof requestBody.aspect_ratio === "string" ? requestBody.aspect_ratio : null,
            quality: typeof requestBody.quality === "string" ? requestBody.quality : null,
            images: [],
          },
          xhsLayout: {
            title,
            images: [],
          },
        }) ?? undefined,
      },
    }),
    prisma.taskSummary.upsert({
      where: { taskType_taskId: { taskType: CANVAS_IMAGE_TASK_TYPE, taskId } },
      create: {
        userId: effectiveUserId,
        taskType: CANVAS_IMAGE_TASK_TYPE,
        taskId,
        title,
        status: "PROCESSING",
        preview: String(requestBody.prompt || "").slice(0, 140),
        progress: 10,
        metadata: toInputJson({
          posterMode: "text2image",
          source: "canvas",
          canvasImage: {
            prompt: typeof requestBody.prompt === "string" ? requestBody.prompt : "",
            model: modelName || String(requestBody.model || ""),
            size: typeof requestBody.size === "string" ? requestBody.size : null,
            aspectRatio: typeof requestBody.aspect_ratio === "string" ? requestBody.aspect_ratio : null,
            quality: typeof requestBody.quality === "string" ? requestBody.quality : null,
            images: [],
          },
          xhsLayout: {
            title,
            images: [],
          },
        }) ?? undefined,
      },
      update: {
        userId: effectiveUserId,
        title,
        status: "PROCESSING",
        preview: String(requestBody.prompt || "").slice(0, 140),
        progress: 10,
        metadata: toInputJson({
          posterMode: "text2image",
          source: "canvas",
          canvasImage: {
            prompt: typeof requestBody.prompt === "string" ? requestBody.prompt : "",
            model: modelName || String(requestBody.model || ""),
            size: typeof requestBody.size === "string" ? requestBody.size : null,
            aspectRatio: typeof requestBody.aspect_ratio === "string" ? requestBody.aspect_ratio : null,
            quality: typeof requestBody.quality === "string" ? requestBody.quality : null,
            images: [],
          },
          xhsLayout: {
            title,
            images: [],
          },
        }) ?? undefined,
        updatedAt: new Date(),
      },
    }),
  ]);

  try {
    await ensureCanvasCreditsAvailable(creditsApiKey, "image", creditsRequestBody);
  } catch (error) {
    if (error instanceof CanvasCreditsError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    throw error;
  }

  after(async () => {
    try {
      const result = await generateCanvasImageOnServer({
        userId: effectiveUserId,
        apiKey: apiKey ?? upstreamApiKey,
        requestBody,
      });
      if (result.status < 200 || result.status >= 300 || result.businessFailed) {
        console.error("[canvas/image] upstream failure", {
          requestId,
          userId: effectiveUserId,
          endpoint: "canvas-image-task",
          status: result.status,
          contentType: result.contentType,
          hasBusinessFailure: result.businessFailed,
          requestSummary: summarizeRequestBody(requestBody),
          responsePreview: result.bodyText.slice(0, 500),
        });
        await markCanvasImageTaskFailed({
          taskId,
          userId: effectiveUserId,
          requestBody,
          message: `图片生成失败：HTTP ${result.status}`,
        });
        return;
      }

      await persistCanvasImageTask({
        taskId,
        userId: effectiveUserId,
        requestBody,
        result,
      });
    } catch (error) {
      console.error("[canvas/image] proxy exception", {
        requestId,
        userId: effectiveUserId,
        endpoint: "canvas-image-task",
        requestSummary: summarizeRequestBody(requestBody),
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      await markCanvasImageTaskFailed({
        taskId,
        userId: effectiveUserId,
        requestBody,
        message: error instanceof Error ? error.message : "Canvas image proxy failed",
      });
    }
  });

  return NextResponse.json(
    {
      data: {
        taskId,
        status: "PROCESSING",
        taskType: CANVAS_IMAGE_TASK_TYPE,
      },
      queued: true,
    },
    { status: 202 },
  );
}
