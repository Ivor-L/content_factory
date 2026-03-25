import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { syncTaskToSummary } from "@/lib/taskSummary";

function safeParseJson(payload?: string | null) {
  if (!payload) return {};
  try {
    return JSON.parse(payload);
  } catch (error) {
    console.warn("Failed to parse replication.result JSON. Returning empty object.", error);
    return {};
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Replication Webhook received:", body);

    // Expected format from n8n: { task_id, status, result_url, error, ... }
    // We passed replication_id to n8n, so we expect it back as task_id or replication_id
    const taskId = body.task_id || body.taskId || body.id || body.replication_id || body.replicationId;
    const status = body.status;
    
    if (!taskId) {
      console.error("Webhook missing task_id", body);
      return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
    }

    const replication = await prisma.replication.findUnique({
      where: { id: taskId },
    });

    if (!replication) {
      console.error(`Replication task not found: ${taskId}`);
      return NextResponse.json({ error: "Replication task not found" }, { status: 404 });
    }

    let updateStatus = replication.status || "pending";
    const normalizedStatus = typeof status === "string" ? status.toLowerCase() : "";

    if (normalizedStatus === "failed" || normalizedStatus === "error" || body.error) {
      updateStatus = "failed";
    } else if (["completed", "success", "video_completed"].includes(normalizedStatus)) {
      updateStatus = "completed";
    } else if (updateStatus !== "completed" && updateStatus !== "failed") {
      updateStatus = updateStatus === "pending" ? "processing" : updateStatus;
    }

    const existingResult = safeParseJson(replication.result);
    const normalizedPayload: Record<string, any> = { ...body };

    if (body?.result && typeof body.result === "object") {
      normalizedPayload.finalResult = body.result;
      if (!normalizedPayload.videoUrl && body.result.videoUrl) {
        normalizedPayload.videoUrl = body.result.videoUrl;
      }
      if (!normalizedPayload.thumbnailUrl && body.result.thumbnailUrl) {
        normalizedPayload.thumbnailUrl = body.result.thumbnailUrl;
      }
    }

    const mergedResult = {
      ...existingResult,
      ...normalizedPayload,
      lastStage: body.stage || status || existingResult.lastStage || updateStatus,
    };

    await prisma.replication.update({
      where: { id: taskId },
      data: {
        status: updateStatus,
        result: JSON.stringify(mergedResult),
      },
    });

    await syncTaskToSummary({
      taskType: 'replication',
      taskId: taskId,
      operation: 'update',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
