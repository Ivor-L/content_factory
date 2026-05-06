import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { parseMetadata, loadTaskWithAssets, parseGeneratedImages } from "@/lib/creativeTaskService";
import { serializeTaskDetail } from "@/lib/creativeTaskFormatter";
import type { CreativeStageKey } from "@/lib/creativeStages";
import { creativeStageOrder } from "@/lib/creativeStages";
import {
  createCreativeTaskWithAssets,
  type CreateCreativeTaskPayload,
} from "@/lib/creativeTaskCreation";
import { syncTaskToSummary } from "@/lib/taskSummary";
import { deleteShortTtlCache, getShortTtlCache, setShortTtlCache } from "@/lib/shortTtlCache";

const CREATIVE_TASKS_LIST_CACHE_TTL_MS = 3_000;

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request, { skipProfileKeys: true });
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const stage = searchParams.get("stage");
  const status = searchParams.get("status");
  const limitParam = Number(searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(limitParam, 100))
    : 30;

  const includeCounts = searchParams.get("includeCounts") === "1";
  const includeHeavy = searchParams.get("includeHeavy") === "1";

  const cacheKey = JSON.stringify({
    userId,
    stage,
    status,
    limit,
    includeCounts,
    includeHeavy,
  });
  const cached = getShortTtlCache<object>("api:creative-tasks:list", cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT" },
    });
  }

  const tasks = await prisma.creativeTask.findMany({
    where: {
      userId,
      ...(stage && creativeStageOrder.includes(stage as CreativeStageKey)
        ? { stage: stage as CreativeStageKey }
        : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      stage: true,
      status: true,
      ideaText: true,
      channel: true,
      targetOutput: true,
      goal: includeHeavy,
      metadata: includeHeavy,
      generatedImagesJson: includeHeavy,
      createdAt: true,
      updatedAt: true,
      ...(includeCounts
        ? {
            _count: {
              select: {
                historyDocs: true,
                stories: true,
                styles: true,
              },
            },
          }
        : {}),
    },
  });

  const data = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    stage: task.stage,
    status: task.status,
    ideaText: task.ideaText,
    channel: task.channel,
    targetOutput: task.targetOutput,
    goal: includeHeavy ? task.goal : null,
    metadata: includeHeavy ? parseMetadata(task.metadata) : null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    attachments: includeCounts
      ? {
          historyDocs: task._count.historyDocs,
          stories: task._count.stories,
          styles: task._count.styles,
        }
      : {
          historyDocs: 0,
          stories: 0,
          styles: 0,
        },
    generatedImages: includeHeavy ? parseGeneratedImages(task.generatedImagesJson) : [],
  }));

  const responseBody = { data };
  setShortTtlCache(
    "api:creative-tasks:list",
    cacheKey,
    responseBody,
    CREATIVE_TASKS_LIST_CACHE_TTL_MS,
  );

  return NextResponse.json(responseBody, {
    headers: { "X-Cache": "MISS" },
  });
}

type CreateBody = CreateCreativeTaskPayload;

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: CreateBody;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.ideaText || typeof payload.ideaText !== "string") {
    return NextResponse.json({ error: "ideaText is required" }, { status: 400 });
  }

  let task;
  try {
    task = await createCreativeTaskWithAssets({ userId, payload });
  } catch (error) {
    console.error("Failed to create creative task", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create task" },
      { status: 400 }
    );
  }

  await syncTaskToSummary({
    taskType: 'creative',
    taskId: task.id,
    operation: 'create',
  });
  deleteShortTtlCache("api:creative-tasks:list", (key) => key.includes(userId));
  deleteShortTtlCache("api:tasks:list", (key) => key.includes(userId));

  const fullTask = await loadTaskWithAssets(task.id, userId);
  return NextResponse.json({ data: fullTask ? serializeTaskDetail(fullTask) : null }, { status: 201 });
}
