import prisma from "@/lib/prisma";

export type KnowledgeVideoType = "subtitle_wrap" | "knowledge_animation";

export interface CreateKnowledgeVideoTaskOptions {
  userId: string;
  title?: string | null;
  videoType: KnowledgeVideoType;
  scriptContent?: string | null;
  audioUrl?: string | null;
  audioDuration?: number | null;
  themeKey?: string | null;
  timeline?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  sourceTaskId?: string;
}

export function serializeKnowledgeVideoTask(task: any) {
  return {
    id: task.id,
    userId: task.userId,
    title: task.title,
    videoType: task.videoType,
    scriptContent: task.scriptContent,
    audioUrl: task.audioUrl,
    audioDuration: task.audioDuration,
    themeKey: task.themeKey,
    status: task.status,
    error: task.error,
    videoUrl: task.videoUrl,
    videoStoragePath: task.videoStoragePath,
    coverUrl: task.coverUrl,
    coverStoragePath: task.coverStoragePath,
    durationSeconds: task.durationSeconds,
    timeline: task.timeline,
    metadata: task.metadata,
    renderStats: task.renderStats,
    remotionComposition: task.remotionComposition,
    remotionProps: task.remotionProps,
    sourceTaskId: task.sourceTaskId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export async function createKnowledgeVideoTask(options: CreateKnowledgeVideoTaskOptions) {
  const sourceTaskConnect = options.sourceTaskId
    ? {
        connect: { id: options.sourceTaskId },
      }
    : undefined;

  const task = await prisma.knowledgeVideoTask.create({
    data: {
      userId: options.userId,
      title: options.title ?? null,
      videoType: options.videoType,
      scriptContent: options.scriptContent ?? null,
      audioUrl: options.audioUrl ?? null,
      audioDuration: options.audioDuration ?? null,
      themeKey: options.themeKey ?? null,
      timeline: options.timeline ?? undefined,
      metadata: options.metadata ?? undefined,
      sourceTask: sourceTaskConnect,
      status: "QUEUED",
    },
  });

  return serializeKnowledgeVideoTask(task);
}
