import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext, getApiKeyForUser } from "@/lib/authServer";

const EXTRACT_WEBHOOK_URL =
  process.env.N8N_WRITING_STYLE_EXTRACT_WEBHOOK?.trim() ||
  process.env.N8N_STYLE_EXTRACT_WEBHOOK?.trim() ||
  "https://hooks.atomx.top/webhook/style_web";
const EXTRACT_WORKFLOW_ID =
  process.env.N8N_WRITING_STYLE_EXTRACT_WORKFLOW_ID || "flow_writing_style_extract";
const EXTRACT_WORKFLOW_NAME =
  process.env.N8N_WRITING_STYLE_EXTRACT_WORKFLOW_NAME || "提取创作风格";

function resolveCallbackUrl(styleId: string) {
  const base =
    process.env.WRITING_STYLE_EXTRACT_CALLBACK_BASE_URL ||
    process.env.N8N_CALLBACK_BASE_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "";
  if (!base) return "";
  const normalized = base.replace(/\/$/, "");
  return `${normalized}/api/webhook/writing-style/extract?style_id=${encodeURIComponent(styleId)}`;
}

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const style = await prisma.writingStyle.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      extractionStatus: true,
      metadata: true,
    },
  });

  if (!style) {
    return NextResponse.json({ error: "写作风格不存在" }, { status: 404 });
  }

  // Only block retry if PROCESSING was triggered recently (within 5 minutes)
  if (String(style.extractionStatus || "").toUpperCase() === "PROCESSING") {
    const meta = style.metadata && typeof style.metadata === "object" && !Array.isArray(style.metadata)
      ? (style.metadata as Record<string, any>)
      : {};
    const startedAt = meta?.extract?.startedAt ? new Date(meta.extract.startedAt).getTime() : 0;
    const elapsed = Date.now() - startedAt;
    if (elapsed < 5 * 60 * 1000) {
      return NextResponse.json({ error: "当前风格正在提炼中" }, { status: 409 });
    }
  }

  const chunks = await prisma.writingStyleChunk.findMany({
    where: { styleId: style.id, status: "ACTIVE" },
    orderBy: [{ createdAt: "desc" }, { chunkIndex: "asc" }],
    take: 300,
    select: {
      id: true,
      chunkIndex: true,
      content: true,
      cardType: true,
      riskLevel: true,
      tags: true,
      score: true,
      createdAt: true,
    },
  });

  if (!chunks.length) {
    return NextResponse.json({ error: "该风格还没有可提炼的切片内容" }, { status: 400 });
  }

  const apiKey = await getApiKeyForUser(userId);
  const callbackUrl = resolveCallbackUrl(style.id);

  const cards = chunks.map((chunk) => ({
    record_id: chunk.id,
    content: chunk.content,
    card_type: chunk.cardType || "其他",
    risk: chunk.riskLevel || "低",
    tags: chunk.tags,
    score: chunk.score,
    created_at: chunk.createdAt.toISOString(),
  }));

  // 兼容旧工作流默认取 body.data.items 的读取路径
  const items = cards.map((card) => ({
    record_id: card.record_id,
    fields: {
      卡片内容: [{ text: card.content }],
      卡片类型: card.card_type,
      风险等级: card.risk,
      标签: card.tags,
      创建时间: [{ text: card.created_at }],
    },
  }));

  await prisma.writingStyle.update({
    where: { id: style.id },
    data: {
      extractionStatus: "PROCESSING",
      metadata: {
        ...(style.metadata && typeof style.metadata === "object" && !Array.isArray(style.metadata)
          ? (style.metadata as Record<string, any>)
          : {}),
        extract: {
          workflowId: EXTRACT_WORKFLOW_ID,
          workflowName: EXTRACT_WORKFLOW_NAME,
          webhookUrl: EXTRACT_WEBHOOK_URL,
          startedAt: new Date().toISOString(),
          status: "PROCESSING",
        },
      },
    },
  });

  const payload = {
    task_id: style.id,
    style_id: style.id,
    style_record_id: style.id,
    record_id: style.id,
    style_name: style.name,
    workflow_id: EXTRACT_WORKFLOW_ID,
    workflow_name: EXTRACT_WORKFLOW_NAME,
    api_key: apiKey,
    callback_url: callbackUrl,
    cards,
    body: {
      data: {
        items,
      },
    },
  };

  try {
    let parsedWebhookUrl: URL;
    try {
      parsedWebhookUrl = new URL(EXTRACT_WEBHOOK_URL);
    } catch {
      throw new Error(`提炼工作流地址无效: ${EXTRACT_WEBHOOK_URL}`);
    }

    console.info("[writing-style.extract] trigger", {
      styleId: style.id,
      webhookUrl: parsedWebhookUrl.toString(),
      chunkCount: cards.length,
    });

    const response = await fetch(EXTRACT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`提炼工作流触发失败(${response.status}): ${text || "无返回"}`);
    }

    let ack: any = null;
    try {
      ack = text ? JSON.parse(text) : null;
    } catch {
      ack = text;
    }

    await prisma.writingStyle.update({
      where: { id: style.id },
      data: {
        metadata: {
          ...(style.metadata && typeof style.metadata === "object" && !Array.isArray(style.metadata)
            ? (style.metadata as Record<string, any>)
            : {}),
          extract: {
            workflowId: EXTRACT_WORKFLOW_ID,
            workflowName: EXTRACT_WORKFLOW_NAME,
            webhookUrl: parsedWebhookUrl.toString(),
            startedAt: new Date().toISOString(),
            status: "TRIGGERED",
            ack,
          },
        },
      },
    });
  } catch (error) {
    await prisma.writingStyle.update({
      where: { id: style.id },
      data: {
        extractionStatus: "FAILED",
        metadata: {
          ...(style.metadata && typeof style.metadata === "object" && !Array.isArray(style.metadata)
            ? (style.metadata as Record<string, any>)
            : {}),
          extract: {
            workflowId: EXTRACT_WORKFLOW_ID,
            workflowName: EXTRACT_WORKFLOW_NAME,
            webhookUrl: EXTRACT_WEBHOOK_URL,
            startedAt: new Date().toISOString(),
            status: "FAILED",
            error: error instanceof Error ? error.message : "unknown",
          },
        },
      },
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "触发失败",
        data: {
          webhookUrl: EXTRACT_WEBHOOK_URL,
          callbackUrl,
        },
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    data: {
      styleId: style.id,
      status: "PROCESSING",
      chunkCount: cards.length,
      webhookUrl: EXTRACT_WEBHOOK_URL,
      callbackUrl,
    },
  });
}
