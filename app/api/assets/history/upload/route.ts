import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { historyAssetPath, getAssetBucket } from "@/lib/storagePaths";
import { uploadToStorage } from "@/lib/storageUpload";
import { scheduleHistoryDocProcessing } from "@/lib/assetProcessing";
import { getSupabaseServiceClient } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  const { userId, token } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "file is required" },
      { status: 400 }
    );
  }

  const title =
    formData.get("title")?.toString() ||
    (file instanceof File && file.name) ||
    "未命名文档";
  const channel = formData.get("channel")?.toString() || null;
  const description = formData.get("description")?.toString() || null;
  const sourceType = formData.get("sourceType")?.toString() || null;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filename =
    (file instanceof File && file.name) || `history-${Date.now()}.txt`;
  const path = historyAssetPath(userId, filename);

  let uploadResult;
  try {
    uploadResult = await uploadToStorage({
      bucket: getAssetBucket(),
      path,
      body: buffer,
      contentType: file.type || "application/octet-stream",
      accessToken: token,
    });
  } catch (error) {
    console.error("[history-upload] storage upload failed", error);
    const message =
      error instanceof Error ? error.message : "Failed to upload asset";
    return NextResponse.json(
      { error: `Storage upload failed: ${message}` },
      { status: 500 }
    );
  }

  const doc = await prisma.historyDoc.create({
    data: {
      userId,
      title,
      description: description ?? undefined,
      channel,
      sourceType,
      originalPath: uploadResult.path,
      status: "PENDING",
      metadata: {
        size: buffer.length,
        contentType: file.type,
        originalFilename: filename,
        publicUrl: uploadResult.publicUrl,
        processingStatus: "PENDING",
      },
    },
  });

  scheduleHistoryDocProcessing(doc.id).catch((error) =>
    console.error("Failed to schedule history doc processing", error)
  );

  return NextResponse.json(
    { data: { ...doc, originalUrl: uploadResult.publicUrl } },
    { status: 201 }
  );
}
