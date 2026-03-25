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

  const filename = (file instanceof File && file.name) || `audio-${Date.now()}.mp3`;
  const ext = filename.split(".").pop() || "mp3";
  const path = `canvas/audio/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadToStorage({
    bucket: getAssetBucket(),
    path,
    body: buffer,
    contentType: file.type || "audio/mpeg",
    upsert: false,
  });

  return NextResponse.json({ url: result.publicUrl, path });
}
