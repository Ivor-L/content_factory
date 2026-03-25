import prisma from "./prisma";
import type { Prisma } from "@prisma/client";
import type { CreativeTaskMetadata, PosterImageAsset } from "@/types/creative";
import type { CreativeStageKey } from "./creativeStages";
import { creativeStageOrder } from "./creativeStages";
import type { CreativeTaskSummary } from "@/types/creative";
import { initMetadata } from "./creativeTaskUtils";

export type LoadedCreativeTask = Prisma.CreativeTaskGetPayload<{
  include: {
    historyDocs: {
      include: {
        historyDoc: {
          include: {
            latestDerivative: true;
          };
        };
      };
    };
    stories: { include: { story: true } };
    styles: { include: { style: true } };
    voiceProfile: true;
  };
}>;

export async function loadTaskWithAssets(id: string, userId: string) {
  return prisma.creativeTask.findFirst({
    where: { id, userId },
    include: {
      historyDocs: {
        include: {
          historyDoc: {
            include: {
              latestDerivative: true,
            },
          },
        },
      },
      stories: { include: { story: true } },
      styles: { include: { style: true } },
      voiceProfile: true,
    },
  });
}

export function parseMetadata(meta: Prisma.JsonValue | null | undefined): CreativeTaskMetadata {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return initMetadata();
  }
  const parsed = meta as CreativeTaskMetadata;
  if (!parsed.stages) {
    parsed.stages = initMetadata().stages;
  }
  if (!parsed.actions) {
    parsed.actions = {};
  }
  if (!parsed.custom) {
    parsed.custom = {};
  }
  return parsed;
}

function coerceJsonValue(value: Prisma.JsonValue | null | undefined): unknown {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return value;
}

export function parseGeneratedImages(
  value: Prisma.JsonValue | null | undefined
): PosterImageAsset[] {
  const parsed = coerceJsonValue(value);
  if (!parsed) return [];

  const candidates = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.images)
    ? ((parsed as Record<string, unknown>).images as unknown[])
    : Array.isArray((parsed as Record<string, unknown>)?.data)
    ? ((parsed as Record<string, unknown>).data as unknown[])
    : [];

  if (!Array.isArray(candidates)) return [];

  const images: PosterImageAsset[] = [];
  candidates.forEach((item, index) => {
    if (!item) return;
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) return;
      images.push({
        id: `poster-${index}`,
        url: trimmed,
        index,
      });
      return;
    }

    if (typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const urlCandidates = [obj.url, obj.imageUrl, obj.publicUrl, obj.src, obj.originalUrl];
      const url = urlCandidates.find((entry) => typeof entry === "string" && entry.trim());
      if (!url || typeof url !== "string") return;

      images.push({
        id:
          typeof obj.id === "string"
            ? obj.id
            : typeof obj.fileName === "string"
            ? obj.fileName
            : typeof obj.name === "string"
            ? obj.name
            : `poster-${(obj.index as number | undefined) ?? index}`,
        url,
        fileName: typeof obj.fileName === "string" ? obj.fileName : undefined,
        prompt: typeof obj.prompt === "string" ? obj.prompt : undefined,
        mimeType: typeof obj.mimeType === "string" ? obj.mimeType : undefined,
        index: typeof obj.index === "number" ? obj.index : index,
      });
    }
  });

  return images;
}

export function summarizeTask(task: LoadedCreativeTask): CreativeTaskSummary {
  const metadata = parseMetadata(task.metadata);
  return {
    id: task.id,
    title: task.title,
    stage: task.stage as CreativeStageKey,
    status: task.status,
    ideaText: task.ideaText ?? undefined,
    targetOutput: task.targetOutput ?? undefined,
    channel: task.channel ?? undefined,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    metadata,
    attachments: {
      historyDocs: task.historyDocs.length,
      stories: task.stories.length,
      styles: task.styles.length,
    },
    generatedImages: parseGeneratedImages(task.generatedImagesJson),
  };
}

export function flattenAssets(task: LoadedCreativeTask) {
  return {
    historyDocs: task.historyDocs.map((item) => item.historyDoc),
    stories: task.stories.map((item) => item.story),
    styles: task.styles.map((item) => item.style),
  };
}

export function assertStageKey(value: string): CreativeStageKey {
  if (creativeStageOrder.includes(value as CreativeStageKey)) {
    return value as CreativeStageKey;
  }
  throw new Error(`Invalid stage key: ${value}`);
}
