import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const taskId = String(payload.taskId || payload.task_id || "");
    const status = String(payload.status || "").toUpperCase();
    const context = payload.context as Record<string, unknown> | undefined;
    const nodeId = context?.nodeId ? String(context.nodeId) : "";

    if (!taskId || !nodeId) {
      return NextResponse.json({ error: "taskId and nodeId required" }, { status: 400 });
    }

    // Extract image URLs from multiple possible formats
    let imageUrls: string[] = [];

    // Format 1: outputs array with fileUrl
    const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
    imageUrls = outputs
      .filter((item: any) => {
        const ft = (item.fileType || "").toLowerCase();
        return ft === "jpg" || ft === "png" || ft === "jpeg" || ft === "webp" || ft === "image";
      })
      .map((item: any) => item.fileUrl)
      .filter((url: any): url is string => typeof url === "string" && url.length > 0);

    // Format 2: data.images array
    if (!imageUrls.length) {
      const data = payload.data as Record<string, unknown> | undefined;
      const images = Array.isArray(data?.images) ? data.images : [];
      imageUrls = images
        .filter((item: any) => typeof item === "string" && item.length > 0)
        .map((item: any) => String(item));
    }

    // Format 3: results array (RunningHub format)
    if (!imageUrls.length) {
      const results = Array.isArray(payload.results) ? payload.results : [];
      imageUrls = results
        .filter((item: any) => typeof item?.url === "string" && item.url.length > 0)
        .map((item: any) => String(item.url));
    }

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
