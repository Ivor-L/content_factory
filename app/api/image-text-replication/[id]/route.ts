import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mapStatus(raw: string): string {
  if (raw === "PROCESSING") return "GENERATE_PENDING";
  if (raw === "FAILED") return "GENERATE_FAILED";
  return raw;
}

function normalizeGeneratedImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      urls.push(item);
      continue;
    }
    const obj = parseObject(item);
    if (!obj) continue;
    const url = obj.url;
    if (typeof url === "string" && url.trim()) {
      urls.push(url);
    }
  }
  return urls;
}

function normalizeImageGuidance(value: unknown): Array<{ index: number; description: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, idx) => {
      const obj = parseObject(item);
      if (!obj) return null;
      const description = typeof obj.description === "string" ? obj.description : "";
      if (!description) return null;
      const index = Number(obj.index);
      return {
        index: Number.isFinite(index) && index > 0 ? Math.floor(index) : idx + 1,
        description,
      };
    })
    .filter((item): item is { index: number; description: string } => Boolean(item));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const task = await prisma.creativeTask.findFirst({
    where: { id, userId },
    include: {
      styles: {
        include: {
          style: {
            select: { id: true, name: true, type: true, previewUrl: true, spec: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const metadata = parseObject(task.metadata) ?? {};
  const custom = parseObject(metadata.custom) ?? {};
  const replication = parseObject(custom.replication) ?? {};
  const style = task.styles[0]?.style ?? null;

  return NextResponse.json({
    task: {
      id: task.id,
      status: mapStatus(task.status),
      analysisResult: task.layoutResultJson ?? replication.analysisResult ?? null,
      generatedCopy:
        (typeof replication.generatedCopy === "string" && replication.generatedCopy) ||
        task.ideaText ||
        null,
      generatedImages: normalizeGeneratedImages(task.generatedImagesJson),
      imageGuidance: normalizeImageGuidance(replication.imageGuidance),
      errorMessage: task.errorMessage ?? null,
      stylePreset: style
        ? {
            id: style.id,
            name: style.name,
            type: style.type,
            previewUrl: style.previewUrl,
            spec: style.spec,
          }
        : null,
    },
  });
}
