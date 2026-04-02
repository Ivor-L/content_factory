import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { triggerCopyRemix } from "@/lib/n8n";
import { syncTaskToSummary } from "@/lib/taskSummary";

type JsonRecord = Record<string, unknown>;

const safeJsonParse = <T = unknown>(value: unknown): T | null => {
  if (!value) return null;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export async function POST(request: NextRequest) {
  const { userId, apiKey } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scriptId, videoUrl: overrideVideoUrl } = body || {};
  const originalCopyRaw = body?.originalCopy ?? body?.original_copy ?? null;
  const originalCopy =
    typeof originalCopyRaw === "string" ? originalCopyRaw.trim() || undefined : undefined;
  const ideaText =
    typeof body?.idea_text === "string" ? body.idea_text.trim() || undefined :
    typeof body?.ideaText === "string" ? body.ideaText.trim() || undefined : undefined;

  const styleId =
    typeof body?.styleId === "string" ? body.styleId.trim() : typeof body?.style_id === "string" ? body.style_id.trim() : "";
  const styleSnapshotRaw =
    body?.styleSnapshot ?? body?.style_snapshot ?? null;
  const styleSnapshot =
    typeof styleSnapshotRaw === "object" && styleSnapshotRaw ? styleSnapshotRaw : safeJsonParse<JsonRecord>(styleSnapshotRaw);

  if (!styleId || !styleSnapshot) {
    return NextResponse.json(
      { error: "请选择写作风格" },
      { status: 400 },
    );
  }
  if (!scriptId && !overrideVideoUrl) {
    return NextResponse.json(
      { error: "scriptId 或 videoUrl 必须提供一个" },
      { status: 400 },
    );
  }

  const script = scriptId
    ? await prisma.script.findUnique({ where: { id: scriptId } })
    : null;
  if (scriptId && !script) {
    return NextResponse.json({ error: "脚本不存在" }, { status: 404 });
  }

  const resolvedVideoUrl = overrideVideoUrl || script?.videoUrl;
  if (!resolvedVideoUrl) {
    return NextResponse.json({ error: "缺少视频地址" }, { status: 400 });
  }

  const styleProfile =
    (styleSnapshot as any)?.currentProfile?.profile ||
    (styleSnapshot as any)?.profile ||
    null;

  const replication = await prisma.replication.create({
    data: {
      status: "pending",
      type: "COPY",
      result: "{}",
      script: script ? { connect: { id: script.id } } : undefined,
      inputParams: {
        mode: "copy",
        scriptId: script?.id ?? null,
        videoUrl: resolvedVideoUrl,
        userId,
        styleId,
        styleSnapshot,
        originalCopy: originalCopy ?? null,
      },
    },
  });

  const callbackBase =
    process.env.N8N_CALLBACK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const callbackUrl = `${callbackBase}/api/webhook/replication/copy`;

  try {
    await triggerCopyRemix({
      replicationId: replication.id,
      scriptId: script?.id,
      videoUrl: resolvedVideoUrl,
      apiKey: apiKey || undefined,
      callbackUrl,
      userId,
      originalCopy: originalCopy || undefined,
      ideaText: ideaText || undefined,
      styleId,
      styleSnapshot: styleSnapshot as JsonRecord,
      styleProfile: styleProfile || undefined,
      workflowId:
        process.env.N8N_COPY_REMIX_WORKFLOW_ID?.trim() || "flow_copy_remix",
    });
  } catch (error) {
    console.error("[replication/copy] trigger failed", error);
    await prisma.replication.update({
      where: { id: replication.id },
      data: {
        status: "failed",
        result: JSON.stringify({ error: String(error) }),
      },
    });
    return NextResponse.json(
      { error: "触发口播复刻失败" },
      { status: 500 },
    );
  }

  await syncTaskToSummary({
    taskType: "replication",
    taskId: replication.id,
    operation: "create",
  });

  return NextResponse.json(
    { data: { replicationId: replication.id, status: "pending" } },
    { status: 202 },
  );
}
