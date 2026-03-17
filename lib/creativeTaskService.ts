import prisma from "./prisma";
import type { Prisma } from "@prisma/client";
import type { CreativeTaskMetadata } from "@/types/creative";
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
