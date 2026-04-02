import prisma from "./prisma";
import { syncTaskToSummary } from "./taskSummary";

const DEFAULT_RETENTION_HOURS = 24 * 5; // 5 days
const DEFAULT_BATCH_LIMIT = 200;
const MAX_BATCH_LIMIT = 1000;

function toPositiveNumber(value: string | number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function resolveRetentionHours(input?: number) {
  const envValue = process.env.CREATIVE_TASK_RETENTION_HOURS;
  const envHours = envValue ? Number(envValue) : undefined;
  return toPositiveNumber(input ?? envHours, DEFAULT_RETENTION_HOURS);
}

function resolveBatchLimit(input?: number) {
  const limit = toPositiveNumber(input, DEFAULT_BATCH_LIMIT);
  return Math.min(Math.round(limit), MAX_BATCH_LIMIT);
}

export interface CreativeTaskCleanupOptions {
  retentionHours?: number;
  limit?: number;
  dryRun?: boolean;
}

export interface CreativeTaskCleanupResult {
  dryRun: boolean;
  cutoffIso: string;
  scanned: number;
  deleted: number;
  deletedTaskIds: string[];
  sample?: Array<{
    id: string;
    status: string;
    updatedAt: string;
  }>;
}

export async function cleanupStaleCreativeTasks(
  options: CreativeTaskCleanupOptions = {}
): Promise<CreativeTaskCleanupResult> {
  const retentionHours = resolveRetentionHours(options.retentionHours);
  const limit = resolveBatchLimit(options.limit);
  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);

  const staleTasks = await prisma.creativeTask.findMany({
    where: { updatedAt: { lt: cutoff } },
    select: {
      id: true,
      status: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  if (staleTasks.length === 0) {
    return {
      dryRun: true,
      cutoffIso: cutoff.toISOString(),
      scanned: 0,
      deleted: 0,
      deletedTaskIds: [],
    };
  }

  const deletedTaskIds = staleTasks.map((task) => task.id);
  const sample = staleTasks.slice(0, 20).map((task) => ({
    id: task.id,
    status: task.status,
    updatedAt: task.updatedAt.toISOString(),
  }));

  if (options.dryRun) {
    return {
      dryRun: true,
      cutoffIso: cutoff.toISOString(),
      scanned: staleTasks.length,
      deleted: 0,
      deletedTaskIds: [],
      sample,
    };
  }

  await prisma.$transaction([
    prisma.creativeTaskHistoryDoc.deleteMany({
      where: { taskId: { in: deletedTaskIds } },
    }),
    prisma.creativeTaskStory.deleteMany({
      where: { taskId: { in: deletedTaskIds } },
    }),
    prisma.creativeTaskStyle.deleteMany({
      where: { taskId: { in: deletedTaskIds } },
    }),
    prisma.creativeEvent.deleteMany({
      where: { taskId: { in: deletedTaskIds } },
    }),
    prisma.creativeTask.deleteMany({
      where: { id: { in: deletedTaskIds } },
    }),
  ]);

  await Promise.all(
    deletedTaskIds.map((taskId) =>
      syncTaskToSummary({
        taskType: "creative",
        taskId,
        operation: "delete",
      })
    )
  );

  return {
    dryRun: false,
    cutoffIso: cutoff.toISOString(),
    scanned: staleTasks.length,
    deleted: deletedTaskIds.length,
    deletedTaskIds,
    sample,
  };
}
