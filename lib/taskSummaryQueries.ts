import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { TaskType } from '@/lib/taskSummary';

type TaskSummaryRecord = Awaited<ReturnType<typeof prisma.taskSummary.findMany>>[number];

export const VALID_TASK_TYPES: TaskType[] = [
  'creative',
  'poster',
  'digitalHuman',
  'replication',
  'storyboard',
  'knowledgeVideo',
  'replicationShot',
];

const COMPLETED_STATUSES = new Set([
  'COMPLETED',
  'READY',
  'SUCCESS',
  'DONE',
  'FINISHED',
]);

const FAILED_STATUSES = new Set([
  'FAILED',
  'ERROR',
  'CANCELED',
  'CANCELLED',
  'GENERATE_FAILED',
  'BREAKDOWN_FAILED',
]);

const PROCESSING_STATUSES = new Set([
  'PROCESSING',
  'ANALYZING',
  'RUNNING',
  'PENDING',
  'QUEUED',
  'STARTED',
  'GENERATING',
  'GENERATE_PENDING',
  'BREAKDOWN_PENDING',
  'BREAKDOWN_PROCESSING',
]);

function normalizePosterSummaryStatus(rawStatus: string | null | undefined): string {
  const status = String(rawStatus ?? '').trim().toUpperCase();
  if (!status) return 'PROCESSING';
  if (COMPLETED_STATUSES.has(status)) return 'COMPLETED';
  if (FAILED_STATUSES.has(status) || status.endsWith('_FAILED')) return 'FAILED';
  if (
    PROCESSING_STATUSES.has(status) ||
    status.endsWith('_PENDING') ||
    status.endsWith('_PROCESSING')
  ) {
    return 'PROCESSING';
  }
  return status;
}

function extractFirstImageUrl(generatedImagesJson: unknown): string | null {
  if (!generatedImagesJson) return null;

  let parsed: unknown = generatedImagesJson;
  if (typeof generatedImagesJson === 'string') {
    try {
      parsed = JSON.parse(generatedImagesJson);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const first = parsed[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object' && 'url' in first) {
    const url = (first as { url?: unknown }).url;
    return typeof url === 'string' && url.trim() ? url : null;
  }
  return null;
}

async function reconcilePosterSummaries(
  tasks: Array<{
    id: string;
    taskType: string;
    taskId: string;
    status: string;
    thumbnailUrl: string | null;
    progress: number | null;
  }> & TaskSummaryRecord[]
) {
  const posterTasks = tasks.filter(
    (task) => task.taskType === 'poster' && typeof task.taskId === 'string' && task.taskId,
  );
  if (posterTasks.length === 0) return tasks;

  const posterTaskIds = Array.from(new Set(posterTasks.map((task) => task.taskId)));
  const creativeTasks = await prisma.creativeTask.findMany({
    where: {
      id: { in: posterTaskIds },
    },
    select: {
      id: true,
      status: true,
      generatedImagesJson: true,
    },
  });

  if (creativeTasks.length === 0) return tasks;

  const creativeMap = new Map(creativeTasks.map((task) => [task.id, task]));
  const repairOps: Promise<unknown>[] = [];
  const now = new Date();

  const reconciled = tasks.map((task) => {
    if (task.taskType !== 'poster') return task;

    const source = creativeMap.get(task.taskId);
    if (!source) return task;

    const currentStatus = String(task.status ?? '').trim().toUpperCase();
    const expectedStatus = normalizePosterSummaryStatus(source.status);
    const fallbackThumbnail = extractFirstImageUrl(source.generatedImagesJson);
    const hasMissingThumbnail = !task.thumbnailUrl && Boolean(fallbackThumbnail);
    const hasStatusMismatch = expectedStatus !== currentStatus;

    if (!hasMissingThumbnail && !hasStatusMismatch) {
      return task;
    }

    const updateData: {
      status?: string;
      progress?: number;
      thumbnailUrl?: string;
      updatedAt: Date;
    } = { updatedAt: now };
    if (hasStatusMismatch) {
      updateData.status = expectedStatus;
      if (expectedStatus === 'COMPLETED') {
        updateData.progress = 100;
      }
    }
    if (hasMissingThumbnail && fallbackThumbnail) {
      updateData.thumbnailUrl = fallbackThumbnail;
    }

    repairOps.push(
      prisma.taskSummary.updateMany({
        where: { taskType: 'poster', taskId: task.taskId },
        data: updateData,
      }),
    );

    return {
      ...task,
      status: hasStatusMismatch ? expectedStatus : task.status,
      progress: hasStatusMismatch && expectedStatus === 'COMPLETED' ? 100 : task.progress,
      thumbnailUrl: hasMissingThumbnail && fallbackThumbnail ? fallbackThumbnail : task.thumbnailUrl,
    };
  });

  if (repairOps.length > 0) {
    await Promise.allSettled(repairOps);
  }

  return reconciled;
}

export type FetchUserTaskSummariesParams = {
  userId: string;
  taskType?: TaskType | null;
  status?: string | null;
  limit?: number;
  offset?: number;
};

type FetchResult = {
  tasks: TaskSummaryRecord[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

const sanitizeLimit = (raw?: number) => {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return 50;
  return Math.min(Math.max(raw, 1), 100);
};

export async function fetchUserTaskSummaries({
  userId,
  taskType,
  status,
  limit: rawLimit,
  offset: rawOffset,
}: FetchUserTaskSummariesParams): Promise<FetchResult> {
  if (!userId) {
    throw new Error('User ID is required to fetch task summaries');
  }

  const limit = sanitizeLimit(rawLimit);
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset ?? 0, 0) : 0;

  const normalizedTaskType =
    taskType && VALID_TASK_TYPES.includes(taskType) ? taskType : undefined;

  const where: Prisma.TaskSummaryWhereInput = {
    userId,
  };

  if (normalizedTaskType) {
    where.taskType = normalizedTaskType;
  } else {
    where.taskType = { in: VALID_TASK_TYPES };
  }

  if (status) {
    where.status = status;
  }

  const [tasks, total] = await Promise.all([
    prisma.taskSummary.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.taskSummary.count({ where }),
  ]);

  const reconciledTasks = await reconcilePosterSummaries(tasks) as TaskSummaryRecord[];

  return {
    tasks: reconciledTasks,
    total,
    limit,
    offset,
    hasMore: offset + reconciledTasks.length < total,
  };
}
