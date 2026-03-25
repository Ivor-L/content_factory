import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext, getApiKeyForUser } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import { triggerDHScriptGeneration } from "@/lib/n8n";

/**
 * POST /api/replication/digital-human
 * Stage 1 入口：创建 Replication 记录，触发 n8n 文案生成工作流
 *
 * Body: { scriptId, characterId }
 *
 * 返回 202：{ data: { replicationId, status: "pending" } }
 *
 * Stage 2（用户确认后）：POST /api/replication/digital-human/confirm
 */
export async function POST(request: NextRequest) {
  const { userId, apiKey: requestApiKey } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scriptId, characterId } = body || {};
  if (!scriptId || !characterId) {
    return NextResponse.json(
      { error: "scriptId and characterId are required" },
      { status: 400 }
    );
  }

  const [script, character] = await Promise.all([
    prisma.script.findUnique({
      where: { id: scriptId },
      select: { id: true, title: true, status: true },
    }),
    prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true, avatar: true, voiceId: true },
    }),
  ]);

  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }
  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
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

  // 创建 Replication 记录（DIGITAL_HUMAN 类型），等待文案生成
  const replication = await prisma.replication.create({
    data: {
      status: "pending",
      result: "{}",
      type: "DIGITAL_HUMAN",
      scriptId,
      inputParams: { characterId, userId },
    },
  });

  const appUrl =
    process.env.N8N_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const callbackUrl = `${appUrl}/api/webhook/replication/script`;
  const apiKey =
    requestApiKey || (await getApiKeyForUser(userId).catch(() => null));

  try {
    await triggerDHScriptGeneration({
      scriptId,
      replicationId: replication.id,
      characterId,
      userId,
      apiKey: apiKey ?? undefined,
      callbackUrl,
      appUrl,
    });
  } catch (error) {
    console.error("[digital-human] failed to trigger script generation", error);
    await prisma.replication.update({
      where: { id: replication.id },
      data: {
        status: "failed",
        result: JSON.stringify({ error: String(error) }),
      },
    });
    return NextResponse.json(
      { error: "触发文案生成失败，请稍后重试" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { data: { replicationId: replication.id, status: "pending" } },
    { status: 202 }
  );
}
