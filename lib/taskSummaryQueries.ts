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
  'grid',
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

function toMetadataRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}

function safeParseResult(payload?: string | null): Record<string, unknown> | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (error) {
    console.warn('[taskSummaryQueries] Failed to parse replication result JSON', error);
  }
  return null;
}

async function attachReplicationResults(
  tasks: TaskSummaryRecord[],
): Promise<TaskSummaryRecord[]> {
  const replicationTasks = tasks.filter(
    (task) => task.taskType === 'replication' && typeof task.taskId === 'string' && task.taskId,
  );
  if (replicationTasks.length === 0) return tasks;

  const replicationIds = Array.from(new Set(replicationTasks.map((task) => task.taskId)));
  const replicationRows = await prisma.replication.findMany({
    where: { id: { in: replicationIds } },
    select: {
      id: true,
      status: true,
      type: true,
      result: true,
    },
  });
  if (replicationRows.length === 0) return tasks;

  const replicationMap = new Map(replicationRows.map((row) => [row.id, row]));

  return tasks.map((task) => {
    if (task.taskType !== 'replication') return task;
    const row = replicationMap.get(task.taskId);
    if (!row) return task;

    const parsedResult = safeParseResult(row.result);
    const metadataRecord = toMetadataRecord(task.metadata);
    if (parsedResult) {
      metadataRecord.replicationResult = parsedResult;
      const parsedVideoUrl =
        (typeof parsedResult.videoUrl === 'string' && parsedResult.videoUrl.trim()) ||
        (typeof parsedResult.resultUrl === 'string' && parsedResult.resultUrl.trim()) ||
        (typeof parsedResult.result_url === 'string' && parsedResult.result_url.trim()) ||
        null;
      if (parsedVideoUrl && !metadataRecord.videoUrl) {
        metadataRecord.videoUrl = parsedVideoUrl;
      }
    }
    if (row.status) {
      metadataRecord.replicationStatus = row.status;
    }
    if (row.type) {
      metadataRecord.replicationType = row.type;
    }

    const nextMetadata: Prisma.JsonValue | null =
      Object.keys(metadataRecord).length > 0 ? (metadataRecord as Prisma.JsonValue) : task.metadata;

    return {
      ...task,
      metadata: nextMetadata,
    };
  });
}

export type FetchUserTaskSummariesParams = {
  userId: string;
  taskType?: TaskType | null;
  status?: string | null;
  limit?: number;
  offset?: number;
  includeEnrichment?: boolean;
  includeTotal?: boolean;
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
  includeEnrichment = true,
  includeTotal = true,
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

  const take = includeTotal ? limit : limit + 1;
  const tasksFetched = await prisma.taskSummary.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    skip: offset,
  });
  const hasExtraForPagination = !includeTotal && tasksFetched.length > limit;
  const tasks = hasExtraForPagination ? tasksFetched.slice(0, limit) : tasksFetched;

  let total = 0;
  if (includeTotal) {
    total = await prisma.taskSummary.count({ where });
  } else {
    total = offset + tasks.length + (hasExtraForPagination ? 1 : 0);
  }

  let resultTasks = tasks as TaskSummaryRecord[];
  if (includeEnrichment) {
    const reconciledTasks = await reconcilePosterSummaries(tasks as TaskSummaryRecord[]) as TaskSummaryRecord[];
    resultTasks = await attachReplicationResults(reconciledTasks) as TaskSummaryRecord[];
  }

  return {
    tasks: resultTasks,
    total,
    limit,
    offset,
    hasMore: includeTotal ? offset + resultTasks.length < total : hasExtraForPagination,
  };
}
