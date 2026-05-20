import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { resolveCanvasUpstreamApiKey } from "@/lib/canvasUpstream";

const CANVAS_IMAGE_TASK_TYPE = "poster";

function toDataUrl(content: unknown, mime: unknown = "image/png") {
  if (typeof content !== "string") return "";
  const trimmed = content.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) return trimmed;
  const mimeType = typeof mime === "string" && mime.trim() ? mime.trim() : "image/png";
  return `data:${mimeType};base64,${trimmed}`;
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
  const inlineData = obj.inlineData ?? obj.inline_data;
  const inlineRecord =
    inlineData && typeof inlineData === "object" && !Array.isArray(inlineData)
      ? (inlineData as Record<string, unknown>)
      : null;
  const inlineDataUrl = inlineRecord?.data
    ? toDataUrl(inlineRecord.data, inlineRecord.mimeType ?? inlineRecord.mime_type)
    : "";
  const base64Url =
    obj.b64_json || obj.b64Json
      ? toDataUrl(obj.b64_json ?? obj.b64Json, obj.mimeType ?? obj.mime_type)
      : "";
  return Array.from(
    new Set(
      [
        inlineDataUrl,
        base64Url,
        ...Object.values(obj).flatMap((item) => extractImageUrls(item, depth + 1)),
      ].filter(Boolean),
    ),
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
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstreamApiKey = resolveCanvasUpstreamApiKey(apiKey);
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

  const summary = await prisma.taskSummary.findUnique({
    where: {
      taskType_taskId: {
        taskType: CANVAS_IMAGE_TASK_TYPE,
        taskId: normalizedTaskId,
      },
    },
  });

  if (!summary || summary.userId !== userId) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const metadata = (summary.metadata && typeof summary.metadata === "object")
    ? (summary.metadata as Record<string, unknown>)
    : {};
  const canvasImage = (metadata.canvasImage && typeof metadata.canvasImage === "object")
    ? (metadata.canvasImage as Record<string, unknown>)
    : {};
  const images = Array.from(new Set([
    ...extractImageUrls(canvasImage.images),
    ...extractImageUrls(canvasImage.rawResult),
    ...extractImageUrls(metadata.xhsLayout),
    ...extractImageUrls(summary.thumbnailUrl),
  ]));
  const status = String(summary.status || "").toUpperCase();

  return NextResponse.json({
    id: normalizedTaskId,
    task_id: normalizedTaskId,
    status,
    state: status,
    progress: summary.progress ?? 0,
    images,
    data: {
      taskId: normalizedTaskId,
      status,
      images,
      image_urls: images,
      thumbnailUrl: summary.thumbnailUrl || null,
      metadata,
    },
  });
}
