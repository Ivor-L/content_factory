import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/storage/image-upload
 *
 * Called by n8n to upload a generated image to Supabase storage.
 * Accepts either a remote URL (we proxy-download) or raw base64.
 *
 * Body:
 *   { task_id, image_url?, image_base64?, mime_type?, filename? }
 *
 * Auth: x-admin-token header
 */
export async function POST(request: NextRequest) {
  const adminToken = request.headers.get("x-admin-token");
  if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    task_id?: string;
    image_url?: string;
    image_base64?: string;
    mime_type?: string;
    filename?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { task_id, image_url, image_base64, mime_type = "image/jpeg", filename } = body;

  if (!task_id) {
    return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
  }

  let imageBuffer: Buffer;
  let contentType = mime_type;

  if (image_url) {
    // Download image from URL
    const fetchRes = await fetch(image_url);
    if (!fetchRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image from URL: ${fetchRes.status}` },
        { status: 502 },
      );
    }
    contentType = fetchRes.headers.get("content-type") ?? mime_type;
    imageBuffer = Buffer.from(await fetchRes.arrayBuffer());
  } else if (image_base64) {
    // Decode base64
    const base64Data = image_base64.replace(/^data:[^;]+;base64,/, "");
    imageBuffer = Buffer.from(base64Data, "base64");
  } else {
    return NextResponse.json(
      { error: "Either image_url or image_base64 is required" },
      { status: 400 },
    );
  }

  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const safeFilename = filename ?? `${Date.now()}.${ext}`;
  const storagePath = `image-text/${task_id}/${safeFilename}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("generated-images")
    .upload(storagePath, imageBuffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error("[image-upload] Supabase upload error:", uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabaseAdmin.storage
    .from("generated-images")
    .getPublicUrl(storagePath);

  return NextResponse.json({ success: true, url: urlData.publicUrl, path: storagePath });
}
