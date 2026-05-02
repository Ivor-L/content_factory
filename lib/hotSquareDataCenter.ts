export interface HotSquareCollectConfig {
  keyword: string;
  pages?: number;
  sortType?: string;
  noteType?: string;
  timeFilter?: string;
  source?: string;
  aiMode?: 0 | 1;
}

export interface HotSquareCategoryConfig {
  id: string;
  name: string;
  enabled?: boolean;
  collect?: HotSquareCollectConfig;
}

export interface HotSquareDataCenterConfigPayload {
  title: string;
  subtitle?: string;
  categories: HotSquareCategoryConfig[];
}

export const HOT_SQUARE_DATA_CENTER_KEY = 'miniapp-hot-square';
export const HOT_SQUARE_SHARED_OWNER = 'system:miniapp-hot-square';

export const DEFAULT_HOT_SQUARE_DATA_CENTER_CONFIG: HotSquareDataCenterConfigPayload = {
  title: '爆款广场',
  subtitle: '发现可复用的内容灵感',
  categories: [
    { id: 'insurance', name: '保险', enabled: true, collect: { keyword: '保险销售话术', pages: 2, sortType: 'popularity_descending', noteType: '普通笔记', timeFilter: '一周内', source: 'explore_feed', aiMode: 0 } },
    { id: 'law', name: '法律', enabled: true, collect: { keyword: '法律咨询科普', pages: 2, sortType: 'popularity_descending', noteType: '普通笔记', timeFilter: '一周内', source: 'explore_feed', aiMode: 0 } },
    { id: 'finance', name: '金融', enabled: true, collect: { keyword: '理财干货', pages: 2, sortType: 'collect_descending', noteType: '普通笔记', timeFilter: '一周内', source: 'explore_feed', aiMode: 0 } },
    { id: 'education', name: '教育', enabled: true, collect: { keyword: '教育方法分享', pages: 2, sortType: 'collect_descending', noteType: '普通笔记', timeFilter: '一周内', source: 'explore_feed', aiMode: 0 } },
    { id: 'psychology', name: '心理', enabled: true, collect: { keyword: '心理成长', pages: 2, sortType: 'comment_descending', noteType: '普通笔记', timeFilter: '一周内', source: 'explore_feed', aiMode: 0 } },
    { id: 'ai', name: 'AI', enabled: true, collect: { keyword: 'AI工具实测', pages: 2, sortType: 'time_descending', noteType: '不限', timeFilter: '一周内', source: 'explore_feed', aiMode: 0 } },
    { id: 'catering', name: '餐饮', enabled: true, collect: { keyword: '餐饮门店运营', pages: 2, sortType: 'popularity_descending', noteType: '视频笔记', timeFilter: '一周内', source: 'explore_feed', aiMode: 0 } },
    { id: 'beauty', name: '美业', enabled: true, collect: { keyword: '美业拓客', pages: 2, sortType: 'popularity_descending', noteType: '视频笔记', timeFilter: '一周内', source: 'explore_feed', aiMode: 0 } },
  ],
};

export const HOT_SQUARE_OPERATIONS_TEMPLATE: HotSquareDataCenterConfigPayload = {
  ...DEFAULT_HOT_SQUARE_DATA_CENTER_CONFIG,
  title: '爆款广场',
  subtitle: '按行业沉淀可复用选题与爆款笔记',
};

function normalizeId(value: unknown, fallbackPrefix: string, index: number): string {
  const raw = String(value ?? '').trim();
  if (raw) return raw;
  return `${fallbackPrefix}-${index + 1}`;
}

function normalizeName(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim();
  return raw || fallback;
}

function normalizeCollect(raw: unknown, categoryName: string): HotSquareCollectConfig {
  const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const keyword = String(obj.keyword ?? '').trim() || categoryName;
  const pagesNum = Number(obj.pages ?? 1);
  const pages = Number.isFinite(pagesNum) ? Math.min(Math.max(Math.floor(pagesNum), 1), 5) : 1;
  const aiModeRaw = Number(obj.aiMode ?? 0);

  return {
    keyword,
    pages,
    sortType: String(obj.sortType ?? 'general').trim() || 'general',
    noteType: String(obj.noteType ?? '不限').trim() || '不限',
    timeFilter: String(obj.timeFilter ?? '不限').trim() || '不限',
    source: String(obj.source ?? 'explore_feed').trim() || 'explore_feed',
    aiMode: aiModeRaw === 1 ? 1 : 0,
  };
}

export function normalizeHotSquareDataCenterConfig(raw: unknown): HotSquareDataCenterConfigPayload {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_HOT_SQUARE_DATA_CENTER_CONFIG;
  }

  const obj = raw as Partial<HotSquareDataCenterConfigPayload>;
  const categoriesRaw = Array.isArray(obj.categories) ? obj.categories : [];
  const categories = categoriesRaw
    .map((item, index): HotSquareCategoryConfig | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as unknown as Record<string, unknown>;
      const name = normalizeName(record.name, `分类${index + 1}`);
      return {
        id: normalizeId(record.id, 'category', index),
        name,
        enabled: record.enabled !== false,
        collect: normalizeCollect(record.collect, name),
      };
    })
    .filter(Boolean) as HotSquareCategoryConfig[];

  if (categories.length === 0) {
    return DEFAULT_HOT_SQUARE_DATA_CENTER_CONFIG;
  }

  return {
    title: String(obj.title ?? '').trim() || DEFAULT_HOT_SQUARE_DATA_CENTER_CONFIG.title,
    subtitle: String(obj.subtitle ?? '').trim() || DEFAULT_HOT_SQUARE_DATA_CENTER_CONFIG.subtitle,
    categories,
  };
}
