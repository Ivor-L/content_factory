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

  const story = await prisma.storyAsset.findFirst({
    where: { id, userId },
  });

  if (!story) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.storyAsset.delete({
    where: { id: story.id },
  });

  await removeAssetFiles([story.contentPath]);

  return NextResponse.json({ data: { id: story.id } });
}
