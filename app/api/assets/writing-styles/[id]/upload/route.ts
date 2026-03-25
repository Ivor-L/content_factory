import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { getAssetBucket, writingStyleAssetPath } from "@/lib/storagePaths";
import { uploadToStorage } from "@/lib/storageUpload";
import { chunkWritingStyleText } from "@/lib/writingStyleChunker";

type Params = {
  params: Promise<{ id: string }>;
};

function normalizeSourceText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function POST(request: NextRequest, { params }: Params) {
  const { userId, token } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const style = await prisma.writingStyle.findFirst({
    where: { id, userId },
    select: { id: true, name: true },
  });

  if (!style) {
    return NextResponse.json({ error: "写作风格不存在" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const title =
    formData.get("title")?.toString().trim() ||
    (file instanceof File && file.name) ||
    `未命名内容-${Date.now()}`;
  const channel = formData.get("channel")?.toString().trim() || null;
  const sourceType = formData.get("sourceType")?.toString().trim() || "manual";
  const contentText = formData.get("contentText")?.toString() || "";

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filename = (file instanceof File && file.name) || `writing-style-${Date.now()}.md`;
  const path = writingStyleAssetPath(userId, filename);

  const uploadResult = await uploadToStorage({
    bucket: getAssetBucket(),
    path,
    body: buffer,
    contentType: file.type || "application/octet-stream",
    accessToken: token,
  });

  const decodedText = normalizeSourceText(
    contentText || buffer.toString("utf-8")
  );

  if (!decodedText) {
    return NextResponse.json({ error: "内容为空，无法切片" }, { status: 400 });
  }

  const chunks = chunkWritingStyleText(decodedText);
  if (!chunks.length) {
    return NextResponse.json(
      { error: "文本有效内容过短，无法生成切片（至少 40 字）" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const created = await prisma.$transaction(async (tx) => {
    const document = await tx.writingStyleDocument.create({
      data: {
        styleId: style.id,
        userId,
        title,
        channel,
        sourceType,
        originalPath: uploadResult.path,
        status: "READY",
        metadata: {
          size: buffer.length,
          contentType: file.type,
          originalFilename: filename,
          publicUrl: uploadResult.publicUrl,
          sourceLength: decodedText.length,
          chunkCount: chunks.length,
          uploadedAt: now,
        },
      },
    });

    await tx.writingStyleChunk.createMany({
      data: chunks.map((chunk) => ({
        styleId: style.id,
        documentId: document.id,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        contentLength: chunk.contentLength,
        cardType: "其他",
        riskLevel: "低",
        tags: [],
        status: "ACTIVE",
        metadata: {
          sourceType,
          title,
        },
      })),
    });

    const count = await tx.writingStyleChunk.count({ where: { styleId: style.id } });

    await tx.writingStyle.update({
      where: { id: style.id },
      data: {
        extractionStatus: "IDLE",
        metadata: {
          lastUploadAt: now,
          lastDocumentId: document.id,
          totalChunks: count,
        },
      },
    });

    return {
      document,
      chunkCount: chunks.length,
    };
  });

  return NextResponse.json(
    {
      data: {
        ...created.document,
        chunkCount: created.chunkCount,
        contentUrl: uploadResult.publicUrl,
      },
    },
    { status: 201 }
  );
}
