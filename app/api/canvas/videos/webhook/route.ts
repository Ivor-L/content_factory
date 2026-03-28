import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deductCanvasCredits } from "@/lib/canvasCredits";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { status, task_id, video_url, message, context } = body;

    // Deduct credits on success
    if (status === "success" && context?.creditsApiKey && context?.charge) {
      try {
        await deductCanvasCredits(context.creditsApiKey, "video", {}, { charge: context.charge });
      } catch (creditError) {
        console.error("[canvas/video/webhook] deduct credits failed", creditError);
      }
    }

    // Write to Supabase Realtime (triggers client subscription)
    await supabase.from("canvas_video_tasks").insert({
      task_id,
      status,
      video_url: video_url || null,
      error_message: message || null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[canvas/video/webhook] error", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
