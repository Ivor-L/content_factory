import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { downloadFromStorage } from "@/lib/storageDownload";
import { removeAssetFiles } from "@/lib/storageRemove";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const historyDoc = await prisma.historyDoc.findFirst({
    where: {
      id,
      userId,
    },
  });

  if (!historyDoc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const metadata =
    historyDoc.metadata && typeof historyDoc.metadata === "object" && !Array.isArray(historyDoc.metadata)
      ? (historyDoc.metadata as Record<string, any>)
      : null;

  let insights: Record<string, any> | null = null;
  if (historyDoc.insightsPath) {
    try {
      const asset = await downloadFromStorage(historyDoc.insightsPath);
      const text = asset.buffer.toString("utf-8");
      insights = JSON.parse(text);
    } catch (error) {
      console.error("Failed to load history insights", error);
    }
  }

  const originalUrl = metadata && typeof metadata.publicUrl === "string" ? metadata.publicUrl : null;

  return NextResponse.json({
    data: {
      ...historyDoc,
      metadata,
      originalUrl,
      insights,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const historyDoc = await prisma.historyDoc.findFirst({
    where: { id, userId },
  });

  if (!historyDoc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.historyDoc.delete({
    where: { id: historyDoc.id },
  });

  await removeAssetFiles([historyDoc.originalPath, historyDoc.insightsPath]);

  return NextResponse.json({ data: { id: historyDoc.id } });
}
