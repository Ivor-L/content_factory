import { NextRequest, NextResponse } from "next/server";
import { getApiKeyForUser, getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import { getXhsText2ImgWebhookUrl } from "@/lib/webhookTargets";
import { toInputJson } from "@/lib/jsonUtils";
import { deductCredits } from "@/lib/credits";
import { getCreditCost } from "@/lib/creditCosts";
import { logCreditUsage } from "@/lib/logCreditUsage";
import { rewriteXhsNote } from "@/lib/xhsRewritePrompt";

const WORKFLOW_ID = "flow_image_text_replication";
const WORKFLOW_NAME = "图文复刻";

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

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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

function extractStyleProfileFromCandidate(candidate: unknown): string | null {
  if (typeof candidate === "string") {
    return normalizeJsonString(candidate);
  }
  if (candidate && typeof candidate === "object") {
    try {
      return JSON.stringify(candidate);
    } catch {
      return null;
    }
  }
  return null;
}

function extractStyleProfile({
  styleSpec,
  analysisResult,
}: {
  styleSpec?: unknown;
  analysisResult?: unknown;
}): string | null {
  const candidates: unknown[] = [];
  if (styleSpec) candidates.push(styleSpec);

  const analysis = parseObject(analysisResult);
  if (analysis) {
    candidates.push(
      analysis.style_profile_json,
      analysis.styleProfileJson,
      analysis.style_json,
      analysis.styleJson,
      analysis.style,
    );
    if (analysis.style_dna) {
      candidates.push({
        style_dna: analysis.style_dna,
        generation_prompts: analysis.generation_prompts ?? undefined,
        layout_blueprint: analysis.layout_blueprint ?? undefined,
        content_mapping: analysis.content_mapping ?? undefined,
      });
    }
  }

  for (const candidate of candidates) {
    const profile = extractStyleProfileFromCandidate(candidate);
    if (profile) return profile;
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
    if (metadata.layout_blueprint) {
      enrichedProfile.layout_blueprint = metadata.layout_blueprint;
    }
    if (metadata.content_mapping) {
      enrichedProfile.content_mapping = metadata.content_mapping;
    }
    candidates.push(enrichedProfile);
  }
  if (rawMetadata) candidates.push(rawMetadata);
  if (style.spec) candidates.push(style.spec);
  if (fallback) candidates.push(fallback);
  for (const candidate of candidates) {
    const profile = extractStyleProfileFromCandidate(candidate);
    if (profile) return profile;
  }
  return null;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function extractImageTextsFromMarkdown(value: string): string[] {
  const blocks = value
    .split(/(?:^|\n)#{2,4}\s*图\s*\d+\s*\n/i)
    .map((item) => item.trim())
    .filter(Boolean);
  if (blocks.length > 1) return blocks;
  return value.trim() ? [value.trim()] : [];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, apiKey: contextApiKey } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const task = await prisma.creativeTask.findFirst({
    where: { id, userId },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "BREAKDOWN_COMPLETED") {
    return NextResponse.json(
      { error: `Cannot generate: task status is ${task.status}` },
      { status: 409 },
    );
  }

  let body: {
    stylePresetId?: string | null;
    topicHint?: string | null;
    styleProfileJson?: string | null;
    style_profile_json?: string | null;
    style_json?: string | null;
    图文排版风格JSON?: string | null;
    imageCount?: number | string | null;
    image_count?: number | string | null;
  } = {};
  try {
    body = await request.json();
  } catch {
    // body is optional
  }

  // Resolve style preset spec (required)
  let stylePresetSpec: unknown = null;
  let stylePresetId: string | null =
    typeof body.stylePresetId === "string" ? body.stylePresetId.trim() : null;
  let styleName: string | null = null;

  if (!stylePresetId) {
    return NextResponse.json({ error: "请选择风格模板后再生成" }, { status: 400 });
  }

  const preset = await prisma.stylePreset.findUnique({
    where: { id: stylePresetId },
    select: { id: true, spec: true, metadata: true, name: true },
  });
  if (!preset) {
    return NextResponse.json({ error: "Style preset not found" }, { status: 404 });
  }
  stylePresetSpec = preset.spec;
  styleName = preset.name;

  const metadata = parseObject(task.metadata) ?? {};
  const custom = parseObject(metadata.custom) ?? {};
  const replication = parseObject(custom.replication) ?? {};
  const sourceTitle = String(replication.sourceTitle ?? task.title ?? "爆款图文复刻").trim();
  const sourceText = String(replication.sourceText ?? task.ideaText ?? "").trim();
  const parsedImageTexts = parseStringArray(replication.rewrittenImageTexts);
  const sourceImageTexts = parsedImageTexts.length ? parsedImageTexts : extractImageTextsFromMarkdown(sourceText);

  const sourceImagesRaw = replication.sourceImages;
  const sourceImages = Array.isArray(sourceImagesRaw)
    ? sourceImagesRaw.filter((item) => typeof item === "string") as string[]
    : [];
  const requestedImageCount = Number(body.imageCount ?? body.image_count);
  const imageCount = clampImageCount(
    Number.isFinite(requestedImageCount) ? requestedImageCount : sourceImages.length || 3,
  );

  const resolvedApiKey = contextApiKey ?? (await getApiKeyForUser(userId).catch(() => null));
  if (!resolvedApiKey) {
    return NextResponse.json({ error: "请先在设置页绑定 API Key" }, { status: 400 });
  }

  const costPerImage = await getCreditCost("image_text_replication", 2);
  const totalCost = imageCount * costPerImage;

  const explicitStyleProfile =
    normalizeJsonString(body.styleProfileJson) ||
    normalizeJsonString(body.style_profile_json) ||
    normalizeJsonString(body.style_json) ||
    normalizeJsonString(body["图文排版风格JSON"]);

  const styleProfileJson =
    explicitStyleProfile ||
    extractStyleProfileFromStyle({
      spec: stylePresetSpec,
      metadata: preset.metadata,
    }) ||
    extractStyleProfile({
      styleSpec: stylePresetSpec,
    });

  if (!styleProfileJson) {
    return NextResponse.json(
      { error: "所选风格模板缺少可用配置，请更换模板" },
      { status: 400 },
    );
  }

  const topicHint = (body.topicHint || "").trim();
  let rewritten;
  try {
    rewritten = await rewriteXhsNote({
      title: sourceTitle,
      body: topicHint ? `${topicHint}\n\n${sourceText}` : sourceText,
      imageTexts: sourceImageTexts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "仿写失败";
    logCreditUsage({ featureKey: "image_text_replication", userId, amount: totalCost, success: false, errorMessage: message });
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const generationTitle = rewritten.title || sourceTitle;
  const generationText = rewritten.body || sourceText || sourceTitle;

  try {
    await deductCredits(resolvedApiKey, {
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

  const nextCustom = {
    ...custom,
    posterMode: "text2image",
    source: "image_text_replication",
    text2image: {
      workflowId: WORKFLOW_ID,
      workflowName: WORKFLOW_NAME,
      styleId: stylePresetId,
      styleName,
      imageCount,
    },
    replication: {
      ...replication,
      phase: "generate",
      topicHint: topicHint || null,
      stylePresetId: stylePresetId ?? null,
      rewrittenTitle: generationTitle,
      rewrittenBody: generationText,
      rewrittenImageTexts: rewritten.imageTexts,
      titleFormula: rewritten.titleFormula,
      tags: rewritten.tags,
    },
  };
  const nextMetadata = {
    ...metadata,
    custom: nextCustom,
  };

  await prisma.$transaction(async (tx) => {
    await tx.creativeTask.update({
      where: { id },
      data: {
        status: "GENERATE_PENDING",
        progress: 20,
        title: generationTitle,
        ideaText: generationText,
        errorMessage: null,
        metadata: toInputJson(nextMetadata) ?? undefined,
      },
    });

    if (stylePresetId) {
      await tx.creativeTaskStyle.upsert({
        where: {
          taskId_styleId: {
            taskId: id,
            styleId: stylePresetId,
          },
        },
        create: {
          taskId: id,
          styleId: stylePresetId,
        },
        update: {},
      });
    }

    await tx.taskSummary.upsert({
      where: { taskType_taskId: { taskType: "poster", taskId: id } },
      create: {
        userId,
        taskType: "poster",
        taskId: id,
        title: generationTitle,
        status: "PROCESSING",
        preview: generationText.slice(0, 140),
        progress: 20,
        metadata: {
          posterMode: "text2image",
          source: "image_text_replication",
          styleId: stylePresetId,
          styleName,
          imageCount,
        },
      },
      update: {
        title: generationTitle,
        status: "PROCESSING",
        preview: generationText.slice(0, 140),
        progress: 20,
        metadata: {
          posterMode: "text2image",
          source: "image_text_replication",
          styleId: stylePresetId,
          styleName,
          imageCount,
        },
        updatedAt: new Date(),
      },
    });
  });

  const infra = resolveText2ImgInfra();
  const payload = {
    task_id: id,
    taskId: id,
    id,
    api_key: resolvedApiKey,
    apiKey: resolvedApiKey,
    workflow_id: WORKFLOW_ID,
    workflowId: WORKFLOW_ID,
    workflow_name: WORKFLOW_NAME,
    workflowName: WORKFLOW_NAME,
    title: generationTitle,
    text: generationText,
    style_profile_json: styleProfileJson,
    styleProfileJson: styleProfileJson,
    style_json: styleProfileJson,
    图文排版风格JSON: styleProfileJson,
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
  };
  const webhookUrl = getXhsText2ImgWebhookUrl();

  // Fire-and-forget — n8n 通过 callback_url 回传结果到 /api/webhook/image-text-result
  // 不等待响应，避免 nginx 504 超时
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      let message = raw;
      try {
        const parsed = JSON.parse(raw);
        message = parsed?.error || parsed?.message || raw;
      } catch { /* ignore */ }
      const errorMessage = message || "触发图文工作流失败";
      console.error("[image-text-replication/generate] webhook returned error:", errorMessage);
      await prisma.$transaction([
        prisma.creativeTask.update({
          where: { id },
          data: { status: "GENERATE_FAILED", errorMessage },
        }),
        prisma.taskSummary.updateMany({
          where: { taskType: "poster", taskId: id },
          data: { status: "FAILED", preview: errorMessage.slice(0, 140), updatedAt: new Date() },
        }),
      ]).catch(() => {});
    }
  }).catch(async (err) => {
    const errorMessage = err instanceof Error ? `触发自动化失败：${err.message}` : "触发自动化失败";
    console.error("[image-text-replication/generate] webhook trigger error:", errorMessage);
    await prisma.$transaction([
      prisma.creativeTask.update({
        where: { id },
        data: { status: "GENERATE_FAILED", errorMessage },
      }),
      prisma.taskSummary.updateMany({
        where: { taskType: "poster", taskId: id },
        data: { status: "FAILED", preview: errorMessage.slice(0, 140), updatedAt: new Date() },
      }),
    ]).catch(() => {});
  });

  return NextResponse.json({ taskId: id, status: "GENERATE_PENDING" });
}
