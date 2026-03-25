import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { syncTaskToSummary } from "@/lib/taskSummary";

/**
 * POST /api/webhook/replication/script
 * n8n 文案生成工作流（Stage 1）完成后的回调
 *
 * 预期 payload：
 * {
 *   replication_id: string,
 *   status: "script_ready" | "failed",
 *   script_content?: string,
 *   title?: string,
 *   duration_estimate?: string,
 *   character_id?: string,
 *   error?: string
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("[webhook/replication/script] received:", body);

    const replicationId =
      body.replication_id || body.replicationId || body.task_id || body.taskId;
    const status = typeof body.status === "string" ? body.status.toLowerCase() : "";

    if (!replicationId) {
      console.error("[webhook/replication/script] missing replication_id", body);
      return NextResponse.json({ error: "Missing replication_id" }, { status: 400 });
    }

    const replication = await prisma.replication.findUnique({
      where: { id: replicationId },
    });

    if (!replication) {
      console.error(`[webhook/replication/script] replication not found: ${replicationId}`);
      return NextResponse.json({ error: "Replication not found" }, { status: 404 });
    }

    let updateStatus: string;
    let resultData: Record<string, unknown>;

    if (status === "failed" || status === "error" || body.error) {
      updateStatus = "script_failed";
      resultData = {
        error: body.error || "Script generation failed",
        stage: "script",
      };
    } else {
      updateStatus = "script_ready";
      resultData = {
        script_content: body.script_content || body.scriptContent || "",
        title: body.title || "",
        duration_estimate: body.duration_estimate || body.durationEstimate || "",
        character_id: body.character_id || body.characterId || "",
        viral_logic: body.viral_logic || "",
        style_applied: body.style_applied || "",
        needs_more_history: body.needs_more_history === true,
        data_suggestion: body.data_suggestion || "",
        stage: "script",
      };
    }

    // 合并到已有 result
    let existingResult: Record<string, unknown> = {};
    if (replication.result) {
      try {
        existingResult = JSON.parse(replication.result);
      } catch {}
    }

    await prisma.replication.update({
      where: { id: replicationId },
      data: {
        status: updateStatus,
        result: JSON.stringify({ ...existingResult, ...resultData }),
      },
    });

    await syncTaskToSummary({
      taskType: "replication",
      taskId: replicationId,
      operation: "update",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[webhook/replication/script] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
