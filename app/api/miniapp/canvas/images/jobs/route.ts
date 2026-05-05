import { randomUUID } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { CanvasImageGenerationError, generateCanvasImageOnServer } from "@/lib/canvasImageGenerationServer";
import { toInputJson } from "@/lib/jsonUtils";
import { getAssetBucket, posterImagePath } from "@/lib/storagePaths";
import { uploadToStorage } from "@/lib/storageUpload";

type ImageJobBody = {
  prompt?: unknown;
  model?: unknown;
  size?: unknown;
  n?: unknown;
  image?: unknown;
  images?: unknown;
};

const MINIAPP_GEMINI_IMAGE_MODELS = new Set([
  "nano-banana",
  "nano-banana-pro",
  "gemini-3.1-pro-preview",
  "nano-banana-2",
  "gemini-3-pro-image-preview",
  "gemini-3.1-flash-image-preview",
]);
const MODEL_ALIAS_MAP: Record<string, string> = {
  image2: "gpt-image-2-all",
};
const IMAGE2_WORKFLOW_MODEL = "image2";

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeJobErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (!message) return "AI作图失败";
  if (message.includes("image2 工作流触发失败")) return message;
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message)) {
    return "生图服务连接失败，请稍后重试或联系管理员检查上游配置";
  }
  return message;
}

function readEnv(name: string): string {
  return String(process.env[name] || "").trim();
}

function isConfiguredUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return /^https?:$/i.test(url.protocol) && !/\.example(?:\/|$)/i.test(url.hostname + url.pathname);
  } catch {
    return false;
  }
}

function hasCanvasUpstreamAuth(apiKey?: string | null): boolean {
  return Boolean(
    readEnv("CANVAS_UPSTREAM_BEARER_TOKEN") ||
    readEnv("CANVAS_UPSTREAM_DEFAULT_API_KEY") ||
    readEnv("CLOUD_API_KEY") ||
    readEnv("DEFAULT_USER_API_KEY") ||
    apiKey?.trim(),
  );
}

function validateImageUpstreamConfig(model: string, apiKey?: string | null): string | null {
  const normalizedModel = model.trim().toLowerCase();
  const isGeminiModel = MINIAPP_GEMINI_IMAGE_MODELS.has(normalizedModel);
  const hasAuth = hasCanvasUpstreamAuth(apiKey);

  if (isGeminiModel) {
    const geminiBase =
      readEnv("CANVAS_GEMINI_BASE_URL") ||
      readEnv("CANVAS_API_BASE_URL") ||
      readEnv("CLOUD_API_BASE_URL");
    if (!isConfiguredUrl(geminiBase)) {
      return "生图上游未配置：请配置 CANVAS_GEMINI_BASE_URL（或 CANVAS_API_BASE_URL / CLOUD_API_BASE_URL）";
    }
    if (!hasAuth) {
      return "生图上游未配置：请配置 CANVAS_UPSTREAM_BEARER_TOKEN 或默认 API Key";
    }
    return null;
  }

  if (!hasAuth) {
    return "生图上游未配置：请配置 CANVAS_UPSTREAM_BEARER_TOKEN 或默认 API Key";
  }
  return null;
}

function sanitizeSize(value: unknown): "1024x1024" | "1536x1024" | "1024x1536" {
  if (value === "1536x1024" || value === "1024x1536") return value;
  return "1024x1024";
}

function sanitizeCount(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 1;
  return Math.min(Math.max(Math.round(value), 1), 4);
}

function sanitizeImages(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 5);
}

function isImage2WorkflowModel(value: string): boolean {
  return value.trim().toLowerCase() === IMAGE2_WORKFLOW_MODEL;
}

function pushUniqueUrl(urls: string[], value: string | undefined | null) {
  const normalized = String(value || "").trim();
  if (!normalized || urls.includes(normalized)) return;
  urls.push(normalized);
}

function resolveStoryboardImageWebhookUrls(): string[] {
  const urls: string[] = [];
  pushUniqueUrl(urls, process.env.N8N_IMAGE_GEN_WEBHOOK);
  pushUniqueUrl(urls, process.env.N8N_STORYBOARD_IMAGE_WEBHOOK);
  pushUniqueUrl(urls, process.env.N8N_INTERNAL_IMAGE_GEN_WEBHOOK);
  pushUniqueUrl(urls, process.env.N8N_INTERNAL_STORYBOARD_IMAGE_WEBHOOK);
  pushUniqueUrl(urls, "https://hooks.atomx.top/webhook/storyboard-image-generate");
  return urls;
}

function resolveCallbackBase(request: NextRequest): string {
  return (
    process.env.N8N_CALLBACK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    request.nextUrl.origin
  ).replace(/\/+$/, "");
}

function describeUrlForLog(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value ? "invalid-url" : "";
  }
}

async function postStoryboardImageWorkflow(params: {
  urls: string[];
  payload: Record<string, unknown>;
  logContext: Record<string, unknown>;
}): Promise<{ response: Response; webhookUrl: string }> {
  const errors: string[] = [];

  for (const webhookUrl of params.urls) {
    try {
      console.log("[miniapp/canvas/images/jobs] triggering image2 workflow", {
        ...params.logContext,
        webhook: describeUrlForLog(webhookUrl),
      });
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params.payload),
      });
      if (response.ok) {
        return { response, webhookUrl };
      }
      const bodyText = await response.text().catch(() => "");
      errors.push(
        `${describeUrlForLog(webhookUrl)} HTTP ${response.status}${bodyText ? ` ${bodyText.slice(0, 180)}` : ""}`,
      );
    } catch (error) {
      errors.push(
        `${describeUrlForLog(webhookUrl)} ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(`image2 工作流触发失败：${errors.join("；") || "no webhook url"}`);
}

function collectUrls(value: unknown, depth = 0): string[] {
  if (depth > 5 || value == null) return [];

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return collectUrls(JSON.parse(trimmed), depth + 1);
      } catch {
        return /^https?:\/\//i.test(trimmed) ? [trimmed] : [];
      }
    }
    return /^https?:\/\//i.test(trimmed) ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectUrls(item, depth + 1));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const preferred = [
      obj.url,
      obj.imageUrl,
      obj.image_url,
      obj.src,
      obj.publicUrl,
      obj.public_url,
      obj.thumbnailUrl,
      obj.thumbnail_url,
    ].flatMap((item) => collectUrls(item, depth + 1));
    if (preferred.length > 0) return preferred;
    return Object.values(obj).flatMap((item) => collectUrls(item, depth + 1));
  }

  return [];
}

function extractImageUrls(payload: unknown): string[] {
  const candidates: unknown[] = [];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    candidates.push(
      obj.data,
      obj.images,
      obj.output,
      obj.result,
      obj.results,
      obj.generatedImages,
      obj.generated_images,
    );
    if (obj.data && typeof obj.data === "object") {
      const dataObj = obj.data as Record<string, unknown>;
      candidates.push(dataObj.images, dataObj.output, dataObj.results, dataObj.result);
    }
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const candidate of candidates) {
    for (const url of collectUrls(candidate)) {
      if (/\.(mp4|mov|m3u8)(\?|$)|\/video\/|\/master\/|xgvideo/i.test(url)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

type InlineImage = {
  data: string;
  mimeType: string;
};

function collectInlineImages(value: unknown, depth = 0): InlineImage[] {
  if (depth > 6 || value == null) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectInlineImages(item, depth + 1));
  }

  if (typeof value !== "object") return [];

  const obj = value as Record<string, unknown>;
  const b64Json =
    obj.b64_json ||
    obj.b64Json ||
    obj.image_base64 ||
    obj.imageBase64 ||
    obj.base64 ||
    obj.base64_json ||
    obj.base64Json;
  if (typeof b64Json === "string" && b64Json.trim()) {
    return [{ data: b64Json.trim(), mimeType: "image/png" }];
  }

  const inline = obj.inline_data || obj.inlineData || obj.inlineDataV1 || obj.inlineDataV2;
  const inlineObj = inline && typeof inline === "object" ? inline as Record<string, unknown> : null;
  const inlineData = inlineObj?.data;
  if (inlineObj && typeof inlineData === "string" && inlineData.trim()) {
    const mimeType =
      (typeof inlineObj.mime_type === "string" && inlineObj.mime_type) ||
      (typeof inlineObj.mimeType === "string" && inlineObj.mimeType) ||
      "image/png";
    return [{ data: inlineData.trim(), mimeType }];
  }

  const directData = obj.data;
  const directMimeType = obj.mime_type || obj.mimeType;
  if (
    typeof directData === "string" &&
    directData.trim() &&
    typeof directMimeType === "string" &&
    directMimeType.startsWith("image/")
  ) {
    return [{ data: directData.trim(), mimeType: directMimeType }];
  }

  return Object.values(obj).flatMap((item) => collectInlineImages(item, depth + 1));
}

function extensionFromMimeType(mimeType: string) {
  if (/jpe?g/i.test(mimeType)) return "jpg";
  if (/webp/i.test(mimeType)) return "webp";
  return "png";
}

async function uploadInlineImages(params: {
  payload: unknown;
  userId: string;
  taskId: string;
}): Promise<string[]> {
  const inlineImages = collectInlineImages(params.payload).slice(0, 4);
  if (inlineImages.length === 0) return [];

  const uploaded = await Promise.all(
    inlineImages.map(async (image, index) => {
      const normalizedData = image.data.replace(/^data:.*;base64,/i, "").trim();
      if (!normalizedData) return "";

      const extension = extensionFromMimeType(image.mimeType);
      const uploadResult = await uploadToStorage({
        bucket: getAssetBucket(),
        path: posterImagePath(params.userId, params.taskId, `canvas-${index + 1}.${extension}`),
        body: Buffer.from(normalizedData, "base64"),
        contentType: image.mimeType,
        upsert: true,
      });
      return uploadResult.publicUrl;
    }),
  );

  return uploaded.filter(Boolean);
}

function buildMetadata(input: {
  prompt: string;
  model: string;
  size: string;
  count: number;
  referenceImages: string[];
  generatedImages?: string[];
  rawResult?: unknown;
  errorMessage?: string;
}) {
  return {
    posterMode: "canvas_image",
    source: "miniapp_ai_image",
    engine: "canvas",
    canvasImage: {
      prompt: input.prompt,
      model: input.model,
      size: input.size,
      count: input.count,
      referenceImages: input.referenceImages,
      images: input.generatedImages ?? [],
      rawResult: input.rawResult,
      errorMessage: input.errorMessage,
    },
    xhsLayout: {
      images: input.generatedImages ?? [],
      title: "AI作图",
    },
  };
}

async function markJobCompleted(params: {
  taskId: string;
  userId: string;
  prompt: string;
  model: string;
  size: string;
  count: number;
  referenceImages: string[];
  generatedImages: string[];
  rawResult: unknown;
}) {
  const metadata = buildMetadata(params);
  await prisma.$transaction([
    prisma.creativeTask.updateMany({
      where: { id: params.taskId, userId: params.userId },
      data: {
        status: "COMPLETED",
        progress: 100,
        generatedImagesJson: toInputJson(params.generatedImages) ?? undefined,
        metadata: toInputJson(metadata) ?? undefined,
      },
    }),
    prisma.taskSummary.updateMany({
      where: { taskType: "poster", taskId: params.taskId, userId: params.userId },
      data: {
        status: "COMPLETED",
        progress: 100,
        thumbnailUrl: params.generatedImages[0] || null,
        metadata: toInputJson(metadata) ?? undefined,
        updatedAt: new Date(),
      },
    }),
  ]);
}

async function markJobFailed(params: {
  taskId: string;
  userId: string;
  prompt: string;
  model: string;
  size: string;
  count: number;
  referenceImages: string[];
  errorMessage: string;
}) {
  const metadata = buildMetadata({ ...params, errorMessage: params.errorMessage });
  await prisma.$transaction([
    prisma.creativeTask.updateMany({
      where: { id: params.taskId, userId: params.userId },
      data: {
        status: "FAILED",
        errorMessage: params.errorMessage,
        metadata: toInputJson(metadata) ?? undefined,
      },
    }),
    prisma.taskSummary.updateMany({
      where: { taskType: "poster", taskId: params.taskId, userId: params.userId },
      data: {
        status: "FAILED",
        metadata: toInputJson(metadata) ?? undefined,
        updatedAt: new Date(),
      },
    }),
  ]);
}

export async function POST(request: NextRequest) {
  const { userId, apiKey, token } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as ImageJobBody | null;
  const prompt = sanitizeText(body?.prompt, 1200);
  if (!prompt) {
    return NextResponse.json({ error: "请先填写图片描述" }, { status: 400 });
  }

  const rawModel = sanitizeText(body?.model, 80) || IMAGE2_WORKFLOW_MODEL;
  const useImage2Workflow = isImage2WorkflowModel(rawModel);
  const model = useImage2Workflow ? IMAGE2_WORKFLOW_MODEL : (MODEL_ALIAS_MAP[rawModel.toLowerCase()] || rawModel);
  const size = sanitizeSize(body?.size);
  const count = sanitizeCount(body?.n);
  const referenceImages = sanitizeImages(body?.image ?? body?.images);
  const configError = useImage2Workflow ? null : validateImageUpstreamConfig(model, apiKey);
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 503 });
  }
  const taskId = randomUUID();
  const title = Array.from(prompt.replace(/\s+/g, " ").trim()).slice(0, 24).join("") || "AI作图";
  const initialMetadata = buildMetadata({ prompt, model, size, count, referenceImages });

  await prisma.$transaction([
    prisma.creativeTask.create({
      data: {
        id: taskId,
        userId,
        title,
        channel: "miniapp",
        targetOutput: "poster",
        ideaText: prompt,
        status: "PROCESSING",
        progress: 10,
        metadata: toInputJson(initialMetadata) ?? undefined,
      },
    }),
    prisma.taskSummary.upsert({
      where: { taskType_taskId: { taskType: "poster", taskId } },
      create: {
        userId,
        taskType: "poster",
        taskId,
        title,
        status: "PROCESSING",
        preview: prompt.slice(0, 140),
        progress: 10,
        metadata: toInputJson(initialMetadata) ?? undefined,
      },
      update: {
        title,
        status: "PROCESSING",
        preview: prompt.slice(0, 140),
        progress: 10,
        metadata: toInputJson(initialMetadata) ?? undefined,
        updatedAt: new Date(),
      },
    }),
  ]);

  if (useImage2Workflow) {
    const webhookPayload = {
      segment_id: taskId,
      task_id: taskId,
      prompt,
      raw_prompt: prompt,
      model: IMAGE2_WORKFLOW_MODEL,
      requested_model: IMAGE2_WORKFLOW_MODEL,
      aspect_ratio: size === "1536x1024" ? "3:2" : size === "1024x1536" ? "2:3" : "1:1",
      reference_image_urls: referenceImages,
      images: referenceImages,
      image_urls: referenceImages,
      model_capabilities: {
        provider: "image2",
        supports_multi_image: true,
        max_reference_images: 8,
        preferred_input_field: "images",
      },
      callback_url: `${resolveCallbackBase(request)}/api/webhook/miniapp-canvas-image`,
      api_key: apiKey || token || process.env.CANVAS_UPSTREAM_DEFAULT_API_KEY || process.env.DEFAULT_USER_API_KEY || "",
      admin_token: process.env.ADMIN_TOKEN,
      workflow_id: "flow_storyboard_image",
      source: "miniapp_ai_image",
    };

    try {
      const { response } = await postStoryboardImageWorkflow({
        urls: resolveStoryboardImageWebhookUrls(),
        payload: webhookPayload,
        logContext: {
          taskId,
          model: IMAGE2_WORKFLOW_MODEL,
          referenceCount: referenceImages.length,
        },
      });

      let responsePayload: unknown = null;
      try {
        responsePayload = await response.json();
      } catch {
        responsePayload = null;
      }
      const immediateImages = extractImageUrls(responsePayload);
      if (immediateImages.length > 0) {
        const generatedImages = immediateImages.slice(0, count);
        await markJobCompleted({
          taskId,
          userId,
          prompt,
          model,
          size,
          count,
          referenceImages,
          generatedImages,
          rawResult: responsePayload,
        });
        return NextResponse.json({
          data: {
            taskId,
            status: "COMPLETED",
            images: generatedImages,
            message: "图片生成完成",
          },
        });
      }

      return NextResponse.json({
        data: {
          taskId,
          status: "PROCESSING",
          message: "图片生产中，请在作品中查看生成结果",
        },
      });
    } catch (error) {
      console.error("[miniapp/canvas/images/jobs] image2 workflow trigger failed", {
        taskId,
        userId,
        error,
      });
      const errorMessage = normalizeJobErrorMessage(error);
      await markJobFailed({
        taskId,
        userId,
        prompt,
        model,
        size,
        count,
        referenceImages,
        errorMessage,
      });
      return NextResponse.json(
        {
          error: errorMessage,
          data: {
            taskId,
            status: "FAILED",
          },
        },
        { status: 502 },
      );
    }
  }

  after(async () => {
    try {
      const result = await generateCanvasImageOnServer({
        userId,
        apiKey,
        requestBody: {
          prompt,
          model,
          size,
          n: count,
          image: referenceImages,
        },
      });
      const payload = result.parsedJson ?? result.bodyText;
      if (result.status < 200 || result.status >= 300 || result.businessFailed) {
        const message = typeof payload === "object" && payload && "error" in payload
          ? JSON.stringify((payload as Record<string, unknown>).error).slice(0, 240)
          : result.bodyText.slice(0, 240);
        throw new Error(message || `图片生成失败：HTTP ${result.status}`);
      }
      let generatedImages = extractImageUrls(payload);
      if (generatedImages.length === 0) {
        generatedImages = await uploadInlineImages({ payload, userId, taskId });
      }
      if (generatedImages.length === 0) {
        throw new Error("图片生成完成但未返回图片地址");
      }
      await markJobCompleted({
        taskId,
        userId,
        prompt,
        model,
        size,
        count,
        referenceImages,
        generatedImages,
        rawResult: payload,
      });
    } catch (error) {
      console.error("[miniapp/canvas/images/jobs] async generation failed", {
        taskId,
        userId,
        error,
      });
      const errorMessage = error instanceof CanvasImageGenerationError
        ? error.message
        : normalizeJobErrorMessage(error);
      await markJobFailed({
        taskId,
        userId,
        prompt,
        model,
        size,
        count,
        referenceImages,
        errorMessage,
      });
    }
  });

  return NextResponse.json({
    data: {
      taskId,
      status: "PROCESSING",
      message: "图片生产中，请在作品中查看生成结果",
    },
  });
}
