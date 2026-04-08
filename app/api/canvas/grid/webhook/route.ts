import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidAdminWebhookRequest } from "@/lib/webhookAuth";
import { syncTaskToSummary } from "@/lib/taskSummary";
import { emitStoryboardTaskUpsert } from "@/lib/storyboardEvents";

/**
 * POST /api/canvas/grid/webhook
 * n8n 九宫格生成完成后的回调接口。
 *
 * 期望 payload:
 *   { taskId, task_id, record_id, status, image_url, imageUrl, outputs: [{fileUrl}] }
 *
 * 成功后更新 storyboard_tasks 表的 status / storyboard_image_url，
 * 触发 Supabase Realtime → 前端 waitForGridTask 收到通知。
 */
export async function POST(request: NextRequest) {
  // 验证 admin token
  if (!isValidAdminWebhookRequest(request)) {
    console.error("[canvas/grid/webhook] Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    console.log("[canvas/grid/webhook] Received:", JSON.stringify(payload).slice(0, 500));

    // 提取 taskId（优先从 query 参数，兼容 n8n 不透传 body 的情况）
    const queryTaskId = request.nextUrl.searchParams.get("taskId") || request.nextUrl.searchParams.get("task_id") || "";
    const taskId = String(queryTaskId || payload.taskId || payload.task_id || payload.record_id || "").trim();
    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const taskRecord = await (prisma as any).storyboardTask.findFirst({
      where: { OR: [{ id: taskId }, { taskId }] },
    });

    if (!taskRecord) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const rawStatus = String(payload.status || "").toUpperCase();
    const isFailed = rawStatus === "FAILED" || rawStatus === "ERROR";

    // 提取图片 URL（兼容多种 n8n 输出格式）
    let imageUrl = "";

    // 格式1：直接字段 image_url / imageUrl
    if (typeof payload.image_url === "string" && payload.image_url) {
      imageUrl = payload.image_url;
    } else if (typeof payload.imageUrl === "string" && payload.imageUrl) {
      imageUrl = payload.imageUrl;
    }

    // 格式2：outputs 数组 [{fileUrl, fileType}]
    if (!imageUrl) {
      const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
      for (const item of outputs as Record<string, unknown>[]) {
        const ft = String(item.fileType || "").toLowerCase();
        if (
          (ft === "jpg" || ft === "png" || ft === "jpeg" || ft === "webp" || ft === "image" || !ft) &&
          typeof item.fileUrl === "string" &&
          item.fileUrl
        ) {
          imageUrl = item.fileUrl;
          break;
        }
      }
    }

    // 格式3：data.images[0]
    if (!imageUrl) {
      const data = payload.data as Record<string, unknown> | undefined;
      const images = Array.isArray(data?.images) ? data.images : [];
      if (typeof images[0] === "string" && images[0]) {
        imageUrl = images[0];
      }
    }

    // 格式4：results[0].url
    if (!imageUrl) {
      const results = Array.isArray(payload.results) ? payload.results : [];
      const first = results[0] as Record<string, unknown> | undefined;
      if (typeof first?.url === "string" && first.url) {
        imageUrl = first.url;
      }
    }

    console.log("[canvas/grid/webhook] taskId:", taskId, "imageUrl:", imageUrl || "(none)", "status:", rawStatus);

    if (isFailed) {
      const failedTask = await (prisma as any).storyboardTask.update({
        where: { id: taskRecord.id },
        data: { status: "FAILED", progress: 0 },
      });
      emitStoryboardTaskUpsert(failedTask);
      await syncTaskToSummary({ taskType: "grid", taskId: failedTask.id, operation: "update" });
      return NextResponse.json({ ok: true });
    }

    if (!imageUrl) {
      return NextResponse.json({ error: "image_url is required for success callback" }, { status: 400 });
    }

    const completedTask = await (prisma as any).storyboardTask.update({
      where: { id: taskRecord.id },
      data: {
        status: "COMPLETED",
        storyboardImageUrl: imageUrl,
        coverImage: imageUrl,
        progress: 100,
      },
    });

    emitStoryboardTaskUpsert(completedTask);
    await syncTaskToSummary({ taskType: "grid", taskId: completedTask.id, operation: "update" });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[canvas/grid/webhook] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 },
    );
  }
}
