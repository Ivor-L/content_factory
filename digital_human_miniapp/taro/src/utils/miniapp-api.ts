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
const ACCESS_TOKEN_STORAGE_KEY = 'MINIAPP_ACCESS_TOKEN';
const REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_CANVAS_IMAGE_REFERENCE_LIMIT = 8;

function normalizeStoryboardAspectRatio(value: unknown, fallback = '9:16'): '9:16' | '16:9' {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === '16:9' || raw === '16/9' || raw === 'landscape' || raw === 'horizontal' || raw === '横屏' || raw === '横版') {
    return '16:9';
  }
  if (raw === '9:16' || raw === '9/16' || raw === 'portrait' || raw === 'vertical' || raw === '竖屏' || raw === '竖版') {
    return '9:16';
  }
  return fallback === '16:9' ? '16:9' : '9:16';
}

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
  comments?: number | null;
  shares?: number | null;
  creatorName?: string | null;
  creatorAvatarUrl?: string | null;
  sourceUrl?: string | null;
  scriptText?: string | null;
  myTaskId?: string | null;
  referenceId?: string | null;
  isCollected?: boolean;
  source?: 'all' | 'mine';
  createdAt?: string | null;
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
    creatorName?: string | null;
    creatorAvatarUrl?: string | null;
    likes?: number | null;
    collects?: number | null;
    comments?: number | null;
    shares?: number | null;
    videoUrl?: string | null;
    sourceType?: string | null;
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
      tags?: string[];
      titleFormula?: {
        topic: string;
        industry: string;
        candidates: Array<{
          title: string;
          formulaId: number;
          triggerType: string;
          formulaTemplate: string;
          originalExample: string;
          reason: string;
        }>;
        top3: Array<{
          title: string;
          formulaId: number;
          triggerType: string;
          formulaTemplate: string;
          originalExample: string;
          reason: string;
        }>;
      } | null;
    } | null;
  };
  generatedImages?: string[];
  imageGuidance?: Array<{ index: number; description: string }>;
  generatedCopy?: string | null;
  errorMessage?: string | null;
}

export interface WorkItem {
  id: string;
  title: string;
  type: 'video' | 'image-text' | 'copy' | 'remix' | 'task';
  status: TaskStatus;
  taskType?: string;
  taskId?: string;
  createdAt: string;
  preview?: string | null;
  thumbnailUrl?: string | null;
  progress?: number | null;
  metadata?: Record<string, unknown> | null;
  generatedImages?: string[];
  images?: string[];
  imageUrls?: string[];
  source: 'task' | 'digitalHuman';
}

export interface WritingStyleOption {
  id: string;
  name: string;
  description?: string | null;
  channel?: string | null;
  currentProfileId?: string | null;
  updatedAt?: string | null;
}

export interface WritingStyleProfile {
  id: string;
  status?: string | null;
  profileJson?: Record<string, unknown> | null;
}

export interface SmartCopyTaskDetail {
  id: string;
  title: string;
  ideaText: string;
  status: string;
  stage: string;
  generatedTitle: string;
  generatedText: string;
  tags: string[];
  errorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreativeTaskDetail {
  id: string;
  title: string;
  status: string;
  stage?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata: Record<string, unknown>;
  generatedImages: string[];
}

export interface CreateSmartCopyTaskInput {
  ideaText: string;
  title?: string;
  channel?: string;
  targetOutput?: string;
  wordCount?: number;
  language?: string;
  styleRules?: Record<string, unknown> | null;
}

export type StoryboardPipelineKey = 'script_to_storyboard' | 'viral_clone' | 'skeleton_video';

export interface CreateStoryboardJobInput {
  pipelineKey: StoryboardPipelineKey;
  title?: string;
  script?: string;
  creativeTaskId?: string;
  productId?: string;
  characterId?: string;
  metadata?: Record<string, unknown>;
  source?: string;
}

export interface CreateStoryboardJobResult {
  taskId: string;
  status: string;
  pipelineKey: StoryboardPipelineKey;
  workflowId: string;
  workflowTriggered?: boolean;
}

export type CreateViralCloneStoryboardJobInput = Omit<CreateStoryboardJobInput, 'pipelineKey' | 'characterId'>;
export type CreateSkeletonStoryboardJobInput = Omit<CreateStoryboardJobInput, 'pipelineKey'>;

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
  rewrittenScript?: string | null;
  generationParams?: Record<string, unknown> | null;
}

export interface StoryboardReferenceItem {
  id: string;
  type: 'product' | 'character';
  name: string;
  imageUrl: string | null;
}

export interface StoryboardTaskStatusResult {
  id: string;
  status: string;
  progress: number;
  imageModel?: string | null;
  videoModel?: string | null;
  finalVideoUrl: string | null;
  storyboardImageUrl?: string | null;
  coverImage?: string | null;
  detailedBreakdown?: Record<string, unknown> | null;
  references: StoryboardReferenceItem[];
  segments: StoryboardSegmentItem[];
}

export interface StoryboardGenerateResult {
  success: boolean;
  quoteOnly?: boolean;
  partial?: boolean;
  task_id: string;
  total: number;
  triggered: number;
  failed: number;
  model?: string;
  message?: string;
  creditEstimate?: {
    unitAmount: number;
    units: number;
    amount: number;
    billingMode: 'duration_seconds' | 'segments';
  };
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
  description?: string;
  sellingPoints?: string;
  sellingPointsText?: string | null;
  analysisResult?: string | null;
  status?: string;
  progress?: number;
  createdAt?: string;
  updatedAt?: string;
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
  thumbnailUrl?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  spec?: Record<string, unknown> | null;
}

export interface CanvasImageGenerationResult {
  images: string[];
  raw: unknown;
}

export interface CanvasImageJobResult {
  taskId: string;
  status: string;
  message: string;
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
  sourceId?: string;
  sourceUrl?: string;
  referenceId?: string;
  status: string;
  title: string;
  videoUrl?: string | null;
  message?: string;
}

export interface VideoCopyExtractResult {
  status: string;
  text?: string | null;
  transcript?: string | null;
  videoUrl?: string | null;
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

function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.join('&');
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

function isImageUrl(url: string): boolean {
  return !isVideoUrl(url);
}

function pickImageUrl(...values: unknown[]): string | null {
  for (const value of values) {
    const url = sanitizeUrl(value);
    if (url && isImageUrl(url)) return url;
  }
  return null;
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

function collectObjects(raw: unknown): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const queue: unknown[] = [raw];
  const seen: unknown[] = [];

  while (queue.length > 0 && result.length < 160) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (seen.includes(current)) continue;
    seen.push(current);

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

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
    if (typeof value === 'string') {
      const normalized = value.replace(/,/g, '').replace(/\+/g, '').trim();
      if (!normalized) continue;
      const match = normalized.match(/([\d.]+)/);
      if (!match) continue;
      let multiplier = 1;
      if (/[万w]/i.test(normalized)) multiplier = 10000;
      else if (/[千k]/i.test(normalized)) multiplier = 1000;
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) return Math.round(parsed * multiplier);
    }
  }
  return null;
}

function pickStringByKeys(objects: Record<string, unknown>[], keys: string[]): string | null {
  for (const obj of objects) {
    for (const key of keys) {
      const value = pickString(obj[key]);
      if (value) return value;
    }
  }
  return null;
}

function pickNumberByKeys(objects: Record<string, unknown>[], keys: string[]): number | null {
  for (const obj of objects) {
    for (const key of keys) {
      const value = pickNumber(obj[key]);
      if (value != null) return value;
    }
  }
  return null;
}

function pickStringByPath(raw: Record<string, unknown> | null | undefined, path: string): string | null {
  if (!raw) return null;
  const value = path.split('.').reduce<unknown>((current, key) => {
    const obj = parseObject(current);
    return obj ? obj[key] : undefined;
  }, raw);
  return pickString(value);
}

function getHotStats(item: any, rawPayload?: Record<string, unknown> | null) {
  const stats = parseObject(item?.stats) || {};
  const rawStats = parseObject(rawPayload?.stats) || {};
  const objects = collectObjects(rawPayload);
  return {
    likes: pickNumber(stats.likes, stats.likeCount, stats.like_count, stats.likedCount, stats.liked_count, rawStats.likes, rawStats.likeCount, rawStats.like_count, rawStats.liked_count, rawPayload?.likes, rawPayload?.likeCount, rawPayload?.like_count, rawPayload?.liked_count, rawPayload?.点赞数, rawPayload?.点赞) ?? pickNumberByKeys(objects, ['点赞数', '点赞', '赞数', 'liked_count', 'like_count', 'likeCount', 'likedCount', 'likes']),
    collects: pickNumber(stats.collects, stats.collectCount, stats.collect_count, stats.collectedCount, stats.collected_count, rawStats.collects, rawStats.collectCount, rawStats.collect_count, rawStats.collected_count, rawPayload?.collects, rawPayload?.collectCount, rawPayload?.collect_count, rawPayload?.collected_count, rawPayload?.收藏数, rawPayload?.收藏) ?? pickNumberByKeys(objects, ['收藏数', '收藏', 'collected_count', 'collect_count', 'collectCount', 'collectedCount', 'collects']),
    comments: pickNumber(stats.comments, stats.commentCount, stats.comment_count, rawStats.comments, rawStats.commentCount, rawStats.comment_count, rawPayload?.comments, rawPayload?.commentCount, rawPayload?.comment_count, rawPayload?.评论数, rawPayload?.评论) ?? pickNumberByKeys(objects, ['评论数', '评论', 'comment_count', 'commentCount', 'comments']),
    shares: pickNumber(stats.shares, stats.shareCount, stats.share_count, rawStats.shares, rawStats.shareCount, rawStats.share_count, rawPayload?.shares, rawPayload?.shareCount, rawPayload?.share_count, rawPayload?.分享数, rawPayload?.分享) ?? pickNumberByKeys(objects, ['分享数', '分享', 'share_count', 'shareCount', 'shares']),
  };
}

function getHotVideoMeta(item: any, rawPayload?: Record<string, unknown> | null) {
  const objects = collectObjects(rawPayload);
  const videoUrl = pickString(
    item?.videoUrl,
    item?.video_url,
    pickStringByPath(rawPayload, 'media.videoUrl'),
    rawPayload?.videoUrl,
    rawPayload?.video_url,
    rawPayload?.视频地址,
    rawPayload?.视频链接,
  ) || pickStringByKeys(objects, ['videoUrl', 'video_url', 'playUrl', 'play_url', 'masterUrl', 'master_url', '视频地址', '视频链接', '播放地址']);
  const sourceType = pickString(
    item?.sourceType,
    item?.source_type,
    pickStringByPath(rawPayload, 'media.sourceType'),
    rawPayload?.sourceType,
    rawPayload?.source_type,
  );
  return {
    videoUrl,
    sourceType: sourceType || (videoUrl ? 'video' : null),
  };
}

function getHotCreator(item: any, rawPayload?: Record<string, unknown> | null) {
  const creator = parseObject(item?.creator) || {};
  const author = parseObject(item?.author) || parseObject(rawPayload?.author) || {};
  const objects = collectObjects(rawPayload);
  const authorNameKeys = ['作者昵称', '作者名称', '用户昵称', '用户名称', '博主昵称', '博主', '作者', 'nickname', 'nickName', 'nick_name', 'authorName', 'author_name', 'userName', 'username', 'name'];
  const avatarKeys = ['作者头像', '用户头像', '博主头像', '头像', 'avatar', 'avatarUrl', 'avatar_url', 'authorAvatar', 'author_avatar', 'userAvatar', 'user_avatar', 'image'];
  return {
    name: pickString(
      creator.displayName,
      creator.name,
      item?.creatorName,
      author.name,
      author.nickname,
      author.nickName,
      author.username,
      rawPayload?.authorName,
      rawPayload?.author_name,
      rawPayload?.作者昵称,
      rawPayload?.作者名称,
      rawPayload?.用户昵称,
      rawPayload?.用户名称,
      rawPayload?.博主昵称,
      rawPayload?.博主,
      rawPayload?.作者,
    ) || pickStringByKeys(objects, authorNameKeys),
    avatarUrl: pickString(
      creator.avatarUrl,
      creator.avatar,
      item?.creatorAvatarUrl,
      author.avatarUrl,
      author.avatar_url,
      author.avatar,
      rawPayload?.authorAvatar,
      rawPayload?.author_avatar,
      rawPayload?.作者头像,
      rawPayload?.用户头像,
      rawPayload?.博主头像,
      rawPayload?.头像,
    ) || pickStringByKeys(objects, avatarKeys),
  };
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
      obj.publicUrl,
      obj.public_url,
      obj.originalUrl,
      obj.original_url,
      obj.fileUrl,
      obj.file_url,
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
    const apiKey = String(Taro.getStorageSync('API_KEY') || '').trim();
    return apiKey || null;
  } catch {
    return null;
  }
}

function setApiKey(apiKey: string | null) {
  try {
    const normalized = String(apiKey || '').trim();
    if (normalized) {
      Taro.setStorageSync('API_KEY', normalized);
    }
  } catch {
    // ignore storage failures
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    const text = payload.trim();
    if (!text) return fallback;
    if (/^<!doctype\s+html/i.test(text) || /^<html[\s>]/i.test(text)) {
      return fallback;
    }
    try {
      return extractErrorMessage(JSON.parse(text), fallback);
    } catch {
      return text.slice(0, 120);
    }
  }
  if (!payload || typeof payload !== 'object') return fallback;

  const data = payload as Record<string, unknown>;
  const message = data.message;
  if (typeof message === 'string' && message.trim()) return message.trim();

  const error = data.error;
  if (typeof error === 'string' && error.trim()) {
    const text = error.trim();
    if (!/^failed to create storyboard job$/i.test(text)) return text;
  }
  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, unknown>;
    const message = errorObj.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
    const code = errorObj.code;
    if (typeof code === 'string' && code.trim()) return code.trim();
  }
  return fallback;
}

function getAccessToken(): string | null {
  try {
    const token = String(Taro.getStorageSync(ACCESS_TOKEN_STORAGE_KEY) || '').trim();
    return token || null;
  } catch {
    return null;
  }
}

async function request<T = unknown>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    data?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const apiKey = getApiKey();
  const accessToken = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-User-Api-Key'] = apiKey;
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await Taro.request({
    url: resolveUrl(path),
    method: options.method ?? (options.data ? 'POST' : 'GET'),
    data: options.data,
    header: headers,
    timeout: REQUEST_TIMEOUT_MS,
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    const message = extractErrorMessage(res.data, `HTTP ${res.statusCode}`);
    throw new Error(message);
  }

  return res.data as T;
}

async function requestFirstAvailable<T = unknown>(
  paths: string[],
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    data?: Record<string, unknown>;
  } = {},
): Promise<T> {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return await request<T>(path, options);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : '';
      if (!/^HTTP 404$|^HTTP 405$|^HTTP 500$/i.test(message)) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('请求失败');
}

async function uploadFile(filePath: string, name: string, mimeType: string): Promise<string> {
  const apiKey = getApiKey();
  const accessToken = getAccessToken();
  const headers: Record<string, string> = {};

  if (apiKey) {
    headers['X-User-Api-Key'] = apiKey;
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await Taro.uploadFile({
    url: resolveUrl('/api/upload'),
    filePath,
    name: 'file',
    header: headers,
    formData: { filename: name, contentType: mimeType },
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    let payload: unknown = null;
    try {
      payload = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    } catch {
      payload = res.data;
    }
    throw new Error(extractErrorMessage(payload, '上传失败'));
  }

  const payload = typeof res.data === 'string'
    ? (JSON.parse(res.data) as Record<string, unknown>)
    : (res.data as Record<string, unknown>);
  const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
  if (!url) throw new Error('上传结果缺少图片地址');
  return url;
}

function isHttpStatusError(error: unknown, statusCode: number): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === `HTTP ${statusCode}` || error.message.includes(String(statusCode));
}

function detectWorkType(item: any): WorkItem['type'] {
  const taskType = String(item?.taskType ?? '').toLowerCase();
  const metadata = item?.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
    ? item.metadata as Record<string, unknown>
    : null;
  if (taskType === 'storyboard' && metadata?.feature === 'viral_remix') return 'remix';
  if (taskType === 'storyboard') return 'video';
  if (taskType.includes('video') || taskType.includes('digital') || taskType === 't2v') return 'video';
  if (taskType.includes('poster') || taskType.includes('image')) return 'image-text';
  if (taskType === 'creative' || taskType.includes('script') || taskType.includes('copy') || taskType.includes('writing')) return 'copy';
  return 'task';
}

function isViralRemixTask(item: any): boolean {
  const taskType = String(item?.taskType ?? '').toLowerCase();
  const metadata = item?.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
    ? item.metadata as Record<string, unknown>
    : null;
  return taskType === 'storyboard' && metadata?.feature === 'viral_remix';
}

function normalizeStatus(value: unknown): TaskStatus {
  const status = String(value ?? '').toUpperCase();
  if (status.includes('COMPLETE') || status === 'DONE' || status === 'SUCCESS') return 'COMPLETED';
  if (status.includes('GENERAT') || status.includes('PROCESS')) return 'GENERATING';
  if (status.includes('FAIL') || status.includes('ERROR')) return 'FAILED';
  if (status === 'ACTIVE') return 'GENERATING';
  if (status === 'CREATED' || status === 'CREATE' || status === 'INIT' || status === 'INITIALIZED') return 'PENDING';
  if (status.includes('PEND') || status.includes('QUEUE') || status.includes('WAIT')) return 'PENDING';
  return status || 'PENDING';
}

function getCreatedAtTime(value: { createdAt?: string | null }): number {
  const time = new Date(value.createdAt || '').getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortByCreatedAtDesc<T extends { createdAt?: string | null }>(items: T[]): T[] {
  return items.slice().sort((a, b) => getCreatedAtTime(b) - getCreatedAtTime(a));
}

function collectStringUrls(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return collectStringUrls(JSON.parse(trimmed), depth + 1);
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringUrls(item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectStringUrls(item, depth + 1));
  }
  return [];
}

function resolveStoryboardCover(raw: Record<string, unknown>, metadata: Record<string, unknown> | null): string | null {
  const candidates = [
    metadata?.referencePoster,
    metadata?.reference_video_poster,
    raw.thumbnailUrl,
    raw.thumbnail_url,
    raw.storyboardImageUrl,
    raw.storyboard_image_url,
    raw.coverImage,
    raw.cover_image,
    metadata?.storyboardImageUrl,
    metadata?.storyboard_image_url,
    metadata?.gridImageUrl,
    metadata?.coverImage,
    metadata?.storyboardImages,
    metadata?.referenceVideoUrl,
    metadata?.reference_video_url,
    metadata?.videoUrl,
  ];
  for (const candidate of candidates) {
    const first = collectStringUrls(candidate).find((url) => /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url) || /^https?:\/\//i.test(url));
    if (first) return first;
  }
  return null;
}

function dedupeWorks(items: WorkItem[]): WorkItem[] {
  const byKey = new Map<string, WorkItem>();
  for (const item of sortByCreatedAtDesc(items)) {
    const taskType = String(item.taskType || '').toLowerCase();
    const taskId = String(item.taskId || item.id || '').trim();
    const key =
      taskType === 'digitalhuman' || item.source === 'digitalHuman'
        ? `digitalHuman:${taskId}`
        : `${item.source}:${item.id}`;
    const existing = byKey.get(key);
    if (!existing || (item.source === 'digitalHuman' && existing.source !== 'digitalHuman')) {
      byKey.set(key, item);
    }
  }
  return sortByCreatedAtDesc(Array.from(byKey.values()));
}

function resolveWorkPreview(item: Record<string, unknown>, metadata: Record<string, unknown> | null): string | null {
  const direct = typeof item.preview === 'string' ? item.preview.trim() : '';
  const generated = extractGeneratedCopyText({ ...item, metadata });
  return generated || direct || null;
}

function extractGeneratedCopyText(item: Record<string, unknown> | null | undefined): string {
  if (!item) return '';
  const metadata = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
    ? item.metadata as Record<string, unknown>
    : {};
  const stages = metadata.stages && typeof metadata.stages === 'object' && !Array.isArray(metadata.stages)
    ? metadata.stages as Record<string, unknown>
    : {};
  const draft = stages.draft && typeof stages.draft === 'object' && !Array.isArray(stages.draft)
    ? stages.draft as Record<string, unknown>
    : {};
  const aiOutput = draft.aiOutput && typeof draft.aiOutput === 'object' && !Array.isArray(draft.aiOutput)
    ? draft.aiOutput as Record<string, unknown>
    : {};
  return pickString(
    item.generatedText,
    item.copyText,
    item.content,
    metadata.generatedText,
    metadata.generated_text,
    metadata.copyText,
    metadata.copy_text,
    metadata.content,
    draft.rawText,
    aiOutput['正文'],
    aiOutput.body,
    aiOutput.script_content,
    aiOutput.scriptContent,
  ) || '';
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeCreativeTaskDetail(raw: Record<string, unknown> | null | undefined): CreativeTaskDetail {
  const metadata = raw?.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
    ? raw.metadata as Record<string, unknown>
    : {};
  const generatedImages = uniqueUrls(collectUrlsFromUnknown(raw?.generatedImages)).filter((url) => !isVideoUrl(url));

  return {
    id: String(raw?.id || ''),
    title: String(raw?.title || '未命名任务'),
    status: String(raw?.status || 'PENDING'),
    stage: typeof raw?.stage === 'string' ? raw.stage : undefined,
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : undefined,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : undefined,
    metadata,
    generatedImages,
  };
}

function normalizeSmartCopyTaskDetail(raw: Record<string, unknown> | null | undefined): SmartCopyTaskDetail {
  const metadata = raw?.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
    ? raw.metadata as Record<string, unknown>
    : {};
  const stages = metadata.stages && typeof metadata.stages === 'object' && !Array.isArray(metadata.stages)
    ? metadata.stages as Record<string, unknown>
    : {};
  const draft = stages.draft && typeof stages.draft === 'object' && !Array.isArray(stages.draft)
    ? stages.draft as Record<string, unknown>
    : {};
  const aiOutput = draft.aiOutput && typeof draft.aiOutput === 'object' && !Array.isArray(draft.aiOutput)
    ? draft.aiOutput as Record<string, unknown>
    : {};
  const generatedTitle = pickString(aiOutput['标题'], aiOutput.title, raw?.title) || '';
  const generatedText = pickString(draft.rawText, aiOutput['正文'], aiOutput.body, aiOutput.script_content, aiOutput.scriptContent) || '';
  const error = aiOutput.error || draft.validatorState;

  return {
    id: String(raw?.id || ''),
    title: String(raw?.title || generatedTitle || '智能文案'),
    ideaText: String(raw?.ideaText || ''),
    status: String(raw?.status || 'PENDING'),
    stage: String(raw?.stage || ''),
    generatedTitle,
    generatedText,
    tags: normalizeStringList(aiOutput['标签'] || aiOutput.tags || aiOutput.hashtags),
    errorMessage: typeof error === 'string' ? error : null,
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : undefined,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : undefined,
  };
}

function parseProductImages(raw: unknown): string[] {
  const urls = collectUrlsFromUnknown(raw);
  return uniqueUrls(urls);
}

function toProductSummary(raw: {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  sellingPoints?: unknown;
  sellingPointsText?: unknown;
  analysisResult?: unknown;
  images?: unknown;
  status?: unknown;
  progress?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
} | null | undefined): ProductSummary | null {
  const id = String(raw?.id || '').trim();
  const name = String(raw?.name || '').trim();
  if (!id || !name) return null;

  const progress =
    typeof raw?.progress === 'number' && Number.isFinite(raw.progress)
      ? raw.progress
      : Number.isFinite(Number(raw?.progress))
        ? Number(raw?.progress)
        : undefined;

  return {
    id,
    name,
    description: typeof raw?.description === 'string' ? raw.description : '',
    sellingPoints: typeof raw?.sellingPoints === 'string' ? raw.sellingPoints : '',
    sellingPointsText: typeof raw?.sellingPointsText === 'string' ? raw.sellingPointsText : null,
    analysisResult: typeof raw?.analysisResult === 'string' ? raw.analysisResult : null,
    images: parseProductImages(raw?.images),
    status: typeof raw?.status === 'string' ? raw.status : 'PENDING',
    progress,
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : undefined,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : undefined,
  };
}

export const miniappApi = {
  async uploadMedia(filePath: string, name: string, mimeType: string): Promise<string> {
    return uploadFile(filePath, name, mimeType);
  },

  async getProfile(): Promise<MiniappProfile> {
    const userInfoStr = Taro.getStorageSync('USER_INFO');
    let userInfo = userInfoStr ? JSON.parse(userInfoStr as string) : null;
    let apiKey = getApiKey();
    let memberLevel: string | null = null;

    try {
      const profileMeta = await request<{
        data?: {
          id?: string;
          username?: string | null;
          avatarUrl?: string | null;
          memberLevel?: string | null;
          apiKey?: string | null;
        };
      }>('/api/user/profile');
      const serverProfile = profileMeta?.data;
      const serverApiKey = typeof serverProfile?.apiKey === 'string' ? serverProfile.apiKey.trim() : '';
      if (serverApiKey) {
        apiKey = serverApiKey;
        setApiKey(serverApiKey);
      }
      memberLevel = serverProfile?.memberLevel ?? null;

      if (serverProfile?.id) {
        const nextUserInfo = {
          ...(userInfo || {}),
          userId: serverProfile.id,
          username: serverProfile.username ?? userInfo?.username ?? null,
          avatarUrl: serverProfile.avatarUrl ?? userInfo?.avatarUrl ?? null,
          apiKey: apiKey ?? null,
        };
        userInfo = nextUserInfo;
        Taro.setStorageSync('USER_INFO', JSON.stringify(nextUserInfo));
      }
    } catch (error) {
      // Some online environments may not expose this endpoint yet.
      if (!isHttpStatusError(error, 401) && !isHttpStatusError(error, 404)) {
        memberLevel = null;
      }
    }

    let points: number | null = null;
    if (apiKey) {
      try {
        const credits = await request<{ ok?: boolean; balance?: number }>('/api/integration/credits');
        points = typeof credits?.balance === 'number' ? credits.balance : null;
      } catch {
        points = null;
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
      const query = buildQuery({
        limit: params?.limit ?? 40,
      });

      // Source A: My-note tasks (miniapp + web image-text replication storage).
      // Source B: Web-side viral references imported by this user (especially Xiaohongshu).
      const refsQuery = buildQuery({
        limit: params?.limit ?? 40,
        platform: 'xiaohongshu',
        q: params?.q?.trim() || undefined,
        sort: params?.sort,
        contentType: params?.contentType,
      });

      const [myNotesPayload, refsPayload] = await Promise.allSettled([
        request<{ data?: Array<Record<string, unknown>> }>(`/api/image-text-replication/my-notes?${query}`),
        request<{ data?: any[] }>(`/api/viral-references?${refsQuery}`),
      ]);

      if (myNotesPayload.status === 'rejected' && refsPayload.status === 'rejected') {
        throw myNotesPayload.reason;
      }

      const payload = myNotesPayload.status === 'fulfilled' ? myNotesPayload.value : null;
      const myNotes = Array.isArray(payload?.data) ? payload.data : [];
      const fromMyNotes = myNotes.map((item) => {
        const sourceImages = Array.isArray(item.sourceImages)
          ? item.sourceImages.map((img) => String(img || '').trim()).filter(Boolean)
          : [];
        const rawPayload = parseObject(item.rawPayload);
        const stats = getHotStats(item, rawPayload);
        const creator = getHotCreator(item, rawPayload);
        const videoMeta = getHotVideoMeta(item, rawPayload);
        const title = String(item.title || item.sourceTitle || '未命名笔记');
        const sourceText = String(item.sourceText || '');
        const sourceUrl = String(item.sourceUrl || '').trim();
        const sourceId = String(item.sourceId || item.id || '').trim();
        const sourcePlatform = String(item.sourcePlatform || 'miniapp-my').trim();
        return {
          id: String(item.id || ''),
          title,
          description: sourceText || null,
          category: '我的',
          coverUrl: sourceImages[0] || null,
          mediaUrls: sourceImages,
          sourceType: videoMeta.sourceType || 'image',
          videoUrl: videoMeta.videoUrl,
          sourceUrl,
          scriptText: sourceText,
          likes: stats.likes,
          collects: stats.collects,
          comments: stats.comments,
          shares: stats.shares,
          creatorName: creator.name || null,
          creatorAvatarUrl: creator.avatarUrl,
          myTaskId: String(item.id || ''),
          source: 'mine',
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : null,
        } as HotItem;
      }).filter((item) => item.id);

      let fromReferences: HotItem[] = [];
      if (refsPayload.status === 'fulfilled') {
        const refsList = Array.isArray(refsPayload.value?.data) ? refsPayload.value.data : [];
        fromReferences = refsList.map((item) => {
          const mediaUrls = normalizeHotMediaUrls(item);
          const coverUrl = sanitizeUrl(item.coverUrl) ?? mediaUrls?.[0] ?? null;
          const rawPayload = parseObject(item.rawPayload);
          const stats = getHotStats(item, rawPayload);
          const creator = getHotCreator(item, rawPayload);
          const videoMeta = getHotVideoMeta(item, rawPayload);
          const scriptText = typeof rawPayload?.scriptText === 'string'
            ? rawPayload.scriptText
            : ((item.scriptText as string | null) ?? (item.description as string | null) ?? null);
          return {
            id: `ref-${String(item.id || '')}`,
            title: String(item.title ?? '未命名笔记'),
            description: (item.description as string | null) ?? null,
            category: '我的',
            coverUrl,
            mediaUrls,
            videoUrl: videoMeta.videoUrl ?? ((item.videoUrl as string | null) ?? null),
            sourceType: videoMeta.sourceType ?? ((item.sourceType as string | null) ?? null),
            likes: stats.likes,
            collects: stats.collects,
            comments: stats.comments,
            shares: stats.shares,
            creatorName: creator.name,
            creatorAvatarUrl: creator.avatarUrl,
            sourceUrl: (item.sourceUrl as string | null) ?? null,
            scriptText,
            referenceId: String(item.id || ''),
            isCollected: true,
            source: 'mine',
            createdAt: typeof item.createdAt === 'string' ? item.createdAt : null,
          } as HotItem;
        }).filter((item) => item.id);
      }

      // Merge two sources by sourceUrl/title signature to reduce duplicates.
      const seen = new Set<string>();
      const merged = [...fromMyNotes, ...fromReferences].filter((item) => {
        const key = `${(item.sourceUrl || '').trim()}|${(item.title || '').trim()}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return params?.sort && params.sort !== 'recent' ? merged : sortByCreatedAtDesc(merged);
    }

    const query = buildQuery({
      limit: params?.limit ?? 20,
      sort: params?.sort,
      contentType: params?.contentType,
      category: params?.category && params.category !== '全行业' ? params.category : undefined,
      scope: 'shared',
      q: params?.q?.trim() || undefined,
    });

    const res = await request<{ data?: any[] }>(`/api/viral-references?${query}`);
    const list = Array.isArray(res?.data) ? res.data : [];

    return list.map((item) => {
      const mediaUrls = normalizeHotMediaUrls(item);
      const coverUrl = sanitizeUrl(item.coverUrl) ?? mediaUrls?.[0] ?? null;
      const rawPayload = parseObject(item.rawPayload);
      const stats = getHotStats(item, rawPayload);
      const creator = getHotCreator(item, rawPayload);
      const videoMeta = getHotVideoMeta(item, rawPayload);

      return {
        id: String(item.id),
        title: String(item.title ?? '未命名爆款'),
        description: (item.description as string | null) ?? null,
        category: (item.category as string | null) ?? null,
        coverUrl,
        mediaUrls,
        videoUrl: videoMeta.videoUrl ?? ((item.videoUrl as string | null) ?? null),
        sourceType: videoMeta.sourceType ?? ((item.sourceType as string | null) ?? null),
        benchmarkScore: typeof item.benchmarkScore === 'number' ? item.benchmarkScore : null,
        likes: stats.likes,
        collects: stats.collects,
        comments: stats.comments,
        shares: stats.shares,
        creatorName: creator.name,
        creatorAvatarUrl: creator.avatarUrl,
        sourceUrl: (item.sourceUrl as string | null) ?? null,
        scriptText: (item.scriptText as string | null) ?? null,
        source: 'all',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : null,
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
        rawPayload: {
          creatorName: item.creatorName || null,
          creatorAvatarUrl: item.creatorAvatarUrl || null,
          media: {
            videoUrl: item.videoUrl || null,
            sourceType: item.sourceType || (item.videoUrl ? 'video' : 'image'),
          },
          stats: {
            likes: item.likes ?? null,
            collects: item.collects ?? null,
            comments: item.comments ?? null,
            shares: item.shares ?? null,
          },
        },
      },
    });
  },

  async removeHotMyNote(params: { id?: string; sourceId?: string; sourceUrl?: string }): Promise<{ deleted: number }> {
    const payload = await request<{ deleted?: number }>('/api/image-text-replication/my-notes', {
      method: 'POST',
      data: {
        action: 'remove',
        id: params.id || undefined,
        sourceId: params.sourceId || undefined,
        sourceUrl: params.sourceUrl || undefined,
      },
    });
    return { deleted: Number(payload?.deleted || 0) };
  },

  async removeViralReference(id: string): Promise<{ deleted: number }> {
    const cleanId = String(id || '').replace(/^ref-/, '').trim();
    const payload = await request<{ deleted?: number }>('/api/viral-references', {
      method: 'POST',
      data: { action: 'remove', ids: cleanId ? [cleanId] : [] },
    });
    return { deleted: Number(payload?.deleted || 0) };
  },

  async collectHotXhsNote(url: string): Promise<MiniappCollectXhsResult> {
    const payload = await request<{
      taskId?: string;
      sourceId?: string;
      sourceUrl?: string;
      referenceId?: string;
      status?: string;
      title?: string;
      videoUrl?: string | null;
      message?: string;
    }>('/api/miniapp/hot-square/collect-xhs', {
      method: 'POST',
      data: { url },
    });

    return {
      taskId: String(payload?.taskId || ''),
      sourceId: typeof payload?.sourceId === 'string' ? payload.sourceId : undefined,
      sourceUrl: typeof payload?.sourceUrl === 'string' ? payload.sourceUrl : undefined,
      referenceId: typeof payload?.referenceId === 'string' ? payload.referenceId : undefined,
      status: String(payload?.status || 'BREAKDOWN_PENDING'),
      title: String(payload?.title || '未命名笔记'),
      videoUrl: typeof payload?.videoUrl === 'string' ? payload.videoUrl : null,
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
    const generatedImages = Array.isArray(task.generatedImages)
      ? task.generatedImages.map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          const url = obj.url;
          return typeof url === 'string' ? url.trim() : '';
        }
        return '';
      }).filter(Boolean)
      : [];
    const imageGuidanceRaw = Array.isArray(task.imageGuidance) ? task.imageGuidance : [];
    const imageGuidance = imageGuidanceRaw.map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const indexValue = Number(obj.index);
      const description = String(obj.description || '').trim();
      if (!description) return null;
      return {
        index: Number.isFinite(indexValue) && indexValue > 0 ? Math.floor(indexValue) : index + 1,
        description,
      };
    }).filter((item): item is { index: number; description: string } => Boolean(item));

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
    const formulaRaw = rewriteRaw?.titleFormula && typeof rewriteRaw.titleFormula === 'object'
      ? rewriteRaw.titleFormula as Record<string, unknown>
      : null;
    const normalizeFormulaCandidates = (value: unknown) => Array.isArray(value)
      ? value.map((item) => {
        if (!item || typeof item !== 'object') return null;
        const obj = item as Record<string, unknown>;
        const formulaId = Number(obj.formulaId);
        const title = String(obj.title || '').trim();
        if (!title || !Number.isFinite(formulaId)) return null;
        return {
          title,
          formulaId: Math.floor(formulaId),
          triggerType: String(obj.triggerType || ''),
          formulaTemplate: String(obj.formulaTemplate || ''),
          originalExample: String(obj.originalExample || ''),
          reason: String(obj.reason || ''),
        };
      }).filter((item): item is NonNullable<typeof item> => Boolean(item))
      : [];

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
        creatorName: typeof sourceRaw.creatorName === 'string' ? sourceRaw.creatorName : null,
        creatorAvatarUrl: typeof sourceRaw.creatorAvatarUrl === 'string' ? sourceRaw.creatorAvatarUrl : null,
        likes: typeof sourceRaw.likes === 'number' ? sourceRaw.likes : null,
        collects: typeof sourceRaw.collects === 'number' ? sourceRaw.collects : null,
        comments: typeof sourceRaw.comments === 'number' ? sourceRaw.comments : null,
        shares: typeof sourceRaw.shares === 'number' ? sourceRaw.shares : null,
        videoUrl: typeof sourceRaw.videoUrl === 'string' ? sourceRaw.videoUrl : null,
        sourceType: typeof sourceRaw.sourceType === 'string' ? sourceRaw.sourceType : null,
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
              tags: Array.isArray(rewriteRaw.tags)
                ? rewriteRaw.tags.map((text) => String(text || '').trim()).filter(Boolean)
                : [],
              titleFormula: formulaRaw
                ? {
                    topic: String(formulaRaw.topic || ''),
                    industry: String(formulaRaw.industry || ''),
                    candidates: normalizeFormulaCandidates(formulaRaw.candidates),
                    top3: normalizeFormulaCandidates(formulaRaw.top3),
                  }
                : null,
            }
          : null,
      },
      generatedCopy: typeof task.generatedCopy === 'string' ? task.generatedCopy : null,
      generatedImages,
      imageGuidance,
      errorMessage: typeof task.errorMessage === 'string' ? task.errorMessage : null,
    };
  },

  async triggerImageTextMyNoteBreakdown(taskId: string): Promise<{ taskId: string; status: string }> {
    return request<{ taskId: string; status: string }>(`/api/image-text-replication/${encodeURIComponent(taskId)}/breakdown`, {
      method: 'POST',
      data: {},
    });
  },

  async retryImageTextMyNoteBreakdown(taskId: string, imageIndex: number): Promise<{ taskId: string; status: string; imageText?: MyNoteImageTextItem }> {
    const payload = await request<{ taskId: string; status: string; imageText?: Partial<MyNoteImageTextItem> }>(`/api/image-text-replication/${encodeURIComponent(taskId)}/breakdown`, {
      method: 'POST',
      data: { imageIndex },
    });
    const rawImageText = payload?.imageText || null;
    const indexValue = Number(rawImageText?.index);
    return {
      taskId: String(payload?.taskId || taskId),
      status: String(payload?.status || 'BREAKDOWN_PENDING'),
      imageText: rawImageText
        ? {
            index: Number.isFinite(indexValue) && indexValue > 0 ? Math.floor(indexValue) : imageIndex,
            text: String(rawImageText.text || ''),
            success: Boolean(rawImageText.success),
            error: typeof rawImageText.error === 'string' ? rawImageText.error : null,
          }
        : undefined,
    };
  },

  async extractMyNoteVideoCopy(taskId: string): Promise<VideoCopyExtractResult> {
    const payload = await request<{ data?: VideoCopyExtractResult }>(`/api/image-text-replication/${encodeURIComponent(taskId)}/extract-video-copy`, {
      method: 'POST',
      data: {},
    });
    const data = payload?.data || (payload as unknown as VideoCopyExtractResult);
    return {
      status: String(data?.status || 'pending'),
      text: typeof data?.text === 'string' ? data.text : null,
      transcript: typeof data?.transcript === 'string' ? data.transcript : null,
      videoUrl: typeof data?.videoUrl === 'string' ? data.videoUrl : null,
    };
  },

  async triggerImageTextMyNoteRewrite(taskId: string): Promise<{ taskId: string; status: string }> {
    return request<{ taskId: string; status: string }>(`/api/image-text-replication/${encodeURIComponent(taskId)}/rewrite`, {
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
        character_id: input.characterId || '',
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
      workflowTriggered: data.workflowTriggered === true,
    };
  },

  async createViralCloneStoryboardJob(input: CreateViralCloneStoryboardJobInput): Promise<CreateStoryboardJobResult> {
    const payload = await requestFirstAvailable<{ success?: boolean; data?: any }>([
      '/api/miniapp/storyboard/viral-clone/jobs',
      '/api/storyboard/jobs',
    ], {
      method: 'POST',
      data: {
        pipeline_key: 'viral_clone',
        title: input.title || '',
        script: input.script || '',
        creativeTaskId: input.creativeTaskId || '',
        product_id: input.productId || '',
        metadata: input.metadata || {},
        source: input.source || 'miniapp_remix_generate_page',
      },
    });

    const data = payload?.data || {};
    return {
      taskId: String(data.taskId || ''),
      status: String(data.status || 'ANALYZING'),
      pipelineKey: 'viral_clone',
      workflowId: String(data.workflowId || ''),
      workflowTriggered: data.workflowTriggered === true,
    };
  },

  async createSkeletonStoryboardJob(input: CreateSkeletonStoryboardJobInput): Promise<CreateStoryboardJobResult> {
    const payload = await requestFirstAvailable<{ success?: boolean; data?: any }>([
      '/api/miniapp/storyboard/skeleton/jobs',
      '/api/storyboard/jobs',
    ], {
      method: 'POST',
      data: {
        pipeline_key: 'skeleton_video',
        title: input.title || '',
        script: input.script || '',
        creativeTaskId: input.creativeTaskId || '',
        product_id: input.productId || '',
        character_id: input.characterId || '',
        metadata: input.metadata || {},
        source: input.source || 'miniapp_generate_page',
      },
    });

    const data = payload?.data || {};
    return {
      taskId: String(data.taskId || ''),
      status: String(data.status || 'ANALYZING'),
      pipelineKey: 'skeleton_video',
      workflowId: String(data.workflowId || ''),
      workflowTriggered: data.workflowTriggered === true,
    };
  },

  async getProducts(): Promise<ProductSummary[]> {
    const payload = await request<{ success?: boolean; data?: Array<Record<string, unknown>> }>('/api/products');
    const list = Array.isArray(payload?.data) ? payload.data : [];
    return list
      .map((item) => toProductSummary(item))
      .filter((item): item is ProductSummary => Boolean(item));
  },

  async getProduct(productId: string): Promise<ProductSummary> {
    const payload = await request<{
      success?: boolean;
      data?: Record<string, unknown>;
    }>(`/api/products/${encodeURIComponent(productId)}`);
    const product = toProductSummary(payload?.data ?? (payload as Record<string, unknown>));
    if (!product) {
      throw new Error('产品不存在');
    }
    return product;
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
      data?: Record<string, unknown>;
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

    const product = toProductSummary(payload?.data);
    if (!product) {
      throw new Error('产品创建失败');
    }

    try {
      const analysisPayload = await request<{
        success?: boolean;
        triggered?: boolean;
        processing?: boolean;
      }>('/api/products/analyze', {
        method: 'POST',
        data: {
          productId: product.id,
          name: product.name,
          description: input.description ?? '',
          images: input.images ?? [],
        },
      });
      if (analysisPayload?.triggered !== true) {
        throw new Error('产品分析未触发');
      }
    } catch (error) {
      console.warn('[miniappApi.createProduct] product analysis trigger failed:', error);
      throw new Error(error instanceof Error ? error.message : '产品分析触发失败');
    }

    return {
      ...product,
      status: 'PROCESSING',
      progress: 0,
      analysisResult: JSON.stringify({ status: 'ANALYZING' }),
    };
  },

  async updateProduct(productId: string, input: {
    name: string;
    description?: string;
    images?: string[];
    sellingPoints?: string[];
    sellingPointsText?: string;
  }): Promise<ProductSummary> {
    const payload = await request<{
      success?: boolean;
      data?: Record<string, unknown>;
    }>(`/api/products/${encodeURIComponent(productId)}`, {
      method: 'PATCH',
      data: {
        name: input.name,
        description: input.description ?? '',
        images: input.images ?? [],
        sellingPoints: input.sellingPoints ?? [],
        sellingPointsText: input.sellingPointsText ?? '',
      },
    });

    const product = toProductSummary(payload?.data);
    if (!product) {
      throw new Error('产品更新失败');
    }

    try {
      const analysisPayload = await request<{
        success?: boolean;
        triggered?: boolean;
        processing?: boolean;
      }>('/api/products/analyze', {
        method: 'POST',
        data: {
          productId: product.id,
          name: product.name,
          description: input.description ?? '',
          images: input.images ?? [],
        },
      });
      if (analysisPayload?.triggered !== true) {
        throw new Error('产品分析未触发');
      }
    } catch (error) {
      console.warn('[miniappApi.updateProduct] product analysis trigger failed:', error);
      throw new Error(error instanceof Error ? error.message : '产品分析触发失败');
    }

    return {
      ...product,
      status: 'PROCESSING',
      progress: 0,
      analysisResult: JSON.stringify({ status: 'ANALYZING' }),
    };
  },

  async deleteProduct(productId: string): Promise<void> {
    await request(`/api/products/${encodeURIComponent(productId)}`, { method: 'DELETE' });
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
        const metadata =
          item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
            ? (item.metadata as Record<string, unknown>)
            : null;
        const taskType = typeof item.taskType === 'string' ? item.taskType : '';
        const storyboardCover = taskType === 'storyboard' || taskType === 'grid'
          ? resolveStoryboardCover(item, metadata)
          : null;
        works.push({
          id: String(item.id),
          title: isViralRemixTask(item) ? '一键复刻' : String(item.title ?? (taskType === 'creative' ? '智能文案' : '未命名任务')),
          type: detectWorkType(item),
          status: normalizeStatus(item.status),
          taskType,
          taskId: String(item.taskId ?? item.task_id ?? item.id),
          createdAt: String(item.createdAt ?? new Date().toISOString()),
          preview: resolveWorkPreview(item, metadata),
          thumbnailUrl:
            storyboardCover ??
            (item.thumbnailUrl as string | null) ??
            (item.thumbnail_url as string | null) ??
            null,
          progress: typeof item.progress === 'number' ? item.progress : null,
          metadata,
          source: 'task',
        });
      }
    }

    if (videosRes.status === 'fulfilled') {
      const videos = Array.isArray(videosRes.value?.data) ? videosRes.value.data : [];
      for (const item of videos) {
        const resultUrl = typeof item.resultUrl === 'string' ? item.resultUrl : null;
        const scriptContent = typeof item.scriptContent === 'string' ? item.scriptContent : '';
        const sourceImageUrl = pickImageUrl(item.coverUrl, item.thumbnailUrl, item.imageUrl);
        const isActionTransfer = String(item.type || '').toUpperCase() === 'ACTION_TRANSFER';
        works.push({
          id: String(item.id),
          title: isActionTransfer
            ? '动作复刻视频'
            : item.type === 'VOICE_CLONE'
              ? '数字人文字驱动视频'
              : '数字人口型驱动视频',
          type: 'video',
          status: normalizeStatus(item.status),
          taskType: 'digitalHuman',
          taskId: String(item.id),
          createdAt: String(item.createdAt ?? new Date().toISOString()),
          preview: scriptContent || null,
          thumbnailUrl: sourceImageUrl,
          metadata: {
            type: typeof item.type === 'string' ? item.type : '',
            scriptContent,
            resultUrl,
            videoUrl: resultUrl,
            sourceType: typeof item.sourceType === 'string' ? item.sourceType : '',
            sourceImageUrl,
            referenceVideoUrl: isActionTransfer && typeof item.audioUrl === 'string' ? item.audioUrl : '',
          },
          source: 'digitalHuman',
        });
      }
    }

    return dedupeWorks(works).slice(0, limit);
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
      storyboardImageUrl: typeof data.storyboardImageUrl === 'string' ? data.storyboardImageUrl : null,
      coverImage: typeof data.coverImage === 'string' ? data.coverImage : null,
      detailedBreakdown:
        data.detailedBreakdown && typeof data.detailedBreakdown === 'object' && !Array.isArray(data.detailedBreakdown)
          ? data.detailedBreakdown as Record<string, unknown>
          : null,
      references: Array.isArray(data.references)
        ? data.references
          .map((item: any) => ({
            id: String(item?.id || ''),
            type: String(item?.type || '') === 'character' ? 'character' as const : 'product' as const,
            name: String(item?.name || ''),
            imageUrl: typeof item?.imageUrl === 'string' && item.imageUrl.trim() ? item.imageUrl.trim() : null,
          }))
          .filter((item) => item.id && item.name)
        : [],
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
        rewrittenScript: typeof segment.rewrittenScript === 'string' ? segment.rewrittenScript : null,
        generationParams:
          segment.generationParams && typeof segment.generationParams === 'object' && !Array.isArray(segment.generationParams)
            ? segment.generationParams as Record<string, unknown>
            : null,
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

  async updateStoryboardTask(
    taskId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await request(`/api/storyboard/${encodeURIComponent(taskId)}`, {
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
    const aspectRatio = normalizeStoryboardAspectRatio(params.aspectRatio, '9:16');
    return request<StoryboardGenerateResult>(`/api/storyboard/${encodeURIComponent(params.taskId)}/generate-images`, {
      method: 'POST',
      data: {
        segmentIds: params.segmentIds,
        model: params.model,
        aspectRatio,
      },
    });
  },

  async generateStoryboardVideos(params: {
    taskId: string;
    segmentIds: string[];
    model: string;
    allowTextVideo?: boolean;
    aspectRatio?: string;
    quoteOnly?: boolean;
    source?: string;
  }): Promise<StoryboardGenerateResult> {
    const aspectRatio = normalizeStoryboardAspectRatio(params.aspectRatio, '9:16');
    return request<StoryboardGenerateResult>(`/api/storyboard/${encodeURIComponent(params.taskId)}/generate-videos`, {
      method: 'POST',
      data: {
        segmentIds: params.segmentIds,
        model: params.model,
        allowTextVideo: Boolean(params.allowTextVideo),
        aspectRatio,
        quoteOnly: Boolean(params.quoteOnly),
        source: params.source,
      },
    });
  },

  async mergeStoryboard(taskId: string): Promise<void> {
    await request(`/api/storyboard/${encodeURIComponent(taskId)}/merge`, {
      method: 'POST',
      data: {},
    });
  },

  async deleteStoryboardTask(taskId: string): Promise<void> {
    await request(`/api/storyboard/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
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

  async listWritingStyles(limit = 50): Promise<WritingStyleOption[]> {
    const payload = await request<{ data?: Array<Record<string, unknown>> }>(`/api/assets/writing-styles?mode=selector&limit=${limit}`);
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows.map((item) => ({
      id: String(item.id || '').trim(),
      name: String(item.name || '未命名风格'),
      description: typeof item.description === 'string' ? item.description : null,
      channel: typeof item.channel === 'string' ? item.channel : null,
      currentProfileId: typeof item.currentProfileId === 'string' ? item.currentProfileId : null,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : null,
    })).filter((item) => item.id);
  },

  async getWritingStyleProfile(styleId: string): Promise<WritingStyleProfile | null> {
    const payload = await request<{ data?: Record<string, unknown> }>(`/api/assets/writing-styles/${encodeURIComponent(styleId)}`);
    const data = payload?.data;
    if (!data || typeof data !== 'object') return null;
    const currentProfile = data.currentProfile && typeof data.currentProfile === 'object' && !Array.isArray(data.currentProfile)
      ? data.currentProfile as Record<string, unknown>
      : null;
    const profileJson = currentProfile?.profileJson && typeof currentProfile.profileJson === 'object' && !Array.isArray(currentProfile.profileJson)
      ? currentProfile.profileJson as Record<string, unknown>
      : null;
    return {
      id: String(data.id || styleId),
      status: typeof currentProfile?.status === 'string' ? currentProfile.status : null,
      profileJson,
    };
  },

  async createSmartCopyTask(input: CreateSmartCopyTaskInput): Promise<SmartCopyTaskDetail> {
    const goal: Record<string, unknown> = {};
    if (typeof input.wordCount === 'number' && input.wordCount > 0) {
      goal.targetWordCount = input.wordCount;
    }
    const payload = await request<{ data?: Record<string, unknown> }>('/api/creative-tasks/direct', {
      method: 'POST',
      data: {
        ideaText: input.ideaText,
        title: input.title || input.ideaText.slice(0, 32),
        channel: input.channel || 'xhs',
        targetOutput: input.targetOutput || '智能文案',
        language: input.language || 'zh-CN',
        goal,
        styleRules: input.styleRules || undefined,
        metadata: {
          source: 'miniapp_smart_copy',
          entry: 'home_smart_copy',
        },
      },
    });
    return normalizeSmartCopyTaskDetail(payload?.data || {});
  },

  async getSmartCopyTask(taskId: string): Promise<SmartCopyTaskDetail> {
    const payload = await request<{ data?: Record<string, unknown> }>(`/api/creative-tasks/${encodeURIComponent(taskId)}`);
    return normalizeSmartCopyTaskDetail(payload?.data || {});
  },

  async getCreativeTask(taskId: string): Promise<CreativeTaskDetail> {
    const payload = await request<{ data?: Record<string, unknown> }>(`/api/creative-tasks/${encodeURIComponent(taskId)}`);
    return normalizeCreativeTaskDetail(payload?.data || {});
  },

  async deleteWorkItem(item: WorkItem): Promise<void> {
    if (item.source === 'digitalHuman') {
      await request(`/api/digital-human/videos/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      return;
    }
    const taskType = String(item.taskType || '').toLowerCase();
    if (taskType === 'storyboard' || taskType === 'grid') {
      const storyboardId = String(item.taskId || item.id || '').trim();
      await request(`/api/storyboard/${encodeURIComponent(storyboardId)}`, { method: 'DELETE' });
      return;
    }
    if (taskType === 'creative') {
      const taskId = String(item.taskId || item.id || '').trim();
      await request(`/api/creative-tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
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
    const query = buildQuery({
      summary: 1,
      includeShared: 1,
      limit: 50,
      type,
    });

    const payload = await request<{ data?: Array<Record<string, unknown>> }>(`/api/assets/styles?${query}`);
    const list = Array.isArray(payload?.data) ? payload.data : [];
    return list.map((item) => ({
      id: String(item.id || ''),
      name: String(item.name || '未命名模板'),
      type: String(item.type || type),
      previewUrl: typeof item.previewUrl === 'string' ? item.previewUrl : null,
      thumbnailUrl: typeof item.thumbnailUrl === 'string'
        ? item.thumbnailUrl
        : typeof item.thumbnail_url === 'string'
          ? item.thumbnail_url
          : item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) && typeof (item.metadata as Record<string, unknown>).thumbnailUrl === 'string'
            ? String((item.metadata as Record<string, unknown>).thumbnailUrl)
            : null,
      status: typeof item.status === 'string' ? item.status : null,
      metadata: item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
        ? item.metadata as Record<string, unknown>
        : null,
      spec: item.spec && typeof item.spec === 'object' && !Array.isArray(item.spec)
        ? item.spec as Record<string, unknown>
        : null,
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
      thumbnailUrl: typeof data.thumbnailUrl === 'string' ? data.thumbnailUrl : null,
      status: typeof data.status === 'string' ? data.status : null,
      metadata: data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
        ? data.metadata as Record<string, unknown>
        : null,
      spec: data.spec && typeof data.spec === 'object' && !Array.isArray(data.spec)
        ? data.spec as Record<string, unknown>
        : null,
    };
  },

  async startXhsText2ImageTask(params: {
    title: string;
    text: string;
    styleId: string;
    styleProfileJson: string;
    imageCount: number;
    language?: string;
  }): Promise<{ taskId: string; summaryId?: string; queued?: boolean }> {
    const payload = await request<{
      data?: { taskId?: string; summaryId?: string };
      taskId?: string;
      summaryId?: string;
      queued?: boolean;
    }>('/api/xhs-text2img/plan', {
      method: 'POST',
      data: {
        title: params.title,
        text: params.text,
        styleId: params.styleId,
        styleProfileJson: params.styleProfileJson,
        imageCount: params.imageCount,
        language: params.language ?? '简体',
      },
    });
    const data = payload?.data || payload;
    return {
      taskId: String(data?.taskId || ''),
      summaryId: typeof data?.summaryId === 'string' ? data.summaryId : undefined,
      queued: payload?.queued === true,
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
    imageCount?: number;
  }): Promise<{ taskId: string; status: string }> {
    return request<{ taskId: string; status: string }>(`/api/image-text-replication/${encodeURIComponent(taskId)}/generate`, {
      method: 'POST',
      data: {
        stylePresetId: params.stylePresetId,
        topicHint: params.topicHint ?? '',
        imageCount: typeof params.imageCount === 'number' ? params.imageCount : undefined,
      },
    });
  },

  async generateCanvasImages(params: {
    prompt: string;
    model: string;
    size?: '1024x1024' | '1536x1024' | '1024x1536';
    aspectRatio?: string;
    negativePrompt?: string;
    referenceImageInstructions?: string;
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
        aspect_ratio: params.aspectRatio,
        aspectRatio: params.aspectRatio,
        negative_prompt: params.negativePrompt,
        reference_image_instructions: params.referenceImageInstructions,
        n: typeof params.n === 'number' ? params.n : 1,
        image: imageInput.slice(0, DEFAULT_CANVAS_IMAGE_REFERENCE_LIMIT),
      },
    });
    return {
      images: extractCanvasImageUrls(payload),
      raw: payload,
    };
  },

  async startCanvasImageJob(params: {
    prompt: string;
    model: string;
    size?: '1024x1024' | '1536x1024' | '1024x1536';
    aspectRatio?: string;
    negativePrompt?: string;
    referenceImageInstructions?: string;
    n?: number;
    image?: string[];
    images?: string[];
  }): Promise<CanvasImageJobResult> {
    const imageInput = Array.isArray(params.image)
      ? params.image
      : (Array.isArray(params.images) ? params.images : []);

    const payload = await request<{ data?: Partial<CanvasImageJobResult> }>('/api/miniapp/canvas/images/jobs', {
      method: 'POST',
      data: {
        prompt: params.prompt,
        model: params.model,
        size: params.size ?? '1024x1024',
        aspect_ratio: params.aspectRatio,
        aspectRatio: params.aspectRatio,
        negative_prompt: params.negativePrompt,
        reference_image_instructions: params.referenceImageInstructions,
        n: typeof params.n === 'number' ? params.n : 1,
        image: imageInput.slice(0, DEFAULT_CANVAS_IMAGE_REFERENCE_LIMIT),
      },
    });
    const resultData = payload?.data || {};
    return {
      taskId: typeof resultData.taskId === 'string' ? resultData.taskId : '',
      status: typeof resultData.status === 'string' ? resultData.status : 'PROCESSING',
      message: typeof resultData.message === 'string' ? resultData.message : '图片生产中，请在作品中查看生成结果',
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
    persist?: boolean;
    requirePreview?: boolean;
    preview?: {
      pages: string[];
      cardClassName?: string;
      cardStyle?: Record<string, string | number>;
      contentClassName?: string;
      contentStyle?: Record<string, string | number>;
      richTextClassName?: string;
      selectedCardStyle?: string;
    };
    cover?: {
      coverStyleId?: string;
      coverTitle?: string;
      coverSubtitle?: string;
      coverImage?: string;
      coverTextColor?: string;
      coverHighlightColor?: string;
      coverCardRadius?: number;
      coverShowStickers?: boolean;
      coverFontFamily?: string;
      coverTitleAlignX?: 'left' | 'center' | 'right';
      coverTitleAlignY?: 'top' | 'center' | 'bottom';
      coverFontSize?: number;
      coverSubtitleFontSize?: number;
      coverLineHeight?: number;
    };
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
        persist: params.persist === true,
        requirePreview: params.requirePreview === true,
        preview: params.preview || undefined,
        cover: params.cover || undefined,
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
    const query = buildQuery({ key });
    const payload = await request<{ data?: { config?: MonetizationSquareConfigPayload } }>(
      `/api/miniapp/monetization-square?${query}`,
    );
    const config = payload?.data?.config;
    if (!config || !Array.isArray(config.categories)) {
      throw new Error('变现广场配置为空');
    }
    return config;
  },

  async getHotSquareConfig(key = 'miniapp-hot-square'): Promise<HotSquareConfigPayload> {
    const query = buildQuery({ key });
    const payload = await request<{ data?: { config?: HotSquareConfigPayload } }>(
      `/api/miniapp/hot-square/config?${query}`,
    );
    const config = payload?.data?.config;
    if (!config || !Array.isArray(config.categories)) {
      throw new Error('爆款分类配置为空');
    }
    return config;
  },
};
