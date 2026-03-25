import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

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
    select: { id: true },
  });

  if (!style) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId") || undefined;
  const limitParam = Number(searchParams.get("limit") ?? "200");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 2000)
    : 200;

  const chunks = await prisma.writingStyleChunk.findMany({
    where: {
      styleId: style.id,
      ...(documentId ? { documentId } : {}),
    },
    orderBy: [
      { createdAt: "desc" },
      { chunkIndex: "asc" },
    ],
    take: limit,
  });

  return NextResponse.json({ data: chunks });
}
