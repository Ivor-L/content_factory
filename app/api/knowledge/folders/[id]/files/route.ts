import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { splitTextToChunks } from "@/lib/knowledge";

type Params = {
  params: Promise<{ id: string }>;
};

function normalizeFilePath(input: string) {
  const normalized = input
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/")
    .trim();
  if (!normalized) return "";
  if (!/\.(md|markdown|txt)$/i.test(normalized)) {
    return `${normalized}.md`;
  }
  return normalized;
}

function getTitleFromPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "untitled.md";
}

export async function GET(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const folder = await prisma.knowledgeFolder.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!folder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") ?? "200");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 500)
    : 200;

  const files = await prisma.knowledgeFile.findMany({
    where: { folderId: folder.id },
    include: {
      _count: {
        select: {
          chunks: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ data: files });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const folder = await prisma.knowledgeFolder.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!folder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawPath =
    (typeof body.path === "string" ? body.path : "") ||
    (typeof body.title === "string" ? body.title : "");
  const path = normalizeFilePath(rawPath);
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  const title = (typeof body.title === "string" && body.title.trim())
    ? body.title.trim()
    : getTitleFromPath(path);
  const content = typeof body.content === "string" ? body.content.replace(/\r\n/g, "\n") : "";

  const existing = await prisma.knowledgeFile.findFirst({
    where: {
      folderId: folder.id,
      userId,
      originalPath: path,
    },
    select: {
      id: true,
      title: true,
      metadata: true,
    },
  });
  const chunks = splitTextToChunks(content, {
    chunkSize: 1100,
    overlap: 160,
    maxChunks: 240,
  });

  if (existing) {
    if (!content.trim()) {
      return NextResponse.json({ data: existing }, { status: 200 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { fileId: existing.id } });
      if (chunks.length > 0) {
        await tx.knowledgeChunk.createMany({
          data: chunks.map((chunk) => ({
            folderId: folder.id,
            fileId: existing.id,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            contentLength: chunk.contentLength,
          })),
        });
      }

      const metadata =
        existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
          ? (existing.metadata as Record<string, unknown>)
          : {};

      return tx.knowledgeFile.update({
        where: { id: existing.id },
        data: {
          title,
          status: "READY",
          originalPath: path,
          metadata: {
            ...metadata,
            relativePath: path,
            path,
            originalFilename: title,
            rawContent: content,
            updatedBy: "manual",
          },
        },
        include: {
          _count: {
            select: {
              chunks: true,
            },
          },
        },
      });
    });

    return NextResponse.json({ data: updated }, { status: 200 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const file = await tx.knowledgeFile.create({
      data: {
        folderId: folder.id,
        userId,
        title,
        sourceType: "manual",
        status: "READY",
        originalPath: path,
        metadata: {
          relativePath: path,
          path,
          originalFilename: title,
          rawContent: content,
          createdBy: "manual",
        },
      },
      include: {
        _count: {
          select: {
            chunks: true,
          },
        },
      },
    });

    if (chunks.length > 0) {
      await tx.knowledgeChunk.createMany({
        data: chunks.map((chunk) => ({
          folderId: folder.id,
          fileId: file.id,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          contentLength: chunk.contentLength,
        })),
      });
    }

    return file;
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
