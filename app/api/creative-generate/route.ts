import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext, getApiKeyForUser } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import { triggerCreativeScriptGeneration } from "@/lib/n8n";

const normalizeStyleRules = (value: unknown): Record<string, any> | undefined => {
  if (!value) return undefined;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
};

/**
 * POST /api/creative-generate
 * 智能创作入口：用户输入观点/想法，触发 n8n 文案生成工作流
 * n8n 内部根据 user_id 查询历史文案 + 案例故事作为上下文
 *
 * Body: { ideaText, wordCount?, characterId?, title? }
 * 返回 202：{ data: { replicationId, status: "pending" } }
 *
 * 生成完成后由 n8n 回调 /api/webhook/replication/script
 * 前端轮询 /api/replication/{id} 等待 status === "script_ready"
 */
export async function POST(request: NextRequest) {
  const { userId, apiKey: requestApiKey } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    ideaText?: string;
    wordCount?: number;
    characterId?: string;
    title?: string;
    styleId?: string;
    styleRules?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ideaText, wordCount, characterId, title } = body || {};
  const styleId = typeof body?.styleId === "string" ? body.styleId.trim() || undefined : undefined;
  let styleRules = normalizeStyleRules(body?.styleRules);

  if (!ideaText?.trim()) {
    return NextResponse.json({ error: "ideaText is required" }, { status: 400 });
  }

  // 若传了 characterId，提前验证角色具备生成数字人视频的条件
  if (characterId) {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true, avatar: true, voiceId: true },
    });
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    if (!character.avatar) {
      return NextResponse.json({ error: "角色缺少头像，无法生成数字人视频" }, { status: 400 });
    }
    if (!character.voiceId) {
      return NextResponse.json({ error: "角色缺少音色参考，请先上传音色" }, { status: 400 });
    }
  }

  if (styleId && !styleRules) {
    const style = await prisma.writingStyle.findFirst({
      where: { id: styleId, userId },
      select: {
        currentProfile: {
          select: { profileJson: true },
        },
      },
    });
    const profileJson = style?.currentProfile?.profileJson;
    if (profileJson && typeof profileJson === "object" && !Array.isArray(profileJson)) {
      styleRules = profileJson as Record<string, any>;
    }
  }

  // 创建 Replication 记录（type: "CREATIVE"，scriptId 为空）
  const replication = await prisma.replication.create({
    data: {
      status: "pending",
      result: "{}",
      type: "CREATIVE",
      inputParams: {
        ideaText: ideaText.trim(),
        wordCount: wordCount ?? null,
        characterId: characterId ?? null,
        title: title?.trim() ?? null,
        styleId: styleId ?? null,
        styleRules: styleRules ?? null,
        userId,
      },
    },
  });

  const appUrl =
    process.env.N8N_CALLBACK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const callbackUrl = `${appUrl}/api/webhook/replication/script`;
  const apiKey =
    requestApiKey || (await getApiKeyForUser(userId).catch(() => null));

  try {
    await triggerCreativeScriptGeneration({
      replicationId: replication.id,
      userId,
      ideaText: ideaText.trim(),
      wordCount: wordCount,
      styleRules,
      styleId,
      apiKey: apiKey ?? undefined,
      callbackUrl,
      appUrl,
    });
  } catch (error) {
    console.error("[creative-generate] failed to trigger script generation", error);
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
