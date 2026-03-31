import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deductCanvasCredits } from "@/lib/canvasCredits";
import { isValidAdminWebhookRequest } from "@/lib/webhookAuth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

/**
 * POST /api/canvas/videos/webhook
 * Accepts callbacks from:
 *   - n8n workflow: { segment_id, status, video_url, context: { creditsApiKey, charge } }
 *   - Legacy poll service: { task_id, status, video_url, context: { creditsApiKey, charge } }
 *
 * Deducts credits on success, then inserts into canvas_video_tasks to trigger Supabase Realtime.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { status, task_id, segment_id, video_url, message, context } = body;

    // Effective task_id: n8n sends segment_id, poll service sends task_id
    const effectiveTaskId = task_id || segment_id;

    if (!effectiveTaskId) {
      return NextResponse.json({ error: "Missing task_id or segment_id" }, { status: 400 });
    }

    // Auth: n8n callbacks must carry x-admin-token (task_id absent in that case)
    if (!task_id && segment_id && !isValidAdminWebhookRequest(request)) {
      console.error("[canvas/video/webhook] Unauthorized n8n callback");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[canvas/video/webhook] Received:", {
      effectiveTaskId,
      status,
      has_video: !!video_url,
      source: task_id ? "poll-service" : "n8n",
    });

    // Deduct credits on success
    if (status === "success" && context?.creditsApiKey && context?.charge) {
      try {
        await deductCanvasCredits(context.creditsApiKey, "video", {}, { charge: context.charge });
        console.log("[canvas/video/webhook] Credits deducted for task:", effectiveTaskId);
      } catch (creditError) {
        console.error("[canvas/video/webhook] deduct credits failed:", creditError);
      }
    }

    // Write to Supabase Realtime — triggers waitForVideoTask subscription in useCanvasOrchestrator
    await supabase.from("canvas_video_tasks").insert({
      task_id: effectiveTaskId,
      status,
      video_url: video_url || null,
      error_message: message || null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[canvas/video/webhook] error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
