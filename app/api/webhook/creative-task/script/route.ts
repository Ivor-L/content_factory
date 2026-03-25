import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { syncTaskToSummary } from "@/lib/taskSummary";
import { parseMetadata } from "@/lib/creativeTaskService";
import { setStageMeta } from "@/lib/creativeTaskUtils";

/**
 * POST /api/webhook/creative-task/script
 * n8n 文案生成工作流（chuangzuo_web）完成后的回调
 *
 * n8n 实际回传格式（数组）：
 * [{ parsed_output: { 标题: string, 正文: string, 标签: string[] }, task_id: string, ... }]
 */
export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // n8n 回传数组，取第一项
  const item: Record<string, unknown> = (
    Array.isArray(rawBody) ? rawBody[0] : rawBody
  ) as Record<string, unknown>;

  console.log("[webhook/creative-task/script] received:", {
    task_id: item?.task_id,
    status: item?.status,
    has_parsed_output: Boolean(item?.parsed_output),
  });

  const taskId =
    (typeof item?.task_id === "string" && item.task_id) ||
    (typeof item?.replication_id === "string" && item.replication_id) ||
    (typeof item?.taskId === "string" && item.taskId);

  if (!taskId) {
    return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
  }

  const task = await prisma.creativeTask.findUnique({ where: { id: taskId } });
  if (!task) {
    console.error(`[webhook/creative-task/script] task not found: ${taskId}`);
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const statusRaw = typeof item?.status === "string" ? item.status.toLowerCase() : "";
  const isFailed = statusRaw === "failed" || statusRaw === "error" || Boolean(item?.error);

  // 解析 parsed_output（优先），回退到 script_content
  const parsedOutput =
    item?.parsed_output && typeof item.parsed_output === "object" && !Array.isArray(item.parsed_output)
      ? (item.parsed_output as Record<string, unknown>)
      : null;

  const bodyText: string =
    (typeof parsedOutput?.["正文"] === "string" ? parsedOutput["正文"] : "") ||
    (typeof item?.script_content === "string" ? item.script_content : "");

  const titleRaw: string =
    (typeof parsedOutput?.["标题"] === "string" ? parsedOutput["标题"] : "") ||
    (typeof item?.title === "string" ? item.title : "");

  const hashtags: string[] =
    Array.isArray(parsedOutput?.["标签"]) ? (parsedOutput["标签"] as string[]) :
    Array.isArray(item?.hashtags) ? (item.hashtags as string[]) : [];

  // 取标题第一行作为任务标题（去掉序号前缀）
  const firstTitle = titleRaw
    .split("\n")
    .map((l) => l.replace(/^\d+[、.。,，]\s*/, "").trim())
    .find((l) => l.length > 0) ?? "";

  const currentMeta = parseMetadata(task.metadata as any);
  const updatedMeta = setStageMeta(currentMeta, "draft", {
    status: isFailed ? "failed" : "completed",
    rawText: isFailed ? null : bodyText,
    aiOutput: isFailed
      ? { error: item?.error || "Generation failed" }
      : { 标题: titleRaw, 正文: bodyText, 标签: hashtags },
  });

  await prisma.creativeTask.update({
    where: { id: taskId },
    data: {
      stage: isFailed ? task.stage : "draft",
      status: isFailed ? "GENERATE_FAILED" : "COMPLETED",
      ...(firstTitle ? { title: firstTitle } : {}),
      metadata: updatedMeta as any,
      updatedAt: new Date(),
    },
  });

  await syncTaskToSummary({ taskType: "creative", taskId, operation: "update" });

  return NextResponse.json({ ok: true });
}
