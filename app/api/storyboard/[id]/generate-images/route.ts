import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { resolveUserApiKey } from "@/lib/userApiKey";
import { deductCredits } from "@/lib/credits";
import { getCreditCost } from "@/lib/creditCosts";
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
      model = "nanoBananapro",
      aspectRatio = "9:16",
    } = body;

    console.log("[generate-images] Request:", {
      task_id: id,
      segmentIds,
      model,
      userId,
    });

    // 1. Verify task exists and belongs to user (if userId is set)
    const task = await prisma.storyboardTask.findUnique({
      where: { id },
      include: {
        product: true,
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
      model,
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
      const costPerSegment = await getCreditCost("storyboard_image", 1);
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

    // Helper: parse product images that may be stored as a JSON string
    function extractFirstProductImage(images: unknown): string | null {
      if (!images) return null;
      if (Array.isArray(images)) return (images as string[])[0] || null;
      if (typeof images === "string") {
        try {
          const parsed = JSON.parse(images);
          return Array.isArray(parsed) ? parsed[0] : images;
        } catch { return images; }
      }
      return null;
    }

    const taskLevelProductImage = extractFirstProductImage(task.product?.images);

    const triggers = segments.map(async (segment) => {
      // Replace [PRODUCT] placeholder in prompt
      let prompt = segment.imagePrompt || segment.visualDescription || "";
      if (task.product?.name) {
        prompt = prompt.replace(/\[PRODUCT\]/g, task.product.name);
      }

      // Extract per-segment refs from generationParams, fall back to task-level
      const generationParams = segment.generationParams as Record<string, any> | null;
      const referenceFrameUrl = generationParams?.reference_frame_url || null;
      const subjectRefs: Array<{ type: string; url: string }> = Array.isArray(generationParams?.subject_refs)
        ? generationParams.subject_refs
        : [];
      const productRef = subjectRefs.find((r) => r.type === "product");
      const hasPersonFlag = generationParams?.has_person ?? true;
      const hasProductFlag = generationParams?.has_product ?? true;
      const productImageUrl = hasProductFlag ? (productRef?.url || taskLevelProductImage || null) : null;
      const image2Prompt = [
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
        reference_frame_url: referenceFrameUrl,
        has_person: hasPersonFlag,
        has_product: hasProductFlag,
        product_image_url: productImageUrl,
        character_image_url: null,
        image_edit_mode: "product_replace",
        model,
        aspect_ratio: aspectRatio,
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
              imageGenerationModel: model,
            },
          });
          return { segment_id: segment.id, success: true, image_url: imageUrl, immediate: true };
        } else {
          // Async result: image will arrive via callback later
          await prisma.storyboardSegment.update({
            where: { id: segment.id },
            data: {
              status: "IMAGE_GENERATING",
              imageGenerationModel: model,
            },
          });
          return { segment_id: segment.id, success: true, immediate: false };
        }
      } catch (error) {
        console.error(`[generate-images] Failed for segment ${segment.id}:`, error);
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
