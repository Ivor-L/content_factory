import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { ensureSystemStylePresetsSeeded } from "@/lib/systemStylePresets";

type Params = {
  params: Promise<{ taskId: string }>;
};

const typeConfig = {
  history: {
    model: prisma.historyDoc,
    connect: prisma.creativeTaskHistoryDoc,
    field: "historyDocId" as const,
    allowSystem: false,
  },
  story: {
    model: prisma.storyAsset,
    connect: prisma.creativeTaskStory,
    field: "storyId" as const,
    allowSystem: false,
  },
  style: {
    model: prisma.stylePreset,
    connect: prisma.creativeTaskStyle,
    field: "styleId" as const,
    allowSystem: true,
  },
};

type AssetType = keyof typeof typeConfig;

export async function POST(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;
  const task = await prisma.creativeTask.findFirst({
    where: { id: taskId, userId },
    select: { id: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let body: { type: AssetType; id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.type || !body?.id || !(body.type in typeConfig)) {
    return NextResponse.json({ error: "Invalid type or id" }, { status: 400 });
  }

  const config = typeConfig[body.type];
  if (config.allowSystem) {
    await ensureSystemStylePresetsSeeded();
  }

  const assetWhere = config.allowSystem
    ? { id: body.id, OR: [{ userId }, { userId: null }] }
    : { id: body.id, userId };

  const asset = await (config.model as any).findFirst({
    where: assetWhere,
    select: { id: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  await (config.connect as any).createMany({
    data: [
      {
        taskId: task.id,
        [config.field]: asset.id,
      },
    ],
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;
  const task = await prisma.creativeTask.findFirst({
    where: { id: taskId, userId },
    select: { id: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as AssetType | null;
  const assetId = searchParams.get("id");
  if (!type || !assetId || !(type in typeConfig)) {
    return NextResponse.json({ error: "Missing type or id" }, { status: 400 });
  }

  const config = typeConfig[type];
  if (config.allowSystem) {
    await ensureSystemStylePresetsSeeded();
  }

  await (config.connect as any).deleteMany({
    where: {
      taskId: task.id,
      [config.field]: assetId,
    },
  });

  return NextResponse.json({ ok: true });
}
