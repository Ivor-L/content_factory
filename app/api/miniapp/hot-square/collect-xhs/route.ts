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
const VIDEO_URL_RE = /\.(mp4|mov|m4v|webm|m3u8)(\?|$)|\/video\/|xgvideo|sns-video/i;

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function collectObjects(value: unknown): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const queue: unknown[] = [value];
  const seen = new Set<unknown>();

  while (queue.length > 0 && result.length < 160) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;
    result.push(obj);
    queue.push(...Object.values(obj));
  }

  return result;
}

function getByPath(payload: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    const obj = parseObject(current);
    return obj ? obj[key] : undefined;
  }, payload);
}

function pickTextAtPaths(payload: Record<string, unknown>, paths: string[]): string | null {
  for (const path of paths) {
    const value = normalizeText(getByPath(payload, path));
    if (value) return value;
  }
  return null;
}

function pickText(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizeText(payload[key]);
    if (value) return value;
  }
  for (const obj of collectObjects(payload).slice(1)) {
    for (const key of keys) {
      const value = normalizeText(obj[key]);
      if (value) return value;
    }
  }
  return null;
}

function parseMetric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return null;

  const normalized = value
    .replace(/,/g, '')
    .replace(/\+/g, '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  const match = normalized.match(/([\d.]+)/);
  if (!match) return null;

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;

  let multiplier = 1;
  if (/[万w]/i.test(normalized)) multiplier = 10000;
  else if (/[千k]/i.test(normalized)) multiplier = 1000;

  return Math.round(parsed * multiplier);
}

function pickNumber(payload: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = parseMetric(payload[key]);
    if (value != null) return value;
  }
  for (const obj of collectObjects(payload).slice(1)) {
    for (const key of keys) {
      const value = parseMetric(obj[key]);
      if (value != null) return value;
    }
  }
  return null;
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

function collectUrls(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return collectUrls(JSON.parse(trimmed));
      } catch {
        // fallback to delimiter parsing below
      }
    }
    return trimmed.split(/[\s,，]+/).map((item) => item.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectUrls(item));
  }
  const obj = parseObject(value);
  if (!obj) return [];
  return [
    ...collectUrls(obj.url),
    ...collectUrls(obj.src),
    ...collectUrls(obj.href),
    ...collectUrls(obj.imageUrl),
    ...collectUrls(obj.image_url),
    ...collectUrls(obj.videoUrl),
    ...collectUrls(obj.video_url),
    ...collectUrls(obj.playUrl),
    ...collectUrls(obj.play_url),
    ...collectUrls(obj.masterUrl),
    ...collectUrls(obj.master_url),
    ...collectUrls(obj.mediaUrl),
    ...collectUrls(obj.media_url),
    ...collectUrls(obj.downloadUrl),
    ...collectUrls(obj.download_url),
    ...collectUrls(obj.urlDefault),
    ...collectUrls(obj.url_default),
  ];
}

function isVideoUrl(url: string): boolean {
  return VIDEO_URL_RE.test(url);
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
  const title = pickTextAtPaths(payload, [
    '作品标题',
    'title',
    'note.title',
    'note.display_title',
    'data.title',
    'data.display_title',
    'result.title',
  ]) || '未命名笔记';
  const sourceText = pickTextAtPaths(payload, [
    '作品描述',
    'description',
    'desc',
    'note.desc',
    'note.description',
    'data.desc',
    'data.description',
    'result.desc',
  ]) || '';
  const parsedSourceUrl = pickTextAtPaths(payload, [
    '作品链接',
    'sourceUrl',
    'source_url',
    'url',
    'shareUrl',
    'share_url',
    'note.url',
    'data.url',
  ]) || sourceUrl;
  const parsedSourceId =
    pickTextAtPaths(payload, [
      '作品ID',
      'noteId',
      'note_id',
      'id',
      'note.id',
      'note.noteId',
      'note.note_id',
      'data.id',
      'data.noteId',
      'data.note_id',
    ]) ||
    parseNoteIdFromSourceUrl(parsedSourceUrl) ||
    parseNoteIdFromSourceUrl(sourceUrl) ||
    randomUUID();

  const mediaCandidates = normalizeUrls([
    ...parseArrayOfString(payload['下载地址']),
    ...collectUrls(payload['images']),
    ...collectUrls(payload['imageList']),
    ...collectUrls(payload['image_list']),
    ...collectUrls(payload['downloadUrls']),
    ...collectUrls(payload['download_urls']),
    ...collectUrls(getByPath(payload, 'note.images')),
    ...collectUrls(getByPath(payload, 'note.imageList')),
    ...collectUrls(getByPath(payload, 'data.images')),
    ...collectUrls(getByPath(payload, 'data.imageList')),
    ...collectUrls(payload['video']),
    ...collectUrls(payload['videoUrl']),
    ...collectUrls(payload['video_url']),
    ...collectUrls(payload['视频地址']),
    ...collectUrls(payload['视频链接']),
    ...collectUrls(payload['播放地址']),
    ...collectUrls(getByPath(payload, 'note.video')),
    ...collectUrls(getByPath(payload, 'note.videoUrl')),
    ...collectUrls(getByPath(payload, 'note.video_url')),
    ...collectUrls(getByPath(payload, 'data.video')),
    ...collectUrls(getByPath(payload, 'data.videoUrl')),
    ...collectUrls(getByPath(payload, 'data.video_url')),
  ]);
  const videoUrl = pickText(payload, ['视频地址', '视频链接', '播放地址', 'videoUrl', 'video_url', 'playUrl', 'play_url', 'masterUrl', 'master_url']) ||
    mediaCandidates.find((url) => isVideoUrl(url)) ||
    null;
  const mediaUrls = mediaCandidates.filter((url) => !isVideoUrl(url));
  const isVideoNote = Boolean(videoUrl);
  const rawPayload = {
    author: {
      name: pickText(payload, ['作者昵称', '作者名称', '用户昵称', '用户名称', '博主昵称', '博主', '作者', 'nickname', 'nickName', 'nick_name', 'authorName', 'author_name', 'userName', 'username', 'name']),
      avatar: pickText(payload, ['作者头像', '用户头像', '博主头像', '头像', 'avatar', 'avatarUrl', 'avatar_url', 'authorAvatar', 'author_avatar', 'userAvatar', 'user_avatar', 'image']),
    },
    stats: {
      likes: pickNumber(payload, ['点赞数', '点赞', '赞数', 'liked_count', 'like_count', 'likeCount', 'likedCount', 'likes']),
      collects: pickNumber(payload, ['收藏数', '收藏', 'collected_count', 'collect_count', 'collectCount', 'collectedCount', 'collects']),
      comments: pickNumber(payload, ['评论数', '评论', 'comment_count', 'commentCount', 'comments']),
      shares: pickNumber(payload, ['分享数', '分享', 'share_count', 'shareCount', 'shares']),
    },
    media: {
      videoUrl,
      mediaUrls,
      sourceType: isVideoNote ? 'video' : 'image',
    },
    source: 'miniapp-xhs-collect',
  };

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
        status: isVideoNote ? 'VIDEO_COLLECTED' : 'BREAKDOWN_PENDING',
        generatedImages: toInputJson(rawPayload),
        errorMessage: null,
      },
    });
    taskId = existing.id;
  } else {
    const created = await prisma.imageTextReplicationTask.create({
      data: {
        id: randomUUID(),
        userId,
        status: isVideoNote ? 'VIDEO_COLLECTED' : 'BREAKDOWN_PENDING',
        sourceTitle: title,
        sourceText,
        sourceImages: toInputJson(mediaUrls),
        sourcePlatform: 'miniapp-my',
        sourceId: parsedSourceId,
        sourceUrl: parsedSourceUrl,
        generatedImages: toInputJson(rawPayload),
      },
    });
    taskId = created.id;
  }

  if (!isVideoNote) {
    void runBreakdownForMyNote(taskId);
  }

  return NextResponse.json({
    taskId,
    status: isVideoNote ? 'VIDEO_COLLECTED' : 'BREAKDOWN_PENDING',
    title,
    videoUrl,
    message: '采集成功，已加入“我的”分类',
  });
}
