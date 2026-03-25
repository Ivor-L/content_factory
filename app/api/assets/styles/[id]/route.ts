import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { removeAssetFiles } from "@/lib/storageRemove";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const style = await prisma.stylePreset.findFirst({
    where: { id, userId },
  });

  if (!style) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const metadata =
    style.metadata && typeof style.metadata === "object" && !Array.isArray(style.metadata)
      ? (style.metadata as Record<string, any>)
      : null;
  const storagePath = metadata?.storagePath;
  const analysisPath = metadata?.analysisPath;

  await prisma.stylePreset.delete({
    where: { id: style.id },
  });

  await removeAssetFiles([storagePath, analysisPath]);

  return NextResponse.json({ data: { id: style.id } });
}
