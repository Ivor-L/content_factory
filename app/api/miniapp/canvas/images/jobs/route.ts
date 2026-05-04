import { randomUUID } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
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

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
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

  const model = sanitizeText(body?.model, 80) || "gpt-image-2-all";
  const size = sanitizeSize(body?.size);
  const count = sanitizeCount(body?.n);
  const referenceImages = sanitizeImages(body?.image ?? body?.images);
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

  const origin = new URL(request.url).origin;
  const headers = new Headers({
    "Content-Type": "application/json",
  });
  if (apiKey) headers.set("X-User-Api-Key", apiKey);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("x-canvas-user-id", userId);

  after(async () => {
    try {
      const response = await fetch(`${origin}/api/canvas/images/generations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt,
          model,
          size,
          n: count,
          image: referenceImages,
        }),
        cache: "no-store",
      });
      const contentType = response.headers.get("content-type") || "";
      const rawText = await response.text();
      let payload: unknown = rawText;
      if (contentType.includes("application/json")) {
        try {
          payload = rawText ? JSON.parse(rawText) : {};
        } catch {
          payload = rawText;
        }
      }
      if (!response.ok) {
        const message = typeof payload === "object" && payload && "error" in payload
          ? JSON.stringify((payload as Record<string, unknown>).error).slice(0, 240)
          : rawText.slice(0, 240);
        throw new Error(message || `图片生成失败：HTTP ${response.status}`);
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
      await markJobFailed({
        taskId,
        userId,
        prompt,
        model,
        size,
        count,
        referenceImages,
        errorMessage: error instanceof Error ? error.message : "AI作图失败",
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
