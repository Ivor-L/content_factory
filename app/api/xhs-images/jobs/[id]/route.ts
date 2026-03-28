import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { ensurePosterJobSchema } from "@/lib/posterJobSchema";
import { serializePosterJob } from "@/lib/posterJobs";
import { removeAssetFiles } from "@/lib/storageRemove";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await context.params;
  const id = normalizeId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  await ensurePosterJobSchema();

  const job = await prisma.xhsPosterJob.findFirst({
    where: { id, userId },
    include: { images: { orderBy: { sortOrder: "asc" } } },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ data: serializePosterJob(job) });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await context.params;
  const id = normalizeId(rawId);
  if (!id) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  await ensurePosterJobSchema();

  const job = await prisma.xhsPosterJob.findFirst({
    where: { id, userId },
    include: { images: true },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const imagePaths = job.images.map((image) => image.storagePath);

  await prisma.xhsPosterJob.delete({ where: { id: job.id } });
  await removeAssetFiles(imagePaths);

  return NextResponse.json({ success: true });
}
