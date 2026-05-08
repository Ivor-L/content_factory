import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { resolveUserApiKey } from "@/lib/userApiKey";
import type { Prisma } from "@prisma/client";
import { deductCredits } from "@/lib/credits";
import { getCreditCostForModel } from "@/lib/creditCosts";
import { logCreditUsage } from "@/lib/logCreditUsage";
import {
  mergeStoryboardVideoCreditCharge,
  refundStoryboardVideoCreditCharge,
  type StoryboardVideoCreditCharge,
} from "@/lib/storyboardVideoCredits";

const NO_BGM_RULE =
  "ABSOLUTELY NO BGM, NO BACKGROUND MUSIC. Pure voice/dialogue and ambient foley only.";

function cleanUrl(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || /^(undefined|null|nan)$/i.test(text)) return "";
  if (text.startsWith("//")) return `https:${text}`;
  return /^https?:\/\//i.test(text) ? text : "";
}

function appendQueryParams(url: string, params: Record<string, string | undefined>): string {
  const base = cleanUrl(url);
  if (!base) return "";
  const parsed = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    const text = String(value || "").trim();
    if (text) parsed.searchParams.set(key, text);
  }
  return parsed.toString();
}

function ensureNoBgmPrompt(prompt: string): string {
  const text = prompt.trim();
  if (!text) return NO_BGM_RULE;
  return /no\s+(bgm|background music)|without\s+(bgm|background music)/i.test(text)
    ? text
    : `${text}\n\n${NO_BGM_RULE}`;
}

function isSeedanceModel(model: unknown): boolean {
  return /seedance/i.test(String(model || ""));
}

function isSeedanceFastModel(model: unknown): boolean {
  return /seedance.*fast|fast.*seedance/i.test(String(model || ""));
}

function isSmartRemixVideoStageSource(value: unknown): boolean {
  return String(value || "").trim() === "smart_remix_video_stage";
}

function normalizeSeedanceVideoModel(model: unknown): string {
  return isSeedanceFastModel(model) ? "bytedance/seedance-2-fast" : "bytedance/seedance-2";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function jsonContainsAnyString(value: unknown, needles: string[]): boolean {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return needles.some((needle) => normalized.includes(needle));
  }
  if (Array.isArray(value)) {
    return value.some((item) => jsonContainsAnyString(item, needles));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) => jsonContainsAnyString(item, needles));
  }
  return false;
}

function isSmartRemixStoryboardTask(task: {
  detailedBreakdown?: Prisma.JsonValue | null;
  replicationMode?: string | null;
}): boolean {
  const breakdown = asRecord(task.detailedBreakdown);
  const metadata = asRecord(breakdown.metadata);
  const pipelineKey = String(breakdown.pipeline_key || breakdown.pipelineKey || "").trim();
  const feature = String(metadata.feature || breakdown.feature || "").trim();
  const source = String(breakdown.source || metadata.entry || "").trim();
  const replicationMode = String(task.replicationMode || "").trim();
  return pipelineKey === "viral_clone" ||
    replicationMode === "viral-clone" ||
    feature === "viral_remix" ||
    source === "miniapp_remix_generate_page" ||
    source === "remix_generate_page" ||
    jsonContainsAnyString(task.detailedBreakdown, [
      "viral_clone",
      "viral_remix",
      "one_click_remix",
      "miniapp_remix_generate_page",
      "remix_generate_page",
    ]);
}

function normalizeVideoAspectRatio(value: unknown): "9:16" | "16:9" | "" {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "portrait" || raw === "vertical" || raw === "竖屏" || raw === "竖版" || raw === "9/16" || raw === "9:16") {
    return "9:16";
  }
  if (raw === "landscape" || raw === "horizontal" || raw === "横屏" || raw === "横版" || raw === "16/9" || raw === "16:9") {
    return "16:9";
  }
  return "";
}

function readBooleanFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "y", "是", "有"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "否", "无"].includes(normalized)) return false;
  return null;
}

function getStoryboardGridUrl(task: Record<string, unknown>, breakdown: Record<string, unknown> | null): string {
  return (
    cleanUrl(task.storyboardImageUrl) ||
    cleanUrl(task.coverImage) ||
    cleanUrl(breakdown?.storyboard_grid_url) ||
    cleanUrl(breakdown?.storyboardGridUrl) ||
    cleanUrl((breakdown?.workflow_data as Record<string, unknown> | undefined)?.storyboard_grid_url)
  );
}

function withSeedanceStoryboardReference(
  prompt: string,
  params: Record<string, unknown>,
  storyboardGridUrl: string,
  aspectRatio: "9:16" | "16:9",
): string {
  if (!storyboardGridUrl) return prompt;
  const panelRange =
    typeof params.panel_range === "string"
      ? params.panel_range
      : typeof params.panelRange === "string"
        ? params.panelRange
        : "";
  const timeRange =
    typeof params.time_range === "string"
      ? params.time_range
      : typeof params.timeRange === "string"
        ? params.timeRange
        : "";

  return [
    prompt,
    "",
    "Seedance 2.0 reference protocol:",
    "- @Image1 is the current clip first frame or product-replaced reference frame.",
    "- @Image2 is the full storyboard contact sheet for the source video.",
    "- Additional reference images may follow as @Image3-@Image9; use them only for product/detail consistency if supplied.",
    `- Use only the matching storyboard area${panelRange ? ` (${panelRange})` : ""}${timeRange ? ` for ${timeRange}` : ""} as composition, camera rhythm, action order, and pacing reference.`,
    `- Do not generate a collage, grid, split-screen, border, panel number, frame label, or storyboard layout. The final output must be one normal full-screen ${aspectRatio} video clip.`,
  ].join("\n");
}

function toProviderModel(model: unknown): string {
  if (!isSeedanceModel(model)) return String(model || "veo3.1-fast");
  return isSeedanceFastModel(model) ? "bytedance/seedance-2-fast" : "bytedance/seedance-2";
}

function resolveSeedanceProviderApiKey(): string {
  return (
    process.env.SEEDANCE_KIE_API_KEY?.trim() ||
    process.env.KIE_SEEDANCE_API_KEY?.trim() ||
    process.env.KIE_API_KEY?.trim() ||
    ""
  );
}

function getReferenceImageUrls(
  firstFrameUrl: string,
  storyboardGridUrl: string,
  params: Record<string, unknown>,
  options: { includeProductRefs: boolean; productImageUrl?: string | null },
): string[] {
  const urls: string[] = [];
  const push = (value: unknown) => {
    const url = cleanUrl(value);
    if (!options.includeProductRefs && options.productImageUrl && url === options.productImageUrl) return;
    if (url && !urls.includes(url) && urls.length < 9) urls.push(url);
  };

  push(firstFrameUrl);
  push(storyboardGridUrl);

  const subjectRefs = Array.isArray(params.subject_refs) ? params.subject_refs : [];
  for (const ref of subjectRefs) {
    if (!ref || typeof ref !== "object") continue;
    const record = ref as Record<string, unknown>;
    if (!options.includeProductRefs && String(record.type || "").trim() === "product") continue;
    push(record.url);
  }

  const extraRefs = Array.isArray(params.reference_image_urls)
    ? params.reference_image_urls
    : Array.isArray(params.referenceImageUrls)
      ? params.referenceImageUrls
      : [];
  for (const url of extraRefs) push(url);

  return urls;
}

function getSkeletonVideoReferenceImageUrls(firstFrameUrl: string): string[] {
  const url = cleanUrl(firstFrameUrl);
  return url ? [url] : [];
}

function getPositiveDurationSeconds(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampSeedanceDurationSeconds(value: unknown, fallback = 8): number {
  const parsed = Math.round(Number(value) || fallback);
  return Math.max(4, Math.min(15, parsed));
}

function getBillableDurationSeconds(model: unknown, duration: unknown): number {
  return isSeedanceModel(model)
    ? clampSeedanceDurationSeconds(duration, 0)
    : getPositiveDurationSeconds(duration, 1);
}

function getDefaultStoryboardVideoUnitCost(model: unknown): number {
  if (!isSeedanceModel(model)) return 3;
  return isSeedanceFastModel(model) ? 3 : 4;
}

async function getStoryboardVideoUnitCost(model: unknown): Promise<number> {
  const defaultAmount = getDefaultStoryboardVideoUnitCost(model);
  const configured = await getCreditCostForModel("storyboard_video", String(model || ""), defaultAmount);
  const amount = Math.floor(Number(configured) || 0);
  return amount > 0 ? amount : defaultAmount;
}

async function estimateStoryboardVideoCredits(
  model: unknown,
  segments: Array<{ duration: unknown }>,
): Promise<{ unitAmount: number; units: number; amount: number; billingMode: "duration_seconds" | "segments" }> {
  if (isSeedanceModel(model)) {
    const units = segments.reduce(
      (sum, segment) => sum + getBillableDurationSeconds(model, segment.duration),
      0,
    ) || 1;
    const unitAmount = await getStoryboardVideoUnitCost(model);
    return {
      unitAmount,
      units: Math.max(1, Math.ceil(units)),
      amount: unitAmount * Math.max(1, Math.ceil(units)),
      billingMode: "duration_seconds",
    };
  }

  const unitAmount = await getStoryboardVideoUnitCost(model);
  const units = Math.max(1, segments.length);
  return {
    unitAmount,
    units,
    amount: unitAmount * units,
    billingMode: "segments",
  };
}

function buildStoryboardVideoCreditCharges(
  model: unknown,
  segments: Array<{ id: string; duration: unknown }>,
  creditEstimate: { unitAmount: number; billingMode: "duration_seconds" | "segments" },
): Map<string, StoryboardVideoCreditCharge> {
  const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const chargedAt = new Date().toISOString();
  const charges = new Map<string, StoryboardVideoCreditCharge>();
  for (const segment of segments) {
    const units = creditEstimate.billingMode === "duration_seconds"
      ? getBillableDurationSeconds(model, segment.duration)
      : 1;
    const normalizedUnits = Math.max(1, Math.ceil(Number(units) || 1));
    charges.set(segment.id, {
      requestId,
      featureKey: "storyboard_video",
      modelKey: String(model || ""),
      unitAmount: creditEstimate.unitAmount,
      units: normalizedUnits,
      amount: creditEstimate.unitAmount * normalizedUnits,
      billingMode: creditEstimate.billingMode,
      chargedAt,
    });
  }
  return charges;
}

function parseKieTaskId(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data as Record<string, unknown>
    : null;
  return cleanText(data?.taskId) || cleanText(record.taskId) || cleanText(data?.id) || "";
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function createKieSeedanceTask(payload: {
  prompt: string;
  referenceImageUrls: string[];
  duration: number;
  aspectRatio: string;
  model: string;
  callbackUrl: string;
  providerApiKey: string;
}) {
  const requestBody = {
    model: payload.model,
    input: {
      prompt: payload.prompt,
      reference_image_urls: payload.referenceImageUrls,
      reference_video_urls: [],
      reference_audio_urls: [],
      generate_audio: false,
      resolution: "720p",
      aspect_ratio: payload.aspectRatio,
      duration: payload.duration,
      web_search: false,
      nsfw_checker: true,
    },
    callBackUrl: payload.callbackUrl,
  };

  const response = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.providerApiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`KIE Seedance createTask failed: ${response.status} ${JSON.stringify(result).slice(0, 500)}`);
  }

  const taskId = parseKieTaskId(result);
  if (!taskId) {
    throw new Error(`KIE Seedance createTask did not return taskId: ${JSON.stringify(result).slice(0, 500)}`);
  }

  return { taskId, requestBody, rawResponse: result };
}

/**
 * Batch trigger video generation for storyboard segments
 * POST /api/storyboard/[id]/generate-videos
 *
 * Seedance calls KIE directly and receives KIE callbacks on /api/webhook/storyboard-video.
 * Other video models still use the legacy n8n webhook.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, apiKey: contextApiKey } = await getRequestUserContext(req, {
      allowDefaultApiKey: false,
    });
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const {
      segmentIds,
      model = "veo3.1-fast",
      allowTextVideo = false,
    } = body;
    const requestSource = body.source || body.requestSource || body.request_source;
    const quoteOnly = body.quoteOnly === true || body.quote_only === true || body.dryRun === true || body.dry_run === true;
    const requestedAspectRatio = normalizeVideoAspectRatio(body.aspectRatio || body.aspect_ratio || body.ratio) || "9:16";

    // 1. Verify task
    const task = await prisma.storyboardTask.findUnique({
      where: { id },
      include: { product: true, character: true },
    });
    if (!task || (task.userId && task.userId !== userId)) {
      return NextResponse.json({ error: "Task not found or unauthorized" }, { status: 404 });
    }
    const forceSeedanceRoute = isSmartRemixVideoStageSource(requestSource) || isSmartRemixStoryboardTask(task);
    const effectiveModel = forceSeedanceRoute ? normalizeSeedanceVideoModel(model) : model;
    const providerRoute = isSeedanceModel(effectiveModel) ? "kie" : "n8n";

    console.log("[generate-videos] Request:", {
      task_id: id,
      segmentIds,
      model: effectiveModel,
      requestedModel: model,
      source: requestSource,
      forceSeedanceRoute,
      providerRoute,
      userId,
    });

    // 2. Get segments
    const hasSpecificSegments = Array.isArray(segmentIds) && segmentIds.length > 0;
    const allowTextOnly = Boolean(allowTextVideo);
    const whereClause: Prisma.StoryboardSegmentWhereInput = { taskId: id };
    if (hasSpecificSegments) {
      whereClause.id = { in: segmentIds };
    } else {
      whereClause.status = allowTextOnly ? { not: "VIDEO_READY" } : "IMAGE_READY";
    }

    const segments = await prisma.storyboardSegment.findMany({
      where: whereClause,
      orderBy: { order: "asc" },
    });

    if (segments.length === 0) {
      return NextResponse.json(
        { error: allowTextOnly ? "No storyboard segments available for video generation" : "No segments with images ready found" },
        { status: 404 }
      );
    }

    const targetSegments = allowTextOnly ? segments.filter((s) => !s.generatedVideo) : segments;
    if (targetSegments.length === 0) {
      return NextResponse.json({ error: "All selected segments already have generated videos" }, { status: 404 });
    }

    const creditEstimate = await estimateStoryboardVideoCredits(effectiveModel, targetSegments);
    const creditCharges = buildStoryboardVideoCreditCharges(effectiveModel, targetSegments, creditEstimate);
    if (quoteOnly) {
      return NextResponse.json({
        success: true,
        quoteOnly: true,
        task_id: id,
        total: targetSegments.length,
        triggered: 0,
        failed: 0,
        model: effectiveModel,
        providerRoute,
        creditEstimate,
      });
    }

    // 3. Resolve API key
    const apiKey = await resolveUserApiKey({
      userId,
      explicitApiKey: contextApiKey,
      allowDefaultFallback: true,
    });
    if (!apiKey) {
      return NextResponse.json(
        { error: "API key not configured", message: "请先在个人资料中绑定 API Key 后再发起生视频任务。" },
        { status: 400 }
      );
    }
    const seedanceProviderApiKey = providerRoute === "kie" ? resolveSeedanceProviderApiKey() : "";
    if (forceSeedanceRoute && providerRoute !== "kie") {
      return NextResponse.json(
        {
          error: "Invalid provider route",
          message: "智能复刻第三阶段只能直连 KIE Seedance，禁止回退到 n8n。",
        },
        { status: 400 }
      );
    }
    if (providerRoute === "kie" && !seedanceProviderApiKey) {
      return NextResponse.json(
        {
          error: "Seedance provider key not configured",
          message: "Seedance 2.0 需要配置 KIE_API_KEY 或 SEEDANCE_KIE_API_KEY 后才能发起。",
        },
        { status: 400 }
      );
    }
    const adminToken = (process.env.ADMIN_TOKEN || "").trim();
    if (providerRoute === "kie" && !adminToken) {
      return NextResponse.json(
        {
          error: "Admin token not configured",
          message: "Seedance 2.0 直连回调需要配置 ADMIN_TOKEN。",
        },
        { status: 400 }
      );
    }

    // 4. Resolve callback URL. The n8n webhook is resolved only inside the non-Seedance branch.
    const callbackBase = (
      process.env.N8N_CALLBACK_BASE_URL ||
      process.env.CANVAS_VIDEO_POLL_CALLBACK_BASE_URL ||
      "https://atomx.top"
    ).replace(/\/+$/, "");
    const callbackUrl = `${callbackBase}/api/webhook/storyboard-video`;

    // 4a. Deduct credits upfront
    try {
      await deductCredits(apiKey, {
        amount: creditEstimate.amount,
        workflowId: "flow_storyboard_video",
        workflowName: "分镜视频生成",
        reason: "storyboard_video",
      });
      logCreditUsage({
        featureKey: providerRoute === "kie"
          ? `storyboard_video:${String(effectiveModel || "")}`
          : "storyboard_video",
        userId,
        amount: creditEstimate.amount,
        success: true,
      });
    } catch (error) {
      console.error("[generate-videos] Failed to deduct credits:", error);
      logCreditUsage({ featureKey: "storyboard_video", userId, success: false, errorMessage: error instanceof Error ? error.message : "Unknown" });
      return NextResponse.json(
        { error: "积分不足，请充值后重试", message: error instanceof Error ? error.message : "扣积分失败" },
        { status: 402 }
      );
    }

    // 5. Fire provider for each segment. Seedance 2.0 calls KIE directly; other models keep the legacy n8n path.
    const breakdown = task.detailedBreakdown as Record<string, unknown> | null;
    const pipelineKey = String(breakdown?.pipeline_key || breakdown?.pipelineKey || "");
    const style = (breakdown?.style as Record<string, unknown>) ?? {};
    const storyboardGridUrl = getStoryboardGridUrl(task as unknown as Record<string, unknown>, breakdown);

    const styleProfileRaw = (style.styleProfileText as string) ?? "";
    let styleProfileJson: unknown = null;
    if (styleProfileRaw) {
      try {
        styleProfileJson = JSON.parse(styleProfileRaw);
      } catch {
        styleProfileJson = styleProfileRaw; // fallback: pass as-is
      }
    }

    const triggers = targetSegments.map(async (segment) => {
      const generationParams = segment.generationParams &&
        typeof segment.generationParams === "object" &&
        !Array.isArray(segment.generationParams)
        ? segment.generationParams as Record<string, unknown>
        : {};
      const creditCharge = creditCharges.get(segment.id);
      const clipPrompt = typeof generationParams.clip_video_prompt === "string"
        ? generationParams.clip_video_prompt.trim()
        : typeof generationParams.clipVideoPrompt === "string"
          ? generationParams.clipVideoPrompt.trim()
          : "";
      const basePrompt = ensureNoBgmPrompt(clipPrompt || segment.videoPrompt || segment.visualDescription || "");
      const firstFrameUrl = cleanUrl(segment.generatedImage) || cleanUrl(generationParams.reference_frame_url);
      const hasProduct = readBooleanFlag(generationParams.has_product ?? generationParams.hasProduct);
      const isSkeletonVideo = pipelineKey === "skeleton_video";
      const includeProductRefs = pipelineKey === "skeleton_video" ? hasProduct === true : hasProduct !== false;
      const productImageUrl = Array.isArray(generationParams.subject_refs)
        ? generationParams.subject_refs
          .map((ref) => (ref && typeof ref === "object" ? ref as Record<string, unknown> : null))
          .find((ref) => String(ref?.type || "").trim() === "product")?.url
        : null;
      const finalPrompt = !isSkeletonVideo && isSeedanceModel(effectiveModel) && firstFrameUrl && storyboardGridUrl
        ? withSeedanceStoryboardReference(basePrompt, generationParams, storyboardGridUrl, requestedAspectRatio)
        : basePrompt;
      const rawSegmentDuration = Number.isFinite(Number(segment.duration)) && Number(segment.duration) > 0
        ? Math.round(Number(segment.duration) * 1000) / 1000
        : 8;
      const segmentDuration = providerRoute === "kie"
        ? clampSeedanceDurationSeconds(rawSegmentDuration)
        : rawSegmentDuration;

      const payload = {
        segment_id: segment.id,
        task_id: id,
        prompt: finalPrompt,
        image_url: firstFrameUrl || null,
        first_frame_url: firstFrameUrl || null,
        storyboard_grid_url: storyboardGridUrl || null,
        storyboardGridUrl: storyboardGridUrl || null,
        reference_image_urls: providerRoute === "kie"
          ? isSkeletonVideo
            ? getSkeletonVideoReferenceImageUrls(firstFrameUrl)
            : getReferenceImageUrls(firstFrameUrl, storyboardGridUrl, generationParams, { includeProductRefs, productImageUrl: cleanUrl(productImageUrl) })
          : [],
        time_range: segment.timeRange || null,
        timeRange: segment.timeRange || null,
        duration: segmentDuration,
        duration_sec: segmentDuration,
        durationSec: segmentDuration,
        duration_seconds: segmentDuration,
        durationSeconds: segmentDuration,
        target_duration_seconds: segmentDuration,
        targetDurationSeconds: segmentDuration,
        video_duration_seconds: segmentDuration,
        videoDurationSeconds: segmentDuration,
        model: toProviderModel(effectiveModel),
        requested_model: effectiveModel,
        requestedModel: effectiveModel,
        aspect_ratio: requestedAspectRatio,
        aspectRatio: requestedAspectRatio,
        callback_url: callbackUrl,
        api_key: apiKey,
        provider_api_key: seedanceProviderApiKey || undefined,
        providerApiKey: seedanceProviderApiKey || undefined,
        admin_token: adminToken || undefined,
        creative_style_raw: (style.creativeStyleRaw as string) ?? "",
        creative_style_norm: (style.creativeStyleNorm as string) ?? "写实",
        style_profile_json: styleProfileJson,
      };

      try {
        if (providerRoute === "kie") {
          const kieCallbackUrl = appendQueryParams(callbackUrl, {
            segment_id: segment.id,
            task_id: id,
            model: toProviderModel(effectiveModel),
            admin_token: adminToken,
          });
          const kieTask = await createKieSeedanceTask({
            prompt: finalPrompt,
            referenceImageUrls: payload.reference_image_urls,
            duration: segmentDuration,
            aspectRatio: requestedAspectRatio,
            model: toProviderModel(effectiveModel),
            callbackUrl: kieCallbackUrl,
            providerApiKey: seedanceProviderApiKey,
          });

          await prisma.storyboardSegment.update({
            where: { id: segment.id },
            data: {
              status: "VIDEO_GENERATING",
              videoGenerationModel: effectiveModel,
              generationParams: mergeStoryboardVideoCreditCharge({
                ...generationParams,
                provider: "kie",
                provider_task_id: kieTask.taskId,
                provider_model: toProviderModel(effectiveModel),
                provider_callback_url: kieCallbackUrl,
                provider_request: kieTask.requestBody,
              }, creditCharge),
            },
          });

          console.log(`[generate-videos] Triggered KIE Seedance for segment ${segment.id}`);
          return { segment_id: segment.id, success: true, provider: "kie", provider_task_id: kieTask.taskId };
        }

        if (forceSeedanceRoute) {
          throw new Error("智能复刻第三阶段禁止调用 n8n");
        }

        const webhookUrl =
          process.env.N8N_VIDEO_GEN_WEBHOOK?.trim() ||
          "https://hooks.atomx.top/webhook/storyboard_video";
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`n8n webhook failed: ${response.status}`);
        }

        await prisma.storyboardSegment.update({
          where: { id: segment.id },
          data: {
            status: "VIDEO_GENERATING",
            videoGenerationModel: effectiveModel,
            generationParams: mergeStoryboardVideoCreditCharge(generationParams, creditCharge),
          },
        });

        console.log(`[generate-videos] Triggered n8n for segment ${segment.id}`);
        return { segment_id: segment.id, success: true };
      } catch (error) {
        console.error(`[generate-videos] Failed for segment ${segment.id}:`, error);
        await prisma.storyboardSegment.update({
          where: { id: segment.id },
          data: {
            status: "VIDEO_FAILED",
            generationParams: mergeStoryboardVideoCreditCharge({
              ...generationParams,
              video_trigger_error: error instanceof Error ? error.message : "Unknown error",
            }, creditCharge),
          },
        }).catch(() => {});
        if (creditCharge) {
          await refundStoryboardVideoCreditCharge({
            segmentId: segment.id,
            apiKey,
            userId,
            reason: "storyboard_video_trigger_failed",
            errorMessage: error instanceof Error ? error.message : "Unknown error",
          }).catch((refundError) => {
            console.error(`[generate-videos] Failed to refund segment ${segment.id}:`, refundError);
          });
        }
        return {
          segment_id: segment.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    const results = await Promise.all(triggers);
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    if (successCount > 0) {
      await prisma.storyboardTask.update({
        where: { id },
        data: { status: "VIDEO_GENERATING", progress: 65, videoModel: effectiveModel },
      });
    }

    console.log("[generate-videos] Batch complete:", {
      task_id: id,
      total: targetSegments.length,
      success: successCount,
      failures: failureCount,
      model: effectiveModel,
    });

    return NextResponse.json(
      {
        success: failureCount === 0,
        partial: successCount > 0 && failureCount > 0,
        task_id: id,
        total: targetSegments.length,
        triggered: successCount,
        failed: failureCount,
        model: effectiveModel,
        providerRoute,
        creditEstimate,
        results,
        message:
          successCount === 0 ? "所有分镜生视频触发失败" : failureCount > 0 ? "部分分镜触发失败" : undefined,
      },
      { status: successCount === 0 ? 502 : 200 }
    );
  } catch (error) {
    console.error("[generate-videos] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
