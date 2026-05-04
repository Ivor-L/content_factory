import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toInputJson } from "@/lib/jsonUtils";

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toGeneratedImageItems(images: string[]) {
  return images.map((url, index) => ({
    index: index + 1,
    url,
  }));
}

function buildSummaryMetadata(
  value: unknown,
  images: string[],
  title: string | null | undefined,
): Record<string, unknown> {
  const current = parseObject(value) ?? {};
  const currentLayout = parseObject(current.xhsLayout) ?? {};

  return {
    ...current,
    posterMode: "text2image",
    source: typeof current.source === "string" && current.source
      ? current.source
      : "image_text_replication",
    images,
    imageUrls: images,
    xhsLayout: {
      ...currentLayout,
      title: typeof currentLayout.title === "string" && currentLayout.title
        ? currentLayout.title
        : title || "图文作品",
      images,
    },
  };
}

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get("x-admin-token");
  if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    task_id?: string;
    taskId?: string;
    id?: string;
    status?: string;
    generated_copy?: string;
    generatedCopy?: string;
    generated_images?: string[];
    generatedImages?: string[];
    image_guidance?: Array<{ index: number; description: string }>;
    imageGuidance?: Array<{ index: number; description: string }>;
    error?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const taskId = body.task_id || body.taskId || body.id;
  const status = body.status;
  const generatedCopy = body.generated_copy ?? body.generatedCopy;
  const generatedImages = body.generated_images ?? body.generatedImages;
  const imageGuidance = body.image_guidance ?? body.imageGuidance;
  const error = body.error;

  if (!taskId) {
    return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
  }

  const task = await prisma.creativeTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (status === "completed" && (generatedCopy || (generatedImages ?? []).length > 0)) {
    const metadata = parseObject(task.metadata) ?? {};
    const custom = parseObject(metadata.custom) ?? {};
    const replication = parseObject(custom.replication) ?? {};
    const normalizedImages = (generatedImages ?? []).filter(Boolean);
    const resolvedCopy = generatedCopy || task.ideaText || "";
    const imageItems = toGeneratedImageItems(normalizedImages);
    const summary = await prisma.taskSummary.findFirst({
      where: { taskType: "poster", taskId },
      select: { metadata: true, title: true },
    });
    const summaryMetadata = normalizedImages.length > 0
      ? buildSummaryMetadata(
          summary?.metadata,
          normalizedImages,
          summary?.title || task.title,
        )
      : null;
    const nextMetadata = {
      ...metadata,
      custom: {
        ...custom,
        posterMode: "text2image",
        source: "image_text_replication",
        replication: {
          ...replication,
          phase: "completed",
          generatedCopy: resolvedCopy,
          imageGuidance: imageGuidance ?? [],
          error: null,
        },
      },
    };

    await prisma.$transaction([
      prisma.creativeTask.update({
        where: { id: taskId },
        data: {
          status: "COMPLETED",
          progress: 100,
          ideaText: resolvedCopy,
          generatedImagesJson: toInputJson(imageItems) ?? undefined,
          errorMessage: null,
          metadata: toInputJson(nextMetadata) ?? undefined,
        },
      }),
      prisma.taskSummary.updateMany({
        where: { taskType: "poster", taskId },
        data: {
          status: "COMPLETED",
          progress: 100,
          thumbnailUrl: normalizedImages[0] || null,
          metadata: summaryMetadata ? toInputJson(summaryMetadata) ?? undefined : undefined,
          updatedAt: new Date(),
        },
      }),
    ]);
  } else if (status === "failed" || status === "error" || error) {
    const errorMessage = error ?? "Generation failed";
    await prisma.$transaction([
      prisma.creativeTask.update({
        where: { id: taskId },
        data: {
          status: "GENERATE_FAILED",
          errorMessage,
        },
      }),
      prisma.taskSummary.updateMany({
        where: { taskType: "poster", taskId },
        data: {
          status: "FAILED",
          preview: errorMessage.slice(0, 140),
          updatedAt: new Date(),
        },
      }),
    ]);
  } else {
    // 其他中间状态忽略
    console.log(`[image-text-result] Ignoring intermediate status: ${status} for task ${taskId}`);
  }

  return NextResponse.json({ success: true, task_id: taskId });
}
