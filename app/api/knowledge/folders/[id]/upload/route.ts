import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { getAssetBucket } from "@/lib/storagePaths";
import { uploadToStorage } from "@/lib/storageUpload";
import {
  buildFallbackKnowledgeChunk,
  decodeTextContent,
  isTextLikeKnowledgeFile,
  knowledgeAssetPath,
  splitTextToChunks,
} from "@/lib/knowledge";

type Params = {
  params: Promise<{ id: string }>;
};

export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: Params) {
  const { userId, token } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: folderId } = await params;
  const folder = await prisma.knowledgeFolder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  });
  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const title =
    formData.get("title")?.toString().trim() ||
    (file instanceof File ? file.name : "") ||
    `knowledge-${Date.now()}.txt`;
  const sourceType = formData.get("sourceType")?.toString().trim() || "manual";

  const filename = (file instanceof File && file.name) || `knowledge-${Date.now()}.txt`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const path = knowledgeAssetPath(userId, folderId, filename);

  const uploadResult = await uploadToStorage({
    bucket: getAssetBucket(),
    path,
    body: buffer,
    contentType: file.type || "application/octet-stream",
    accessToken: token,
  });

  const knowledgeFile = await prisma.knowledgeFile.create({
    data: {
      folderId,
      userId,
      title,
      sourceType,
      status: "READY",
      originalPath: uploadResult.path,
      metadata: {
        size: buffer.length,
        contentType: file.type || null,
        originalFilename: filename,
        publicUrl: uploadResult.publicUrl,
      },
    },
  });

  const isTextLike = isTextLikeKnowledgeFile(filename, file.type);
  const chunks = isTextLike
    ? splitTextToChunks(decodeTextContent(buffer), {
        chunkSize: 1100,
        overlap: 160,
        maxChunks: 240,
      })
    : [buildFallbackKnowledgeChunk(title, filename, file.type)];

  if (chunks.length > 0) {
    await prisma.knowledgeChunk.createMany({
      data: chunks.map((chunk) => ({
        folderId,
        fileId: knowledgeFile.id,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        contentLength: chunk.contentLength,
      })),
    });
  }

  return NextResponse.json(
    {
      data: {
        ...knowledgeFile,
        originalUrl: uploadResult.publicUrl,
        chunkCount: chunks.length,
      },
    },
    { status: 201 },
  );
}
