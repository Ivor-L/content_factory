import Taro from '@tarojs/taro';

function getApiBaseUrl(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromDefine = typeof __API_BASE_URL__ !== 'undefined' ? (String((__API_BASE_URL__ as any) || '').trim()) : '';
    if (fromDefine) return fromDefine.replace(/\/$/, '');
  } catch {
    // ignore
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtime = (typeof globalThis !== 'undefined' ? (globalThis as any) : null);
    const fromProcess = runtime?.process?.env?.TARO_APP_API_BASE_URL;
    if (typeof fromProcess === 'string' && fromProcess.trim()) {
      return fromProcess.trim().replace(/\/$/, '');
    }
  } catch {
    // ignore
  }
  return '';
}

const API_BASE_URL = getApiBaseUrl();

export type TaskStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED' | string;

export interface MiniappProfile {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  points: number | null;
  apiKey: string | null;
  memberLevel?: string | null;
}

export interface HotItem {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  coverUrl?: string | null;
  mediaUrls?: string[] | null;
  videoUrl?: string | null;
  sourceType?: string | null;
  benchmarkScore?: number | null;
  likes?: number | null;
  collects?: number | null;
  creatorName?: string | null;
  sourceUrl?: string | null;
  scriptText?: string | null;
  source?: 'all' | 'mine';
}

export interface MyNoteImageTextItem {
  index: number;
  text: string;
  success: boolean;
  error?: string | null;
}

export interface MyNoteTaskDetail {
  id: string;
  status: string;
  source: {
    title: string;
    text: string;
    images: string[];
    platform?: string;
    sourceId?: string;
    sourceUrl?: string;
  };
  analysisResult: {
    sourceTitle: string;
    sourceText: string;
    sourceImages: string[];
    extractedImageTexts: MyNoteImageTextItem[];
    rewriteResult: {
      title: string;
      body: string;
      imageTexts: string[];
    } | null;
  };
  generatedCopy?: string | null;
  errorMessage?: string | null;
}

export interface WorkItem {
  id: string;
  title: string;
  type: 'video' | 'image-text' | 'copy' | 'task';
  status: TaskStatus;
  taskType?: string;
  createdAt: string;
  preview?: string | null;
  thumbnailUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  source: 'task' | 'digitalHuman';
}

export type StoryboardPipelineKey = 'script_to_storyboard' | 'viral_clone' | 'skeleton_video';

export interface CreateStoryboardJobInput {
  pipelineKey: StoryboardPipelineKey;
  title?: string;
  script?: string;
  creativeTaskId?: string;
  productId?: string;
  metadata?: Record<string, unknown>;
  source?: string;
}

export interface CreateStoryboardJobResult {
  taskId: string;
  status: string;
  pipelineKey: StoryboardPipelineKey;
  workflowId: string;
}

export interface StoryboardSegmentItem {
  id: string;
  order: number;
  duration: number;
  timeRange: string | null;
  imagePrompt: string | null;
  videoPrompt: string | null;
  generatedImage: string | null;
  generatedVideo: string | null;
  status: string;
  originalScript: string | null;
}

export interface StoryboardTaskStatusResult {
  id: string;
  status: string;
  progress: number;
  imageModel?: string | null;
  videoModel?: string | null;
  finalVideoUrl: string | null;
  segments: StoryboardSegmentItem[];
}

export interface StoryboardGenerateResult {
  success: boolean;
  partial?: boolean;
  task_id: string;
  total: number;
  triggered: number;
  failed: number;
  model?: string;
  message?: string;
}

export interface AssetOverview {
  characters: number;
  products: number;
  styles: number;
  templates: number;
}

export interface ProductSummary {
  id: string;
  name: string;
  images: string[];
}

export interface XhsNormalizedMarkdown {
  markdown: string;
  standardizedMarkdown: string;
  needsRewrite: boolean;
}

export interface XhsMetaResult {
  title: string;
  body: string;
  tags: string[];
}

export interface StylePresetSummary {
  id: string;
  name: string;
  type: string;
  previewUrl?: string | null;
  status?: string | null;
}

export interface CanvasImageGenerationResult {
  images: string[];
  raw: unknown;
}

export interface XhsLayoutRenderResult {
  taskId: string;
  title: string;
  templateId: string;
  images: string[];
}

export interface MonetizationActionConfig {
  type: 'route';
  route: string;
  params?: Record<string, string | number | boolean | null>;
  featureKey?: string;
  promptTemplate?: string;
}

export interface MonetizationItemConfig {
  id: string;
  title: string;
  subtitle?: string;
  coverImageUrl?: string;
  demoVideoUrl?: string;
  tags?: string[];
  demos?: {
    id: string;
    title: string;
    subtitle?: string;
    coverImageUrl?: string;
    demoVideoUrl?: string;
    tags?: string[];
    action?: MonetizationActionConfig;
  }[];
  action: MonetizationActionConfig;
}

export interface MonetizationCategoryConfig {
  id: string;
  name: string;
  items: MonetizationItemConfig[];
}

export interface MonetizationSquareConfigPayload {
  title: string;
  subtitle?: string;
  categories: MonetizationCategoryConfig[];
}

export interface HotSquareCategoryConfig {
  id: string;
  name: string;
  enabled?: boolean;
}

export interface HotSquareConfigPayload {
  title: string;
  subtitle?: string;
  categories: HotSquareCategoryConfig[];
}

export interface XhsPublishResult {
  id: string;
  url: string;
  qrcode: string;
}

export interface MiniappCollectXhsResult {
  taskId: string;
  status: string;
  title: string;
  message?: string;
}

const HOT_VIDEO_URL_RE = /\.(mp4|mov|m3u8)(\?|$)|\/video\/|\/master\/|xgvideo/i;

function pickList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data)) return data;
  }
  return [];
}

function sumKnowledgeFiles(foldersPayload: unknown): number {
  const folders = pickList(foldersPayload);
  if (folders.length === 0) return 0;

  let total = 0;
  for (const folder of folders) {
    const count = (folder as { _count?: { files?: unknown } })._count?.files;
    total += typeof count === 'number' ? count : 0;
  }
  return total;
}

function resolveUrl(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^(https?:\/\/|\/)/i.test(trimmed)) return trimmed;
  return null;
}

function isVideoUrl(url: string): boolean {
  return HOT_VIDEO_URL_RE.test(url);
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of urls) {
    const url = sanitizeUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function parseObject(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

function collectUrlsFromUnknown(value: unknown): string[] {
  if (value == null) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        return collectUrlsFromUnknown(JSON.parse(trimmed));
      } catch {
        // ignore and fallback to plain URL parsing
      }
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((part) => part.trim()).filter(Boolean);
    }
    return [trimmed];
  }

  if (Array.isArray(value)) {
    const urls: string[] = [];
    for (const item of value) {
      urls.push(...collectUrlsFromUnknown(item));
    }
    return urls;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const urls: string[] = [];
    const candidates = [
      obj.url,
      obj.urlDefault,
      obj.url_default,
      obj.src,
      obj.imageUrl,
      obj.image_url,
      obj.coverUrl,
      obj.cover_url,
      obj.videoUrl,
      obj.video_url,
      obj.playUrl,
      obj.play_url,
      obj.masterUrl,
      obj.master_url,
    ];
    for (const candidate of candidates) {
      urls.push(...collectUrlsFromUnknown(candidate));
    }
    return urls;
  }

  return [];
}

function normalizeHotMediaUrls(item: any): string[] | null {
  const rawPayload = parseObject(item?.rawPayload);

  const candidates: unknown[] = [
    item?.mediaUrls,
    item?.media_urls,
    item?.images,
    item?.imageList,
    item?.image_list,
    rawPayload?.mediaUrls,
    rawPayload?.media_urls,
    rawPayload?.images,
    rawPayload?.imageList,
    rawPayload?.image_list,
    parseObject(rawPayload?.note)?.images,
    parseObject(rawPayload?.note)?.imageList,
    parseObject(rawPayload?.data)?.images,
    parseObject(rawPayload?.data)?.imageList,
  ];

  const allUrls: string[] = [];
  for (const candidate of candidates) {
    allUrls.push(...collectUrlsFromUnknown(candidate));
  }

  const unique = uniqueUrls(allUrls);
  if (unique.length === 0) return null;

  const imageUrls = unique.filter((url) => !isVideoUrl(url));
  if (imageUrls.length > 0) return imageUrls;

  return unique;
}

function extractCanvasImageUrls(payload: unknown): string[] {
  const candidates: unknown[] = [];
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    candidates.push(
      obj.data,
      obj.images,
      obj.output,
      obj.result,
      obj.results,
      obj.generatedImages,
      obj.generated_images,
    );
    if (obj.data && typeof obj.data === 'object') {
      const dataObj = obj.data as Record<string, unknown>;
      candidates.push(dataObj.images, dataObj.output, dataObj.results, dataObj.result);
    }
  }

  const urls: string[] = [];
  for (const candidate of candidates) {
    urls.push(...collectUrlsFromUnknown(candidate));
  }
  return uniqueUrls(urls).filter((url) => !isVideoUrl(url));
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

function isHttpStatusError(error: unknown, statusCode: number): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === `HTTP ${statusCode}` || error.message.includes(String(statusCode));
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
    if (apiKey) {
      try {
        const credits = await request<{ ok?: boolean; balance?: number }>('/api/integration/credits');
        points = typeof credits?.balance === 'number' ? credits.balance : null;
      } catch {
        points = null;
      }
    }

    let memberLevel: string | null = null;
    if (apiKey) {
      try {
        const profileMeta = await request<{ data?: { memberLevel?: string | null } }>('/api/user/profile');
        memberLevel = profileMeta?.data?.memberLevel ?? null;
      } catch (error) {
        // Some online environments may not expose this endpoint yet.
        if (!isHttpStatusError(error, 404)) {
          memberLevel = null;
        }
      }
    }

    return {
      id: userInfo?.userId ?? '',
      username: userInfo?.username ?? null,
      avatarUrl: userInfo?.avatarUrl ?? null,
      points,
      apiKey,
      memberLevel,
    };
  },

  async getHotList(params?: {
    category?: string;
    q?: string;
    limit?: number;
    contentType?: 'video' | 'image';
    sort?: 'recent' | 'likes' | 'collects' | 'comments';
    source?: 'all' | 'mine';
  }): Promise<HotItem[]> {
    if (params?.source === 'mine') {
      const query = new URLSearchParams();
      query.set('limit', String(params?.limit ?? 40));
      const payload = await request<{ data?: Array<Record<string, unknown>> }>(`/api/image-text-replication/my-notes?${query.toString()}`);
      const list = Array.isArray(payload?.data) ? payload.data : [];
      return list.map((item) => {
        const sourceImages = Array.isArray(item.sourceImages)
          ? item.sourceImages.map((img) => String(img || '').trim()).filter(Boolean)
          : [];
        const title = String(item.title || item.sourceTitle || '未命名笔记');
        const sourceText = String(item.sourceText || '');
        return {
          id: String(item.id || ''),
          title,
          description: sourceText || null,
          category: '我的',
          coverUrl: sourceImages[0] || null,
          mediaUrls: sourceImages,
          sourceType: 'image',
          sourceUrl: '',
          scriptText: sourceText,
          source: 'mine',
        } as HotItem;
      }).filter((item) => item.id);
    }

    const query = new URLSearchParams();
    query.set('limit', String(params?.limit ?? 20));
    if (params?.sort) {
      query.set('sort', params.sort);
    }
    if (params?.contentType) {
      query.set('contentType', params.contentType);
    }
    if (params?.category && params.category !== '全行业') {
      query.set('category', params.category);
    }
    query.set('scope', 'shared');
    if (params?.q?.trim()) {
      query.set('q', params.q.trim());
    }

    const res = await request<{ data?: any[] }>(`/api/viral-references?${query.toString()}`);
    const list = Array.isArray(res?.data) ? res.data : [];

    return list.map((item) => {
      const mediaUrls = normalizeHotMediaUrls(item);
      const coverUrl = sanitizeUrl(item.coverUrl) ?? mediaUrls?.[0] ?? null;

      return {
        id: String(item.id),
        title: String(item.title ?? '未命名爆款'),
        description: (item.description as string | null) ?? null,
        category: (item.category as string | null) ?? null,
        coverUrl,
        mediaUrls,
        videoUrl: (item.videoUrl as string | null) ?? null,
        sourceType: (item.sourceType as string | null) ?? null,
        benchmarkScore: typeof item.benchmarkScore === 'number' ? item.benchmarkScore : null,
        likes: typeof item.stats?.likes === 'number'
          ? item.stats.likes
          : (typeof item.stats?.likes === 'string' ? Number(item.stats.likes) || 0 : null),
        collects: typeof item.stats?.collects === 'number'
          ? item.stats.collects
          : (typeof item.stats?.collects === 'string' ? Number(item.stats.collects) || 0 : null),
        creatorName: (item.creator?.name as string | null) ?? null,
        sourceUrl: (item.sourceUrl as string | null) ?? null,
        scriptText: (item.scriptText as string | null) ?? null,
        source: 'all',
      };
    });
  },

  async startOneClickCreate(item: HotItem): Promise<{ taskId: string; status: string }> {
    return request<{ taskId: string; status: string }>('/api/image-text-replication/my-notes', {
      method: 'POST',
      data: {
        sourceTitle: item.title,
        sourceText: item.scriptText ?? item.description ?? '',
        sourceImages: item.mediaUrls && item.mediaUrls.length > 0
          ? item.mediaUrls
          : (item.coverUrl ? [item.coverUrl] : []),
        sourcePlatform: 'miniapp',
        sourceId: item.id,
        sourceUrl: item.sourceUrl ?? '',
      },
    });
  },

  async collectHotXhsNote(url: string): Promise<MiniappCollectXhsResult> {
    const payload = await request<{ taskId?: string; status?: string; title?: string; message?: string }>('/api/miniapp/hot-square/collect-xhs', {
      method: 'POST',
      data: { url },
    });

    return {
      taskId: String(payload?.taskId || ''),
      status: String(payload?.status || 'BREAKDOWN_PENDING'),
      title: String(payload?.title || '未命名笔记'),
      message: typeof payload?.message === 'string' ? payload.message : undefined,
    };
  },

  async getImageTextMyNoteTask(taskId: string): Promise<MyNoteTaskDetail> {
    const payload = await request<{ task?: Record<string, unknown> }>(`/api/image-text-replication/${encodeURIComponent(taskId)}`);
    const task = payload?.task || {};
    const sourceRaw = task.source && typeof task.source === 'object' ? task.source as Record<string, unknown> : {};
    const analysisRaw = task.analysisResult && typeof task.analysisResult === 'object'
      ? task.analysisResult as Record<string, unknown>
      : {};
    const extractedRaw = Array.isArray(analysisRaw.extractedImageTexts)
      ? analysisRaw.extractedImageTexts
      : [];

    const extractedImageTexts = extractedRaw
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const obj = item as Record<string, unknown>;
        const indexValue = Number(obj.index);
        return {
          index: Number.isFinite(indexValue) && indexValue > 0 ? Math.floor(indexValue) : index + 1,
          text: String(obj.text || ''),
          success: Boolean(obj.success),
          error: typeof obj.error === 'string' ? obj.error : null,
        };
      })
      .filter((item): item is MyNoteImageTextItem => Boolean(item));

    const rewriteRaw = analysisRaw.rewriteResult && typeof analysisRaw.rewriteResult === 'object'
      ? analysisRaw.rewriteResult as Record<string, unknown>
      : null;

    return {
      id: String(task.id || taskId),
      status: String(task.status || 'PENDING'),
      source: {
        title: String(sourceRaw.title || analysisRaw.sourceTitle || ''),
        text: String(sourceRaw.text || analysisRaw.sourceText || ''),
        images: Array.isArray(sourceRaw.images)
          ? sourceRaw.images.map((img) => String(img || '').trim()).filter(Boolean)
          : [],
        platform: typeof sourceRaw.platform === 'string' ? sourceRaw.platform : '',
        sourceId: typeof sourceRaw.sourceId === 'string' ? sourceRaw.sourceId : '',
        sourceUrl: typeof sourceRaw.sourceUrl === 'string' ? sourceRaw.sourceUrl : '',
      },
      analysisResult: {
        sourceTitle: String(analysisRaw.sourceTitle || ''),
        sourceText: String(analysisRaw.sourceText || ''),
        sourceImages: Array.isArray(analysisRaw.sourceImages)
          ? analysisRaw.sourceImages.map((img) => String(img || '').trim()).filter(Boolean)
          : [],
        extractedImageTexts,
        rewriteResult: rewriteRaw
          ? {
              title: String(rewriteRaw.title || ''),
              body: String(rewriteRaw.body || ''),
              imageTexts: Array.isArray(rewriteRaw.imageTexts)
                ? rewriteRaw.imageTexts.map((text) => String(text || '').trim()).filter(Boolean)
                : [],
            }
          : null,
      },
      generatedCopy: typeof task.generatedCopy === 'string' ? task.generatedCopy : null,
      errorMessage: typeof task.errorMessage === 'string' ? task.errorMessage : null,
    };
  },

  async triggerImageTextMyNoteBreakdown(taskId: string): Promise<{ taskId: string; status: string }> {
    return request<{ taskId: string; status: string }>(`/api/image-text-replication/${encodeURIComponent(taskId)}/breakdown`, {
      method: 'POST',
      data: {},
    });
  },

  async triggerImageTextMyNoteRewrite(taskId: string): Promise<{ taskId: string; status: string; workTaskId: string }> {
    return request<{ taskId: string; status: string; workTaskId: string }>(`/api/image-text-replication/${encodeURIComponent(taskId)}/rewrite`, {
      method: 'POST',
      data: {},
    });
  },

  async createStoryboardJob(input: CreateStoryboardJobInput): Promise<CreateStoryboardJobResult> {
    const payload = await request<{ success?: boolean; data?: any }>('/api/storyboard/jobs', {
      method: 'POST',
      data: {
        pipeline_key: input.pipelineKey,
        title: input.title || '',
        script: input.script || '',
        creativeTaskId: input.creativeTaskId || '',
        product_id: input.productId || '',
        metadata: input.metadata || {},
        source: input.source || 'miniapp',
      },
    });

    const data = payload?.data || {};
    return {
      taskId: String(data.taskId || ''),
      status: String(data.status || 'ANALYZING'),
      pipelineKey: (String(data.pipelineKey || input.pipelineKey) as StoryboardPipelineKey),
      workflowId: String(data.workflowId || ''),
    };
  },

  async getProducts(): Promise<ProductSummary[]> {
    const payload = await request<{ success?: boolean; data?: Array<{ id?: string; name?: string; images?: string }> }>('/api/products');
    const list = Array.isArray(payload?.data) ? payload.data : [];
    return list
      .map((item) => {
        const id = String(item?.id || '').trim();
        const name = String(item?.name || '').trim();
        const rawImages = String(item?.images || '').trim();
        if (!id || !name) return null;

        let images: string[] = [];
        if (rawImages) {
          try {
            const parsed = JSON.parse(rawImages);
            if (Array.isArray(parsed)) {
              images = parsed.map((img) => String(img || '').trim()).filter(Boolean);
            } else if (typeof parsed === 'string' && parsed.trim()) {
              images = [parsed.trim()];
            }
          } catch {
            images = rawImages.split(',').map((img) => img.trim()).filter(Boolean);
          }
        }

        return { id, name, images };
      })
      .filter((item): item is ProductSummary => Boolean(item));
  },

  async createProduct(input: {
    name: string;
    description?: string;
    images?: string[];
    sellingPoints?: string[];
    sellingPointsText?: string;
  }): Promise<ProductSummary> {
    const payload = await request<{
      success?: boolean;
      data?: { id?: string; name?: string; images?: string };
    }>('/api/products', {
      method: 'POST',
      data: {
        name: input.name,
        description: input.description ?? '',
        images: input.images ?? [],
        sellingPoints: input.sellingPoints ?? [],
        sellingPointsText: input.sellingPointsText ?? '',
      },
    });

    const data = payload?.data;
    const id = String(data?.id || '').trim();
    const name = String(data?.name || '').trim();
    const rawImages = String(data?.images || '').trim();
    if (!id || !name) {
      throw new Error('产品创建失败');
    }

    let images: string[] = [];
    if (rawImages) {
      try {
        const parsed = JSON.parse(rawImages);
        if (Array.isArray(parsed)) {
          images = parsed.map((img) => String(img || '').trim()).filter(Boolean);
        } else if (typeof parsed === 'string' && parsed.trim()) {
          images = [parsed.trim()];
        }
      } catch {
        images = rawImages.split(',').map((img) => img.trim()).filter(Boolean);
      }
    }

    return { id, name, images };
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
          taskType: typeof item.taskType === 'string' ? item.taskType : '',
          createdAt: String(item.createdAt ?? new Date().toISOString()),
          preview: (item.preview as string | null) ?? null,
          thumbnailUrl:
            (item.thumbnailUrl as string | null) ??
            (item.thumbnail_url as string | null) ??
            null,
          metadata:
            item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
              ? (item.metadata as Record<string, unknown>)
              : null,
          source: 'task',
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
          taskType: 'digitalHuman',
          createdAt: String(item.createdAt ?? new Date().toISOString()),
          preview: (item.resultUrl as string | null) ?? null,
          thumbnailUrl: (item.coverUrl as string | null) ?? null,
          metadata: null,
          source: 'digitalHuman',
        });
      }
    }

    works.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return works.slice(0, limit);
  },

  async getStoryboardStatus(taskId: string): Promise<StoryboardTaskStatusResult> {
    const payload = await request<{ data?: any }>(`/api/storyboard/${encodeURIComponent(taskId)}/status`);
    const data = payload?.data || {};
    const rawSegments = Array.isArray(data.segments) ? data.segments : [];

    return {
      id: String(data.id || taskId),
      status: String(data.status || 'PENDING'),
      progress: typeof data.progress === 'number' ? data.progress : 0,
      imageModel: typeof data.imageModel === 'string' ? data.imageModel : null,
      videoModel: typeof data.videoModel === 'string' ? data.videoModel : null,
      finalVideoUrl: typeof data.finalVideoUrl === 'string' ? data.finalVideoUrl : null,
      segments: rawSegments.map((segment: any) => ({
        id: String(segment.id || ''),
        order: typeof segment.order === 'number' ? segment.order : 0,
        duration: typeof segment.duration === 'number' ? segment.duration : 0,
        timeRange: typeof segment.timeRange === 'string' ? segment.timeRange : null,
        imagePrompt: typeof segment.imagePrompt === 'string' ? segment.imagePrompt : null,
        videoPrompt: typeof segment.videoPrompt === 'string' ? segment.videoPrompt : null,
        generatedImage: typeof segment.generatedImage === 'string' ? segment.generatedImage : null,
        generatedVideo: typeof segment.generatedVideo === 'string' ? segment.generatedVideo : null,
        status: String(segment.status || 'PENDING'),
        originalScript: typeof segment.originalScript === 'string' ? segment.originalScript : null,
      })),
    };
  },

  async updateStoryboardSegment(
    segmentId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await request(`/api/storyboard/segments/${encodeURIComponent(segmentId)}`, {
      method: 'PATCH',
      data,
    });
  },

  async generateStoryboardImages(params: {
    taskId: string;
    segmentIds: string[];
    model: string;
    aspectRatio?: string;
  }): Promise<StoryboardGenerateResult> {
    return request<StoryboardGenerateResult>(`/api/storyboard/${encodeURIComponent(params.taskId)}/generate-images`, {
      method: 'POST',
      data: {
        segmentIds: params.segmentIds,
        model: params.model,
        aspectRatio: params.aspectRatio || '16:9',
      },
    });
  },

  async generateStoryboardVideos(params: {
    taskId: string;
    segmentIds: string[];
    model: string;
    allowTextVideo?: boolean;
  }): Promise<StoryboardGenerateResult> {
    return request<StoryboardGenerateResult>(`/api/storyboard/${encodeURIComponent(params.taskId)}/generate-videos`, {
      method: 'POST',
      data: {
        segmentIds: params.segmentIds,
        model: params.model,
        allowTextVideo: Boolean(params.allowTextVideo),
      },
    });
  },

  async mergeStoryboard(taskId: string): Promise<void> {
    await request(`/api/storyboard/${encodeURIComponent(taskId)}/merge`, {
      method: 'POST',
      data: {},
    });
  },

  async getAssetOverview(): Promise<AssetOverview> {
    const [charactersRes, productsRes, stylesRes, knowledgeRes] = await Promise.allSettled([
      request<unknown>('/api/characters'),
      request<unknown>('/api/products'),
      request<unknown>('/api/assets/styles'),
      request<unknown>('/api/knowledge/folders?limit=100'),
    ]);

    const characters = charactersRes.status === 'fulfilled'
      ? pickList(charactersRes.value).length
      : 0;
    const products = productsRes.status === 'fulfilled'
      ? pickList(productsRes.value).length
      : 0;
    const styles = stylesRes.status === 'fulfilled'
      ? pickList(stylesRes.value).length
      : 0;
    const templates = knowledgeRes.status === 'fulfilled'
      ? sumKnowledgeFiles(knowledgeRes.value)
      : 0;

    return {
      characters,
      products,
      styles,
      templates,
    };
  },

  async deleteWorkItem(item: WorkItem): Promise<void> {
    if (item.source === 'digitalHuman') {
      await request(`/api/digital-human/videos/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      return;
    }
    await request(`/api/tasks/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
  },

  async normalizeXhsMarkdown(markdown: string): Promise<XhsNormalizedMarkdown> {
    const payload = await request<{ data?: Partial<XhsNormalizedMarkdown> }>('/api/xhs-layout/normalize', {
      method: 'POST',
      data: { markdown },
    });
    const data = payload?.data || {};
    const normalized = typeof data.standardizedMarkdown === 'string'
      ? data.standardizedMarkdown
      : (typeof data.markdown === 'string' ? data.markdown : markdown);
    return {
      markdown: typeof data.markdown === 'string' ? data.markdown : normalized,
      standardizedMarkdown: normalized,
      needsRewrite: Boolean(data.needsRewrite),
    };
  },

  async generateXhsMeta(markdown: string, filePath = 'miniapp-card.md'): Promise<XhsMetaResult> {
    const payload = await request<{ data?: Partial<XhsMetaResult> }>('/api/xhs-layout/meta', {
      method: 'POST',
      data: { markdown, filePath },
    });
    const data = payload?.data || {};
    return {
      title: typeof data.title === 'string' ? data.title : '',
      body: typeof data.body === 'string' ? data.body : '',
      tags: Array.isArray(data.tags) ? data.tags.map((item) => String(item)).filter(Boolean) : [],
    };
  },

  async listStylePresets(type = 'xhs-visual'): Promise<StylePresetSummary[]> {
    const query = new URLSearchParams();
    query.set('summary', '1');
    query.set('includeShared', '1');
    query.set('limit', '50');
    query.set('type', type);

    const payload = await request<{ data?: Array<Record<string, unknown>> }>(`/api/assets/styles?${query.toString()}`);
    const list = Array.isArray(payload?.data) ? payload.data : [];
    return list.map((item) => ({
      id: String(item.id || ''),
      name: String(item.name || '未命名模板'),
      type: String(item.type || type),
      previewUrl: typeof item.previewUrl === 'string' ? item.previewUrl : null,
      status: typeof item.status === 'string' ? item.status : null,
    })).filter((item) => item.id);
  },

  async createStylePreset(input: {
    name: string;
    type?: string;
    description?: string;
    previewUrl?: string;
    spec?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<StylePresetSummary> {
    const payload = await request<{ data?: Record<string, unknown> }>('/api/assets/styles', {
      method: 'POST',
      data: {
        name: input.name,
        type: input.type ?? 'xhs-visual',
        description: input.description ?? '',
        previewUrl: input.previewUrl ?? '',
        spec: input.spec ?? {},
        metadata: input.metadata ?? { source: 'miniapp-manual' },
      },
    });
    const data = payload?.data || {};
    const id = String(data.id || '').trim();
    if (!id) throw new Error('风格创建失败');
    return {
      id,
      name: String(data.name || input.name),
      type: String(data.type || input.type || 'xhs-visual'),
      previewUrl: typeof data.previewUrl === 'string' ? data.previewUrl : (input.previewUrl ?? null),
      status: typeof data.status === 'string' ? data.status : null,
    };
  },

  async startImageTextReplication(params: {
    sourceTitle: string;
    sourceText: string;
    sourceImages?: string[];
    sourcePlatform?: string;
    sourceId?: string;
    sourceUrl?: string;
  }): Promise<{ taskId: string; status: string }> {
    return request<{ taskId: string; status: string }>('/api/image-text-replication/start', {
      method: 'POST',
      data: {
        sourceTitle: params.sourceTitle,
        sourceText: params.sourceText,
        sourceImages: params.sourceImages ?? [],
        sourcePlatform: params.sourcePlatform ?? 'miniapp',
        sourceId: params.sourceId ?? '',
        sourceUrl: params.sourceUrl ?? '',
      },
    });
  },

  async triggerImageTextReplicationGenerate(taskId: string, params: {
    stylePresetId: string;
    topicHint?: string;
  }): Promise<{ taskId: string; status: string }> {
    return request<{ taskId: string; status: string }>(`/api/image-text-replication/${encodeURIComponent(taskId)}/generate`, {
      method: 'POST',
      data: {
        stylePresetId: params.stylePresetId,
        topicHint: params.topicHint ?? '',
      },
    });
  },

  async generateCanvasImages(params: {
    prompt: string;
    model: string;
    size?: '1024x1024' | '1536x1024' | '1024x1536';
    n?: number;
    image?: string[];
    images?: string[];
  }): Promise<CanvasImageGenerationResult> {
    const imageInput = Array.isArray(params.image)
      ? params.image
      : (Array.isArray(params.images) ? params.images : []);

    const payload = await request<unknown>('/api/canvas/images/generations', {
      method: 'POST',
      data: {
        prompt: params.prompt,
        model: params.model,
        size: params.size ?? '1024x1024',
        n: typeof params.n === 'number' ? params.n : 1,
        image: imageInput.slice(0, 5),
      },
    });
    return {
      images: extractCanvasImageUrls(payload),
      raw: payload,
    };
  },

  async publishXhsLayout(params: {
    title: string;
    content: string;
    images: string[];
    taskId?: string;
  }): Promise<XhsPublishResult> {
    const payload = await request<{ data?: Partial<XhsPublishResult> }>('/api/xhs-layout/publish', {
      method: 'POST',
      data: {
        type: 'normal',
        title: params.title,
        content: params.content,
        images: params.images,
        taskId: params.taskId || '',
      },
    });
    const data = payload?.data || {};
    return {
      id: typeof data.id === 'string' ? data.id : '',
      url: typeof data.url === 'string' ? data.url : '',
      qrcode: typeof data.qrcode === 'string' ? data.qrcode : '',
    };
  },

  async renderXhsLayout(params: {
    markdown: string;
    templateId?: string;
    styleKey?: string;
    title?: string;
    includeCover?: boolean;
    maxPages?: number;
  }): Promise<XhsLayoutRenderResult> {
    const payload = await request<{ data?: Partial<XhsLayoutRenderResult> }>('/api/xhs-layout/render', {
      method: 'POST',
      data: {
        markdown: params.markdown,
        templateId: params.templateId || '',
        styleKey: params.styleKey || '',
        title: params.title || '',
        includeCover: params.includeCover !== false,
        maxPages: params.maxPages ?? 8,
      },
    });
    const data = payload?.data || {};
    return {
      taskId: typeof data.taskId === 'string' ? data.taskId : '',
      title: typeof data.title === 'string' ? data.title : '',
      templateId: typeof data.templateId === 'string' ? data.templateId : '',
      images: Array.isArray(data.images) ? data.images.map((item) => String(item)).filter(Boolean) : [],
    };
  },

  async getMonetizationSquareConfig(key = 'default'): Promise<MonetizationSquareConfigPayload> {
    const query = new URLSearchParams();
    query.set('key', key);
    const payload = await request<{ data?: { config?: MonetizationSquareConfigPayload } }>(
      `/api/miniapp/monetization-square?${query.toString()}`,
    );
    const config = payload?.data?.config;
    if (!config || !Array.isArray(config.categories)) {
      throw new Error('变现广场配置为空');
    }
    return config;
  },

  async getHotSquareConfig(key = 'miniapp-hot-square'): Promise<HotSquareConfigPayload> {
    const query = new URLSearchParams();
    query.set('key', key);
    const payload = await request<{ data?: { config?: HotSquareConfigPayload } }>(
      `/api/miniapp/hot-square/config?${query.toString()}`,
    );
    const config = payload?.data?.config;
    if (!config || !Array.isArray(config.categories)) {
      throw new Error('爆款分类配置为空');
    }
    return config;
  },
};
