import Taro from '@tarojs/taro';

const API_BASE_URL = (process.env.TARO_APP_API_BASE_URL || '').replace(/\/$/, '');

export type TaskStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED' | string;

export interface MiniappProfile {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  points: number | null;
  apiKey: string | null;
}

export interface HotItem {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  coverUrl?: string | null;
  benchmarkScore?: number | null;
  creatorName?: string | null;
  sourceUrl?: string | null;
  scriptText?: string | null;
}

export interface WorkItem {
  id: string;
  title: string;
  type: 'video' | 'image-text' | 'copy' | 'task';
  status: TaskStatus;
  createdAt: string;
  preview?: string | null;
}

export interface AssetOverview {
  characters: number;
  products: number;
  styles: number;
  templates: number;
}

function resolveUrl(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function getApiKey(): string | null {
  try {
    return Taro.getStorageSync('API_KEY') || null;
  } catch {
    return null;
  }
}

async function request<T = unknown>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    data?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-User-Api-Key'] = apiKey;
  }

  const res = await Taro.request({
    url: resolveUrl(path),
    method: options.method ?? (options.data ? 'POST' : 'GET'),
    data: options.data,
    header: headers,
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    const payload = res.data as Record<string, unknown> | null;
    const message = (payload?.error as string) ?? `HTTP ${res.statusCode}`;
    throw new Error(message);
  }

  return res.data as T;
}

function detectWorkType(item: any): WorkItem['type'] {
  const taskType = String(item?.taskType ?? '').toLowerCase();
  if (taskType.includes('video') || taskType.includes('digital') || taskType === 't2v') return 'video';
  if (taskType.includes('poster') || taskType.includes('image')) return 'image-text';
  if (taskType.includes('script') || taskType.includes('copy') || taskType.includes('writing')) return 'copy';
  return 'task';
}

function normalizeStatus(value: unknown): TaskStatus {
  const status = String(value ?? '').toUpperCase();
  if (status.includes('COMPLETE') || status === 'DONE' || status === 'SUCCESS') return 'COMPLETED';
  if (status.includes('GENERAT') || status.includes('PROCESS')) return 'GENERATING';
  if (status.includes('FAIL') || status.includes('ERROR')) return 'FAILED';
  if (status.includes('PEND') || status.includes('QUEUE') || status.includes('WAIT')) return 'PENDING';
  return status || 'PENDING';
}

export const miniappApi = {
  async getProfile(): Promise<MiniappProfile> {
    const userInfoStr = Taro.getStorageSync('USER_INFO');
    const userInfo = userInfoStr ? JSON.parse(userInfoStr as string) : null;
    const apiKey = getApiKey();

    let points: number | null = null;
    try {
      const credits = await request<{ ok?: boolean; balance?: number }>('/api/integration/credits');
      points = typeof credits?.balance === 'number' ? credits.balance : null;
    } catch {
      points = null;
    }

    return {
      id: userInfo?.userId ?? '',
      username: userInfo?.username ?? null,
      avatarUrl: userInfo?.avatarUrl ?? null,
      points,
      apiKey,
    };
  },

  async getHotList(params?: { category?: string; q?: string; limit?: number }): Promise<HotItem[]> {
    const query = new URLSearchParams();
    query.set('limit', String(params?.limit ?? 20));
    if (params?.category && params.category !== '全行业') {
      query.set('category', params.category);
    }
    if (params?.q?.trim()) {
      query.set('q', params.q.trim());
    }

    const res = await request<{ data?: any[] }>(`/api/viral-references?${query.toString()}`);
    const list = Array.isArray(res?.data) ? res.data : [];

    return list.map((item) => ({
      id: String(item.id),
      title: String(item.title ?? '未命名爆款'),
      description: (item.description as string | null) ?? null,
      category: (item.category as string | null) ?? null,
      coverUrl: (item.coverUrl as string | null) ?? null,
      benchmarkScore: typeof item.benchmarkScore === 'number' ? item.benchmarkScore : null,
      creatorName: (item.creator?.name as string | null) ?? null,
      sourceUrl: (item.sourceUrl as string | null) ?? null,
      scriptText: (item.scriptText as string | null) ?? null,
    }));
  },

  async startOneClickCreate(item: HotItem): Promise<{ taskId: string; status: string }> {
    return request<{ taskId: string; status: string }>('/api/image-text-replication/start', {
      method: 'POST',
      data: {
        sourceTitle: item.title,
        sourceText: item.scriptText ?? item.description ?? '',
        sourceImages: item.coverUrl ? [item.coverUrl] : [],
        sourcePlatform: 'miniapp',
        sourceId: item.id,
        sourceUrl: item.sourceUrl ?? '',
      },
    });
  },

  async getWorkList(limit = 50): Promise<WorkItem[]> {
    const [tasksRes, videosRes] = await Promise.allSettled([
      request<{ data?: any[] }>(`/api/tasks?limit=${limit}`),
      request<{ data?: any[] }>(`/api/digital-human/videos?limit=${Math.min(20, limit)}`),
    ]);

    const works: WorkItem[] = [];

    if (tasksRes.status === 'fulfilled') {
      const tasks = Array.isArray(tasksRes.value?.data) ? tasksRes.value.data : [];
      for (const item of tasks) {
        works.push({
          id: String(item.id),
          title: String(item.title ?? '未命名任务'),
          type: detectWorkType(item),
          status: normalizeStatus(item.status),
          createdAt: String(item.createdAt ?? new Date().toISOString()),
          preview: (item.preview as string | null) ?? null,
        });
      }
    }

    if (videosRes.status === 'fulfilled') {
      const videos = Array.isArray(videosRes.value?.data) ? videosRes.value.data : [];
      for (const item of videos) {
        works.push({
          id: String(item.id),
          title: item.type === 'VOICE_CLONE' ? '数字人文字驱动视频' : '数字人口型驱动视频',
          type: 'video',
          status: normalizeStatus(item.status),
          createdAt: String(item.createdAt ?? new Date().toISOString()),
          preview: (item.resultUrl as string | null) ?? null,
        });
      }
    }

    works.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return works.slice(0, limit);
  },

  async getAssetOverview(): Promise<AssetOverview> {
    const [charactersRes, productsRes, stylesRes] = await Promise.allSettled([
      request<any[]>('/api/characters'),
      request<any[]>('/api/products'),
      request<any[]>('/api/assets/styles'),
    ]);

    const characters = charactersRes.status === 'fulfilled' && Array.isArray(charactersRes.value)
      ? charactersRes.value.length
      : 0;
    const products = productsRes.status === 'fulfilled' && Array.isArray(productsRes.value)
      ? productsRes.value.length
      : 0;
    const styles = stylesRes.status === 'fulfilled' && Array.isArray(stylesRes.value)
      ? stylesRes.value.length
      : 0;

    return {
      characters,
      products,
      styles,
      templates: 0,
    };
  },
};
