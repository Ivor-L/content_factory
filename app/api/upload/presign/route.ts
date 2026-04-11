import { NextRequest, NextResponse } from "next/server";
import { getOssClient, getOssPublicUrl, hasOssUploadConfig } from "@/lib/oss";

export async function POST(request: NextRequest) {
  const { filename, contentType } = await request.json().catch(() => ({}));
  if (!filename || !contentType) {
    return NextResponse.json({ error: "filename and contentType are required" }, { status: 400 });
  }

  if (!hasOssUploadConfig()) {
    return NextResponse.json({ error: "OSS not configured" }, { status: 503 });
  }

  try {
    const ext = String(filename).split(".").pop() || "bin";
    const folder = contentType.startsWith("video/") ? "storyboard/videos" : "storyboard/images";
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const client = getOssClient({ internal: false, secure: true });
    const signedUrl = client.signatureUrl(key, {
      method: "PUT",
      expires: 300, // 5 minutes
      "Content-Type": contentType,
    } as Parameters<typeof client.signatureUrl>[1]);

    const cdnHost = getOssPublicUrl();
    if (!cdnHost) {
      return NextResponse.json({ error: "OSS public URL unavailable" }, { status: 503 });
    }
    const publicUrl = `${cdnHost}/${encodeURI(key)}`;

    return NextResponse.json({ uploadUrl: signedUrl, publicUrl, key });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate presigned URL";
    console.error("[upload/presign] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
