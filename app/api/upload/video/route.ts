import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { uploadToStorage } from "@/lib/storageUpload";
import { getAssetBucket } from "@/lib/storagePaths";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const filename = (file instanceof File && file.name) || `video-${Date.now()}.mp4`;
  const ext = filename.split(".").pop() || "mp4";
  const path = `storyboard/videos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadToStorage({
    bucket: getAssetBucket(),
    path,
    body: buffer,
    contentType: file.type || "video/mp4",
    upsert: false,
  });

  return NextResponse.json({ url: result.publicUrl });
}
