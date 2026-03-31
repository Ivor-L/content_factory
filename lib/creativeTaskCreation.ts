import prisma from "./prisma";
import { initMetadata } from "./creativeTaskUtils";
import { ensureSystemStylePresetsSeeded } from "./systemStylePresets";
import type { StyleRules } from "@/types/creative";
import { sanitizeStyleRules } from "./styleRules";
import { toInputJson } from "./jsonUtils";

export type CreateCreativeTaskPayload = {
  title?: string;
  ideaText: string;
  channel?: string | null;
  targetOutput?: string | null;
  goal?: Record<string, unknown>;
  voiceProfileId?: string | null;
  historyDocIds?: string[];
  storyIds?: string[];
  styleIds?: string[];
  styleRules?: StyleRules | null;
  language?: string | null;
};

export async function createCreativeTaskWithAssets({
  userId,
  payload,
}: {
  userId: string;
  payload: CreateCreativeTaskPayload;
}) {
  if (!payload.ideaText || typeof payload.ideaText !== "string") {
    throw new Error("ideaText is required");
  }

  let voiceProfileConnect:
    | { connect: { id: string } }
    | undefined = undefined;

  if (payload.voiceProfileId) {
    const voiceProfile = await prisma.voiceProfile.findFirst({
      where: { id: payload.voiceProfileId, userId },
      select: { id: true },
    });
    if (!voiceProfile) {
      throw new Error("voiceProfile not found");
    }
    voiceProfileConnect = { connect: { id: voiceProfile.id } };
  }

  const metadata = initMetadata();
  if (Object.prototype.hasOwnProperty.call(payload, "language")) {
    const normalizedLanguage =
      typeof payload.language === "string" ? payload.language.trim() : "";
    metadata.custom = metadata.custom ?? {};
    metadata.custom.language = normalizedLanguage || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "styleRules")) {
    const sanitizedStyleRules = sanitizeStyleRules(payload.styleRules);
    if (sanitizedStyleRules !== undefined) {
      metadata.custom = metadata.custom ?? {};
      if (sanitizedStyleRules === null) {
        metadata.custom.styleRules = null;
      } else {
        metadata.custom.styleRules = sanitizedStyleRules;
      }
    }
  }

  const goalJson = toInputJson(payload.goal);
  const task = await prisma.creativeTask.create({
    data: {
      userId,
      title: payload.title ?? null,
      ideaText: payload.ideaText,
      channel: payload.channel ?? null,
      targetOutput: payload.targetOutput ?? null,
      goal: goalJson === undefined ? undefined : goalJson,
      metadata: toInputJson(metadata) ?? undefined,
      voiceProfile: voiceProfileConnect,
    },
  });

  await linkAssets({
    taskId: task.id,
    userId,
    historyDocIds: payload.historyDocIds,
    storyIds: payload.storyIds,
    styleIds: payload.styleIds,
  });

  await autoLinkDefaultAssets({
    taskId: task.id,
    userId,
    channel: payload.channel,
    ideaText: payload.ideaText,
    skipHistory: Boolean(payload.historyDocIds?.length),
    skipStories: Boolean(payload.storyIds?.length),
  });

  return task;
}

async function linkAssets({
  taskId,
  userId,
  historyDocIds,
  storyIds,
  styleIds,
}: {
  taskId: string;
  userId: string;
  historyDocIds?: string[];
  storyIds?: string[];
  styleIds?: string[];
}) {
  if (historyDocIds?.length) {
    const owned = await prisma.historyDoc.findMany({
      where: { id: { in: historyDocIds }, userId },
      select: { id: true },
    });
    if (owned.length !== historyDocIds.length) {
      throw new Error("history doc not found or permission denied");
    }
    await prisma.creativeTaskHistoryDoc.createMany({
      data: owned.map((doc) => ({ taskId, historyDocId: doc.id })),
      skipDuplicates: true,
    });
  }

  if (storyIds?.length) {
    const owned = await prisma.storyAsset.findMany({
      where: { id: { in: storyIds }, userId },
      select: { id: true },
    });
    if (owned.length !== storyIds.length) {
      throw new Error("story asset not found or permission denied");
    }
    await prisma.creativeTaskStory.createMany({
      data: owned.map((story) => ({ taskId, storyId: story.id })),
      skipDuplicates: true,
    });
  }

  if (styleIds?.length) {
    await ensureSystemStylePresetsSeeded();
    const accessible = await prisma.stylePreset.findMany({
      where: {
        id: { in: styleIds },
        OR: [{ userId }, { userId: null }],
      },
      select: { id: true },
    });
    if (accessible.length !== styleIds.length) {
      throw new Error("style preset not found or permission denied");
    }
    await prisma.creativeTaskStyle.createMany({
      data: accessible.map((style) => ({ taskId, styleId: style.id })),
      skipDuplicates: true,
    });
  }
}

async function autoLinkDefaultAssets({
  taskId,
  userId,
  channel,
  ideaText,
  skipHistory,
  skipStories,
}: {
  taskId: string;
  userId: string;
  channel?: string | null;
  ideaText?: string | null;
  skipHistory?: boolean;
  skipStories?: boolean;
}) {
  const normalizedChannel = channel?.trim() || undefined;
  const keywords = buildIdeaKeywords(ideaText);

  if (!skipHistory) {
    const docs = await findPreferredHistoryDocs(userId, normalizedChannel, keywords);
    if (docs.length > 0) {
      await prisma.creativeTaskHistoryDoc.createMany({
        data: docs.map((doc) => ({ taskId, historyDocId: doc.id })),
        skipDuplicates: true,
      });
    }
  }

  if (!skipStories) {
    const stories = await findPreferredStories(userId, normalizedChannel, keywords);
    if (stories.length > 0) {
      await prisma.creativeTaskStory.createMany({
        data: stories.map((story) => ({ taskId, storyId: story.id })),
        skipDuplicates: true,
      });
    }
  }
}

async function findPreferredHistoryDocs(
  userId: string,
  channel?: string,
  keywords: string[] = [],
  take = 2
) {
  const keywordWhere = buildKeywordWhere(keywords, ["title", "description"]);
  const docs = await prisma.historyDoc.findMany({
    where: {
      userId,
      ...(channel ? { channel } : {}),
      ...keywordWhere,
    },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true },
  });
  if (docs.length > 0 || !channel) return docs;
  const fallback = await prisma.historyDoc.findMany({
    where: { userId, ...keywordWhere },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true },
  });
  if (fallback.length > 0) return fallback;
  return prisma.historyDoc.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true },
  });
}

async function findPreferredStories(
  userId: string,
  channel?: string,
  keywords: string[] = [],
  take = 2
) {
  const keywordWhere = buildKeywordWhere(keywords, ["title", "summary"]);
  const stories = await prisma.storyAsset.findMany({
    where: {
      userId,
      ...(channel ? { channel } : {}),
      ...keywordWhere,
    },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true },
  });
  if (stories.length > 0 || !channel) return stories;
  const fallback = await prisma.storyAsset.findMany({
    where: { userId, ...keywordWhere },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true },
  });
  if (fallback.length > 0) return fallback;
  return prisma.storyAsset.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true },
  });
}

function buildIdeaKeywords(input?: string | null, limit = 5) {
  if (!input) return [];
  const matches = input.toLowerCase().match(/[a-z0-9\u4e00-\u9fa5]+/g);
  if (!matches) return [];
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const word of matches) {
    if (word.length < 2) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    keywords.push(word);
    if (keywords.length >= limit) break;
  }
  return keywords;
}

function buildKeywordWhere(keywords: string[], fields: string[]) {
  if (!keywords.length) return {};
  const orConditions = keywords.map((keyword) => ({
    OR: fields.map((field) => ({
      [field]: { contains: keyword, mode: "insensitive" as const },
    })),
  }));
  return { OR: orConditions };
}
