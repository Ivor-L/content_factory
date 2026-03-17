import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { getAssetBucket, storyAssetPath } from "@/lib/storagePaths";
import { uploadToStorage } from "@/lib/storageUpload";
import { scheduleStoryAssetProcessing } from "@/lib/assetProcessing";

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

  const title =
    formData.get("title")?.toString() ||
    (file instanceof File && file.name) ||
    "未命名故事";
  const summary = formData.get("summary")?.toString() || null;
  const channel = formData.get("channel")?.toString() || null;
  const tagsRaw = formData.get("tags")?.toString();
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : undefined;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filename =
    (file instanceof File && file.name) || `story-${Date.now()}.md`;
  const path = storyAssetPath(userId, filename);

  const uploadResult = await uploadToStorage({
    bucket: getAssetBucket(),
    path,
    body: buffer,
    contentType: file.type || "application/octet-stream",
  });

  const story = await prisma.storyAsset.create({
    data: {
      userId,
      title,
      summary: summary ?? undefined,
      channel,
      tags,
      contentPath: uploadResult.path,
      metadata: {
        size: buffer.length,
        contentType: file.type,
        originalFilename: filename,
        publicUrl: uploadResult.publicUrl,
        processingStatus: "PENDING",
      },
    },
  });

  scheduleStoryAssetProcessing(story.id).catch((error) =>
    console.error("Failed to schedule story processing", error)
  );

  return NextResponse.json(
    { data: { ...story, contentUrl: uploadResult.publicUrl } },
    { status: 201 }
  );
}
