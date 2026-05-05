import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toInputJson } from "@/lib/jsonUtils";

function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
  if (Array.isArray(value)) return value.flatMap((item) => collectUrls(item, depth + 1));
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return [
      obj.image_url,
      obj.imageUrl,
      obj.url,
      obj.images,
      obj.generated_images,
      obj.generatedImages,
      obj.data,
      obj.result,
    ].flatMap((item) => collectUrls(item, depth + 1));
  }
  return [];
}

export async function POST(request: NextRequest) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken) {
    const incoming = request.headers.get("x-admin-token") || request.headers.get("X-Admin-Token") || "";
    if (incoming !== adminToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    const taskId = sanitizeText(body.task_id || body.taskId || body.segment_id || body.segmentId);
    const status = sanitizeText(body.status || body.state || "success").toLowerCase();
    const imageUrls = Array.from(new Set(collectUrls(body))).filter((url) => !/\.(mp4|mov|m3u8)(\?|$)/i.test(url));

    if (!taskId) {
      return NextResponse.json({ error: "Missing task id" }, { status: 400 });
    }

    const task = await prisma.creativeTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const failed = status.includes("fail") || status.includes("error");
    const metadata = task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
      ? task.metadata as Record<string, unknown>
      : {};
    const nextMetadata = {
      ...metadata,
      canvasImage: {
        ...(metadata.canvasImage && typeof metadata.canvasImage === "object" ? metadata.canvasImage as Record<string, unknown> : {}),
        model: sanitizeText(body.model) || "image2",
        images: imageUrls,
        rawResult: body,
        errorMessage: failed ? sanitizeText(body.error || body.message) : undefined,
      },
      xhsLayout: {
        ...(metadata.xhsLayout && typeof metadata.xhsLayout === "object" ? metadata.xhsLayout as Record<string, unknown> : {}),
        images: imageUrls,
        title: "AI作图",
      },
    };

    await prisma.$transaction([
      prisma.creativeTask.update({
        where: { id: taskId },
        data: {
          status: failed ? "FAILED" : "COMPLETED",
          progress: failed ? task.progress : 100,
          errorMessage: failed ? sanitizeText(body.error || body.message) || "AI作图失败" : null,
          generatedImagesJson: !failed && imageUrls.length > 0 ? toInputJson(imageUrls) ?? undefined : undefined,
          metadata: toInputJson(nextMetadata) ?? undefined,
        },
      }),
      prisma.taskSummary.updateMany({
        where: { taskType: "poster", taskId },
        data: {
          status: failed ? "FAILED" : "COMPLETED",
          progress: failed ? undefined : 100,
          thumbnailUrl: !failed ? imageUrls[0] || null : undefined,
          metadata: toInputJson(nextMetadata) ?? undefined,
          updatedAt: new Date(),
        },
      }),
    ]);

    return NextResponse.json({ success: true, taskId, images: imageUrls });
  } catch (error) {
    console.error("[miniapp-canvas-image-webhook] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    );
  }
}
