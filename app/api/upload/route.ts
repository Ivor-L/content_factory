import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { uploadToStorage } from "@/lib/storageUpload";
import { getAssetBucket } from "@/lib/storagePaths";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const MAX_SIZE = 50 * 1024 * 1024; // 50MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `文件过大，最大 50MB，当前 ${(file.size / 1024 / 1024).toFixed(1)}MB` },
      { status: 413 }
    );
  }

  const filename = (file instanceof File && file.name) || `upload-${Date.now()}`;
  const ext = filename.split(".").pop() || "bin";
  const path = `characters/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadToStorage({
    bucket: getAssetBucket(),
    path,
    body: buffer,
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  return NextResponse.json({ url: result.publicUrl });
}
