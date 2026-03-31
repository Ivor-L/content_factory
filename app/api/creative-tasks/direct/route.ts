import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext, getApiKeyForUser } from "@/lib/authServer";
import {
  createCreativeTaskWithAssets,
  type CreateCreativeTaskPayload,
} from "@/lib/creativeTaskCreation";
import { loadTaskWithAssets } from "@/lib/creativeTaskService";
import { serializeTaskDetail } from "@/lib/creativeTaskFormatter";
import type { CreativeStageKey } from "@/lib/creativeStages";
import { syncTaskToSummary } from "@/lib/taskSummary";
import { triggerCreativeScriptGeneration } from "@/lib/n8n";

type DirectCreateBody = CreateCreativeTaskPayload & {
  targetStage?: CreativeStageKey;
};

export async function POST(request: NextRequest) {
  const { userId, apiKey: requestApiKey } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: DirectCreateBody;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.ideaText || typeof payload.ideaText !== "string") {
    return NextResponse.json({ error: "ideaText is required" }, { status: 400 });
  }

  const normalizedLanguage =
    typeof payload.language === "string" ? payload.language.trim() : payload.language ?? null;

  const createPayload: CreateCreativeTaskPayload = {
    ...payload,
    channel: payload.channel ?? "xhs",
    targetOutput: payload.targetOutput ?? "图文",
    language: normalizedLanguage,
  };

  let task;
  try {
    task = await createCreativeTaskWithAssets({ userId, payload: createPayload });
    await syncTaskToSummary({
      taskType: "creative",
      taskId: task.id,
      operation: "create",
    });
  } catch (error) {
    console.error("Failed to create direct creative task", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create task" },
      { status: 400 }
    );
  }

  // 触发 n8n 文案生成工作流（异步，不阻塞响应）
  try {
    const appUrl =
      process.env.N8N_CALLBACK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const callbackUrl = `${appUrl}/api/webhook/creative-task/script`;
    const apiKey =
      requestApiKey || (await getApiKeyForUser(userId).catch(() => null));

    const wordCount =
      payload.goal && typeof payload.goal === "object" && "targetWordCount" in payload.goal
        ? (payload.goal as { targetWordCount?: number }).targetWordCount
        : undefined;

    triggerCreativeScriptGeneration({
      replicationId: task.id,
      userId,
      ideaText: payload.ideaText.trim(),
      wordCount,
      styleRules: payload.styleRules as Record<string, any> | null ?? null,
      language: typeof normalizedLanguage === "string" ? normalizedLanguage : undefined,
      apiKey: apiKey ?? undefined,
      callbackUrl,
      appUrl,
    }).catch((err) => {
      console.error("[creative-tasks/direct] n8n trigger failed", err);
    });
  } catch (error) {
    // 触发失败不影响任务已创建的事实，仅记录日志
    console.error("[creative-tasks/direct] failed to trigger n8n webhook", error);
  }

  const detail = await loadTaskWithAssets(task.id, userId);
  return NextResponse.json({ data: detail ? serializeTaskDetail(detail) : null }, { status: 201 });
}
