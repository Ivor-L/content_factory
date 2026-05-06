import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidAdminWebhookRequest } from "@/lib/webhookAuth";
import { syncTaskToSummary } from "@/lib/taskSummary";
import { getApiKeyForUser } from "@/lib/authServer";
import { deductConfiguredCredits } from "@/lib/creditBilling";

type JsonRecord = Record<string, unknown>;

const toText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const toUrl = (value: unknown): string => {
  const text = toText(value);
  if (!text || /^(undefined|null|nan)$/i.test(text)) return "";
  if (text.startsWith("//")) return `https:${text}`;
  return /^https?:\/\//i.test(text) ? text : "";
};

const toNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const parseJsonSafe = (value: unknown): JsonRecord | null => {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JsonRecord;
      }
    } catch {
      return null;
    }
  }
  return null;
};

const toObjectArray = (value: unknown): JsonRecord[] => {
  const parsed =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return null;
          }
        })()
      : value;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({ ...item }));
};

const pickTaskId = (req: NextRequest, body: JsonRecord, eventData: JsonRecord | null): string => {
  const queryTaskId =
    req.nextUrl.searchParams.get("task_id") ||
    req.nextUrl.searchParams.get("taskId") ||
    req.nextUrl.searchParams.get("taskID") ||
    req.nextUrl.searchParams.get("record_id") ||
    req.nextUrl.searchParams.get("recordId") ||
    "";

  return String(
    queryTaskId ||
      body?.task_id ||
      body?.taskId ||
      body?.taskID ||
      body?.record_id ||
      body?.recordId ||
      body?.id ||
      (body?.data as JsonRecord | undefined)?.task_id ||
      (body?.data as JsonRecord | undefined)?.taskId ||
      (body?.data as JsonRecord | undefined)?.record_id ||
      (body?.data as JsonRecord | undefined)?.recordId ||
      eventData?.task_id ||
      eventData?.taskId ||
      eventData?.record_id ||
      eventData?.recordId ||
      ""
  ).trim();
};

const pickWorkflowData = (body: JsonRecord, eventData: JsonRecord | null): JsonRecord | null => {
  const direct =
    parseJsonSafe(body?.workflow_data) ||
    parseJsonSafe(body?.workflowData) ||
    parseJsonSafe(body?.result) ||
    parseJsonSafe((body?.data as JsonRecord | undefined)?.workflow_data) ||
    parseJsonSafe((body?.data as JsonRecord | undefined)?.workflowData);
  if (direct) return direct;
  return eventData;
};

const pickStoryboardGridUrl = (body: JsonRecord, workflowData: JsonRecord | null): string =>
  toUrl(body?.storyboard_grid_url) ||
  toUrl(body?.storyboardGridUrl) ||
  toUrl(workflowData?.storyboard_grid_url) ||
  toUrl(workflowData?.storyboardGridUrl) ||
  "";

const pickSegments = (
  body: JsonRecord,
  eventData: JsonRecord | null,
  workflowData: JsonRecord | null
): JsonRecord[] => {
  const candidates: unknown[] = [
    body?.segments,
    body?.results,
    body?.data,
    (body?.data as JsonRecord | undefined)?.segments,
    (body?.data as JsonRecord | undefined)?.results,
    eventData?.segments,
    eventData?.results,
    eventData?.data,
    workflowData?.segments,
    workflowData?.results,
    workflowData?.scenes,
    workflowData?.scene_breakdown,
    workflowData?.shots,
  ];

  for (const candidate of candidates) {
    const rows = toObjectArray(candidate);
    if (rows.length > 0) return rows;
  }
  return [];
};

const pickErrorMessage = (body: JsonRecord, eventData: JsonRecord | null): string =>
  toText(body?.error) ||
  toText(body?.errorMessage) ||
  toText(body?.error_message) ||
  toText(body?.message) ||
  toText(eventData?.msg) ||
  toText((body?.data as JsonRecord | undefined)?.error) ||
  "";

const normalizeStatus = (body: JsonRecord, eventData: JsonRecord | null): string => {
  const rawStatus = (
    toText(body?.status) ||
    toText(body?.state) ||
    toText(body?.event) ||
    toText((body?.data as JsonRecord | undefined)?.status)
  ).toLowerCase();

  if (rawStatus) return rawStatus;

  const code =
    toNumber(body?.code) ??
    toNumber(eventData?.code) ??
    toNumber((body?.data as JsonRecord | undefined)?.code);
  if (code === 0) return "success";
  if (code !== null) return "failed";
  return "";
};

const isCompletedStatus = (status: string): boolean =>
  ["completed", "success", "succeeded", "done", "finished", "task_end"].includes(status);

const isFailedStatus = (status: string): boolean =>
  ["failed", "fail", "error", "errored", "timeout", "cancelled", "canceled"].includes(status);

/**
 * Webhook endpoint for receiving storyboard breakdown results from n8n workflow
 * n8n workflow: 小程序首页爆款拆解 / 分镜拆解
 * Webhook path: /webhook/miniapp_viral_breakdown_grid
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify admin token
    if (!isValidAdminWebhookRequest(req)) {
      console.error("[storyboard-breakdown] Unauthorized: Invalid admin token");
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as JsonRecord;
    const eventData = parseJsonSafe(body?.eventData) || parseJsonSafe(body?.event_data);
    const workflowData = pickWorkflowData(body, eventData);
    const segments = pickSegments(body, eventData, workflowData);
    const taskId = pickTaskId(req, body, eventData);
    const status = normalizeStatus(body, eventData);
    const errorMessage = pickErrorMessage(body, eventData);
    const storyboardGridUrl = pickStoryboardGridUrl(body, workflowData);

    console.log("[storyboard-breakdown] Received webhook:", {
      task_id: taskId,
      status,
      segmentCount: segments.length,
    });

    if (!taskId) {
      return NextResponse.json(
        { error: "Missing task_id" },
        { status: 400 }
      );
    }

    const storyboardTask = await prisma.storyboardTask.findUnique({
      where: { id: taskId },
      select: { id: true },
    });

    // Compatibility path:
    // Some "script breakdown" flows reuse this callback URL and pass Script.id as task_id.
    // In this case we should update Script instead of StoryboardTask to avoid 500 failures.
    if (!storyboardTask) {
      const script = await prisma.script.findUnique({
        where: { id: taskId },
        select: { id: true, breakdown: true, blueprint: true },
      });

      if (!script) {
        console.warn("[storyboard-breakdown] task_id not found in storyboardTask/script:", taskId);
        return NextResponse.json({
          success: true,
          ignored: true,
          reason: "task_not_found",
          task_id: taskId,
        });
      }

      let existingBreakdown: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(script.breakdown || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          existingBreakdown = parsed as Record<string, unknown>;
        }
      } catch {
        existingBreakdown = {};
      }

      const isCompleted = isCompletedStatus(status) || (segments.length > 0 && !isFailedStatus(status) && !errorMessage);
      const isFailed = isFailedStatus(status) || Boolean(errorMessage);

      const scriptUpdate: Record<string, unknown> = {
        status: isCompleted ? "completed" : isFailed ? "failed" : status || "processing",
        progress: isCompleted ? 100 : isFailed ? 0 : 60,
        error: isFailed ? (errorMessage || "Storyboard breakdown failed") : null,
      };

      if (workflowData !== null || segments.length > 0) {
        const existingSceneBreakdown = Array.isArray(existingBreakdown.scene_breakdown)
          ? (existingBreakdown.scene_breakdown as unknown[])
          : [];
        scriptUpdate.blueprint = JSON.stringify({
          status: status || null,
          workflow_data: workflowData ?? null,
          segments,
        });
        scriptUpdate.breakdown = JSON.stringify({
          ...existingBreakdown,
          status: status || existingBreakdown.status || null,
          workflow_data: workflowData ?? existingBreakdown.workflow_data ?? null,
          scene_breakdown: segments.length > 0 ? segments : existingSceneBreakdown,
        });
      }

      await prisma.script.update({
        where: { id: taskId },
        data: scriptUpdate as any,
      });

      console.log("[storyboard-breakdown] Updated script status:", {
        task_id: taskId,
        newStatus: scriptUpdate.status,
      });

      return NextResponse.json({
        success: true,
        task_id: taskId,
        task_type: "script",
        segmentCount: segments.length,
      });
    }

    // 2. Update storyboard task status
    const isCompleted = isCompletedStatus(status) || (segments.length > 0 && !isFailedStatus(status) && !errorMessage);
    const isFailed = isFailedStatus(status) || Boolean(errorMessage);
    const existingTask = await prisma.storyboardTask.findUnique({
      where: { id: taskId },
      select: { detailedBreakdown: true },
    });
    const existingDetailed = existingTask?.detailedBreakdown &&
      typeof existingTask.detailedBreakdown === "object" &&
      !Array.isArray(existingTask.detailedBreakdown)
      ? existingTask.detailedBreakdown as Record<string, unknown>
      : {};
    const existingMetadata = existingDetailed.metadata &&
      typeof existingDetailed.metadata === "object" &&
      !Array.isArray(existingDetailed.metadata)
      ? existingDetailed.metadata as Record<string, unknown>
      : {};
    const nextDetailed = workflowData && typeof workflowData === "object" && !Array.isArray(workflowData)
      ? workflowData as Record<string, unknown>
      : { segments };
    const nextMetadata = nextDetailed.metadata &&
      typeof nextDetailed.metadata === "object" &&
      !Array.isArray(nextDetailed.metadata)
      ? nextDetailed.metadata as Record<string, unknown>
      : {};

    const updateData: any = {
      progress: isCompleted ? 30 : 0,
      updatedAt: new Date(),
    };

    if (isCompleted) {
      updateData.status = "BREAKDOWN_COMPLETED";
      updateData.detailedBreakdown = {
        ...existingDetailed,
        ...nextDetailed,
        metadata: {
          ...existingMetadata,
          ...nextMetadata,
        },
      };
      if (storyboardGridUrl) {
        updateData.storyboardImageUrl = storyboardGridUrl;
        updateData.coverImage = storyboardGridUrl;
      }
    } else if (isFailed) {
      updateData.status = "BREAKDOWN_FAILED";
    }

    await prisma.storyboardTask.update({
      where: { id: taskId },
      data: updateData,
    });
    void syncTaskToSummary({ taskType: 'storyboard', taskId, operation: 'update' });

    console.log("[storyboard-breakdown] Updated task status:", {
      task_id: taskId,
      newStatus: updateData.status,
      progress: updateData.progress,
    });

    // 3. Create segments if breakdown was successful
    if (isCompleted && segments.length > 0) {
      // Fetch product only for subject_refs. Person references are intentionally
      // excluded because image generation can flag imported faces as sensitive.
      const task = await prisma.storyboardTask.findUnique({
        where: { id: taskId },
        include: { product: true },
      });

      const productImages = (task?.product as any)?.images || null;
      const productImageUrl = Array.isArray(productImages)
        ? productImages[0]
        : typeof productImages === "string"
        ? (() => { try { const p = JSON.parse(productImages); return Array.isArray(p) ? p[0] : productImages; } catch { return productImages; } })()
        : null;

      const segmentData = segments.map((seg: JsonRecord, idx: number) => {
        const startSec = toNumber(seg.start_sec ?? seg.startSec);
        const endSec = toNumber(seg.end_sec ?? seg.endSec);
        const durationByRange =
          startSec !== null && endSec !== null && endSec > startSec
            ? Math.round((endSec - startSec) * 1000) / 1000
            : null;
        const duration =
          toNumber(seg.duration) ??
          toNumber(seg.duration_sec) ??
          toNumber(seg.durationSec) ??
          durationByRange ??
          8;
        const cameraFromColumns = [
          toText(seg.camera_shot_size),
          toText(seg.camera_angle),
          toText(seg.camera_movement),
        ]
          .filter(Boolean)
          .join(" / ");
        const mustShow = toText(seg.must_show).toLowerCase();
        const parsedHasPerson =
          typeof seg.has_person === "boolean"
            ? (seg.has_person as boolean)
            : typeof seg.hasPerson === "boolean"
            ? (seg.hasPerson as boolean)
            : mustShow
            ? mustShow.includes("person") || mustShow.includes("human") || mustShow.includes("人物")
            : true;
        const parsedHasProduct =
          typeof seg.has_product === "boolean"
            ? (seg.has_product as boolean)
            : typeof seg.hasProduct === "boolean"
            ? (seg.hasProduct as boolean)
            : mustShow
            ? mustShow.includes("product") || mustShow.includes("商品") || mustShow.includes("产品")
            : true;

        // Build image refs from the selected product and the extracted reference frame only.
        const subjectRefs: Array<{ type: string; url: string; label: string }> = [];
        if (parsedHasProduct !== false && productImageUrl) {
          subjectRefs.push({ type: "product", url: productImageUrl, label: "产品图" });
        }
        const referenceFrameUrl =
          toText(seg.reference_frame_url) ||
          toText(seg.referenceFrameUrl) ||
          toText(seg.ref_frame_image) ||
          toText(seg.ref_frame_url);
        if (referenceFrameUrl) {
          subjectRefs.push({ type: "reference_frame", url: referenceFrameUrl, label: "参考帧" });
        }

        return {
          taskId: taskId,
          order: toNumber(seg.order) ?? toNumber(seg.idx) ?? toNumber(seg.shot_id) ?? idx + 1,
          duration,
          timeRange:
            toText(seg.time_range) ||
            (startSec !== null && endSec !== null ? `${startSec}-${endSec}s` : undefined),
          imagePrompt:
            toText(seg.final_image_prompt) ||
            toText(seg.image_prompt) ||
            toText(seg.imagePrompt) ||
            toText(seg.prompt_text) ||
            toText(seg.scene_prompt),
          videoPrompt:
            toText(seg.final_video_prompt) ||
            toText(seg.video_prompt) ||
            toText(seg.videoPrompt) ||
            toText(seg.visual_content_description),
          originalScript:
            toText(seg.original_script) ||
            toText(seg.dialogue_vo_original) ||
            toText(seg.dialogue_vo_zh) ||
            toText(seg.text),
          rewrittenScript:
            toText(seg.rewritten_script) ||
            toText(seg.rewrite_vo_zh_translation) ||
            toText(seg.rewrite_vo_target_language),
          visualDescription:
            toText(seg.visual_description) ||
            toText(seg.visual_content_description) ||
            toText(seg.shot_goal),
          cameraNotes: toText(seg.camera_notes) || cameraFromColumns,
          lightingNotes: toText(seg.lighting_notes) || toText(seg.lighting_atmosphere),
          status: "PENDING_IMAGE",
          generationParams: {
            reference_frame_url: referenceFrameUrl || null,
            has_person: parsedHasPerson,
            has_product: parsedHasProduct,
            subject_refs: subjectRefs,
            image_history: [],
          },
        };
      });

      // Delete existing segments and create new ones
      await prisma.storyboardSegment.deleteMany({
        where: { taskId: taskId },
      });

      await prisma.storyboardSegment.createMany({
        data: segmentData,
      });

      console.log("[storyboard-breakdown] Created segments:", {
        task_id: taskId,
        count: segmentData.length,
      });

      // 4. Deduct credits from user (only on successful breakdown)
      if (task?.userId) {
        try {
          const apiKey = await getApiKeyForUser(task.userId);
          if (apiKey) {
            await deductConfiguredCredits({
              apiKey,
              featureKey: "storyboard_breakdown",
              userId: task.userId,
              defaultAmount: 1,
              workflowId: "flow_storyboard_disassembly",
              workflowName: "分镜拆解",
            });
          }
        } catch (error) {
          console.error("[storyboard-breakdown] Failed to deduct credits:", error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      task_id: taskId,
      segmentCount: segments.length,
    });
  } catch (error) {
    console.error("[storyboard-breakdown] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
