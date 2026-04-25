import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

type Params = {
  params: Promise<{ fileId: string }>;
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
      metadata: true,
    },
  });
  if (!file) {
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

  const metadata =
    file.metadata && typeof file.metadata === "object" && !Array.isArray(file.metadata)
      ? (file.metadata as Record<string, unknown>)
      : {};

  const updated = await prisma.knowledgeFile.update({
    where: { id: file.id },
    data: {
      title,
      originalPath: path,
      metadata: {
        ...metadata,
        relativePath: path,
        path,
        originalFilename: title,
      },
    },
    select: {
      id: true,
      title: true,
      originalPath: true,
      metadata: true,
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await params;
  const file = await prisma.knowledgeFile.findFirst({
    where: { id: fileId, userId },
    select: { id: true },
  });
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.knowledgeFile.delete({
    where: { id: file.id },
  });

  return NextResponse.json({ ok: true });
}
