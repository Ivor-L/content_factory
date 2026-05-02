import Taro from '@tarojs/taro';
import type { HotItem } from './miniapp-api';

const FAVORITES_KEY = 'MINIAPP_FAVORITES';

export interface FavoriteItem extends HotItem {
  collectedAt: number;
  source: 'hot' | 'upload';
}

function readFavorites(): FavoriteItem[] {
  try {
    const raw = Taro.getStorageSync(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && item.id)
      .map((item) => ({
        ...item,
        id: String(item.id),
        title: String(item.title || '未命名内容'),
        collectedAt: typeof item.collectedAt === 'number' ? item.collectedAt : Date.now(),
      }))
      .sort((a, b) => b.collectedAt - a.collectedAt);
  } catch {
    return [];
  }
}

function writeFavorites(list: FavoriteItem[]) {
  Taro.setStorageSync(FAVORITES_KEY, JSON.stringify(list));
}

export function getFavorites(): FavoriteItem[] {
  return readFavorites();
}

export function getFavoriteIdSet(): Set<string> {
  return new Set(readFavorites().map((item) => String(item.id)));
}

export function toggleFavoriteFromHot(item: HotItem): { favorited: boolean; list: FavoriteItem[] } {
  const list = readFavorites();
  const id = String(item.id);
  const index = list.findIndex((fav) => String(fav.id) === id);

  if (index >= 0) {
    const nextList = list.filter((fav) => String(fav.id) !== id);
    writeFavorites(nextList);
    return { favorited: false, list: nextList };
  }

  const next: FavoriteItem = {
    ...item,
    id,
    title: String(item.title || '未命名内容'),
    collectedAt: Date.now(),
    source: 'hot',
  };
  const nextList = [next, ...list];
  writeFavorites(nextList);
  return { favorited: true, list: nextList };
}

export function addUploadedFavorite(payload: {
  title?: string;
  videoUrl: string;
  coverUrl?: string | null;
  description?: string | null;
}): FavoriteItem {
  const list = readFavorites();
  const next: FavoriteItem = {
    id: `upload-${Date.now()}`,
    title: payload.title?.trim() || '我上传的视频',
    description: payload.description ?? '手动上传',
    coverUrl: payload.coverUrl ?? null,
    videoUrl: payload.videoUrl,
    sourceType: 'video',
    category: '我的上传',
    collectedAt: Date.now(),
    source: 'upload',
  };
  const nextList = [next, ...list];
  writeFavorites(nextList);
  return next;
}

export function removeFavorite(id: string): FavoriteItem[] {
  const nextList = readFavorites().filter((item) => String(item.id) !== String(id));
  writeFavorites(nextList);
  return nextList;
}
