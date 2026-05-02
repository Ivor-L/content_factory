import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { toInputJson } from '@/lib/jsonUtils';
import { runBreakdownForMyNote } from '@/lib/imageTextMyNotes';

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeImages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') || 30), 1), 60);

  // "我的" should include all user-created image-text replication notes:
  // miniapp collect, one-click create, and web-side note tasks.
  const rows = await prisma.imageTextReplicationTask.findMany({
    where: {
      userId,
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: limit,
  });

  return NextResponse.json({
    data: rows.map((row) => ({
      id: row.id,
      title: row.sourceTitle || '未命名笔记',
      status: row.status,
      sourceText: row.sourceText || '',
      sourceImages: row.sourceImages,
      sourcePlatform: row.sourcePlatform || '',
      sourceId: row.sourceId || '',
      sourceUrl: row.sourceUrl || '',
      analysisResult: row.analysisResult,
      generatedCopy: row.generatedCopy,
      imageGuidance: row.imageGuidance,
      errorMessage: row.errorMessage,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sourceTitle = normalizeText(body.sourceTitle) || '未命名笔记';
  const sourceText = normalizeText(body.sourceText);
  const sourceImages = normalizeImages(body.sourceImages);
  const sourceId = normalizeText(body.sourceId) || randomUUID();
  const sourceUrl = normalizeText(body.sourceUrl);

  let existing = await prisma.imageTextReplicationTask.findFirst({
    where: {
      userId,
      sourcePlatform: 'miniapp-my',
      sourceId,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });
  if (!existing) {
    existing = await prisma.imageTextReplicationTask.findFirst({
      where: {
        userId,
        sourceId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  let taskId = existing?.id || '';
  if (existing) {
    await prisma.imageTextReplicationTask.update({
      where: { id: existing.id },
      data: {
        sourceTitle,
        sourceText,
        sourceImages: toInputJson(sourceImages),
        sourceUrl,
        status: 'BREAKDOWN_PENDING',
        analysisResult: Prisma.JsonNull,
        generatedCopy: null,
        generatedImages: Prisma.JsonNull,
        imageGuidance: Prisma.JsonNull,
        errorMessage: null,
      },
    });
    taskId = existing.id;
  } else {
    const created = await prisma.imageTextReplicationTask.create({
      data: {
        id: randomUUID(),
        userId,
        status: 'BREAKDOWN_PENDING',
        sourceTitle,
        sourceText,
        sourceImages: toInputJson(sourceImages),
        sourcePlatform: 'miniapp-my',
        sourceId,
        sourceUrl,
      },
    });
    taskId = created.id;
  }

  // fire-and-forget: allow user to close page while parsing continues
  void runBreakdownForMyNote(taskId).catch((error) => {
    console.error('[image-text-replication/my-notes] background breakdown failed', error);
  });

  return NextResponse.json({
    taskId,
    status: 'BREAKDOWN_PENDING',
  });
}
