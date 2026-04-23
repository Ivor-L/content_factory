import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

type Params = {
  params: Promise<{ fileId: string }>;
};

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
