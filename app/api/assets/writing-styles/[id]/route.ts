import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { removeAssetFiles } from "@/lib/storageRemove";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const style = await prisma.writingStyle.findFirst({
    where: { id, userId },
    include: {
      currentProfile: true,
      _count: {
        select: {
          documents: true,
          chunks: true,
          profiles: true,
        },
      },
    },
  });

  if (!style) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: style });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existed = await prisma.writingStyle.findFirst({ where: { id, userId } });
  if (!existed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof payload?.name === "string" ? payload.name.trim() : undefined;
  const description =
    typeof payload?.description === "string" ? payload.description.trim() : undefined;
  const channel =
    typeof payload?.channel === "string" ? payload.channel.trim() : undefined;

  if (name !== undefined && !name) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
  }

  const style = await prisma.writingStyle.update({
    where: { id: existed.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(channel !== undefined ? { channel: channel || null } : {}),
    },
  });

  return NextResponse.json({ data: style });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const style = await prisma.writingStyle.findFirst({
    where: { id, userId },
    include: {
      documents: {
        select: {
          originalPath: true,
        },
      },
    },
  });

  if (!style) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.writingStyle.delete({
    where: { id: style.id },
  });

  await removeAssetFiles(style.documents.map((doc) => doc.originalPath));

  return NextResponse.json({ data: { id: style.id } });
}
