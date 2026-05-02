import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { toInputJson } from '@/lib/jsonUtils';
import { runBreakdownForMyNote } from '@/lib/imageTextMyNotes';

type XhsDetailResponse = {
  message?: string;
  data?: Record<string, unknown> | null;
};

const XHS_URL_RE = /(xiaohongshu\.com\/(explore|discovery\/item)|xhslink\.com)/i;

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function parseArrayOfString(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeUrls(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const url = item.trim();
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function parseNoteIdFromSourceUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    const last = segments[segments.length - 1] || '';
    return last.trim() || null;
  } catch {
    return null;
  }
}

function resolveXhsDownloaderBaseUrl(): string {
  const candidates = [
    process.env.XHS_DOWNLOADER_BASE_URL,
    process.env.XHS_DOWNLOADER_URL,
    process.env.XHS_COLLECTOR_BASE_URL,
  ];
  for (const item of candidates) {
    const value = normalizeText(item);
    if (!value) continue;
    return value.replace(/\/$/, '');
  }
  return '';
}

async function requestXhsDetail(sourceUrl: string): Promise<XhsDetailResponse> {
  const baseUrl = resolveXhsDownloaderBaseUrl();
  if (!baseUrl) {
    throw new Error('服务端未配置 XHS_DOWNLOADER_BASE_URL');
  }

  const endpoint = `${baseUrl}/xhs/detail`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const payload: Record<string, unknown> = {
      url: sourceUrl,
      download: false,
      skip: false,
    };

    const cookie = normalizeText(process.env.XHS_DOWNLOADER_COOKIE);
    if (cookie) {
      payload.cookie = cookie;
    }

    const proxy = normalizeText(process.env.XHS_DOWNLOADER_PROXY);
    if (proxy) {
      payload.proxy = proxy;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `采集服务调用失败 (${response.status})`);
    }

    const result = (await response.json().catch(() => ({}))) as XhsDetailResponse;
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('采集服务超时，请稍后重试');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { url?: unknown } = {};
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sourceUrl = normalizeText(body.url);
  if (!sourceUrl) {
    return NextResponse.json({ error: '请先粘贴小红书链接' }, { status: 400 });
  }
  if (!XHS_URL_RE.test(sourceUrl)) {
    return NextResponse.json({ error: '仅支持小红书链接' }, { status: 400 });
  }

  let detail: XhsDetailResponse;
  try {
    detail = await requestXhsDetail(sourceUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : '采集服务调用失败';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const payload = detail?.data || {};
  const title = normalizeText(payload['作品标题']) || '未命名笔记';
  const sourceText = normalizeText(payload['作品描述']);
  const parsedSourceUrl = normalizeText(payload['作品链接']) || sourceUrl;
  const parsedSourceId =
    normalizeText(payload['作品ID']) ||
    parseNoteIdFromSourceUrl(parsedSourceUrl) ||
    parseNoteIdFromSourceUrl(sourceUrl) ||
    randomUUID();

  const mediaUrls = normalizeUrls(parseArrayOfString(payload['下载地址']));

  const existing = await prisma.imageTextReplicationTask.findFirst({
    where: {
      userId,
      sourcePlatform: 'miniapp-my',
      sourceId: parsedSourceId,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  let taskId = existing?.id || '';

  if (existing) {
    await prisma.imageTextReplicationTask.update({
      where: { id: existing.id },
      data: {
        sourceTitle: title,
        sourceText,
        sourceImages: toInputJson(mediaUrls),
        sourceUrl: parsedSourceUrl,
        status: 'BREAKDOWN_PENDING',
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
        sourceTitle: title,
        sourceText,
        sourceImages: toInputJson(mediaUrls),
        sourcePlatform: 'miniapp-my',
        sourceId: parsedSourceId,
        sourceUrl: parsedSourceUrl,
      },
    });
    taskId = created.id;
  }

  void runBreakdownForMyNote(taskId);

  return NextResponse.json({
    taskId,
    status: 'BREAKDOWN_PENDING',
    title,
    message: '采集成功，已加入“我的”分类',
  });
}
