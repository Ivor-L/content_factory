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

function toVolcengineSeedanceModel(model: unknown): string {
  const fastOverride = process.env.VOLCENGINE_SEEDANCE_FAST_MODEL?.trim();
  const standardOverride = process.env.VOLCENGINE_SEEDANCE_MODEL?.trim();
  return isSeedanceFastModel(model)
    ? fastOverride || "doubao-seedance-2-0-fast-260128"
    : standardOverride || "doubao-seedance-2-0-260128";
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
    "- 图片1 is the current clip first frame or product-replaced reference frame.",
    "- 图片2 is the full storyboard contact sheet for the source video.",
    "- Additional reference images may follow as 图片3-图片9; use them only for product/detail consistency if supplied.",
    `- Use only the matching storyboard area${panelRange ? ` (${panelRange})` : ""}${timeRange ? ` for ${timeRange}` : ""} as composition, camera rhythm, action order, and pacing reference.`,
    `- Do not generate a collage, grid, split-screen, border, panel number, frame label, or storyboard layout. The final output must be one normal full-screen ${aspectRatio} video clip.`,
  ].join("\n");
}

function toProviderModel(model: unknown): string {
  if (!isSeedanceModel(model)) return String(model || "veo3.1-fast");
  return toVolcengineSeedanceModel(model);
}

function resolveVolcengineArkApiKey(): string {
  return (
    process.env.VOLCENGINE_ARK_API_KEY?.trim() ||
    process.env.SEEDANCE_ARK_API_KEY?.trim() ||
    process.env.ARK_API_KEY?.trim() ||
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

function durationFromTimeRange(value: unknown): number {
  const text = String(value || "").trim();
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-~–—]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;
  const start = toSeconds(match[1], match[2], match[3]);
  const end = toSeconds(match[4], match[5], match[6]);
  return end > start ? Math.round((end - start) * 1000) / 1000 : 0;
}

function toSeconds(first: string, second: string, third?: string): number {
  const a = Number(first);
  const b = Number(second);
  const c = third === undefined ? 0 : Number(third);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return 0;
  return third === undefined ? a * 60 + b : a * 3600 + b * 60 + c;
}

function getBillableDurationSeconds(model: unknown, duration: unknown): number {
  return isSeedanceModel(model)
    ? clampSeedanceDurationSeconds(duration, 0)
    : getPositiveDurationSeconds(duration, 1);
}

function resolveSegmentDurationSeconds(segment: { duration: unknown; timeRange?: unknown }, params?: Record<string, unknown>): number {
  const fromClipRange = durationFromTimeRange(params?.clip_time_range ?? params?.clipTimeRange);
  if (fromClipRange > 0) return fromClipRange;
  const fromSegmentRange = durationFromTimeRange(segment.timeRange);
  if (fromSegmentRange > 0) return fromSegmentRange;
  const parsed = Number(segment.duration);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) / 1000 : 8;
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

function parseVolcengineTaskId(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? record.data as Record<string, unknown>
    : null;
  return cleanText(data?.taskId) || cleanText(record.taskId) || cleanText(record.id) || cleanText(data?.id) || "";
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function createVolcengineSeedanceTask(payload: {
  prompt: string;
  referenceImageUrls: string[];
  duration: number;
  aspectRatio: string;
  model: string;
  callbackUrl: string;
  providerApiKey: string;
  metadata: Record<string, string>;
}) {
  const requestBody = {
    model: payload.model,
    callback_url: payload.callbackUrl,
    content: [
      {
        type: "text",
        text: payload.prompt,
      },
      ...payload.referenceImageUrls.map((url) => ({
        type: "image_url",
        image_url: { url },
        role: "reference_image",
      })),
    ],
    generate_audio: false,
    resolution: "720p",
    ratio: payload.aspectRatio,
    duration: payload.duration,
    watermark: false,
    metadata: payload.metadata,
  };

  const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.providerApiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new VolcengineSeedanceCreateError(response.status, result, requestBody);
  }

  const taskId = parseVolcengineTaskId(result);
  if (!taskId) {
    throw new Error(`Volcengine Seedance create task did not return task id: ${JSON.stringify(result).slice(0, 500)}`);
  }

  return { taskId, requestBody, rawResponse: result };
}

class VolcengineSeedanceCreateError extends Error {
  status: number;
  responseBody: unknown;
  requestBody: Record<string, unknown>;

  constructor(status: number, responseBody: unknown, requestBody: Record<string, unknown>) {
    super(`Volcengine Seedance create task failed: ${status} ${JSON.stringify(responseBody).slice(0, 500)}`);
    this.name = "VolcengineSeedanceCreateError";
    this.status = status;
    this.responseBody = responseBody;
    this.requestBody = requestBody;
  }
}

function getVolcengineErrorCode(value: unknown): string {
  const record = asRecord(value);
  const error = asRecord(record.error);
  return String(error.code || record.code || "").trim();
}

function getVolcengineErrorMessage(value: unknown): string {
  const record = asRecord(value);
  const error = asRecord(record.error);
  return String(error.message || record.message || "").trim();
}

function translateVolcengineErrorCode(code: string): string {
  const normalized = code.trim();
  const exact: Record<string, string> = {
    MissingParameter: "请求缺少必要参数，请查阅 API 文档。",
    InvalidParameter: "请求包含非法参数，请查阅 API 文档。",
    "InvalidEndpoint.ClosedEndpoint": "推理接入点已关闭或暂时不可用，请稍后重试或联系管理员。",
    SensitiveContentDetected: "输入文本可能包含敏感信息，请更换 prompt 后重试。",
    "SensitiveContentDetected.SevereViolation": "输入文本可能包含严重违规信息，请更换 prompt 后重试。",
    "SensitiveContentDetected.Violence": "输入文本可能包含激进行为相关信息，请更换 prompt 后重试。",
    InputTextSensitiveContentDetected: "输入文本可能包含敏感信息，请更换后重试。",
    InputImageSensitiveContentDetected: "输入图像可能包含敏感信息，请更换后重试。",
    InputVideoSensitiveContentDetected: "输入视频可能包含敏感信息，请更换后重试。",
    InputAudioSensitiveContentDetected: "输入音频可能包含敏感信息，请更换后重试。",
    OutputTextSensitiveContentDetected: "生成的文字可能包含敏感信息，请更换输入内容后重试。",
    OutputImageSensitiveContentDetected: "生成的图像可能包含敏感信息，请更换输入内容后重试。",
    OutputVideoSensitiveContentDetected: "生成的视频可能包含敏感信息，请更换输入内容后重试。",
    OutputAudioSensitiveContentDetected: "生成的音频可能包含敏感信息，请更换输入内容后重试。",
    "InputTextSensitiveContentDetected.PolicyViolation": "输入文本可能涉及版权限制，请更换后重试。",
    "InputImageSensitiveContentDetected.PolicyViolation": "输入图片可能涉及版权限制，请更换后重试。",
    "InputVideoSensitiveContentDetected.PolicyViolation": "输入视频可能涉及版权限制，请更换后重试。",
    "InputAudioSensitiveContentDetected.PolicyViolation": "输入音频可能涉及版权限制，请更换后重试。",
    "OutputVideoSensitiveContentDetected.PolicyViolation": "生成的视频可能涉及版权限制，请更换输入内容后重试。",
    "InputImageSensitiveContentDetected.PrivacyInformation": "输入图片可能包含真人，请更换后重试。",
    "InputVideoSensitiveContentDetected.PrivacyInformation": "输入视频可能包含真人，请更换后重试。",
    InputTextRiskDetection: "火山引擎风险识别检测到输入文本可能包含敏感信息，请更换后重试。",
    InputImageRiskDetection: "火山引擎风险识别检测到输入图片可能包含敏感信息，请更换后重试。",
    OutputTextRiskDetection: "火山引擎风险识别检测到输出文本可能包含敏感信息，请更换后重试。",
    OutputImageRiskDetection: "火山引擎风险识别检测到输出图片可能包含敏感信息，请更换后重试。",
    ContentSecurityDetectionError: "火山引擎风险识别服务请求失败，请稍后重试。",
    AuthenticationError: "火山方舟 API Key 无效或缺失，请检查密钥配置。",
    "OperationDenied.ServiceNotOpen": "模型服务不可用，请前往火山方舟控制台开通对应模型服务。",
    OperationDenied_ServiceNotOpen: "模型服务不可用，请前往火山方舟控制台开通对应模型服务。",
    OperationDenied_ServiceOverdue: "账号账单已逾期，请前往火山费用中心充值后重试。",
    AccountOverdueError: "当前账号欠费，请前往火山费用中心充值后重试。",
    AccessDenied: "没有访问该资源的权限，请检查权限设置或联系管理员添加白名单。",
    InvalidEndpointOrModel_NotFound: "模型或推理接入点不存在，或当前账号无权访问。",
    "InvalidEndpointOrModel.NotFound": "模型或推理接入点不存在，或当前账号无权访问。",
    ModelNotOpen: "当前账号暂未开通该模型服务，请前往火山方舟控制台开通。",
    "InvalidEndpointOrModel.ModelIDAccessDisabled": "当前账号不允许使用模型 ID 调用，请使用有权限的推理接入点 ID。",
    RateLimitExceeded_EndpointRPMExceeded: "推理接入点 RPM 限制已超出，请稍后重试。",
    "RateLimitExceeded.EndpointRPMExceeded": "推理接入点 RPM 限制已超出，请稍后重试。",
    RateLimitExceeded_EndpointTPMExceeded: "推理接入点 TPM 限制已超出，请稍后重试。",
    "RateLimitExceeded.EndpointTPMExceeded": "推理接入点 TPM 限制已超出，请稍后重试。",
    ModelAccountRpmRateLimitExceeded: "账号模型 RPM 限制已超出，请稍后重试。",
    ModelAccountTpmRateLimitExceeded: "账号模型 TPM 限制已超出，请稍后重试。",
    APIAccountRpmRateLimitExceeded: "当前账号该接口 RPM 限制已超出，请稍后重试。",
    ModelAccountIpmRateLimitExceeded: "账号模型 IPM 限制已超出，请稍后重试。",
    QuotaExceeded: "当前额度或排队任务数已超出限制，请稍后重试或开通模型服务。",
    ServerOverloaded: "服务资源紧张，请稍后重试。",
    RequestBurstTooFast: "请求量激增触发系统保护，请放缓请求频率后重试。",
    SetLimitExceeded: "当前账号已达到模型推理限额，请前往火山方舟控制台调整限额或关闭安心体验模式。",
    InflightBatchsizeExceeded: "当前并发数已达到限制，请降低并发或充值解锁更大并发额度。",
    AccountRateLimitExceeded: "请求过于频繁，请降低请求频率后重试。",
    InternalServiceError: "火山内部系统异常，请稍后重试。",
  };
  if (exact[normalized]) return exact[normalized];
  if (normalized.startsWith("InvalidParameter.")) return "请求参数值不合法，请检查参数后重试。";
  if (normalized.startsWith("MissingParameter.")) return "缺少必要请求参数，请确认参数后重试。";
  if (normalized.includes("SensitiveContentDetected")) return "内容可能包含敏感信息，请更换输入内容后重试。";
  if (normalized.includes("RiskDetection")) return "火山引擎风险识别检测到内容可能包含敏感信息，请更换后重试。";
  if (normalized.includes("RateLimitExceeded")) return "请求频率或额度限制已超出，请稍后重试。";
  return "";
}

function formatProviderError(error: unknown): string {
  if (error instanceof VolcengineSeedanceCreateError) {
    const code = getVolcengineErrorCode(error.responseBody);
    const cnMessage = translateVolcengineErrorCode(code);
    const rawMessage = getVolcengineErrorMessage(error.responseBody);
    if (cnMessage) return code ? `${cnMessage}（${code}）` : cnMessage;
    if (rawMessage) return `火山方舟调用失败：${rawMessage}`;
  }
  return error instanceof Error ? error.message : "Unknown error";
}

function getProviderFailureDebug(error: unknown, fallbackRequest: Record<string, unknown>): Record<string, unknown> {
  if (error instanceof VolcengineSeedanceCreateError) {
    return {
      provider_http_status: error.status,
      provider_error_code: getVolcengineErrorCode(error.responseBody) || null,
      provider_error_message: getVolcengineErrorMessage(error.responseBody) || null,
      provider_error_response: error.responseBody,
      provider_request: error.requestBody,
    };
  }
  return {
    provider_request: fallbackRequest,
  };
}

function summarizeTriggerFailures(results: Array<{ success?: boolean; error?: string }>): string | undefined {
  const firstError = results.find((result) => !result.success && result.error)?.error;
  if (!firstError) return undefined;
  return firstError.replace(/\s+/g, " ").slice(0, 180);
}

/**
 * Batch trigger video generation for storyboard segments
 * POST /api/storyboard/[id]/generate-videos
 *
 * Seedance calls Volcengine Ark directly and receives callbacks on /api/webhook/storyboard-video.
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
    const providerRoute = isSeedanceModel(effectiveModel) ? "volcengine" : "n8n";

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
    const seedanceProviderApiKey = providerRoute === "volcengine" ? resolveVolcengineArkApiKey() : "";
    if (forceSeedanceRoute && providerRoute !== "volcengine") {
      return NextResponse.json(
        {
          error: "Invalid provider route",
          message: "智能复刻第三阶段只能直连火山 Seedance，禁止回退到 n8n。",
        },
        { status: 400 }
      );
    }
    if (providerRoute === "volcengine" && !seedanceProviderApiKey) {
      return NextResponse.json(
        {
          error: "Seedance provider key not configured",
          message: "Seedance 2.0 需要配置 VOLCENGINE_ARK_API_KEY 或 ARK_API_KEY 后才能发起。",
        },
        { status: 400 }
      );
    }
    const adminToken = (process.env.ADMIN_TOKEN || "").trim();
    if (providerRoute === "volcengine" && !adminToken) {
      return NextResponse.json(
        {
          error: "Admin token not configured",
          message: "Seedance 2.0 火山回调需要配置 ADMIN_TOKEN。",
        },
        { status: 400 }
      );
    }

    const callbackBase = (
      process.env.N8N_CALLBACK_BASE_URL ||
      process.env.CANVAS_VIDEO_POLL_CALLBACK_BASE_URL ||
      "https://atomx.top"
    ).replace(/\/+$/, "");
    const callbackUrl = `${callbackBase}/api/webhook/storyboard-video?admin_token=${encodeURIComponent(adminToken)}`;

    // 4. Deduct credits upfront
    try {
      await deductCredits(apiKey, {
        amount: creditEstimate.amount,
        workflowId: "flow_storyboard_video",
        workflowName: "分镜视频生成",
        reason: "storyboard_video",
      });
      logCreditUsage({
        featureKey: providerRoute === "volcengine"
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

    // 5. Fire provider for each segment. Seedance 2.0 calls Volcengine Ark directly; other models keep the legacy n8n path.
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
      const rawSegmentDuration = resolveSegmentDurationSeconds(segment, generationParams);
      const segmentDuration = providerRoute === "volcengine"
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
        reference_image_urls: providerRoute === "volcengine"
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
        api_key: apiKey,
        provider_api_key: seedanceProviderApiKey || undefined,
        providerApiKey: seedanceProviderApiKey || undefined,
        creative_style_raw: (style.creativeStyleRaw as string) ?? "",
        creative_style_norm: (style.creativeStyleNorm as string) ?? "写实",
        style_profile_json: styleProfileJson,
      };

      try {
        if (providerRoute === "volcengine") {
          const providerModel = toProviderModel(effectiveModel);
          const volcengineTask = await createVolcengineSeedanceTask({
            prompt: finalPrompt,
            referenceImageUrls: payload.reference_image_urls,
            duration: segmentDuration,
            aspectRatio: requestedAspectRatio,
            model: providerModel,
            callbackUrl,
            providerApiKey: seedanceProviderApiKey,
            metadata: {
              segment_id: segment.id,
              task_id: id,
              model: String(effectiveModel || ""),
              provider: "volcengine",
            },
          });

          await prisma.storyboardSegment.update({
            where: { id: segment.id },
            data: {
              status: "VIDEO_GENERATING",
              videoGenerationModel: effectiveModel,
              generationParams: mergeStoryboardVideoCreditCharge({
                ...generationParams,
                provider: "volcengine",
                provider_task_id: volcengineTask.taskId,
                provider_model: providerModel,
                provider_callback_url: callbackUrl,
                provider_request: volcengineTask.requestBody,
                provider_create_response: volcengineTask.rawResponse,
                provider_state: "submitted",
                provider_submitted_at: new Date().toISOString(),
              }, creditCharge),
            },
          });

          console.log(`[generate-videos] Triggered Volcengine Seedance for segment ${segment.id}`);
          return { segment_id: segment.id, success: true, provider: "volcengine", provider_task_id: volcengineTask.taskId, provider_model: providerModel };
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
        const providerErrorMessage = formatProviderError(error);
        const providerFailureDebug = getProviderFailureDebug(error, payload);
        console.error(`[generate-videos] Failed for segment ${segment.id}:`, error);
        await prisma.storyboardSegment.update({
          where: { id: segment.id },
          data: {
            status: "VIDEO_FAILED",
            generationParams: mergeStoryboardVideoCreditCharge({
              ...generationParams,
              video_trigger_error: providerErrorMessage,
              provider_state: "failed",
              provider_failed_at: new Date().toISOString(),
              provider_reference_image_urls: payload.reference_image_urls,
              provider_first_frame_url: firstFrameUrl || null,
              provider_storyboard_grid_url: storyboardGridUrl || null,
              ...providerFailureDebug,
            }, creditCharge),
          },
        }).catch(() => {});
        if (creditCharge) {
          await refundStoryboardVideoCreditCharge({
            segmentId: segment.id,
            apiKey,
            userId,
            reason: "storyboard_video_trigger_failed",
            errorMessage: providerErrorMessage,
          }).catch((refundError) => {
            console.error(`[generate-videos] Failed to refund segment ${segment.id}:`, refundError);
          });
        }
        return {
          segment_id: segment.id,
          success: false,
          error: providerErrorMessage,
          provider_error_code: providerFailureDebug.provider_error_code,
          reference_image_urls: payload.reference_image_urls,
        };
      }
    });

    const results = await Promise.all(triggers);
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;
    const firstFailure = summarizeTriggerFailures(results);

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

    return NextResponse.json({
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
        successCount === 0
          ? `所有分镜生视频触发失败${firstFailure ? `：${firstFailure}` : ""}`
          : failureCount > 0
            ? `部分分镜触发失败${firstFailure ? `：${firstFailure}` : ""}`
            : undefined,
    });
  } catch (error) {
    console.error("[generate-videos] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
