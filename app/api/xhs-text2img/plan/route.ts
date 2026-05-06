import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { initMetadata } from "@/lib/creativeTaskUtils";
import { toInputJson } from "@/lib/jsonUtils";
import { getXhsText2ImgWebhookUrl } from "@/lib/webhookTargets";
import { deductCredits } from "@/lib/credits";
import { getCreditCostForModel } from "@/lib/creditCosts";
import { logCreditUsage } from "@/lib/logCreditUsage";

const WORKFLOW_ID = "flow_xhs_text2img";
const WORKFLOW_NAME = "图文排版";
const ASYNC_TRIGGER = process.env.XHS_TEXT2IMG_ASYNC_TRIGGER !== "0";

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function normalizeUrl(value: string | null | undefined): string {
  return normalizeText(value).replace(/\/+$/, "");
}

function resolveText2ImgInfra() {
  const appUrl = normalizeUrl(
    process.env.N8N_CALLBACK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "",
  );
  const callbackUrl = appUrl ? `${appUrl}/api/webhook/image-text-result` : "";
  const supabaseUrl = normalizeUrl(
    process.env.N8N_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "https://supabase-api.atomx.top",
  );
  const supabaseApiKey = normalizeText(
    process.env.N8N_SUPABASE_API_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  );
  const supabaseBucket =
    normalizeText(
      process.env.N8N_SUPABASE_BUCKET ||
        process.env.NEXT_PUBLIC_SUPABASE_BUCKET ||
        "uploads",
    ) || "uploads";
  const adminToken = normalizeText(process.env.ADMIN_TOKEN || "");
  const imageUploadUrl = normalizeUrl(
    process.env.N8N_IMAGE_UPLOAD_URL ||
      (appUrl ? `${appUrl}/api/storage/image-upload` : ""),
  );
  const generateImageUrl = normalizeUrl(process.env.N8N_GENERATE_IMAGE_URL || "");

  return {
    callbackUrl,
    supabaseUrl,
    supabaseApiKey,
    supabaseBucket,
    adminToken,
    imageUploadUrl,
    generateImageUrl,
  };
}

function clampImageCount(value?: number) {
  if (!Number.isFinite(value)) return 3;
  const rounded = Math.round(value!);
  if (Number.isNaN(rounded)) return 3;
  return Math.min(Math.max(rounded, 1), 5);
}

function normalizeJsonString(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed);
  } catch {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return trimmed;
    }
    return null;
  }
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function extractStyleProfileFromStyle(style: { metadata?: unknown; spec?: unknown }, fallback?: string | null) {
  const rawMetadata = typeof style.metadata === "string" ? style.metadata : null;
  const metadata = parseMetadata(style.metadata);
  const candidates: Array<unknown> = [];
  if (metadata?.analysis) candidates.push(metadata.analysis);
  if (metadata?.style_profile_json) candidates.push(metadata.style_profile_json);
  if (metadata?.styleProfileJson) candidates.push(metadata.styleProfileJson);
  if (metadata?.style_dna) {
    const enrichedProfile: Record<string, unknown> = {
      style_dna: metadata.style_dna,
    };
    if (metadata.generation_prompts) {
      enrichedProfile.generation_prompts = metadata.generation_prompts;
    } else if (metadata.promptKit) {
      enrichedProfile.promptKit = metadata.promptKit;
    }
    candidates.push(enrichedProfile);
  }
  if (rawMetadata) candidates.push(rawMetadata);
  if (style.spec) candidates.push(style.spec);
  if (fallback) candidates.push(fallback);

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const normalized = normalizeJsonString(candidate);
      if (normalized) return normalized;
      continue;
    }
    if (candidate && typeof candidate === "object") {
      try {
        return JSON.stringify(candidate);
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function markTaskFailed({
  creativeTaskId,
  taskId,
  errorMessage,
}: {
  creativeTaskId: string;
  taskId: string;
  errorMessage: string;
}) {
  await prisma.$transaction([
    prisma.creativeTask.update({
      where: { id: creativeTaskId },
      data: {
        status: "FAILED",
        errorMessage,
      },
    }),
    prisma.taskSummary.update({
      where: { taskType_taskId: { taskType: "poster", taskId } },
      data: {
        status: "FAILED",
        preview: errorMessage.slice(0, 140),
      },
    }),
  ]);
}

async function forwardToWebhook({
  payload,
  creativeTaskId,
  taskId,
  asyncMode = false,
}: {
  payload: Record<string, unknown>;
  creativeTaskId: string;
  taskId: string;
  asyncMode?: boolean;
}) {
  const webhookUrl = getXhsText2ImgWebhookUrl();
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const webhookText = await response.text().catch(() => "");
    if (!response.ok) {
      let message = webhookText;
      try {
        const parsed = JSON.parse(webhookText);
        message = parsed?.error || parsed?.message || webhookText;
      } catch {
        // ignore parse failures
      }
      const normalizedMessage = message || "触发工作流失败";
      // In async mode the webhook may return a non-2xx status while n8n still
      // processes the job — do NOT mark the task failed here; the callback
      // endpoint is responsible for the final status update.
      if (!asyncMode) {
        await markTaskFailed({ creativeTaskId, taskId, errorMessage: normalizedMessage });
      } else {
        console.warn("[xhs-text2img] webhook non-ok (async mode, task kept PROCESSING):", normalizedMessage);
      }
      return { ok: false as const, error: normalizedMessage };
    }
    return { ok: true as const };
  } catch (error) {
    const networkMessage =
      error instanceof Error ? error.message : "无法访问图文生成服务";
    const normalizedMessage = `触发自动化失败：${networkMessage}`;
    // Network-level failure means the workflow was never triggered — safe to fail
    // the task in both sync and async modes.
    await markTaskFailed({ creativeTaskId, taskId, errorMessage: normalizedMessage });
    return { ok: false as const, error: normalizedMessage };
  }
}

export async function POST(request: NextRequest) {
  const { userId, apiKey } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "请先在设置页绑定 API Key" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const styleId = typeof body.styleId === "string" ? body.styleId.trim() : "";
  const rawStyleProfile = typeof body.styleProfileJson === "string" ? body.styleProfileJson : "";
  const rawImageCount =
    typeof body.imageCount === "number"
      ? body.imageCount
      : Number.isFinite(Number(body.imageCount))
      ? Number(body.imageCount)
      : undefined;
  const languagePrefRaw = typeof body.language === "string" ? body.language.trim() : "";
  const languagePref = languagePrefRaw || "简体";

  if (!title) {
    return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "正文不能为空" }, { status: 400 });
  }
  if (!styleId) {
    return NextResponse.json({ error: "styleId is required" }, { status: 400 });
  }

  const style = await prisma.stylePreset.findFirst({
    where: {
      id: styleId,
      OR: [{ userId }, { userId: null }],
    },
  });

  if (!style) {
    return NextResponse.json({ error: "Style preset not found" }, { status: 404 });
  }

  const normalizedStyleProfile =
    normalizeJsonString(rawStyleProfile) || extractStyleProfileFromStyle(style);

  if (!normalizedStyleProfile) {
    return NextResponse.json({ error: "无法解析风格 JSON" }, { status: 400 });
  }

  let styleProfileObject: Record<string, unknown> | null = null;
  try {
    styleProfileObject = JSON.parse(normalizedStyleProfile);
  } catch {
    styleProfileObject = null;
  }

  const imageCount = clampImageCount(rawImageCount);
  const taskId = randomUUID();

  const costPerImage = await getCreditCostForModel("image_text_replication", WORKFLOW_ID, 2);
  const totalCost = imageCount * costPerImage;
  try {
    await deductCredits(apiKey, {
      amount: totalCost,
      workflowId: WORKFLOW_ID,
      workflowName: WORKFLOW_NAME,
      reason: "image_text_replication",
    });
    logCreditUsage({ featureKey: "image_text_replication", userId, amount: totalCost, success: true });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "积分不足";
    logCreditUsage({ featureKey: "image_text_replication", userId, amount: totalCost, success: false, errorMessage });
    return NextResponse.json({ error: errorMessage }, { status: 402 });
  }

  const creativeMetadata = initMetadata();
  const customMetadata = (creativeMetadata.custom = creativeMetadata.custom ?? {});
  customMetadata.posterMode = "text2image";
  customMetadata.text2image = {
    workflowId: WORKFLOW_ID,
    workflowName: WORKFLOW_NAME,
    styleId,
    styleName: style.name,
    imageCount,
    language: languagePref,
    ...(styleProfileObject ? { styleProfile: styleProfileObject } : {}),
  };

  const { summary, creativeTask } = await prisma.$transaction(async (tx) => {
    const createdTask = await tx.creativeTask.create({
      data: {
        id: taskId,
        userId,
        title,
        ideaText: text,
        channel: "xhs",
        targetOutput: "poster",
        status: "PROCESSING",
        metadata: toInputJson(creativeMetadata) ?? undefined,
      },
    });

    await tx.creativeTaskStyle.create({
      data: {
        taskId,
        styleId,
      },
    });

    const createdSummary = await tx.taskSummary.create({
      data: {
        userId,
        taskType: "poster",
        taskId,
        title,
        status: "PROCESSING",
        preview: text.slice(0, 140),
        metadata: {
          posterMode: "text2image",
          styleId,
          styleName: style.name,
          imageCount,
        },
      },
    });

    return { summary: createdSummary, creativeTask: createdTask };
  });

  const infra = resolveText2ImgInfra();
  const payload = {
    task_id: taskId,
    taskId,
    id: taskId,
    api_key: apiKey,
    apiKey: apiKey,
    workflow_id: WORKFLOW_ID,
    workflowId: WORKFLOW_ID,
    workflow_name: WORKFLOW_NAME,
    workflowName: WORKFLOW_NAME,
    title,
    text,
    style_profile_json: normalizedStyleProfile,
    styleProfileJson: normalizedStyleProfile,
    style_json: normalizedStyleProfile,
    图文排版风格JSON: normalizedStyleProfile,
    image_count: imageCount,
    imageCount,
    image_count_user: imageCount,
    imageCountUser: imageCount,
    callback_url: infra.callbackUrl,
    callbackUrl: infra.callbackUrl,
    admin_token: infra.adminToken,
    adminToken: infra.adminToken,
    supabase_url: infra.supabaseUrl,
    supabaseUrl: infra.supabaseUrl,
    supabase_api_key: infra.supabaseApiKey,
    supabaseApiKey: infra.supabaseApiKey,
    supabase_bucket: infra.supabaseBucket,
    supabaseBucket: infra.supabaseBucket,
    image_upload_url: infra.imageUploadUrl,
    imageUploadUrl: infra.imageUploadUrl,
    generate_image_url: infra.generateImageUrl,
    generateImageUrl: infra.generateImageUrl,
    language: languagePref,
  };

  const forwardPromise = forwardToWebhook({
    payload,
    creativeTaskId: creativeTask.id,
    taskId,
    asyncMode: ASYNC_TRIGGER,
  });

  if (ASYNC_TRIGGER) {
    forwardPromise.catch((error) => {
      console.error("[xhs-text2img] async trigger failed", error);
    });
    return NextResponse.json(
      { data: { taskId, summaryId: summary.id }, queued: true },
      { status: 202 }
    );
  }

  const result = await forwardPromise;
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ data: { taskId, summaryId: summary.id } }, { status: 201 });
}
