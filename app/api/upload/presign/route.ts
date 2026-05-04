import { NextRequest, NextResponse } from "next/server";
import { getOssClient, getOssPublicUrl, getOssUploadConfig, hasOssUploadConfig } from "@/lib/oss";

const POST_POLICY_EXPIRES_MS = 10 * 60 * 1000;
const MAX_DIRECT_UPLOAD_BYTES = 200 * 1024 * 1024;

function getOssUploadUrl(): string {
  const { region, bucket } = getOssUploadConfig();
  const cleanRegion = String(region || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\.aliyuncs\.com$/i, "")
    .replace(/\/+$/g, "");
  if (!bucket || !cleanRegion) return "";
  return `https://${bucket}.${cleanRegion}.aliyuncs.com`;
}

export async function POST(request: NextRequest) {
  const { filename, contentType, type } = await request.json().catch(() => ({}));
  if (!filename || !contentType) {
    return NextResponse.json({ error: "filename and contentType are required" }, { status: 400 });
  }

  if (!hasOssUploadConfig()) {
    return NextResponse.json({ error: "OSS not configured" }, { status: 503 });
  }

  try {
    const ext = String(filename).split(".").pop() || "bin";
    const normalizedType = typeof type === "string" ? type.trim().toLowerCase() : "";
    const folder =
      normalizedType === "character"
        ? "characters"
        : contentType.startsWith("video/")
        ? "storyboard/videos"
        : "storyboard/images";
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
    const postPolicy = {
      expiration: new Date(Date.now() + POST_POLICY_EXPIRES_MS).toISOString(),
      conditions: [
        ["content-length-range", 0, MAX_DIRECT_UPLOAD_BYTES],
        ["eq", "$key", key],
        ["eq", "$success_action_status", "200"],
        ["starts-with", "$Content-Type", contentType.split("/")[0] ? `${contentType.split("/")[0]}/` : ""],
      ],
    };
    const postSignature = client.calculatePostSignature(postPolicy);
    const postUploadUrl = getOssUploadUrl();

    return NextResponse.json({
      uploadUrl: signedUrl,
      publicUrl,
      key,
      method: "PUT",
      postUploadUrl,
      postFormData: {
        key,
        policy: postSignature.policy,
        OSSAccessKeyId: postSignature.OSSAccessKeyId,
        Signature: postSignature.Signature,
        success_action_status: "200",
        "Content-Type": contentType,
      },
      postMaxBytes: MAX_DIRECT_UPLOAD_BYTES,
      postExpiresInSeconds: Math.floor(POST_POLICY_EXPIRES_MS / 1000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate presigned URL";
    console.error("[upload/presign] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
