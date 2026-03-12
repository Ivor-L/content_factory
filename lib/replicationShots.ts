import prisma from '@/lib/prisma';
import { Prisma, ReplicationShotTask } from '@prisma/client';

export const REPLICATION_SHOT_TASK_STATUSES = [
  'PENDING',
  'SCENE_GENERATING',
  'SCENE_PENDING_CONFIRM',
  'SHOTS_GENERATING',
  'SHOTS_COMPLETED',
  'VIDEOS_GENERATING',
  'COMPLETED',
  'FAILED',
] as const;

export type ReplicationShotTaskStatus = (typeof REPLICATION_SHOT_TASK_STATUSES)[number];

export type ShotPrompt = {
  index: number;
  title?: string;
  description?: string;
  imagePrompt?: string;
  videoPrompt?: string;
  referenceImageUrl?: string;
  status?: 'pending' | 'generating' | 'completed' | 'failed';
  metadata?: Record<string, unknown>;
};

export type ShotFrame = {
  index: number;
  imageUrl?: string;
  prompt?: string;
  referenceImageUrl?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  errorMessage?: string;
  updatedAt?: string;
};

export type EndFrameOption = {
  index: number;
  useNextAsEndFrame: boolean;
  endFrameUrl?: string;
};

export type ShotVideo = {
  index: number;
  videoUrl?: string;
  prompt?: string;
  referenceImageUrl?: string;
  runninghubTaskId?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
};

const baseTaskInclude = {
  script: {
    select: {
      id: true,
      title: true,
      videoUrl: true,
      breakdown: true,
      blueprint: true,
    },
  },
  product: {
    select: {
      id: true,
      name: true,
      images: true,
      description: true,
      sellingPoints: true,
      sellingPointsText: true,
    },
  },
  character: {
    select: {
      id: true,
      name: true,
      avatar: true,
      voiceId: true,
    },
  },
} satisfies Prisma.ReplicationShotTaskInclude;

export type ReplicationShotTaskWithRelations = Prisma.ReplicationShotTaskGetPayload<{
  include: typeof baseTaskInclude;
}>;

type JsonArray = ShotPrompt[] | ShotFrame[] | EndFrameOption[] | ShotVideo[] | null;

function asJsonValue(value: JsonArray): Prisma.JsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  return value as unknown as Prisma.JsonValue;
}

function parseArrayField<T>(value: Prisma.JsonValue | null): T[] | null {
  if (!value) return null;
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as T[];
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeReplicationShotTask(
  task: ReplicationShotTaskWithRelations
): ReplicationShotTaskWithRelations & {
  shotPrompts: ShotPrompt[] | null;
  firstFrames: ShotFrame[] | null;
  endFrameOptions: EndFrameOption[] | null;
  videos: ShotVideo[] | null;
} {
  return {
    ...task,
    shotPrompts: parseArrayField<ShotPrompt>(task.shotPrompts as Prisma.JsonValue | null),
    firstFrames: parseArrayField<ShotFrame>(task.firstFrames as Prisma.JsonValue | null),
    endFrameOptions: parseArrayField<EndFrameOption>(
      task.endFrameOptions as Prisma.JsonValue | null
    ),
    videos: parseArrayField<ShotVideo>(task.videos as Prisma.JsonValue | null),
  };
}

export interface CreateReplicationShotTaskInput {
  scriptId: string;
  userId?: string | null;
  productId?: string | null;
  characterId?: string | null;
  status?: ReplicationShotTaskStatus;
  sceneImageUrl?: string | null;
  productSceneImageUrl?: string | null;
  shotPrompts?: ShotPrompt[] | null;
  firstFrames?: ShotFrame[] | null;
}

export async function createReplicationShotTask(
  input: CreateReplicationShotTaskInput
): Promise<ReturnType<typeof normalizeReplicationShotTask>> {
  const {
    scriptId,
    userId,
    productId,
    characterId,
    status = 'SCENE_GENERATING',
    sceneImageUrl,
    productSceneImageUrl,
    shotPrompts = null,
    firstFrames = null,
  } = input;

  const task = await prisma.replicationShotTask.create({
    data: {
      script: { connect: { id: scriptId } },
      ...(productId ? { product: { connect: { id: productId } } } : {}),
      ...(characterId ? { character: { connect: { id: characterId } } } : {}),
      ...(userId ? { userId } : {}),
      status,
      sceneImageUrl: sceneImageUrl ?? undefined,
      productSceneImageUrl: productSceneImageUrl ?? undefined,
      shotPrompts: asJsonValue(shotPrompts),
      firstFrames: asJsonValue(firstFrames),
    },
    include: baseTaskInclude,
  });

  return normalizeReplicationShotTask(task);
}

export interface ReplicationShotTaskFilters {
  userId?: string;
  status?: ReplicationShotTaskStatus | ReplicationShotTaskStatus[];
}

export async function listReplicationShotTasks(
  filters: ReplicationShotTaskFilters = {}
): Promise<ReturnType<typeof normalizeReplicationShotTask>[]> {
  const { userId, status } = filters;
  const where: Prisma.ReplicationShotTaskWhereInput = {};

  if (userId) {
    where.userId = userId;
  }

  if (status) {
    where.status = Array.isArray(status) ? { in: status } : status;
  }

  const tasks = await prisma.replicationShotTask.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: baseTaskInclude,
  });

  return tasks.map((task) => normalizeReplicationShotTask(task));
}

export async function getReplicationShotTaskById(
  id: string,
  userId?: string
): Promise<ReturnType<typeof normalizeReplicationShotTask> | null> {
  const task = await prisma.replicationShotTask.findFirst({
    where: {
      id,
      ...(userId ? { userId } : {}),
    },
    include: baseTaskInclude,
  });

  if (!task) return null;
  return normalizeReplicationShotTask(task);
}

export interface UpdateReplicationShotTaskInput {
  taskId: string;
  userId?: string;
  data: {
    status?: ReplicationShotTaskStatus;
    sceneImageUrl?: string | null;
    productSceneImageUrl?: string | null;
    shotPrompts?: ShotPrompt[] | null;
    firstFrames?: ShotFrame[] | null;
    endFrameOptions?: EndFrameOption[] | null;
    videos?: ShotVideo[] | null;
    finalVideoUrl?: string | null;
  };
}

export async function updateReplicationShotTask({
  taskId,
  userId,
  data,
}: UpdateReplicationShotTaskInput): Promise<
  ReturnType<typeof normalizeReplicationShotTask>
> {
  const existing = await prisma.replicationShotTask.findFirst({
    where: {
      id: taskId,
      ...(userId ? { userId } : {}),
    },
    select: { id: true },
  });

  if (!existing) {
    throw new Error('Replication shot task not found or access denied');
  }

  const updateData: Prisma.ReplicationShotTaskUpdateInput = {};

  if (data.status) updateData.status = data.status;
  if (data.sceneImageUrl !== undefined) updateData.sceneImageUrl = data.sceneImageUrl;
  if (data.productSceneImageUrl !== undefined)
    updateData.productSceneImageUrl = data.productSceneImageUrl;
  if (data.shotPrompts !== undefined) updateData.shotPrompts = asJsonValue(data.shotPrompts);
  if (data.firstFrames !== undefined) updateData.firstFrames = asJsonValue(data.firstFrames);
  if (data.endFrameOptions !== undefined)
    updateData.endFrameOptions = asJsonValue(data.endFrameOptions);
  if (data.videos !== undefined) updateData.videos = asJsonValue(data.videos);
  if (data.finalVideoUrl !== undefined) updateData.finalVideoUrl = data.finalVideoUrl;

  const task = await prisma.replicationShotTask.update({
    where: {
      id: taskId,
    },
    data: updateData,
    include: baseTaskInclude,
  });

  return normalizeReplicationShotTask(task);
}
