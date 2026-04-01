import { NextRequest, NextResponse } from "next/server";
import OSS from "ali-oss";

function getOssClient() {
  const region = process.env.ALIYUN_OSS_REGION;
  const bucket = process.env.ALIYUN_OSS_BUCKET;
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET;

  if (!region || !bucket || !accessKeyId || !accessKeySecret) {
    throw new Error("Missing Aliyun OSS environment variables");
  }

  // Presign uses public endpoint (not internal) so browser can access
  // secure: true forces https:// in signed URLs, required when serving over HTTPS (Mixed Content)
  return new OSS({ region, bucket, accessKeyId, accessKeySecret, internal: false, secure: true });
}

export async function POST(request: NextRequest) {
  const { filename, contentType } = await request.json().catch(() => ({}));
  if (!filename || !contentType) {
    return NextResponse.json({ error: "filename and contentType are required" }, { status: 400 });
  }

  if (
    !process.env.ALIYUN_OSS_BUCKET ||
    !process.env.ALIYUN_OSS_ACCESS_KEY_ID ||
    !process.env.ALIYUN_OSS_ACCESS_KEY_SECRET ||
    !process.env.ALIYUN_OSS_REGION ||
    !process.env.ALIYUN_OSS_PUBLIC_URL
  ) {
    return NextResponse.json({ error: "OSS not configured" }, { status: 503 });
  }

  try {
    const ext = String(filename).split(".").pop() || "bin";
    const folder = contentType.startsWith("video/") ? "storyboard/videos" : "storyboard/images";
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const client = getOssClient();
    const signedUrl = client.signatureUrl(key, {
      method: "PUT",
      expires: 300, // 5 minutes
      "Content-Type": contentType,
    } as Parameters<typeof client.signatureUrl>[1]);

    const cdnHost = (process.env.ALIYUN_OSS_PUBLIC_URL || "").replace(/\/+$/, "");
    const publicUrl = `${cdnHost}/${encodeURI(key)}`;

    return NextResponse.json({ uploadUrl: signedUrl, publicUrl, key });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate presigned URL";
    console.error("[upload/presign] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
