import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getApiKeyForUser, getRequestUserContext } from "@/lib/authServer";
import { getAssetBucket, stylePreviewPath } from "@/lib/storagePaths";
import { uploadToStorage } from "@/lib/storageUpload";
import { toInputJson } from "@/lib/jsonUtils";

const DEFAULT_STYLE_TYPE = "xhs-visual";
const STYLE_WORKFLOW_WEBHOOK =
  process.env.N8N_STYLE_WORKFLOW_WEBHOOK ||
  "https://hooks.atomx.top/webhook/xhs_vision_style_web";
const STYLE_WORKFLOW_ID =
  process.env.N8N_STYLE_WORKFLOW_ID || "flow_xhs_Vision";
const STYLE_WORKFLOW_NAME =
  process.env.N8N_STYLE_WORKFLOW_NAME || "小红书视觉风格分析";
const STYLE_SCENE_TYPE =
  process.env.N8N_STYLE_SCENE_TYPE || "图文讲解详情图";
const STYLE_GOAL_FALLBACK =
  process.env.N8N_STYLE_GOAL || "适合知识卡片/小红书封面风格";
const STYLE_ANALYSIS_CALLBACK_URL =
  process.env.STYLE_ANALYSIS_CALLBACK_URL ||
  (() => {
    const base =
      process.env.STYLE_ANALYSIS_CALLBACK_BASE_URL ||
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "";
    return base ? `${base.replace(/\/$/, "")}/api/webhook/style-analysis` : "";
  })();

const nowIso = () => new Date().toISOString();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

export async function POST(request: NextRequest) {
  const { userId, apiKey: requestApiKey } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "file is required" },
      { status: 400 }
    );
  }

  const name =
    formData.get("name")?.toString() ||
    (file instanceof File && file.name) ||
    "未命名风格";
  const typeEntry = formData.get("type");
  const type =
    typeof typeEntry === "string" && typeEntry.trim().length > 0
      ? typeEntry.trim()
      : DEFAULT_STYLE_TYPE;
  const description = formData.get("description")?.toString() || null;
  const sceneTypeInput = formData.get("sceneType")?.toString()?.trim();
  const styleGoalInput = formData.get("styleGoal")?.toString()?.trim();
  const specRaw = formData.get("spec")?.toString();
  let spec: Prisma.InputJsonValue = {};
  if (specRaw) {
    try {
      spec = JSON.parse(specRaw) as Prisma.InputJsonValue;
    } catch (error) {
      return NextResponse.json(
        { error: "spec must be valid JSON" },
        { status: 400 }
      );
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filename =
    (file instanceof File && file.name) || `style-${Date.now()}.png`;
  const path = stylePreviewPath(userId, filename);

  const uploadResult = await uploadToStorage({
    bucket: getAssetBucket(),
    path,
    body: buffer,
    contentType: file.type || "application/octet-stream",
  });

  const style = await prisma.stylePreset.create({
    data: {
      userId,
      name,
      type,
      description: description ?? undefined,
      spec,
      previewUrl: uploadResult.publicUrl,
      metadata: {
        size: buffer.length,
        contentType: file.type,
        originalFilename: filename,
        storagePath: uploadResult.path,
        processingStatus: "PENDING",
        ...(sceneTypeInput || styleGoalInput
          ? {
              custom: {
                ...(sceneTypeInput ? { sceneType: sceneTypeInput } : {}),
                ...(styleGoalInput ? { styleGoal: styleGoalInput } : {}),
              },
            }
          : {}),
      },
    },
  });

  const apiKey = requestApiKey || (await getApiKeyForUser(userId));
  const sceneType = sceneTypeInput || STYLE_SCENE_TYPE;
  const styleGoal = styleGoalInput || description || STYLE_GOAL_FALLBACK;

  const hasCallbackPlaceholder = STYLE_ANALYSIS_CALLBACK_URL.includes("{style_id}");
  const callbackUrl = STYLE_ANALYSIS_CALLBACK_URL
    ? hasCallbackPlaceholder
      ? STYLE_ANALYSIS_CALLBACK_URL.replace("{style_id}", style.id)
      : `${STYLE_ANALYSIS_CALLBACK_URL}${
          STYLE_ANALYSIS_CALLBACK_URL.includes("?") ? "&" : "?"
        }style_id=${encodeURIComponent(style.id)}`
    : "";

  const payload: Record<string, any> = {
    task_id: style.id,
    api_key: apiKey,
    workflow_id: STYLE_WORKFLOW_ID,
    workflow_name: STYLE_WORKFLOW_NAME,
    style_name: style.name,
    style_type: style.type,
    style_goal: styleGoal,
    scene_type: sceneType,
    image_urls: [style.previewUrl],
    metadata: {
      user_id: style.userId,
    },
  };
  if (callbackUrl) {
    payload.callback_url = callbackUrl;
  }

  if (!apiKey) {
    await prisma.stylePreset.update({
      where: { id: style.id },
      data: {
        metadata: toInputJson({
          ...asRecord(style.metadata),
          processingStatus: "FAILED",
          failedAt: nowIso(),
          lastError: "未找到用户 API Key，无法触发视觉风格拆解",
        }),
      },
    });
  } else {
    const baseWorkflowMeta = {
      provider: "n8n",
      workflowId: STYLE_WORKFLOW_ID,
      workflowName: STYLE_WORKFLOW_NAME,
      webhookUrl: STYLE_WORKFLOW_WEBHOOK,
      status: "TRIGGERED",
      triggeredAt: nowIso(),
    };

    await prisma.stylePreset.update({
      where: { id: style.id },
      data: {
        metadata: toInputJson({
          ...asRecord(style.metadata),
          processingStatus: "PROCESSING",
          workerStartedAt: nowIso(),
          workflow: baseWorkflowMeta,
          lastError: "",
        }),
      },
    });

    try {
      const response = await fetch(STYLE_WORKFLOW_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(
          `style webhook failed (${response.status}): ${responseText || "no response"}`
        );
      }

      let ack: unknown = responseText;
      try {
        ack = responseText ? JSON.parse(responseText) : null;
      } catch {
        ack = responseText || null;
      }

      await prisma.stylePreset.update({
        where: { id: style.id },
        data: {
          metadata: toInputJson({
            ...asRecord(style.metadata),
            processingStatus: "PROCESSING",
            workflow: {
              ...baseWorkflowMeta,
              lastAckAt: nowIso(),
              ack,
            },
            lastError: "",
          }),
        },
      });
    } catch (error) {
      console.error("Failed to trigger style workflow directly", error);
      await prisma.stylePreset.update({
        where: { id: style.id },
        data: {
          metadata: toInputJson({
            ...asRecord(style.metadata),
            processingStatus: "FAILED",
            lastError:
              error instanceof Error
                ? error.message
                : "触发视觉风格拆解失败",
            failedAt: nowIso(),
          }),
        },
      });
    }
  }

  const latestStyle =
    (await prisma.stylePreset.findUnique({ where: { id: style.id } })) || style;

  return NextResponse.json(
    { data: { ...latestStyle, previewUpload: uploadResult.publicUrl } },
    { status: 201 }
  );
}
