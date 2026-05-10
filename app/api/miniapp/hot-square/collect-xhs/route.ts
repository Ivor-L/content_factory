import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getApiKeyForUser, getRequestUserContext } from '@/lib/authServer';
import { toInputJson } from '@/lib/jsonUtils';
import { runBreakdownForMyNote } from '@/lib/imageTextMyNotes';
import { deductConfiguredCredits } from '@/lib/creditBilling';

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
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return null;
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

function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('blob:')) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function extractUrl(value: unknown): string | null {
  const direct = sanitizeUrl(value);
  if (direct) return direct;

  if (typeof value === 'string') {
    const parsed = parseObject(value);
    return parsed ? extractUrl(parsed) : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = extractUrl(item);
      if (url) return url;
    }
    return null;
  }

  const obj = parseObject(value);
  if (!obj) return null;

  const candidates = [
    obj.url,
    obj.urlDefault,
    obj.url_default,
    obj.src,
    obj.href,
    obj.imageUrl,
    obj.image_url,
    obj.avatarUrl,
    obj.avatar_url,
    obj.coverUrl,
    obj.cover_url,
    obj.cover,
    obj.cover_image,
    obj.coverImage,
    obj.displayUrl,
    obj.display_url,
    obj.thumbnail,
    obj.thumbnailUrl,
    obj.thumbnail_url,
  ];
  for (const candidate of candidates) {
    const url = extractUrl(candidate);
    if (url) return url;
  }
  return null;
}

function pickUrlAtPaths(payload: Record<string, unknown>, paths: string[]): string | null {
  for (const path of paths) {
    const url = extractUrl(getByPath(payload, path));
    if (url) return url;
  }
  return null;
}

function pickUrl(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = extractUrl(payload[key]);
    if (value) return value;
  }
  for (const obj of collectObjects(payload).slice(1)) {
    for (const key of keys) {
      const value = extractUrl(obj[key]);
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

function pickNumberAtPaths(payload: Record<string, unknown>, paths: string[]): number | null {
  for (const path of paths) {
    const value = parseMetric(getByPath(payload, path));
    if (value != null) return value;
  }
  return null;
}

function pickMetric(payload: Record<string, unknown>, paths: string[], keys: string[]): number | null {
  return pickNumberAtPaths(payload, paths) ?? pickNumber(payload, keys);
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

function normalizeAuthor(payload: Record<string, unknown>) {
  const name = pickTextAtPaths(payload, [
    '作者昵称',
    '作者名称',
    '用户昵称',
    '用户名称',
    '博主昵称',
    '博主',
    '作者',
    'author.name',
    'author.nickname',
    'author.nickName',
    'author.nick_name',
    'author.username',
    'user.name',
    'user.nickname',
    'user.nickName',
    'user.nick_name',
    'user.username',
    'user_info.name',
    'user_info.nickname',
    'userInfo.name',
    'userInfo.nickname',
    'note.user.name',
    'note.user.nickname',
    'note.userInfo.nickname',
    'note.user_info.nickname',
    'note.note_card.user.nickname',
    'note.note_card.user_info.nickname',
    'note_card.user.nickname',
    'note_card.user_info.nickname',
    'data.user.nickname',
    'data.user_info.nickname',
    'data.note_card.user.nickname',
    'data.note_card.user_info.nickname',
    'result.user.nickname',
    'result.user_info.nickname',
  ]) || pickText(payload, [
    'nickname',
    'nickName',
    'nick_name',
    'authorName',
    'author_name',
    'userName',
    'username',
    'name',
  ]);

  const avatar = pickUrlAtPaths(payload, [
    '作者头像',
    '用户头像',
    '博主头像',
    '头像',
    'author.avatar',
    'author.avatarUrl',
    'author.avatar_url',
    'author.image',
    'author.imageUrl',
    'author.image_url',
    'user.avatar',
    'user.avatarUrl',
    'user.avatar_url',
    'user.image',
    'user.imageUrl',
    'user.image_url',
    'user_info.avatar',
    'user_info.avatarUrl',
    'user_info.avatar_url',
    'user_info.image',
    'user_info.imageUrl',
    'user_info.image_url',
    'userInfo.avatar',
    'userInfo.avatarUrl',
    'userInfo.avatar_url',
    'note.user.avatar',
    'note.user.avatarUrl',
    'note.user_info.avatar',
    'note.userInfo.avatar',
    'note.note_card.user.avatar',
    'note.note_card.user_info.avatar',
    'note_card.user.avatar',
    'note_card.user.avatarUrl',
    'note_card.user_info.avatar',
    'data.user.avatar',
    'data.user_info.avatar',
    'data.note_card.user.avatar',
    'data.note_card.user_info.avatar',
    'result.user.avatar',
    'result.user_info.avatar',
  ]) || pickUrl(payload, [
    'avatar',
    'avatarUrl',
    'avatar_url',
    'authorAvatar',
    'author_avatar',
    'userAvatar',
    'user_avatar',
    'image',
    'imageUrl',
    'image_url',
  ]);

  return { name, avatar };
}

function normalizeStats(payload: Record<string, unknown>) {
  return {
    likes: pickMetric(payload, [
      'stats.likes',
      'stats.likeCount',
      'stats.like_count',
      'stats.likedCount',
      'stats.liked_count',
      'interactInfo.likedCount',
      'interactInfo.liked_count',
      'interact_info.likedCount',
      'interact_info.liked_count',
      'interactionInfo.likedCount',
      'interaction_info.liked_count',
      'note.stats.likes',
      'note.interactInfo.likedCount',
      'note.interact_info.liked_count',
      'note.note_card.interact_info.liked_count',
      'note_card.interact_info.liked_count',
      'data.stats.likes',
      'data.interactInfo.likedCount',
      'data.interact_info.liked_count',
      'data.note_card.interact_info.liked_count',
      'result.stats.likes',
    ], ['点赞数', '点赞', '赞数', 'liked_count', 'like_count', 'likeCount', 'likedCount', 'likes']),
    collects: pickMetric(payload, [
      'stats.collects',
      'stats.collectCount',
      'stats.collect_count',
      'stats.collectedCount',
      'stats.collected_count',
      'interactInfo.collectedCount',
      'interactInfo.collected_count',
      'interact_info.collectedCount',
      'interact_info.collected_count',
      'interactionInfo.collectedCount',
      'interaction_info.collected_count',
      'note.stats.collects',
      'note.interactInfo.collectedCount',
      'note.interact_info.collected_count',
      'note.note_card.interact_info.collected_count',
      'note_card.interact_info.collected_count',
      'data.stats.collects',
      'data.interactInfo.collectedCount',
      'data.interact_info.collected_count',
      'data.note_card.interact_info.collected_count',
      'result.stats.collects',
    ], ['收藏数', '收藏', 'collected_count', 'collect_count', 'collectCount', 'collectedCount', 'collects']),
    comments: pickMetric(payload, [
      'stats.comments',
      'stats.commentCount',
      'stats.comment_count',
      'interactInfo.commentCount',
      'interactInfo.comment_count',
      'interact_info.commentCount',
      'interact_info.comment_count',
      'interactionInfo.commentCount',
      'interaction_info.comment_count',
      'note.stats.comments',
      'note.interactInfo.commentCount',
      'note.interact_info.comment_count',
      'note.note_card.interact_info.comment_count',
      'note_card.interact_info.comment_count',
      'data.stats.comments',
      'data.interactInfo.commentCount',
      'data.interact_info.comment_count',
      'data.note_card.interact_info.comment_count',
      'result.stats.comments',
    ], ['评论数', '评论', 'comment_count', 'commentCount', 'comments']),
    shares: pickMetric(payload, [
      'stats.shares',
      'stats.shareCount',
      'stats.share_count',
      'interactInfo.shareCount',
      'interactInfo.share_count',
      'interact_info.shareCount',
      'interact_info.share_count',
      'interactionInfo.shareCount',
      'interaction_info.share_count',
      'note.stats.shares',
      'note.interactInfo.shareCount',
      'note.interact_info.share_count',
      'note.note_card.interact_info.share_count',
      'note_card.interact_info.share_count',
      'data.stats.shares',
      'data.interactInfo.shareCount',
      'data.interact_info.share_count',
      'data.note_card.interact_info.share_count',
      'result.stats.shares',
    ], ['分享数', '分享', 'share_count', 'shareCount', 'shares']),
  };
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
    ...collectUrls(obj.cover),
    ...collectUrls(obj.coverUrl),
    ...collectUrls(obj.cover_url),
    ...collectUrls(obj.coverImage),
    ...collectUrls(obj.cover_image),
    ...collectUrls(obj.thumbnail),
    ...collectUrls(obj.thumbnailUrl),
    ...collectUrls(obj.thumbnail_url),
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

function buildMiniappWebReferenceSourceId(userId: string, sourceId: string): string {
  return `miniapp:${userId}:${sourceId}`;
}

async function syncMiniappCollectToWebReference(
  db: Prisma.TransactionClient,
  input: {
    userId: string;
    taskId: string;
    sourceId: string;
    sourceUrl: string;
    title: string;
    description: string;
    mediaUrls: string[];
    coverUrl: string | null;
    videoUrl: string | null;
    sourceType: string;
    author: Record<string, unknown>;
    stats: Record<string, unknown>;
    rawPayload: Record<string, unknown>;
  },
) {
  const webSourceId = buildMiniappWebReferenceSourceId(input.userId, input.sourceId);
  const allMediaUrls = normalizeUrls([
    ...input.mediaUrls,
    ...(input.coverUrl ? [input.coverUrl] : []),
    ...(input.videoUrl ? [input.videoUrl] : []),
  ]);
  const coverUrl = input.coverUrl || input.mediaUrls[0] || null;
  const rawPayload = {
    ...input.rawPayload,
    miniappMyNoteId: input.taskId,
    originalSourceId: input.sourceId,
    sourceId: webSourceId,
    source_id: webSourceId,
    xhsSourceId: input.sourceId,
    xhs_source_id: input.sourceId,
    title: input.title,
    desc: input.description,
    description: input.description,
    url: input.sourceUrl,
    link: input.sourceUrl,
    pageUrl: input.sourceUrl,
    media: {
      ...(input.rawPayload.media && typeof input.rawPayload.media === 'object'
        ? input.rawPayload.media as Record<string, unknown>
        : {}),
      sourceType: input.sourceType,
      mediaUrls: input.mediaUrls,
      coverUrl,
      videoUrl: input.videoUrl,
    },
    scriptText: input.description,
    script_text: input.description,
    source: 'miniapp-xhs-collect',
  };

  return db.viralReferenceItem.upsert({
    where: {
      platform_sourceId: {
        platform: 'xiaohongshu',
        sourceId: webSourceId,
      },
    },
    update: {
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      title: input.title,
      description: input.description,
      coverUrl,
      videoUrl: input.videoUrl,
      mediaUrls: toInputJson(allMediaUrls.length > 0 ? allMediaUrls : null),
      stats: toInputJson(input.stats),
      author: toInputJson(input.author),
      category: '我的',
      remark: 'miniapp-xhs-collect',
      rawPayload: toInputJson(rawPayload),
      collectorVersion: 'miniapp_xhs_collect_v1',
      ingestedBy: input.userId,
      ingestedAt: new Date(),
      publishedAt: new Date(),
    },
    create: {
      platform: 'xiaohongshu',
      sourceType: input.sourceType,
      sourceId: webSourceId,
      sourceUrl: input.sourceUrl,
      title: input.title,
      description: input.description,
      coverUrl,
      videoUrl: input.videoUrl,
      mediaUrls: toInputJson(allMediaUrls.length > 0 ? allMediaUrls : null),
      stats: toInputJson(input.stats),
      author: toInputJson(input.author),
      category: '我的',
      remark: 'miniapp-xhs-collect',
      rawPayload: toInputJson(rawPayload),
      collectorVersion: 'miniapp_xhs_collect_v1',
      ingestedBy: input.userId,
      ingestedAt: new Date(),
      publishedAt: new Date(),
    },
  });
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

  const apiKey = await getApiKeyForUser(userId);
  if (!apiKey) {
    return NextResponse.json({ error: '请先在设置页绑定 API Key' }, { status: 400 });
  }
  try {
    await deductConfiguredCredits({
      apiKey,
      featureKey: 'xhs_collect',
      userId,
      defaultAmount: 5,
      workflowId: 'xhs_collect',
      workflowName: '小红书笔记采集',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '积分不足或扣费失败' },
      { status: 402 },
    );
  }

  const payload = detail?.data || {};
  const title = pickTextAtPaths(payload, [
    '作品标题',
    'title',
    'display_title',
    'displayTitle',
    'noteCard.title',
    'noteCard.display_title',
    'noteCard.displayTitle',
    'note_card.title',
    'note_card.display_title',
    'note.title',
    'note.display_title',
    'note.displayTitle',
    'note.noteCard.title',
    'note.noteCard.display_title',
    'note.note_card.title',
    'note.note_card.display_title',
    'data.title',
    'data.display_title',
    'data.displayTitle',
    'data.noteCard.title',
    'data.noteCard.display_title',
    'data.note_card.title',
    'data.note_card.display_title',
    'result.title',
    'result.display_title',
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
    ...collectUrls(payload['cover']),
    ...collectUrls(payload['coverUrl']),
    ...collectUrls(payload['cover_url']),
    ...collectUrls(payload['coverImage']),
    ...collectUrls(payload['cover_image']),
    ...collectUrls(payload['thumbnail']),
    ...collectUrls(payload['thumbnailUrl']),
    ...collectUrls(payload['thumbnail_url']),
    ...collectUrls(getByPath(payload, 'note.cover')),
    ...collectUrls(getByPath(payload, 'note.coverUrl')),
    ...collectUrls(getByPath(payload, 'note.cover_url')),
    ...collectUrls(getByPath(payload, 'note.note_card.cover')),
    ...collectUrls(getByPath(payload, 'note.note_card.cover.url_default')),
    ...collectUrls(getByPath(payload, 'note.note_card.cover.urlDefault')),
    ...collectUrls(getByPath(payload, 'note.noteCard.cover')),
    ...collectUrls(getByPath(payload, 'note.noteCard.cover.url_default')),
    ...collectUrls(getByPath(payload, 'note.noteCard.cover.urlDefault')),
    ...collectUrls(getByPath(payload, 'note.images')),
    ...collectUrls(getByPath(payload, 'note.imageList')),
    ...collectUrls(getByPath(payload, 'data.cover')),
    ...collectUrls(getByPath(payload, 'data.coverUrl')),
    ...collectUrls(getByPath(payload, 'data.cover_url')),
    ...collectUrls(getByPath(payload, 'data.note_card.cover')),
    ...collectUrls(getByPath(payload, 'data.note_card.cover.url_default')),
    ...collectUrls(getByPath(payload, 'data.noteCard.cover')),
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
  const coverUrl = pickUrlAtPaths(payload, [
    '封面',
    '封面图',
    'cover',
    'cover.url',
    'cover.urlDefault',
    'cover.url_default',
    'coverUrl',
    'cover_url',
    'coverImage',
    'cover_image',
    'thumbnail',
    'thumbnailUrl',
    'thumbnail_url',
    'note.cover',
    'note.cover.url',
    'note.cover.urlDefault',
    'note.cover.url_default',
    'note.note_card.cover',
    'note.note_card.cover.url',
    'note.note_card.cover.urlDefault',
    'note.note_card.cover.url_default',
    'note.noteCard.cover',
    'note.noteCard.cover.url',
    'note.noteCard.cover.urlDefault',
    'note.noteCard.cover.url_default',
    'data.cover',
    'data.cover.url',
    'data.cover.urlDefault',
    'data.cover.url_default',
    'data.note_card.cover',
    'data.note_card.cover.urlDefault',
    'data.note_card.cover.url_default',
    'result.cover',
    'result.cover.url',
    'result.cover.urlDefault',
    'result.cover.url_default',
  ]) || mediaUrls[0] || null;
  const isVideoNote = Boolean(videoUrl);
  const author = normalizeAuthor(payload);
  const stats = normalizeStats(payload);
  const rawPayload = {
    raw: payload,
    originalPayload: payload,
    author,
    stats,
    media: {
      coverUrl,
      videoUrl,
      mediaUrls,
      sourceType: isVideoNote ? 'video' : 'image',
    },
    source: 'miniapp-xhs-collect',
  };

  const saved = await prisma.$transaction(async (tx) => {
    const existing = await tx.imageTextReplicationTask.findFirst({
      where: {
        userId,
        sourcePlatform: 'miniapp-my',
        sourceId: parsedSourceId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    let savedTaskId = existing?.id || '';

    if (existing) {
      await tx.imageTextReplicationTask.update({
        where: { id: existing.id },
        data: {
          sourceTitle: title,
          sourceText,
          sourceImages: toInputJson(coverUrl ? normalizeUrls([coverUrl, ...mediaUrls]) : mediaUrls),
          sourceUrl: parsedSourceUrl,
          status: isVideoNote ? 'VIDEO_COLLECTED' : 'BREAKDOWN_PENDING',
          generatedImages: toInputJson(rawPayload),
          errorMessage: null,
        },
      });
      savedTaskId = existing.id;
    } else {
      const created = await tx.imageTextReplicationTask.create({
        data: {
          id: randomUUID(),
          userId,
          status: isVideoNote ? 'VIDEO_COLLECTED' : 'BREAKDOWN_PENDING',
          sourceTitle: title,
          sourceText,
          sourceImages: toInputJson(coverUrl ? normalizeUrls([coverUrl, ...mediaUrls]) : mediaUrls),
          sourcePlatform: 'miniapp-my',
          sourceId: parsedSourceId,
          sourceUrl: parsedSourceUrl,
          generatedImages: toInputJson(rawPayload),
        },
      });
      savedTaskId = created.id;
    }

    const reference = await syncMiniappCollectToWebReference(tx, {
      userId,
      taskId: savedTaskId,
      sourceId: parsedSourceId,
      sourceUrl: parsedSourceUrl,
      title,
      description: sourceText,
      mediaUrls,
      coverUrl,
      videoUrl,
      sourceType: isVideoNote ? 'video' : 'note',
      author,
      stats,
      rawPayload,
    });

    return {
      taskId: savedTaskId,
      referenceId: reference.id,
    };
  });

  if (!isVideoNote) {
    void runBreakdownForMyNote(saved.taskId);
  }

  return NextResponse.json({
    taskId: saved.taskId,
    sourceId: parsedSourceId,
    sourceUrl: parsedSourceUrl,
    referenceId: saved.referenceId,
    status: isVideoNote ? 'VIDEO_COLLECTED' : 'BREAKDOWN_PENDING',
    title,
    videoUrl,
    message: '采集成功，已加入“我的”分类',
  });
}
