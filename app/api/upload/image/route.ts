import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { uploadToStorage } from "@/lib/storageUpload";
import { getAssetBucket } from "@/lib/storagePaths";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export async function POST(request: NextRequest) {
  console.log("[upload/image] start", new Date().toISOString());
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `文件过大，最大 5MB，当前 ${(file.size / 1024 / 1024).toFixed(1)}MB` },
      { status: 413 }
    );
  }

  const type = formData.get("type");
  const filename = (file instanceof File && file.name) || `image-${Date.now()}.jpg`;
  const ext = filename.split(".").pop() || "jpg";
  const prefix = type === "character" ? "characters" : "storyboard/images";
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  console.log("[upload/image] uploading", { path, size: file.size, type: file.type });
  const buffer = Buffer.from(await file.arrayBuffer());
  const start = Date.now();
  const result = await uploadToStorage({
    bucket: getAssetBucket(),
    path,
    body: buffer,
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  console.log("[upload/image] done", { duration: Date.now() - start, url: result.publicUrl });

  return NextResponse.json({ url: result.publicUrl });
}
