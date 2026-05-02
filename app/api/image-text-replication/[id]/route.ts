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

function normalizeMyNoteAnalysis(value: unknown) {
  const data = parseObject(value) ?? {};
  const rawTexts = Array.isArray(data.extractedImageTexts) ? data.extractedImageTexts : [];
  const extractedImageTexts = rawTexts
    .map((item, index) => {
      const obj = parseObject(item);
      if (!obj) return null;
      const text = typeof obj.text === 'string' ? obj.text : '';
      const success = Boolean(obj.success);
      const error = typeof obj.error === 'string' ? obj.error : null;
      const idx = Number(obj.index);
      return {
        index: Number.isFinite(idx) && idx > 0 ? Math.floor(idx) : index + 1,
        text,
        success,
        error,
      };
    })
    .filter(Boolean);

  const rewrite = parseObject(data.rewriteResult);
  const rewriteResult = rewrite
    ? {
        title: typeof rewrite.title === 'string' ? rewrite.title : '',
        body: typeof rewrite.body === 'string' ? rewrite.body : '',
        imageTexts: Array.isArray(rewrite.imageTexts)
          ? rewrite.imageTexts.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
      }
    : null;

  return {
    sourceTitle: typeof data.sourceTitle === 'string' ? data.sourceTitle : '',
    sourceText: typeof data.sourceText === 'string' ? data.sourceText : '',
    sourceImages: Array.isArray(data.sourceImages)
      ? data.sourceImages.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    extractedImageTexts,
    rewriteResult,
  };
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

  if (task) {
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

  const myNote = await prisma.imageTextReplicationTask.findFirst({
    where: { id, userId },
  });

  if (!myNote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    task: {
      id: myNote.id,
      status: mapStatus(myNote.status),
      generatedCopy: myNote.generatedCopy || null,
      generatedImages: normalizeGeneratedImages(myNote.generatedImages),
      imageGuidance: normalizeImageGuidance(myNote.imageGuidance),
      errorMessage: myNote.errorMessage ?? null,
      analysisResult: normalizeMyNoteAnalysis(myNote.analysisResult),
      source: {
        title: myNote.sourceTitle || '',
        text: myNote.sourceText || '',
        images: Array.isArray(myNote.sourceImages)
          ? myNote.sourceImages.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
        platform: myNote.sourcePlatform || '',
        sourceId: myNote.sourceId || '',
        sourceUrl: myNote.sourceUrl || '',
      },
      stylePreset: null,
    },
  });
}
