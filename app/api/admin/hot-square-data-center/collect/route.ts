import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUserContext } from '@/lib/authServer';
import { importViralReferenceQueueItems, type RawQueueItem } from '@/lib/viralReferenceImporter';
import {
  HOT_SQUARE_DATA_CENTER_KEY,
  HOT_SQUARE_SHARED_OWNER,
  normalizeHotSquareDataCenterConfig,
} from '@/lib/hotSquareDataCenter';
import prisma from '@/lib/prisma';

type SearchNotesNote = {
  id?: string;
  note_id?: string;
  title?: string;
  desc?: string;
  description?: string;
  type?: string;
  note_type?: string;
  liked_count?: number;
  collected_count?: number;
  comment_count?: number;
  share_count?: number;
  create_time?: number;
  time?: number;
  user?: Record<string, unknown>;
  author?: Record<string, unknown>;
  cover?: Record<string, unknown>;
  video?: Record<string, unknown>;
  image_list?: unknown[];
  images?: unknown[];
  note_card?: Record<string, unknown>;
  [key: string]: unknown;
};

type SearchNotesResponse = {
  data?: {
    items?: SearchNotesNote[];
    notes?: SearchNotesNote[];
    note_list?: SearchNotesNote[];
    search_id?: string;
    search_session_id?: string;
  };
  search_id?: string;
  search_session_id?: string;
  items?: SearchNotesNote[];
  notes?: SearchNotesNote[];
  note_list?: SearchNotesNote[];
  [key: string]: unknown;
};

async function requireAdmin(request: Request) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  return data?.is_admin ? userId : null;
}

function toString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeImageCandidates(note: SearchNotesNote): unknown[] {
  const card = note.note_card && typeof note.note_card === 'object' ? note.note_card as Record<string, unknown> : {};
  return [
    note.image_list,
    note.images,
    card.image_list,
    card.images,
    card.note_image_list,
  ];
}

function toQueueItem(note: SearchNotesNote, categoryName: string): RawQueueItem | null {
  const sourceId = toString(note.note_id || note.id);
  if (!sourceId) return null;

  const user = note.user && typeof note.user === 'object' ? note.user as Record<string, unknown> : {};
  const author = note.author && typeof note.author === 'object' ? note.author as Record<string, unknown> : {};
  const card = note.note_card && typeof note.note_card === 'object' ? note.note_card as Record<string, unknown> : {};
  const title = toString(note.title || card.title) || '未命名笔记';
  const description = toString(note.desc || note.description || card.desc || card.description);
  const sourceUrl = `https://www.xiaohongshu.com/explore/${encodeURIComponent(sourceId)}`;

  const data: Record<string, unknown> = {
    id: sourceId,
    noteId: sourceId,
    sourceId,
    source_id: sourceId,
    title,
    desc: description,
    description,
    url: sourceUrl,
    link: sourceUrl,
    pageUrl: sourceUrl,
    cover: note.cover || card.cover || null,
    video: note.video || card.video || null,
    image_list: normalizeImageCandidates(note),
    images: normalizeImageCandidates(note),
    author: {
      name: toString(user.nickname || author.nickname || author.name),
      profileUrl: toString(user.profile_url || author.profile_url || ''),
      username: toString(user.user_id || author.user_id || ''),
    },
    stats: {
      likes: Number(note.liked_count ?? 0) || 0,
      collects: Number(note.collected_count ?? 0) || 0,
      comments: Number(note.comment_count ?? 0) || 0,
      shares: Number(note.share_count ?? 0) || 0,
    },
    publishedAt: note.create_time || note.time || null,
    raw: note,
    scriptText: description,
  };

  return {
    platform: 'xiaohongshu',
    sourceType: toString(note.type || note.note_type || 'note') || 'note',
    collectorVersion: 'xhs_search_notes_v1',
    data,
    userTags: {
      category: categoryName,
      remark: 'admin-hot-square-collect',
    },
  };
}

function collectItems(payload: SearchNotesResponse): SearchNotesNote[] {
  const first = payload.data?.items;
  if (Array.isArray(first) && first.length > 0) return first;
  const second = payload.data?.notes;
  if (Array.isArray(second) && second.length > 0) return second;
  const third = payload.data?.note_list;
  if (Array.isArray(third) && third.length > 0) return third;
  if (Array.isArray(payload.items) && payload.items.length > 0) return payload.items;
  if (Array.isArray(payload.notes) && payload.notes.length > 0) return payload.notes;
  if (Array.isArray(payload.note_list) && payload.note_list.length > 0) return payload.note_list;
  return [];
}

export async function POST(request: NextRequest) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null) as { categoryId?: string } | null;
  const categoryId = toString(body?.categoryId);
  if (!categoryId) {
    return NextResponse.json({ error: 'Missing categoryId' }, { status: 400 });
  }

  const apiKey = toString(process.env.HOT_SQUARE_XHS_API_KEY || process.env.REDNOTE_API_KEY);
  const baseUrl = toString(process.env.HOT_SQUARE_XHS_API_BASE_URL || 'https://api.tikhub.io');
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing HOT_SQUARE_XHS_API_KEY/REDNOTE_API_KEY' }, { status: 500 });
  }

  const cfgRecord = await prisma.monetizationSquareConfig.findFirst({
    where: {
      key: HOT_SQUARE_DATA_CENTER_KEY,
      published: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
  const config = normalizeHotSquareDataCenterConfig(cfgRecord?.config);
  const category = config.categories.find((item) => item.id === categoryId);
  if (!category) {
    return NextResponse.json({ error: 'Category not found in config' }, { status: 404 });
  }
  if (category.enabled === false) {
    return NextResponse.json({ error: 'Category is disabled' }, { status: 400 });
  }

  const collect = category.collect || { keyword: category.name };
  const pages = Math.min(Math.max(Number(collect.pages ?? 1) || 1, 1), 5);

  let totalFetched = 0;
  const queueItems: RawQueueItem[] = [];
  let searchId = '';
  let searchSessionId = '';

  for (let page = 1; page <= pages; page += 1) {
    const params = new URLSearchParams();
    params.set('keyword', collect.keyword || category.name);
    params.set('page', String(page));
    if (collect.sortType) params.set('sort_type', collect.sortType);
    if (collect.noteType) params.set('note_type', collect.noteType);
    if (collect.timeFilter) params.set('time_filter', collect.timeFilter);
    if (collect.source) params.set('source', collect.source);
    params.set('ai_mode', String(collect.aiMode === 1 ? 1 : 0));
    if (page > 1 && searchId) params.set('search_id', searchId);
    if (page > 1 && searchSessionId) params.set('search_session_id', searchSessionId);

    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/xiaohongshu/app_v2/search_notes?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      return NextResponse.json(
        { error: `XHS search_notes failed at page ${page}: HTTP ${resp.status}`, detail: detail.slice(0, 500) },
        { status: 502 },
      );
    }

    const payload = await resp.json() as SearchNotesResponse;
    const items = collectItems(payload);
    totalFetched += items.length;

    const currentSearchId = toString(payload.data?.search_id || payload.search_id);
    const currentSearchSessionId = toString(payload.data?.search_session_id || payload.search_session_id);
    if (currentSearchId) searchId = currentSearchId;
    if (currentSearchSessionId) searchSessionId = currentSearchSessionId;

    for (const item of items) {
      const queueItem = toQueueItem(item, category.name);
      if (queueItem) queueItems.push(queueItem);
    }

    if (items.length === 0) break;
  }

  if (queueItems.length === 0) {
    return NextResponse.json({
      success: true,
      categoryId,
      categoryName: category.name,
      fetched: totalFetched,
      imported: 0,
      errors: [],
    });
  }

  const importResult = await importViralReferenceQueueItems(queueItems, HOT_SQUARE_SHARED_OWNER);
  return NextResponse.json({
    success: true,
    categoryId,
    categoryName: category.name,
    fetched: totalFetched,
    imported: importResult.results.length,
    errors: importResult.errors,
  });
}
