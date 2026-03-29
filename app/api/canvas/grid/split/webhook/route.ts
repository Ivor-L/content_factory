import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const taskId = String(payload.task_id || payload.taskId || "");
    const status = String(payload.status || "").toUpperCase();
    const context = payload.context as Record<string, unknown> | undefined;
    const nodeId = context?.nodeId ? String(context.nodeId) : "";

    if (!taskId || !nodeId) {
      return NextResponse.json({ error: "taskId and nodeId required" }, { status: 400 });
    }

    // Extract image URLs from outputs
    const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
    const imageUrls = outputs
      .filter((item: any) => {
        const ft = (item.fileType || "").toLowerCase();
        return ft === "jpg" || ft === "png" || ft === "jpeg" || ft === "webp" || ft === "image";
      })
      .map((item: any) => item.fileUrl)
      .filter((url: any): url is string => typeof url === "string" && url.length > 0);

    // Store in Supabase
    const { error } = await supabaseAdmin
      .from("canvas_grid_split_results")
      .upsert({
        task_id: taskId,
        node_id: nodeId,
        status,
        image_urls: imageUrls,
        updated_at: new Date().toISOString(),
      }, { onConflict: "task_id" });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[canvas/grid/split/webhook] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 },
    );
  }
}
