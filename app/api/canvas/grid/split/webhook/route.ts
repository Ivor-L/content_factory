import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncTaskToSummary } from "@/lib/taskSummary";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    console.log("[webhook] Received payload:", JSON.stringify(payload, null, 2).substring(0, 500));

    const taskId = String(payload.taskId || payload.task_id || "");
    const status = String(payload.status || "").toUpperCase();
    const context = (payload.context as Record<string, unknown> | undefined) || {};
    const nodeId = context?.nodeId ? String(context.nodeId) : "";
    const gridTaskId = context?.gridTaskId ? String(context.gridTaskId) : "";

    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    // Extract image URLs from multiple possible formats
    let imageUrls: string[] = [];

    // Format 1: outputs array with fileUrl
    const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
    imageUrls = outputs
      .filter((item: any) => {
        const ft = (item.fileType || "").toLowerCase();
        return ft === "jpg" || ft === "png" || ft === "jpeg" || ft === "webp" || ft === "image";
      })
      .map((item: any) => item.fileUrl)
      .filter((url: any): url is string => typeof url === "string" && url.length > 0);

    // Format 2: data.images array
    if (!imageUrls.length) {
      const data = payload.data as Record<string, unknown> | undefined;
      const images = Array.isArray(data?.images) ? data.images : [];
      imageUrls = images
        .filter((item: any) => typeof item === "string" && item.length > 0)
        .map((item: any) => String(item));
    }

    // Format 3: results array (RunningHub format)
    if (!imageUrls.length) {
      const results = Array.isArray(payload.results) ? payload.results : [];
      imageUrls = results
        .filter((item: any) => typeof item?.url === "string" && item.url.length > 0)
        .map((item: any) => String(item.url));
    }

    console.log("[webhook] Extracted URLs:", { count: imageUrls.length, urls: imageUrls.slice(0, 2) });

    if (gridTaskId) {
      await handleGridTaskSplit({
        gridTaskId,
        splitJobId: taskId,
        status,
        imageUrls,
      });
      return NextResponse.json({ ok: true });
    }

    if (!nodeId) {
      return NextResponse.json({ error: "nodeId required" }, { status: 400 });
    }

    // Store in Supabase
    const { error } = await supabaseAdmin
      .from("canvas_grid_split_results")
      .upsert({
        id: `${taskId}_${Date.now()}`,
        task_id: taskId,
        node_id: nodeId,
        status,
        image_urls: imageUrls,
        updated_at: new Date().toISOString(),
      }, { onConflict: "task_id" });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[canvas/grid/split/webhook] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 },
    );
  }
}

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

async function handleGridTaskSplit({
  gridTaskId,
  status,
  imageUrls,
  splitJobId,
}: {
  gridTaskId: string;
  status: string;
  imageUrls: string[];
  splitJobId: string;
}) {
  const normalizedStatus = status.toUpperCase();
  const isSuccess = normalizedStatus === "SUCCESS" || normalizedStatus === "COMPLETED";

  const gridTask = await prisma.storyboardTask.findUnique({
    where: { id: gridTaskId },
    select: {
      id: true,
      userId: true,
      videoType: true,
      scriptContent: true,
      referenceImage: true,
      replicationMode: true,
      imageModel: true,
      videoModel: true,
      detailedBreakdown: true,
    },
  });

  if (!gridTask || gridTask.videoType !== "grid") {
    console.warn("[grid split] Grid task not found or invalid", gridTaskId);
    return;
  }

  const breakdown = normalizeJsonRecord(gridTask.detailedBreakdown) || {};
  if (!isSuccess || !imageUrls.length) {
    await prisma.storyboardTask.update({
      where: { id: gridTask.id },
      data: {
        status: "SPLIT_FAILED",
        detailedBreakdown: {
          ...breakdown,
          splitJobId,
          splitJobStatus: "failed",
          splitError: imageUrls.length ? undefined : "未获取到拆分图片",
        },
      },
    });
    await syncTaskToSummary({ taskType: "grid", taskId: gridTask.id, operation: "update" });
    return;
  }

  const storyboardId = await prisma.$transaction(async (tx) => {
    const existingStoryboardId =
      typeof breakdown.splitStoryboardTaskId === "string" ? breakdown.splitStoryboardTaskId : null;
    let storyboardTaskId = existingStoryboardId;

    if (storyboardTaskId) {
      await tx.storyboardTask.update({
        where: { id: storyboardTaskId },
        data: {
          coverImage: imageUrls[0],
          storyboardImageUrl: imageUrls[0],
          storyboardImages: imageUrls,
          status: "COMPLETED",
          progress: 100,
        },
      });
      await tx.storyboardSegment.deleteMany({ where: { taskId: storyboardTaskId } });
    } else {
      const created = await tx.storyboardTask.create({
        data: {
          status: "COMPLETED",
          coverImage: imageUrls[0],
          storyboardImageUrl: imageUrls[0],
          storyboardImages: imageUrls,
          scriptContent: gridTask.scriptContent,
          referenceImage: gridTask.referenceImage,
          userId: gridTask.userId,
          replicationMode: gridTask.replicationMode,
          imageModel: gridTask.imageModel,
          videoModel: gridTask.videoModel,
          detailedBreakdown: {
            sourceGridTaskId: gridTask.id,
          },
        },
      });
      storyboardTaskId = created.id;
      await tx.storyboardTask.update({
        where: { id: storyboardTaskId },
        data: { taskId: storyboardTaskId },
      });
    }

    if (imageUrls.length) {
      await tx.storyboardSegment.createMany({
        data: imageUrls.map((url, index) => ({
          taskId: storyboardTaskId!,
          order: index,
          duration: 8,
          status: "COMPLETED",
          generatedImage: url,
          imagePrompt: `Panel ${index + 1}`,
        })),
      });
    }

    await tx.storyboardTask.update({
      where: { id: gridTask.id },
      data: {
        status: "SPLIT_COMPLETED",
        progress: 100,
        storyboardImages: imageUrls,
        detailedBreakdown: {
          ...breakdown,
          splitJobId,
          splitJobStatus: "completed",
          splitStoryboardTaskId: storyboardTaskId,
          splitImageUrls: imageUrls,
        },
      },
    });

    return storyboardTaskId!;
  });

  await syncTaskToSummary({ taskType: "grid", taskId: gridTask.id, operation: "update" });
  await syncTaskToSummary({ taskType: "storyboard", taskId: storyboardId, operation: "create" });
}
