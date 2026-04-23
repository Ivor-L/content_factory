import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { splitTextToChunks } from "@/lib/knowledge";

type Params = {
  params: Promise<{ fileId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await params;

  const file = await prisma.knowledgeFile.findFirst({
    where: { id: fileId, userId },
    select: {
      id: true,
      folderId: true,
      title: true,
      status: true,
      sourceType: true,
      metadata: true,
      chunks: {
        select: {
          chunkIndex: true,
          content: true,
        },
        orderBy: { chunkIndex: "asc" },
      },
    },
  });

  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const content = file.chunks
    .map((chunk) => chunk.content)
    .filter((item) => typeof item === "string" && item.trim().length > 0)
    .join("\n\n")
    .trim();
  const metadata =
    file.metadata && typeof file.metadata === "object" && !Array.isArray(file.metadata)
      ? (file.metadata as Record<string, unknown>)
      : null;
  const rawContent = typeof metadata?.rawContent === "string" ? metadata.rawContent : null;

  return NextResponse.json({
    data: {
      id: file.id,
      folderId: file.folderId,
      title: file.title,
      status: file.status,
      sourceType: file.sourceType,
      metadata: file.metadata,
      content: rawContent ?? content,
    },
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await params;
  const file = await prisma.knowledgeFile.findFirst({
    where: { id: fileId, userId },
    select: {
      id: true,
      folderId: true,
      metadata: true,
    },
  });

  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = typeof payload.content === "string" ? payload.content.replace(/\r\n/g, "\n") : null;
  if (content === null) {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }

  const chunks = splitTextToChunks(content, {
    chunkSize: 1100,
    overlap: 160,
    maxChunks: 240,
  });

  const metadata =
    file.metadata && typeof file.metadata === "object" && !Array.isArray(file.metadata)
      ? (file.metadata as Record<string, unknown>)
      : {};

  await prisma.$transaction(async (tx) => {
    await tx.knowledgeChunk.deleteMany({
      where: {
        fileId: file.id,
      },
    });

    if (chunks.length > 0) {
      await tx.knowledgeChunk.createMany({
        data: chunks.map((chunk) => ({
          folderId: file.folderId,
          fileId: file.id,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          contentLength: chunk.contentLength,
        })),
      });
    }

    await tx.knowledgeFile.update({
      where: { id: file.id },
      data: {
        status: "READY",
        metadata: {
          ...metadata,
          rawContent: content,
        },
      },
    });
  });

  return NextResponse.json({
    data: {
      id: file.id,
      folderId: file.folderId,
      chunkCount: chunks.length,
      content,
    },
  });
}
