import prisma from './prisma';

export type TaskType =
  | 'creative'
  | 'poster'
  | 'digitalHuman'
  | 'replication'
  | 'storyboard'
  | 'knowledgeVideo'
  | 'replicationShot'
  | 'grid';

export interface SyncTaskOptions {
  taskType: TaskType;
  taskId: string;
  operation: 'create' | 'update' | 'delete';
}

/**
 * 同步任务到 TaskSummary 表
 */
export async function syncTaskToSummary(options: SyncTaskOptions): Promise<void> {
  const { taskType, taskId, operation } = options;

  try {
    if (operation === 'delete') {
      await prisma.taskSummary.deleteMany({
        where: { taskType, taskId },
      });
      return;
    }

    // 根据任务类型获取任务数据
    const taskData = await fetchTaskData(taskType, taskId);
    if (!taskData) {
      console.warn(`Task not found: ${taskType}/${taskId}`);
      return;
    }

    // 提取通用字段
    const summaryData = extractSummaryData(taskType, taskData);

    // 创建或更新 TaskSummary
    await prisma.taskSummary.upsert({
      where: {
        taskType_taskId: {
          taskType,
          taskId,
        },
      },
      create: summaryData,
      update: {
        ...summaryData,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(`Failed to sync task to summary: ${taskType}/${taskId}`, error);
    // 不抛出错误，避免影响主流程
  }
}

/**
 * 根据任务类型获取任务数据
 */
async function fetchTaskData(taskType: TaskType, taskId: string): Promise<any> {
  switch (taskType) {
    case 'creative':
      return prisma.creativeTask.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          userId: true,
          title: true,
          stage: true,
          status: true,
          ideaText: true,
          layoutResultJson: true,
          generatedImagesJson: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    case 'poster': {
      // Try xhsPosterJob first (legacy path)
      const xhsJob = await prisma.xhsPosterJob.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          userId: true,
          title: true,
          copyText: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          images: {
            select: { imageUrl: true },
            take: 1,
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
      if (xhsJob) return xhsJob;
      // Fall back to creative_tasks with posterMode = text2image
      const creativeTask = await prisma.creativeTask.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          userId: true,
          title: true,
          ideaText: true,
          status: true,
          generatedImagesJson: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (creativeTask) return { ...creativeTask, _source: 'creativeTask' as const };
      return null;
    }

    case 'digitalHuman':
      return prisma.digitalHumanVideo.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          userId: true,
          type: true,
          scriptContent: true,
          status: true,
          resultUrl: true,
          imageUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    case 'replication':
      return prisma.replication.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          status: true,
          type: true,
          result: true,
          createdAt: true,
          updatedAt: true,
          product: {
            select: {
              name: true,
              images: true,
              userId: true,
            },
          },
          script: {
            select: {
              title: true,
            },
          },
        },
      });

    case 'storyboard':
      return prisma.storyboardTask.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          userId: true,
          status: true,
          scriptContent: true,
          coverImage: true,
          storyboardImageUrl: true,
          detailedBreakdown: true,
          progress: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    case 'grid':
      return prisma.storyboardTask.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          userId: true,
          status: true,
          scriptContent: true,
          coverImage: true,
          storyboardImageUrl: true,
          storyboardImages: true,
          videoType: true,
          detailedBreakdown: true,
          progress: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    case 'knowledgeVideo':
      return prisma.knowledgeVideoTask.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          userId: true,
          title: true,
          videoType: true,
          status: true,
          videoUrl: true,
          coverUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    case 'replicationShot':
      return prisma.replicationShotTask.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          userId: true,
          status: true,
          finalVideoUrl: true,
          createdAt: true,
          updatedAt: true,
          script: {
            select: {
              title: true,
              userId: true,
            },
          },
          product: {
            select: {
              name: true,
            },
          },
        },
      });

    default:
      return null;
  }
}

/**
 * 从任务数据中提取 TaskSummary 字段
 */
function extractSummaryData(taskType: TaskType, taskData: any): any {
  const base = {
    taskType,
    taskId: taskData.id,
    userId: taskData.userId || taskData.product?.userId || taskData.script?.userId,
    createdAt: taskData.createdAt,
    updatedAt: taskData.updatedAt,
  };

  switch (taskType) {
    case 'creative':
      return {
        ...base,
        title: taskData.title || '智能创作任务',
        status: taskData.status,
        preview: taskData.ideaText?.substring(0, 100),
        thumbnailUrl: extractImageFromLayoutResult(taskData.generatedImagesJson || taskData.layoutResultJson),
        metadata: {
          stage: taskData.stage,
        },
      };

    case 'poster':
      if (taskData._source === 'creativeTask') {
        return {
          ...base,
          title: taskData.title || '图文创作',
          status: taskData.status,
          preview: taskData.ideaText?.substring(0, 100),
          thumbnailUrl: extractImageFromLayoutResult(taskData.generatedImagesJson),
          metadata: { posterMode: 'text2image' },
        };
      }
      return {
        ...base,
        title: taskData.title || '小红书图文',
        status: taskData.status,
        preview: taskData.copyText?.substring(0, 100),
        thumbnailUrl: taskData.images?.[0]?.imageUrl,
      };

    case 'digitalHuman': {
      const metadata: Record<string, string> = {
        type: taskData.type,
      };
      if (typeof taskData.resultUrl === 'string' && taskData.resultUrl.trim()) {
        metadata.resultUrl = taskData.resultUrl;
        metadata.videoUrl = taskData.resultUrl;
      }
      if (typeof taskData.imageUrl === 'string' && taskData.imageUrl.trim()) {
        metadata.imageUrl = taskData.imageUrl;
      }
      if (typeof taskData.scriptContent === 'string' && taskData.scriptContent.trim()) {
        metadata.scriptContent = taskData.scriptContent.trim();
      }
      const isActionTransfer = taskData.type === 'ACTION_TRANSFER';
      return {
        ...base,
        title: isActionTransfer ? '动作复刻视频' : '数字人视频',
        status: taskData.status,
        preview: isActionTransfer ? '图片角色动作复刻' : taskData.scriptContent?.substring(0, 100),
        thumbnailUrl: taskData.resultUrl || taskData.imageUrl,
        metadata,
      };
    }

    case 'replication':
      return {
        ...base,
        title: `复刻：${taskData.product?.name || taskData.script?.title || '未命名'}`,
        status: taskData.status,
        thumbnailUrl: extractFirstImage(taskData.product?.images),
        metadata: {
          type: taskData.type,
          productName: taskData.product?.name,
          scriptTitle: taskData.script?.title,
        },
      };

    case 'storyboard': {
      const detailed = normalizeJsonRecord(taskData.detailedBreakdown);
      const detailedMetadata = normalizeJsonRecord(detailed?.metadata);
      const isViralRemix = detailedMetadata?.feature === 'viral_remix';
      const title = typeof detailedMetadata?.title === 'string' && detailedMetadata.title.trim()
        ? detailedMetadata.title.trim()
        : isViralRemix
          ? '一键复刻'
          : '分镜视频';
      const referenceVideoUrl = typeof detailedMetadata?.reference_video_url === 'string'
        ? detailedMetadata.reference_video_url
        : undefined;
      const referencePoster = typeof detailedMetadata?.reference_video_poster === 'string'
        ? detailedMetadata.reference_video_poster
        : undefined;
      return {
        ...base,
        title,
        status: taskData.status,
        preview: taskData.scriptContent?.substring(0, 100),
        thumbnailUrl: taskData.coverImage || taskData.storyboardImageUrl || referencePoster || referenceVideoUrl,
        progress: taskData.progress,
        metadata: isViralRemix
          ? {
            feature: 'viral_remix',
            referenceVideoUrl,
            referencePoster,
            videoUrl: referenceVideoUrl,
            durationSeconds: detailedMetadata?.duration_seconds,
            strategy: detailedMetadata?.strategy,
            strategyLabel: detailedMetadata?.strategy_label,
          }
          : undefined,
      };
    }

    case 'grid': {
      const detailed = normalizeJsonRecord(taskData.detailedBreakdown);
      const storyboardImages = Array.isArray(taskData.storyboardImages)
        ? taskData.storyboardImages.filter((url: unknown): url is string => typeof url === 'string' && url.trim().length > 0)
        : [];
      const metadata: Record<string, unknown> = {};
      if (storyboardImages.length) {
        metadata.storyboardImages = storyboardImages;
      }
      if (detailed?.splitStoryboardTaskId) {
        metadata.splitStoryboardId = detailed.splitStoryboardTaskId;
      }
      if (taskData.storyboardImageUrl || taskData.coverImage) {
        metadata.gridImageUrl = taskData.storyboardImageUrl || taskData.coverImage;
      }
      return {
        ...base,
        title: '九宫格任务',
        status: taskData.status,
        preview: taskData.scriptContent?.substring(0, 100),
        thumbnailUrl: taskData.storyboardImageUrl || taskData.coverImage,
        progress: taskData.progress,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
    }

    case 'knowledgeVideo':
      return {
        ...base,
        title: taskData.title || '知识视频',
        status: taskData.status,
        thumbnailUrl: taskData.coverUrl,
        metadata: {
          videoType: taskData.videoType,
          videoUrl: taskData.videoUrl,
        },
      };

    case 'replicationShot':
      return {
        ...base,
        title: `场景复刻：${taskData.product?.name || taskData.script?.title || '未命名'}`,
        status: taskData.status,
        thumbnailUrl: taskData.finalVideoUrl,
        metadata: {
          productName: taskData.product?.name,
          scriptTitle: taskData.script?.title,
        },
      };

    default:
      return base;
  }
}

/**
 * 从图片字段中提取第一张图片 URL
 */
function extractFirstImage(images?: string | null): string | null {
  if (!images) return null;
  try {
    const parsed = JSON.parse(images);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed[0];
    }
    if (typeof parsed === 'string') {
      return parsed;
    }
  } catch {
    const candidates = images.split(',').map((img) => img.trim()).filter(Boolean);
    if (candidates.length > 0) {
      return candidates[0];
    }
  }
  return null;
}

/**
 * 从 layout_result_json 中提取第一张图片 URL
 * layout_result_json 格式:
 * [
 *   { index: 0, url: "https://...", fileName: "", mimeType: "" },
 *   ...
 * ]
 */
function extractImageFromLayoutResult(layoutJson?: any): string | null {
  if (!layoutJson) return null;

  try {
    const data = typeof layoutJson === 'string' ? JSON.parse(layoutJson) : layoutJson;

    // 标准格式：数组，每个元素包含 url 字段
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object' && first.url) {
        return first.url;
      }
    }

    return null;
  } catch (error) {
    console.warn('Failed to extract image from layout_result_json:', error);
    return null;
  }
}

function normalizeJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return null;
}

/**
 * 批量同步所有任务到 TaskSummary（用于初始化或修复数据）
 */
export async function syncAllTasks(userId?: string): Promise<void> {
  console.log('Starting full task sync...');

  const taskTypes: TaskType[] = [
    'creative',
    'poster',
    'digitalHuman',
    'replication',
    'storyboard',
    'knowledgeVideo',
    'replicationShot',
    'grid',
  ];

  for (const taskType of taskTypes) {
    try {
      const tasks = await fetchAllTasksByType(taskType, userId);
      console.log(`Syncing ${tasks.length} ${taskType} tasks...`);

      for (const task of tasks) {
        await syncTaskToSummary({
          taskType,
          taskId: task.id,
          operation: 'create',
        });
      }
    } catch (error) {
      console.error(`Failed to sync ${taskType} tasks:`, error);
    }
  }

  console.log('Full task sync completed.');
}

/**
 * 获取指定类型的所有任务 ID
 */
async function fetchAllTasksByType(taskType: TaskType, userId?: string): Promise<{ id: string }[]> {
  const where = userId ? { userId } : {};

  switch (taskType) {
    case 'creative':
      return prisma.creativeTask.findMany({ where, select: { id: true } });
    case 'poster': {
      const xhsJobs = await prisma.xhsPosterJob.findMany({ where, select: { id: true } });
      const text2imgTasks = await prisma.creativeTask.findMany({
        where: { ...where, targetOutput: 'poster' },
        select: { id: true },
      });
      return [...xhsJobs, ...text2imgTasks];
    }
    case 'digitalHuman':
      return prisma.digitalHumanVideo.findMany({ where, select: { id: true } });
    case 'replication':
      // Replication 没有直接的 userId，需要通过 product 或 script 关联
      return prisma.replication.findMany({ select: { id: true } });
    case 'storyboard':
      return prisma.storyboardTask.findMany({
        where: {
          ...where,
          NOT: { videoType: 'grid' },
        },
        select: { id: true },
      });
    case 'grid':
      return prisma.storyboardTask.findMany({
        where: {
          ...where,
          videoType: 'grid',
        },
        select: { id: true },
      });
    case 'knowledgeVideo':
      return prisma.knowledgeVideoTask.findMany({ where, select: { id: true } });
    case 'replicationShot':
      return prisma.replicationShotTask.findMany({ where, select: { id: true } });
    default:
      return [];
  }
}
