import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { resolveUserApiKey } from "@/lib/userApiKey";
import { deductCredits } from "@/lib/credits";
import { getCreditCostForModel } from "@/lib/creditCosts";
import { logCreditUsage } from "@/lib/logCreditUsage";

/**
 * Batch trigger image generation for storyboard segments
 * POST /api/storyboard/[id]/generate-images
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
      model = "image2",
    } = body;
    const requestedModel = String(model || "image2").trim() || "image2";

    console.log("[generate-images] Request:", {
      task_id: id,
      segmentIds,
      model: requestedModel,
      userId,
    });

    // 1. Verify task exists and belongs to user (if userId is set)
    const task = await prisma.storyboardTask.findUnique({
      where: { id },
      include: {
        product: true,
        character: true,
      },
    });

    if (!task || (task.userId && task.userId !== userId)) {
      return NextResponse.json(
        { error: "Task not found or unauthorized" },
        { status: 404 }
      );
    }

    // 2. Get segments to generate images for
    const hasSpecificSegments = Array.isArray(segmentIds) && segmentIds.length > 0;
    const whereClause: any = { taskId: id };

    if (hasSpecificSegments) {
      whereClause.id = { in: segmentIds };
    }

    const segments = await prisma.storyboardSegment.findMany({
      where: whereClause,
      orderBy: { order: "asc" },
    });

    if (segments.length === 0) {
      return NextResponse.json(
        { error: "No segments found" },
        { status: 404 }
      );
    }

    console.log("[generate-images] Triggering generation for segments:", {
      count: segments.length,
      model: requestedModel,
    });

    // 3. Resolve webhook URL (env first, then stable fallback)
    const webhookUrl =
      process.env.N8N_IMAGE_GEN_WEBHOOK?.trim() ||
      process.env.N8N_STORYBOARD_IMAGE_WEBHOOK?.trim() ||
      "https://hooks.atomx.top/webhook/storyboard-image-generate";

    // 4. Resolve api_key + trigger image generation for each segment
    const callbackBase = (
      process.env.N8N_CALLBACK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      req.nextUrl.origin
    ).replace(/\/+$/, "");
    const callbackUrl = `${callbackBase}/api/webhook/storyboard-image`;
    const apiKey = await resolveUserApiKey({
      userId,
      explicitApiKey: contextApiKey,
      allowDefaultFallback: false,
    });
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "API key not configured",
          message: "请先在个人资料中绑定 API Key 后再发起生图任务。",
        },
        { status: 400 }
      );
    }

    // 4a. Deduct credits upfront (per segment)
    try {
      const costPerSegment = await getCreditCostForModel("storyboard_image", requestedModel, 1);
      const totalCost = costPerSegment * segments.length;
      await deductCredits(apiKey, {
        amount: totalCost,
        workflowId: "flow_storyboard_image",
        workflowName: "分镜首帧图生成",
        reason: "storyboard_image",
      });
      logCreditUsage({ featureKey: "storyboard_image", userId, amount: totalCost, success: true });
    } catch (error) {
      console.error("[generate-images] Failed to deduct credits:", error);
      logCreditUsage({ featureKey: "storyboard_image", userId, success: false, errorMessage: error instanceof Error ? error.message : "Unknown" });
      return NextResponse.json(
        { error: "积分不足，请充值后重试", message: error instanceof Error ? error.message : "扣积分失败" },
        { status: 402 }
      );
    }

    // Helper: parse image fields that may be stored as JSON strings.
    function extractImageUrls(images: unknown): string[] {
      if (!images) return [];
      if (Array.isArray(images)) {
        return images.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
      }
      if (typeof images === "string") {
        try {
          const parsed = JSON.parse(images);
          return extractImageUrls(parsed);
        } catch {
          const trimmed = images.trim();
          return trimmed ? [trimmed] : [];
        }
      }
      return [];
    }

    function uniqueUrls(urls: Array<string | null | undefined>, limit: number): string[] {
      const seen = new Set<string>();
      const result: string[] = [];
      for (const url of urls) {
        const normalized = typeof url === "string" ? url.trim() : "";
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
        if (result.length >= limit) break;
      }
      return result;
    }

    function toStringArray(value: unknown): string[] {
      if (!Array.isArray(value)) return [];
      return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
    }

    function normalizeSubjectRefs(value: unknown): Array<{ type: string; url: string; label?: string }> {
      if (!Array.isArray(value)) return [];
      return value
        .map((item) => {
          const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
          return {
            type: String(record.type || "custom"),
            url: String(record.url || "").trim(),
            label: typeof record.label === "string" ? record.label : undefined,
          };
        })
        .filter((item) => item.url);
    }

    function asRecord(value: unknown): Record<string, unknown> | null {
      return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
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

    function normalizeAspectRatio(value: unknown): "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "" {
      const raw = String(value || "").trim().toLowerCase();
      if (!raw) return "";
      if (raw === "portrait" || raw === "vertical" || raw === "竖屏" || raw === "竖版") return "9:16";
      if (raw === "landscape" || raw === "horizontal" || raw === "横屏" || raw === "横版") return "16:9";
      if (raw === "square" || raw === "方图" || raw === "1/1" || raw === "1:1") return "1:1";
      if (raw === "3/4" || raw === "3:4") return "3:4";
      if (raw === "4/3" || raw === "4:3") return "4:3";
      if (raw === "9/16" || raw === "9:16") return "9:16";
      if (raw === "16/9" || raw === "16:9") return "16:9";
      return "";
    }

    function aspectRatioFromDimensions(width: unknown, height: unknown): "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "" {
      const w = Number(width);
      const h = Number(height);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "";
      const ratio = w / h;
      if (ratio < 0.68) return "9:16";
      if (ratio < 0.9) return "3:4";
      if (ratio <= 1.12) return "1:1";
      if (ratio <= 1.55) return "4:3";
      return "16:9";
    }

    function pickAspectRatioFromRecord(record: Record<string, unknown> | null | undefined): "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "" {
      if (!record) return "";
      const directKeys = [
        "image_aspect_ratio",
        "imageAspectRatio",
        "aspect_ratio",
        "aspectRatio",
        "source_aspect_ratio",
        "sourceAspectRatio",
        "reference_aspect_ratio",
        "referenceAspectRatio",
        "format",
      ];
      for (const key of directKeys) {
        const value = normalizeAspectRatio(record[key]);
        if (value) return value;
      }
      const dimensionPairs = [
        ["source_width", "source_height"],
        ["sourceWidth", "sourceHeight"],
        ["reference_width", "reference_height"],
        ["referenceWidth", "referenceHeight"],
        ["video_width", "video_height"],
        ["videoWidth", "videoHeight"],
        ["width", "height"],
      ] as const;
      for (const [widthKey, heightKey] of dimensionPairs) {
        const value = aspectRatioFromDimensions(record[widthKey], record[heightKey]);
        if (value) return value;
      }
      return "";
    }

    function sizeFromAspectRatio(value: string): "1024x1024" | "1536x1024" | "1024x1536" {
      if (value === "16:9" || value === "4:3") return "1536x1024";
      if (value === "9:16" || value === "3:4") return "1024x1536";
      return "1024x1024";
    }

    function getModelCapabilities(value: unknown): Record<string, unknown> {
      const normalized = String(value || "").trim().toLowerCase();
      if (normalized === "image2" || normalized.includes("gpt-image-2")) {
        return {
          provider: "image2",
          supports_multi_image: true,
          max_reference_images: 8,
          preferred_input_field: "images",
        };
      }
      if (normalized.includes("banana") || normalized.includes("gemini")) {
        return {
          provider: "gemini-image",
          supports_multi_image: true,
          max_reference_images: 5,
          preferred_input_field: "contents.parts.inline_data",
        };
      }
      return {
        provider: "generic-image",
        supports_multi_image: true,
        max_reference_images: 5,
        preferred_input_field: "images",
      };
    }

    const taskLevelProductImages = extractImageUrls(task.product?.images);
    const taskLevelProductImage = taskLevelProductImages[0] || null;
    const taskLevelCharacterImage =
      typeof task.character?.avatar === "string" && task.character.avatar.trim()
        ? task.character.avatar.trim()
        : null;
    const taskDetailedBreakdown =
      task.detailedBreakdown && typeof task.detailedBreakdown === "object" && !Array.isArray(task.detailedBreakdown)
        ? task.detailedBreakdown as Record<string, unknown>
        : {};
    const pipelineKey = String(taskDetailedBreakdown.pipeline_key || taskDetailedBreakdown.pipelineKey || "");
    const taskMetadata = asRecord(taskDetailedBreakdown.metadata);
    const workflowData = asRecord(taskDetailedBreakdown.workflow_data) || asRecord(taskDetailedBreakdown.workflowData) || taskDetailedBreakdown;
    const sourceAnalysis = asRecord(workflowData.source_video_analysis) || asRecord(workflowData.sourceVideoAnalysis);
    const inferredAspectRatio =
      pickAspectRatioFromRecord(taskMetadata) ||
      pickAspectRatioFromRecord(sourceAnalysis) ||
      pickAspectRatioFromRecord(workflowData) ||
      pickAspectRatioFromRecord(taskDetailedBreakdown);
    const requestAspectRatio = normalizeAspectRatio(body.aspectRatio || body.aspect_ratio || body.ratio);
    const aspectRatio = requestAspectRatio || inferredAspectRatio || (pipelineKey === "viral_clone" ? "9:16" : "16:9");
    const allowCharacterReference = pipelineKey === "skeleton_video";
    const modelCapabilities = getModelCapabilities(requestedModel);
    const maxReferenceImages = Number(modelCapabilities.max_reference_images || 5) || 5;

    const triggers = segments.map(async (segment) => {
      // Replace [PRODUCT] placeholder in prompt
      let prompt = segment.imagePrompt || segment.visualDescription || "";
      if (task.product?.name) {
        prompt = prompt.replace(/\[PRODUCT\]/g, task.product.name);
      }

      // Extract per-segment refs from generationParams, fall back to task-level
      const generationParams = segment.generationParams as Record<string, any> | null;
      const generationParamsPatch = { ...(generationParams || {}) };
      const currentImageUrl = typeof segment.generatedImage === "string" ? segment.generatedImage.trim() : "";
      if (currentImageUrl) {
        generationParamsPatch.image_history = uniqueUrls([
          currentImageUrl,
          ...toStringArray(generationParamsPatch.image_history),
        ], 20);
      }
      const referenceFrameUrl = generationParams?.reference_frame_url || null;
      const subjectRefs = normalizeSubjectRefs(generationParams?.subject_refs);
      const productRef = subjectRefs.find((r) => r.type === "product");
      const characterRef = subjectRefs.find((r) => r.type === "character");
      const hasPersonFlag = generationParams?.has_person ?? true;
      const hasProductFlag = readBooleanFlag(generationParams?.has_product ?? generationParams?.hasProduct);
      const shouldUseProductImage = pipelineKey === "skeleton_video" ? hasProductFlag === true : hasProductFlag !== false;
      const subjectReplaceMode = String(generationParams?.subject_replace_mode || generationParams?.subjectReplaceMode || "").trim();
      const productImageUrl = shouldUseProductImage ? (productRef?.url || taskLevelProductImage || null) : null;
      const characterImageUrl = allowCharacterReference && hasPersonFlag !== false
        ? (characterRef?.url || taskLevelCharacterImage || null)
        : null;
      const editingCharacterImageUrl = characterRef?.url || taskLevelCharacterImage || null;
      const referenceImageUrls = uniqueUrls([
        ...(subjectReplaceMode === "product" ? [productImageUrl] : []),
        ...(subjectReplaceMode === "character" ? [editingCharacterImageUrl] : []),
        ...subjectRefs.filter((ref) => shouldUseProductImage || ref.type !== "product").map((ref) => ref.url),
        productImageUrl,
        allowCharacterReference ? characterImageUrl : null,
        referenceFrameUrl,
      ], maxReferenceImages);
      const image2Prompt = allowCharacterReference
        ? [
          prompt,
          "",
          "3D skeleton storyboard mode:",
          "- Use the selected character reference to preserve the intended character identity and appearance.",
          "- Use the selected product reference where the shot includes a product.",
          "- Keep the storyboard pose, action, camera, lighting, and timing from the prompt.",
          "- Preserve the shot grammar while replacing only the intended character/product subjects.",
        ].join("\n")
        : [
          prompt,
          "",
          "Product replacement mode:",
          "- Use the reference frame as the composition, camera, lighting, pose, layout, and scene anchor.",
          "- Use the product reference image only to replace the original product with the selected product.",
          "- Do not use or import any person, face, model, celebrity, or character identity reference.",
          "- Keep people in the reference frame generic and natural if they appear; do not preserve or copy a real person's identity.",
          "- Preserve the viral ad shot grammar while swapping only the product identity where applicable.",
        ].join("\n");

      const payload = {
        segment_id: segment.id,
        task_id: id,
        prompt: image2Prompt,
        raw_prompt: prompt,
        reference_frame_url: referenceFrameUrl,
        has_person: hasPersonFlag,
        has_product: hasProductFlag,
        use_product_image: shouldUseProductImage,
        product_image_url: productImageUrl,
        character_image_url: characterImageUrl,
        person_image_url: characterImageUrl,
        subject_refs: subjectRefs.filter((ref) => shouldUseProductImage || ref.type !== "product"),
        subject_replace_mode: subjectReplaceMode || (allowCharacterReference ? "character_product_reference" : "product_replace"),
        reference_image_urls: referenceImageUrls,
        images: referenceImageUrls,
        image_urls: referenceImageUrls,
        image_edit_mode: allowCharacterReference ? "character_product_reference" : "product_replace",
        model: requestedModel,
        requested_model: requestedModel,
        model_capabilities: modelCapabilities,
        aspect_ratio: aspectRatio,
        size: sizeFromAspectRatio(aspectRatio),
        n: 1,
        callback_url: callbackUrl,
        api_key: apiKey,
        admin_token: process.env.ADMIN_TOKEN,
        workflow_id: "YPzVxDvKVKPVmPuo",
      };

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Webhook failed: ${response.status}`);
        }

        // The n8n workflow is synchronous (respondToWebhook) — read the response body
        // to check if the image was already generated and the URL is ready.
        let imageUrl: string | null = null;
        try {
          const responseData = await response.json();
          if (responseData?.image_url) {
            imageUrl = responseData.image_url;
          }
        } catch {
          // Non-JSON response — treat as async (image_url not yet available)
        }

        if (imageUrl) {
          // Synchronous result: image is ready right now
          await prisma.storyboardSegment.update({
            where: { id: segment.id },
            data: {
              generatedImage: imageUrl,
              status: "IMAGE_READY",
              imageGenerationModel: requestedModel,
              generationParams: generationParamsPatch,
            },
          });
          return { segment_id: segment.id, success: true, image_url: imageUrl, immediate: true };
        } else {
          // Async result: image will arrive via callback later
          await prisma.storyboardSegment.update({
            where: { id: segment.id },
            data: {
              generatedImage: null,
              status: "IMAGE_GENERATING",
              imageGenerationModel: requestedModel,
              generationParams: generationParamsPatch,
            },
          });
          return { segment_id: segment.id, success: true, immediate: false };
        }
      } catch (error) {
        console.error(`[generate-images] Failed for segment ${segment.id}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await prisma.storyboardSegment.update({
          where: { id: segment.id },
          data: {
            status: "IMAGE_FAILED",
            generationParams: {
              ...generationParamsPatch,
              image_error: errorMessage,
              image_error_at: new Date().toISOString(),
            },
          },
        }).catch(() => {});
        return {
          segment_id: segment.id,
          success: false,
          error: errorMessage,
        };
      }
    });

    const results = await Promise.all(triggers);
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;
    const immediateCount = results.filter((r: any) => r.success && r.immediate).length;

    if (successCount > 0) {
      // Check how many segments in this task are now IMAGE_READY
      const allSegmentsNow = await prisma.storyboardSegment.findMany({
        where: { taskId: id },
        select: { status: true },
      });
      const allReady = allSegmentsNow.every(
        (s) => s.status === "IMAGE_READY" || s.status.startsWith("VIDEO_")
      );
      const progress = allReady
        ? 60
        : Math.max(35, Math.floor(30 + (immediateCount / allSegmentsNow.length) * 30));

      await prisma.storyboardTask.update({
        where: { id },
        data: {
          status: allReady ? "IMAGE_GENERATION_COMPLETED" : "IMAGE_GENERATING",
          progress,
          imageModel: requestedModel,
        },
      });
    }

    console.log("[generate-images] Batch trigger complete:", {
      task_id: id,
      total: segments.length,
      success: successCount,
      failures: failureCount,
    });

    const payload = {
      success: failureCount === 0,
      partial: successCount > 0 && failureCount > 0,
      task_id: id,
      model: requestedModel,
      aspect_ratio: aspectRatio,
      total: segments.length,
      triggered: successCount,
      failed: failureCount,
      results,
      message:
        successCount === 0
          ? "所有分镜生图触发失败"
          : failureCount > 0
            ? "部分分镜触发失败"
            : undefined,
    };

    return NextResponse.json(payload, { status: successCount === 0 ? 502 : 200 });
  } catch (error) {
    console.error("[generate-images] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
