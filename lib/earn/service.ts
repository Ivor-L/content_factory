import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  clampInt,
  isEarnTaskStatus,
  isEarnUserTaskStatus,
  parseDateOrNull,
  parseJsonObject,
  parseStringArray,
  safeTrim,
} from './normalize';

export function buildTaskWhere(params: URLSearchParams, admin = false): Prisma.EarnTaskWhereInput {
  const type = safeTrim(params.get('type'));
  const status = safeTrim(params.get('status'));
  const platform = safeTrim(params.get('platform'));
  const query = safeTrim(params.get('q') || params.get('query'));

  const where: Prisma.EarnTaskWhereInput = {};

  if (admin) {
    if (status && isEarnTaskStatus(status)) where.status = status;
  } else {
    where.status = 'active';
    where.OR = [
      { deadlineAt: null },
      { deadlineAt: { gt: new Date() } },
    ];
  }

  if (type) where.type = type;

  if (platform) {
    where.platforms = {
      array_contains: [platform],
    } as Prisma.JsonFilter<'EarnTask'>;
  }

  if (query) {
    const keywordFilter: Prisma.EarnTaskWhereInput = {
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    };

    if (where.OR) {
      where.AND = [{ OR: where.OR as Prisma.EarnTaskWhereInput[] }, keywordFilter];
      delete where.OR;
    } else {
      where.OR = keywordFilter.OR;
    }
  }

  return where;
}

export function getPagination(params: URLSearchParams) {
  const page = clampInt(params.get('page'), 1, 10_000, 1);
  const pageSize = clampInt(params.get('pageSize') || params.get('limit'), 1, 100, 20);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export async function listTasks(params: URLSearchParams, admin = false) {
  const where = buildTaskWhere(params, admin);
  const { page, pageSize, skip, take } = getPagination(params);

  const [items, total] = await Promise.all([
    prisma.earnTask.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        _count: {
          select: {
            materials: true,
            userTasks: true,
          },
        },
      },
    }),
    prisma.earnTask.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
  };
}

export async function getPublicTask(taskId: string) {
  return prisma.earnTask.findFirst({
    where: {
      id: taskId,
      status: 'active',
      OR: [
        { deadlineAt: null },
        { deadlineAt: { gt: new Date() } },
      ],
    },
    include: {
      materials: {
        where: { enabled: true },
        orderBy: [{ usedCount: 'asc' }, { createdAt: 'asc' }],
        take: 5,
      },
    },
  });
}

export async function getAdminTask(taskId: string) {
  return prisma.earnTask.findUnique({
    where: { id: taskId },
    include: {
      materials: {
        orderBy: [{ createdAt: 'desc' }],
      },
      _count: {
        select: {
          userTasks: true,
        },
      },
    },
  });
}

export function buildTaskInput(body: Record<string, unknown>, adminId?: string): Prisma.EarnTaskCreateInput {
  const title = safeTrim(body.title);
  const description = safeTrim(body.description);
  if (!title) throw badRequest('Missing title');
  if (!description) throw badRequest('Missing description');

  const status = safeTrim(body.status) || 'draft';
  if (!isEarnTaskStatus(status)) throw badRequest('Invalid status');

  return {
    title,
    description,
    type: safeTrim(body.type) || 'publish',
    status,
    platforms: parseStringArray(body.platforms),
    coverUrl: safeTrim(body.coverUrl),
    rewardAmount: clampInt(body.rewardAmount, 0, 100_000_000, 0),
    maxParticipants: clampInt(body.maxParticipants, 0, 1_000_000, 0),
    currentParticipants: clampInt(body.currentParticipants, 0, 1_000_000, 0),
    deadlineAt: parseDateOrNull(body.deadlineAt),
    keepSeconds: clampInt(body.keepSeconds, 0, 365 * 24 * 60 * 60, 0),
    requiresPlugin: body.requiresPlugin === true,
    requiresShoppingCart: body.requiresShoppingCart === true,
    requirements: parseJsonObject(body.requirements),
    actionConfig: parseJsonObject(body.actionConfig),
    createdBy: adminId || null,
  };
}

export function buildTaskUpdateInput(body: Record<string, unknown>): Prisma.EarnTaskUpdateInput {
  const data: Prisma.EarnTaskUpdateInput = {};

  if ('title' in body) {
    const title = safeTrim(body.title);
    if (!title) throw badRequest('Invalid title');
    data.title = title;
  }
  if ('description' in body) {
    const description = safeTrim(body.description);
    if (!description) throw badRequest('Invalid description');
    data.description = description;
  }
  if ('type' in body) data.type = safeTrim(body.type) || 'publish';
  if ('status' in body) {
    const status = safeTrim(body.status);
    if (!isEarnTaskStatus(status)) throw badRequest('Invalid status');
    data.status = status;
  }
  if ('platforms' in body) data.platforms = parseStringArray(body.platforms);
  if ('coverUrl' in body) data.coverUrl = safeTrim(body.coverUrl);
  if ('rewardAmount' in body) data.rewardAmount = clampInt(body.rewardAmount, 0, 100_000_000, 0);
  if ('maxParticipants' in body) data.maxParticipants = clampInt(body.maxParticipants, 0, 1_000_000, 0);
  if ('currentParticipants' in body) data.currentParticipants = clampInt(body.currentParticipants, 0, 1_000_000, 0);
  if ('deadlineAt' in body) data.deadlineAt = parseDateOrNull(body.deadlineAt);
  if ('keepSeconds' in body) data.keepSeconds = clampInt(body.keepSeconds, 0, 365 * 24 * 60 * 60, 0);
  if ('requiresPlugin' in body) data.requiresPlugin = body.requiresPlugin === true;
  if ('requiresShoppingCart' in body) data.requiresShoppingCart = body.requiresShoppingCart === true;
  if ('requirements' in body) data.requirements = parseJsonObject(body.requirements);
  if ('actionConfig' in body) data.actionConfig = parseJsonObject(body.actionConfig);

  return data;
}

export function buildMaterialInput(taskId: string, body: Record<string, unknown>): Prisma.EarnTaskMaterialCreateInput {
  return {
    task: { connect: { id: taskId } },
    title: safeTrim(body.title),
    description: safeTrim(body.description),
    type: safeTrim(body.type) || 'mixed',
    payload: parseJsonObject(body.payload),
    enabled: body.enabled !== false,
  };
}

export async function applyTask(input: {
  taskId: string;
  userId: string;
  platform: string;
  platformUid?: string | null;
  platformAccountName?: string | null;
  taskMaterialId?: string | null;
}) {
  const now = new Date();
  const platformUid = input.platformUid || '';

  return prisma.$transaction(async (tx) => {
    const task = await tx.earnTask.findFirst({
      where: {
        id: input.taskId,
        status: 'active',
        OR: [
          { deadlineAt: null },
          { deadlineAt: { gt: now } },
        ],
      },
    });

    if (!task) throw notFound('Task not found');

    const platforms = parseStringArray(task.platforms);
    if (platforms.length > 0 && !platforms.includes(input.platform)) {
      throw badRequest('Platform is not supported by this task');
    }

    if (task.maxParticipants > 0 && task.currentParticipants >= task.maxParticipants) {
      throw badRequest('Task is full');
    }

    let materialId = input.taskMaterialId || null;
    if (materialId) {
      const material = await tx.earnTaskMaterial.findFirst({
        where: {
          id: materialId,
          taskId: task.id,
          enabled: true,
        },
      });
      if (!material) throw badRequest('Task material not found');
    } else {
      const material = await tx.earnTaskMaterial.findFirst({
        where: {
          taskId: task.id,
          enabled: true,
        },
        orderBy: [{ usedCount: 'asc' }, { createdAt: 'asc' }],
      });
      materialId = material?.id || null;
    }

    const existing = await tx.earnUserTask.findFirst({
      where: {
        taskId: task.id,
        userId: input.userId,
        platform: input.platform,
        platformUid,
        status: { notIn: ['cancelled', 'expired'] },
      },
      include: {
        task: true,
        taskMaterial: true,
      },
    });
    if (existing) return { task, userTask: existing, existing: true };

    const userTask = await tx.earnUserTask.create({
      data: {
        taskId: task.id,
        userId: input.userId,
        platform: input.platform,
        platformUid,
        platformAccountName: input.platformAccountName || null,
        taskMaterialId: materialId,
        rewardAmount: task.rewardAmount,
        status: 'doing',
      },
      include: {
        task: true,
        taskMaterial: true,
      },
    });

    await tx.earnTask.update({
      where: { id: task.id },
      data: { currentParticipants: { increment: 1 } },
    });

    if (materialId) {
      await tx.earnTaskMaterial.update({
        where: { id: materialId },
        data: { usedCount: { increment: 1 } },
      });
    }

    return { task, userTask, existing: false };
  });
}

export async function listUserTasks(params: URLSearchParams, userId: string) {
  const { page, pageSize, skip, take } = getPagination(params);
  const status = safeTrim(params.get('status'));
  const where: Prisma.EarnUserTaskWhereInput = { userId };
  if (status && isEarnUserTaskStatus(status)) where.status = status;

  const [items, total] = await Promise.all([
    prisma.earnUserTask.findMany({
      where,
      skip,
      take,
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        task: true,
        taskMaterial: true,
      },
    }),
    prisma.earnUserTask.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getUserTask(id: string, userId: string) {
  return prisma.earnUserTask.findFirst({
    where: { id, userId },
    include: {
      task: true,
      taskMaterial: true,
    },
  });
}

export function buildSubmissionInput(body: Record<string, unknown>): Prisma.EarnUserTaskUpdateInput {
  const submissionUrl = safeTrim(body.submissionUrl);
  const screenshotUrls = parseStringArray(body.screenshotUrls);
  const pluginEvidence = parseJsonObject(body.pluginEvidence);
  const qrCodeScanResult = safeTrim(body.qrCodeScanResult);

  if (!submissionUrl && screenshotUrls.length === 0 && Object.keys(pluginEvidence).length === 0) {
    throw badRequest('Missing submissionUrl, screenshotUrls or pluginEvidence');
  }

  return {
    submissionUrl,
    screenshotUrls,
    pluginEvidence,
    qrCodeScanResult,
    submissionTime: new Date(),
    status: 'pending',
    metadata: parseJsonObject(body.metadata),
  };
}

export async function listSubmissions(params: URLSearchParams) {
  const { page, pageSize, skip, take } = getPagination(params);
  const status = safeTrim(params.get('status'));
  const where: Prisma.EarnUserTaskWhereInput = {};
  if (status && isEarnUserTaskStatus(status)) where.status = status;

  const [items, total] = await Promise.all([
    prisma.earnUserTask.findMany({
      where,
      skip,
      take,
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        task: true,
        taskMaterial: true,
      },
    }),
    prisma.earnUserTask.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export function badRequest(message: string) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = 400;
  return error;
}

export function notFound(message: string) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = 404;
  return error;
}
