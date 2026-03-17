import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getRequestUserContext } from "@/lib/authServer";
import { getAssetBucket, stylePreviewPath } from "@/lib/storagePaths";
import { uploadToStorage } from "@/lib/storageUpload";
import { scheduleStylePresetProcessing } from "@/lib/assetProcessing";

const DEFAULT_STYLE_TYPE = "xhs-visual";

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
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

  const name =
    formData.get("name")?.toString() ||
    (file instanceof File && file.name) ||
    "未命名风格";
  const typeEntry = formData.get("type");
  const type =
    typeof typeEntry === "string" && typeEntry.trim().length > 0
      ? typeEntry.trim()
      : DEFAULT_STYLE_TYPE;
  const description = formData.get("description")?.toString() || null;
  const specRaw = formData.get("spec")?.toString();
  let spec: Prisma.InputJsonValue = {};
  if (specRaw) {
    try {
      spec = JSON.parse(specRaw) as Prisma.InputJsonValue;
    } catch (error) {
      return NextResponse.json(
        { error: "spec must be valid JSON" },
        { status: 400 }
      );
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filename =
    (file instanceof File && file.name) || `style-${Date.now()}.png`;
  const path = stylePreviewPath(userId, filename);

  const uploadResult = await uploadToStorage({
    bucket: getAssetBucket(),
    path,
    body: buffer,
    contentType: file.type || "application/octet-stream",
  });

  const style = await prisma.stylePreset.create({
    data: {
      userId,
      name,
      type,
      description: description ?? undefined,
      spec,
      previewUrl: uploadResult.publicUrl,
      metadata: {
        size: buffer.length,
        contentType: file.type,
        originalFilename: filename,
        storagePath: uploadResult.path,
        processingStatus: "PENDING",
      },
    },
  });

  scheduleStylePresetProcessing(style.id).catch((error) =>
    console.error("Failed to schedule style processing", error)
  );

  return NextResponse.json(
    { data: { ...style, previewUpload: uploadResult.publicUrl } },
    { status: 201 }
  );
}
