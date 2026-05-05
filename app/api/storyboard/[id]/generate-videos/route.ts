import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { resolveUserApiKey } from "@/lib/userApiKey";
import type { Prisma } from "@prisma/client";
import { deductCredits } from "@/lib/credits";
import { getCreditCost } from "@/lib/creditCosts";
import { logCreditUsage } from "@/lib/logCreditUsage";

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

/**
 * Batch trigger video generation for storyboard segments
 * POST /api/storyboard/[id]/generate-videos
 *
 * Calls n8n webhook which generates the video and POSTs back via callback_url.
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
    const requestedAspectRatio = normalizeVideoAspectRatio(body.aspectRatio || body.aspect_ratio || body.ratio) || "9:16";

    console.log("[generate-videos] Request:", { task_id: id, segmentIds, model, userId });

    // 1. Verify task
    const task = await prisma.storyboardTask.findUnique({
      where: { id },
      include: { product: true, character: true },
    });
    if (!task || (task.userId && task.userId !== userId)) {
      return NextResponse.json({ error: "Task not found or unauthorized" }, { status: 404 });
    }

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
    const seedanceProviderApiKey = isSeedanceModel(model) ? resolveSeedanceProviderApiKey() : "";
    if (isSeedanceModel(model) && !seedanceProviderApiKey) {
      return NextResponse.json(
        {
          error: "Seedance provider key not configured",
          message: "Seedance 2.0 需要配置 KIE_API_KEY 或 SEEDANCE_KIE_API_KEY 后才能发起。",
        },
        { status: 400 }
      );
    }

    // 4. Resolve webhook + callback URLs
    const webhookUrl =
      process.env.N8N_VIDEO_GEN_WEBHOOK?.trim() ||
      "https://hooks.atomx.top/webhook/storyboard_video";

    const callbackBase = (
      process.env.N8N_CALLBACK_BASE_URL ||
      process.env.CANVAS_VIDEO_POLL_CALLBACK_BASE_URL ||
      "https://atomx.top"
    ).replace(/\/+$/, "");
    const callbackUrl = `${callbackBase}/api/webhook/storyboard-video`;

    // 4a. Deduct credits upfront (per segment)
    try {
      const costPerSegment = await getCreditCost("storyboard_video", 1);
      const totalCost = costPerSegment * targetSegments.length;
      await deductCredits(apiKey, {
        amount: totalCost,
        workflowId: "flow_storyboard_video",
        workflowName: "分镜视频生成",
        reason: "storyboard_video",
      });
      logCreditUsage({ featureKey: "storyboard_video", userId, amount: totalCost, success: true });
    } catch (error) {
      console.error("[generate-videos] Failed to deduct credits:", error);
      logCreditUsage({ featureKey: "storyboard_video", userId, success: false, errorMessage: error instanceof Error ? error.message : "Unknown" });
      return NextResponse.json(
        { error: "积分不足，请充值后重试", message: error instanceof Error ? error.message : "扣积分失败" },
        { status: 402 }
      );
    }

    // 5. Fire n8n for each segment
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
      const basePrompt = ensureNoBgmPrompt(segment.videoPrompt || segment.visualDescription || "");
      const firstFrameUrl = cleanUrl(segment.generatedImage) || cleanUrl(generationParams.reference_frame_url);
      const hasProduct = readBooleanFlag(generationParams.has_product ?? generationParams.hasProduct);
      const includeProductRefs = pipelineKey === "skeleton_video" ? hasProduct === true : hasProduct !== false;
      const productImageUrl = Array.isArray(generationParams.subject_refs)
        ? generationParams.subject_refs
          .map((ref) => (ref && typeof ref === "object" ? ref as Record<string, unknown> : null))
          .find((ref) => String(ref?.type || "").trim() === "product")?.url
        : null;
      const finalPrompt = isSeedanceModel(model) && firstFrameUrl && storyboardGridUrl
        ? withSeedanceStoryboardReference(basePrompt, generationParams, storyboardGridUrl, requestedAspectRatio)
        : basePrompt;

      const payload = {
        segment_id: segment.id,
        task_id: id,
        prompt: finalPrompt,
        image_url: firstFrameUrl || null,
        first_frame_url: firstFrameUrl || null,
        storyboard_grid_url: storyboardGridUrl || null,
        storyboardGridUrl: storyboardGridUrl || null,
        reference_image_urls: isSeedanceModel(model)
          ? getReferenceImageUrls(firstFrameUrl, storyboardGridUrl, generationParams, { includeProductRefs, productImageUrl: cleanUrl(productImageUrl) })
          : [],
        time_range: segment.timeRange || null,
        duration: segment.duration || 8,
        model: toProviderModel(model),
        requested_model: model,
        requestedModel: model,
        aspect_ratio: requestedAspectRatio,
        aspectRatio: requestedAspectRatio,
        callback_url: callbackUrl,
        api_key: apiKey,
        provider_api_key: seedanceProviderApiKey || undefined,
        providerApiKey: seedanceProviderApiKey || undefined,
        admin_token: process.env.ADMIN_TOKEN,
        creative_style_raw: (style.creativeStyleRaw as string) ?? "",
        creative_style_norm: (style.creativeStyleNorm as string) ?? "写实",
        style_profile_json: styleProfileJson,
      };

      try {
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
          data: { status: "VIDEO_GENERATING", videoGenerationModel: model },
        });

        console.log(`[generate-videos] Triggered n8n for segment ${segment.id}`);
        return { segment_id: segment.id, success: true };
      } catch (error) {
        console.error(`[generate-videos] Failed for segment ${segment.id}:`, error);
        await prisma.storyboardSegment.update({
          where: { id: segment.id },
          data: { status: "VIDEO_FAILED" },
        }).catch(() => {});
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
        data: { status: "VIDEO_GENERATING", progress: 65, videoModel: model },
      });
    }

    console.log("[generate-videos] Batch complete:", {
      task_id: id,
      total: targetSegments.length,
      success: successCount,
      failures: failureCount,
      model,
    });

    return NextResponse.json(
      {
        success: failureCount === 0,
        partial: successCount > 0 && failureCount > 0,
        task_id: id,
        total: targetSegments.length,
        triggered: successCount,
        failed: failureCount,
        model,
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
