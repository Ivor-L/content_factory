import { NextRequest, NextResponse } from "next/server";
import { getApiKeyForUser, getRequestUserContext } from "@/lib/authServer";
import { createRunningHubTask, fetchRunningHubOutputs, RunningHubNodePatch } from "@/lib/runninghub";
import { deductConfiguredCredits } from "@/lib/creditBilling";

const AUDIO_WORKFLOW_ID = process.env.RUNNINGHUB_AUDIO_WORKFLOW_ID || "2029476062287110146";
const AUDIO_API_KEY = process.env.RUNNINGHUB_API_KEY || "d75f6f54beb14fee8b7379b35449332f";
const AUDIO_WORKFLOW_JSON = process.env.RUNNINGHUB_AUDIO_WORKFLOW_JSON || null;

function parseResourceUrl(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const voiceUrl = parseResourceUrl(body.voiceReferenceUrl || body.voiceUrl);
  const emotionUrl = parseResourceUrl(body.emotionReferenceUrl || body.emotionUrl);
  const script = typeof body.script === "string" ? body.script.trim() : "";

  if (!voiceUrl || !script) {
    return NextResponse.json({ error: "voiceReferenceUrl and script are required" }, { status: 400 });
  }

  const workflowId = (typeof body.workflowId === "string" && body.workflowId.trim()) || AUDIO_WORKFLOW_ID;
  const apiKey = (typeof body.apiKey === "string" && body.apiKey.trim()) || AUDIO_API_KEY;
  const creditsApiKey = await getApiKeyForUser(userId);
  if (!creditsApiKey) {
    return NextResponse.json({ error: "请先在设置页绑定 API Key" }, { status: 400 });
  }
  try {
    await deductConfiguredCredits({
      apiKey: creditsApiKey,
      featureKey: "canvas_audio_generation",
      userId,
      defaultAmount: 1,
      modelKey: workflowId,
      workflowId,
      workflowName: "Canvas Audio Generation",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "积分不足或扣费失败" },
      { status: 402 },
    );
  }

  const nodeInfoList: RunningHubNodePatch[] = [
    { nodeId: "13", fieldName: "audio", fieldValue: voiceUrl },
    { nodeId: "14", fieldName: "value", fieldValue: script },
  ];

  if (emotionUrl) {
    nodeInfoList.push({ nodeId: "15", fieldName: "audio", fieldValue: emotionUrl });
  }

  const task = await createRunningHubTask({
    apiKey,
    workflowId,
    nodeInfoList,
    workflow: AUDIO_WORKFLOW_JSON ?? undefined,
  });

  return NextResponse.json({ taskId: task.taskId, taskStatus: task.taskStatus });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId")?.trim();
  const voiceUrl = searchParams.get("voiceUrl")?.trim();
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  const apiKey = searchParams.get("apiKey")?.trim() || AUDIO_API_KEY;

  try {
    const outputs = await fetchRunningHubOutputs({ apiKey, taskId });
    const audio = outputs.find((item) => (item.fileType || "").toLowerCase() === "mp3");
    if (!audio || !audio.fileUrl) {
      return NextResponse.json({ status: "running" });
    }
    return NextResponse.json({ status: "completed", audioUrl: audio.fileUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
