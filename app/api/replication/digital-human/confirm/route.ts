import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import { createDigitalHumanJob } from "@/lib/digitalHumanJob";
import {
  analyzeScriptDuration,
  formatScriptDurationMessage,
} from "@/lib/digitalHumanLimits";

/**
 * POST /api/replication/digital-human/confirm
 * Stage 2：用户确认文案后触发数字人视频生成
 *
 * Body: { replicationId, scriptContent? }
 * - scriptContent 为可选，用户在前端编辑过时提供，覆盖 n8n 生成的文案
 */
export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { replicationId, scriptContent: userEditedScript, characterId: bodyCharacterId } = body || {};
  if (!replicationId) {
    return NextResponse.json(
      { error: "replicationId is required" },
      { status: 400 }
    );
  }

  const replication = await prisma.replication.findUnique({
    where: { id: replicationId },
  });

  if (!replication) {
    return NextResponse.json(
      { error: "Replication not found" },
      { status: 404 }
    );
  }

  if (replication.status !== "script_ready") {
    return NextResponse.json(
      {
        error: `当前状态 ${replication.status} 不支持确认，需为 script_ready`,
      },
      { status: 400 }
    );
  }

  let resultData: Record<string, unknown> = {};
  try {
    resultData = JSON.parse(replication.result || "{}");
  } catch {}

  // 用户编辑过的文案优先，否则用 n8n 生成的
  const scriptContent =
    (typeof userEditedScript === "string" ? userEditedScript.trim() : "") ||
    (resultData.script_content as string) ||
    "";

  // 优先级：body 直传（智能创作流程）> n8n 回调写入 result > 创建时存入 inputParams
  const inputParams = replication.inputParams as Record<string, unknown> | null;
  const characterId =
    (typeof bodyCharacterId === "string" ? bodyCharacterId.trim() : "") ||
    (resultData.character_id as string) ||
    (inputParams?.characterId as string) ||
    "";

  if (!scriptContent) {
    return NextResponse.json({ error: "文案内容不能为空" }, { status: 400 });
  }
  if (!characterId) {
    return NextResponse.json(
      { error: "缺少数字人角色信息，请重新发起生成" },
      { status: 400 }
    );
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, avatar: true, voiceId: true },
  });

  if (!character) {
    return NextResponse.json(
      { error: "数字人角色不存在" },
      { status: 404 }
    );
  }
  if (!character.avatar) {
    return NextResponse.json(
      { error: "角色缺少头像，无法生成数字人视频" },
      { status: 400 }
    );
  }
  if (!character.voiceId) {
    return NextResponse.json(
      { error: "角色缺少音色参考，请先上传音色" },
      { status: 400 }
    );
  }

  const durationStats = analyzeScriptDuration(scriptContent);
  if (durationStats.needSplit) {
    return NextResponse.json(
      {
        error: formatScriptDurationMessage(durationStats, { locale: "zh" }),
        meta: {
          durationSeconds: durationStats.estimatedSeconds,
          limitSeconds: durationStats.limitSeconds,
          limitChars: durationStats.limitChars,
        },
      },
      { status: 400 }
    );
  }

  const job = await createDigitalHumanJob({
    type: "VOICE_CLONE",
    imageUrl: character.avatar,
    audioUrl: character.voiceId,
    script: scriptContent,
    durationSeconds: durationStats.estimatedSeconds,
    userId,
  });

  // 更新 replication 为 processing，记录最终文案和 videoId
  await prisma.replication.update({
    where: { id: replicationId },
    data: {
      status: "processing",
      result: JSON.stringify({
        ...resultData,
        script_content: scriptContent,
        video_id: job.id,
        confirmed_at: new Date().toISOString(),
      }),
    },
  });

  return NextResponse.json({ data: { videoId: job.id } }, { status: 201 });
}
