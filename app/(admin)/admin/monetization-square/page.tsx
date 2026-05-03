"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_MONETIZATION_SQUARE_CONFIG,
  DEFAULT_MONETIZATION_SQUARE_KEY,
  normalizeMonetizationConfig,
  type MonetizationSquareConfigPayload,
  type MonetizationCategoryConfig,
  type MonetizationItemConfig,
  type MonetizationActionConfig,
} from '@/lib/monetizationSquare';

interface AdminMonetizationResp {
  data?: {
    key: string;
    name: string;
    description: string | null;
    published: boolean;
    version: number;
    config: MonetizationSquareConfigPayload;
  };
  error?: string;
}

type EditorMode = 'visual' | 'json';

const ROUTE_OPTIONS = [
  { label: '图文生成', value: '/pages/image-generate/index' },
  { label: '视频生成', value: '/pages/generate/index' },
  { label: '爆款复刻', value: '/pages/remix-generate/index' },
  { label: '爆款广场', value: '/pages/hot-square/index' },
  { label: '首页', value: '/pages/home/index' },
  { label: '作品页', value: '/pages/works/index' },
];

function isShareCategory(id: string, name: string): boolean {
  const normalizedId = String(id || '').trim().toLowerCase();
  const normalizedName = String(name || '').trim();
  return normalizedId.startsWith('share-') || normalizedId.startsWith('share_') || normalizedName.startsWith('分享');
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function paramsToQuery(params?: Record<string, string | number | boolean | null>): string {
  if (!params) return '';
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (!key.trim()) return;
    if (value === null || value === undefined || String(value).trim() === '') return;
    query.set(key, String(value));
  });
  return query.toString();
}

function queryToParams(text: string): Record<string, string> | undefined {
  const raw = text.trim();
  if (!raw) return undefined;
  const queryText = raw.startsWith('?') ? raw.slice(1) : raw;
  const search = new URLSearchParams(queryText);
  const result: Record<string, string> = {};
  search.forEach((value, key) => {
    if (!key.trim()) return;
    result[key] = value;
  });
  return Object.keys(result).length > 0 ? result : undefined;
}

function createDefaultAction(): MonetizationActionConfig {
  return {
    type: 'route',
    route: '/pages/generate/index',
    params: undefined,
  };
}

function createEmptyDemo(): NonNullable<MonetizationItemConfig['demos']>[number] {
  return {
    id: createId('demo'),
    title: '新演示',
    subtitle: '',
    coverImageUrl: '',
    demoVideoUrl: '',
    tags: [],
  };
}

function ensureDemoAction(
  demo: NonNullable<MonetizationItemConfig['demos']>[number],
  fallbackRoute = '/pages/home/index',
): MonetizationActionConfig {
  const action = demo.action;
  if (action?.type === 'route' && String(action.route || '').trim()) {
    return action;
  }
  return {
    type: 'route',
    route: fallbackRoute,
    params: action?.params,
    featureKey: action?.featureKey,
    promptTemplate: action?.promptTemplate,
  };
}

function createEmptyItem(): MonetizationItemConfig {
  return {
    id: createId('item'),
    title: '新子类型',
    subtitle: '',
    coverImageUrl: '',
    demoVideoUrl: '',
    tags: [],
    action: createDefaultAction(),
    demos: [createEmptyDemo()],
  };
}

function createEmptyCategory(): MonetizationCategoryConfig {
  return {
    id: createId('category'),
    name: '新类目',
    items: [createEmptyItem()],
  };
}

function prepareVisualConfig(config: MonetizationSquareConfigPayload): MonetizationSquareConfigPayload {
  return {
    ...config,
    categories: config.categories.map((category) => ({
      ...category,
      items: category.items.map((item) => ({
        ...item,
        action: item.action?.route ? item.action : createDefaultAction(),
        demos: Array.isArray(item.demos) && item.demos.length > 0
          ? item.demos
          : [{
            id: item.id,
            title: item.title,
            subtitle: item.subtitle,
            coverImageUrl: item.coverImageUrl,
            demoVideoUrl: item.demoVideoUrl,
            tags: item.tags,
          }],
      })),
    })),
  };
}

async function uploadMedia(file: File, kind: 'image' | 'video'): Promise<string> {
  const endpoint = kind === 'video' ? '/api/upload/video' : '/api/upload/image';
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(endpoint, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  const payload = await res.json().catch(() => ({})) as { url?: string; error?: string };
  if (!res.ok || !payload.url) {
    throw new Error(payload.error || '上传失败');
  }
  return payload.url;
}

export default function AdminMonetizationSquarePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(true);
  const [name, setName] = useState('默认变现广场');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState(1);

  const [editorMode, setEditorMode] = useState<EditorMode>('visual');
  const [visualConfig, setVisualConfig] = useState<MonetizationSquareConfigPayload>(prepareVisualConfig(DEFAULT_MONETIZATION_SQUARE_CONFIG));
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [jsonText, setJsonText] = useState(JSON.stringify(DEFAULT_MONETIZATION_SQUARE_CONFIG, null, 2));
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const jsonParseResult = useMemo(() => {
    try {
      const parsed = normalizeMonetizationConfig(JSON.parse(jsonText));
      return { ok: true as const, parsed, error: '' };
    } catch (error) {
      return {
        ok: false as const,
        parsed: null,
        error: error instanceof Error ? error.message : 'JSON 格式错误',
      };
    }
  }, [jsonText]);

  const selectedCategory = useMemo(() => {
    const categories = visualConfig.categories;
    if (categories.length === 0) return null;
    return categories.find((item) => item.id === selectedCategoryId) || categories[0];
  }, [visualConfig, selectedCategoryId]);

  const selectedItem = useMemo(() => {
    const items = selectedCategory?.items || [];
    if (items.length === 0) return null;
    return items.find((item) => item.id === selectedItemId) || items[0];
  }, [selectedCategory, selectedItemId]);

  useEffect(() => {
    if (!selectedCategory && visualConfig.categories.length > 0) {
      setSelectedCategoryId(visualConfig.categories[0].id);
      return;
    }
    if (selectedCategory && selectedCategory.id !== selectedCategoryId) {
      setSelectedCategoryId(selectedCategory.id);
    }
  }, [selectedCategory, selectedCategoryId, visualConfig.categories]);

  useEffect(() => {
    if (!selectedCategory) {
      if (selectedItemId) setSelectedItemId('');
      return;
    }
    if (!selectedItem && selectedCategory.items.length > 0) {
      setSelectedItemId(selectedCategory.items[0].id);
      return;
    }
    if (selectedItem && selectedItem.id !== selectedItemId) {
      setSelectedItemId(selectedItem.id);
    }
  }, [selectedCategory, selectedItem, selectedItemId]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!profile?.is_admin) {
        router.push('/dashboard');
        return;
      }
      setToken(session.access_token);
    };
    void init();
  }, [router]);

  const fetchConfig = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/monetization-square?key=default', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as AdminMonetizationResp;
      if (!res.ok || !json.data) {
        throw new Error(json.error || '加载失败');
      }
      const nextConfig = prepareVisualConfig(json.data.config || DEFAULT_MONETIZATION_SQUARE_CONFIG);
      setName(json.data.name || '默认变现广场');
      setDescription(json.data.description || '');
      setPublished(json.data.published !== false);
      setVersion(json.data.version || 1);
      setVisualConfig(nextConfig);
      setSelectedCategoryId(nextConfig.categories[0]?.id || '');
      setSelectedItemId(nextConfig.categories[0]?.items[0]?.id || '');
      setJsonText(JSON.stringify(nextConfig, null, 2));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (editorMode !== 'visual') return;
    setJsonText(JSON.stringify(visualConfig, null, 2));
  }, [editorMode, visualConfig]);

  const updateCategory = (categoryId: string, updater: (category: MonetizationCategoryConfig) => MonetizationCategoryConfig) => {
    setVisualConfig((prev) => ({
      ...prev,
      categories: prev.categories.map((category) => (category.id === categoryId ? updater(category) : category)),
    }));
  };

  const updateItem = (categoryId: string, itemId: string, updater: (item: MonetizationItemConfig) => MonetizationItemConfig) => {
    updateCategory(categoryId, (category) => ({
      ...category,
      items: category.items.map((item) => (item.id === itemId ? updater(item) : item)),
    }));
  };

  const updateDemo = (
    categoryId: string,
    itemId: string,
    demoId: string,
    updater: (demo: NonNullable<MonetizationItemConfig['demos']>[number]) => NonNullable<MonetizationItemConfig['demos']>[number],
  ) => {
    updateItem(categoryId, itemId, (item) => ({
      ...item,
      demos: (item.demos || []).map((demo) => (demo.id === demoId ? updater(demo) : demo)),
    }));
  };

  const removeCategory = (categoryId: string) => {
    setVisualConfig((prev) => ({
      ...prev,
      categories: prev.categories.filter((item) => item.id !== categoryId),
    }));
    if (selectedCategoryId === categoryId) {
      setSelectedCategoryId('');
      setSelectedItemId('');
    }
  };

  const removeItem = (categoryId: string, itemId: string) => {
    updateCategory(categoryId, (category) => ({
      ...category,
      items: category.items.filter((item) => item.id !== itemId),
    }));
    if (selectedItemId === itemId) {
      setSelectedItemId('');
    }
  };

  const generateCategoryIdFromName = (categoryId: string) => {
    const category = visualConfig.categories.find((item) => item.id === categoryId);
    if (!category) return;
    const base = slugify(category.name) || 'category';
    const existing = new Set(visualConfig.categories.map((item) => item.id));
    existing.delete(category.id);
    let candidate = base;
    let i = 2;
    while (existing.has(candidate)) {
      candidate = `${base}-${i}`;
      i += 1;
    }
    updateCategory(categoryId, (current) => ({ ...current, id: candidate }));
    if (selectedCategoryId === categoryId) setSelectedCategoryId(candidate);
  };

  const generateItemIdFromName = (categoryId: string, itemId: string) => {
    const category = visualConfig.categories.find((entry) => entry.id === categoryId);
    const item = category?.items.find((entry) => entry.id === itemId);
    if (!category || !item) return;
    const base = slugify(item.title) || 'item';
    const existing = new Set(category.items.map((entry) => entry.id));
    existing.delete(item.id);
    let candidate = base;
    let i = 2;
    while (existing.has(candidate)) {
      candidate = `${base}-${i}`;
      i += 1;
    }
    updateItem(categoryId, itemId, (current) => ({ ...current, id: candidate }));
    if (selectedItemId === itemId) setSelectedItemId(candidate);
  };

  const handleRestoreDefault = () => {
    const next = prepareVisualConfig(DEFAULT_MONETIZATION_SQUARE_CONFIG);
    setVisualConfig(next);
    setSelectedCategoryId(next.categories[0]?.id || '');
    setSelectedItemId(next.categories[0]?.items[0]?.id || '');
    setJsonText(JSON.stringify(next, null, 2));
    setMessage('已恢复默认模板（未保存）。');
  };

  const handleSave = async () => {
    if (!token) return;

    const configToSave = editorMode === 'json'
      ? (jsonParseResult.ok ? jsonParseResult.parsed : null)
      : normalizeMonetizationConfig(visualConfig);

    if (!configToSave) {
      setMessage(`保存失败：${jsonParseResult.error}`);
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const res = await fetch('/api/admin/monetization-square', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          key: DEFAULT_MONETIZATION_SQUARE_KEY,
          name,
          description: description || null,
          published,
          config: configToSave,
        }),
      });
      const json = await res.json() as AdminMonetizationResp;
      if (!res.ok || !json.data) {
        throw new Error(json.error || '保存失败');
      }
      const nextConfig = prepareVisualConfig(json.data.config || configToSave);
      setVersion(json.data.version || version + 1);
      setVisualConfig(nextConfig);
      setSelectedCategoryId(nextConfig.categories[0]?.id || '');
      setSelectedItemId(nextConfig.categories[0]?.items[0]?.id || '');
      setJsonText(JSON.stringify(nextConfig, null, 2));
      setMessage('保存成功，已更新发布配置。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadDemoMedia = async (
    categoryId: string,
    itemId: string,
    demoId: string,
    file: File,
    kind: 'image' | 'video',
  ) => {
    const key = `${categoryId}-${itemId}-${demoId}-${kind}`;
    setUploadingKey(key);
    setMessage('');
    try {
      const url = await uploadMedia(file, kind);
      updateDemo(categoryId, itemId, demoId, (demo) => (
        kind === 'image'
          ? { ...demo, coverImageUrl: url }
          : { ...demo, demoVideoUrl: url }
      ));
      setMessage(kind === 'image' ? '图片上传成功。' : '视频上传成功。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传失败');
    } finally {
      setUploadingKey(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">变现广场配置</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">三列可视化：左侧分类，中间子类型，右侧详情配置。</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">配置名称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">版本</span>
            <input
              value={String(version)}
              readOnly
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300"
            />
          </label>
        </div>

        <label className="space-y-2 block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">描述</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">发布给小程序</span>
        </label>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">广场内容配置</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditorMode('visual')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${editorMode === 'visual' ? 'bg-black text-white dark:bg-white dark:text-black' : 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300'}`}
            >
              可视化模式
            </button>
            <button
              type="button"
              onClick={() => setEditorMode('json')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${editorMode === 'json' ? 'bg-black text-white dark:bg-white dark:text-black' : 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300'}`}
            >
              高级 JSON
            </button>
            <button
              onClick={handleRestoreDefault}
              type="button"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              恢复默认模板
            </button>
          </div>
        </div>

        {editorMode === 'visual' ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_360px_1fr]">
            <aside className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
              <div className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">分类列表</div>
              <div className="space-y-2">
                {visualConfig.categories.map((category) => {
                  const active = selectedCategory?.id === category.id;
                  return (
                    <div key={category.id} className={`rounded-lg border px-2 py-2 ${active ? 'border-black bg-black/5 dark:border-white dark:bg-white/10' : 'border-gray-200 dark:border-gray-700'}`}>
                      <div className="mb-2 flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedCategoryId(category.id)}
                          className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          选中
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => generateCategoryIdFromName(category.id)}
                            className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            自动ID
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCategory(category.id)}
                            className="rounded border border-red-300 px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                          >
                            删
                          </button>
                        </div>
                      </div>
                      <input
                        value={category.name}
                        onChange={(e) => updateCategory(category.id, (current) => ({ ...current, name: e.target.value }))}
                        onFocus={() => setSelectedCategoryId(category.id)}
                        className="mb-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                        placeholder="分类名称"
                      />
                      <input
                        value={category.id}
                        onChange={(e) => {
                          const oldId = category.id;
                          const nextId = e.target.value;
                          updateCategory(oldId, (current) => ({ ...current, id: nextId }));
                          if (selectedCategoryId === oldId) setSelectedCategoryId(nextId);
                        }}
                        onFocus={() => setSelectedCategoryId(category.id)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                        placeholder="分类 ID"
                      />
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = createEmptyCategory();
                  setVisualConfig((prev) => ({ ...prev, categories: [...prev.categories, next] }));
                  setSelectedCategoryId(next.id);
                  setSelectedItemId(next.items[0]?.id || '');
                }}
                className="mt-3 w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                + 添加分类
              </button>
            </aside>

            <section className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
              {!selectedCategory ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                  请先在左侧选择分类。
                </div>
              ) : (
                <>
                  <div className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">二级子类型菜单</div>
                  <div className="space-y-2">
                    {selectedCategory.items.map((item) => {
                      const active = selectedItem?.id === item.id;
                      return (
                        <div key={item.id} className={`rounded-md border px-2 py-2 ${active ? 'border-black bg-black/5 dark:border-white dark:bg-white/10' : 'border-gray-200 dark:border-gray-700'}`}>
                          <div className="mb-2 flex items-center justify-between gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedItemId(item.id)}
                              className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              选中
                            </button>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => generateItemIdFromName(selectedCategory.id, item.id)}
                                className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                              >
                                自动ID
                              </button>
                              <button
                                type="button"
                                onClick={() => removeItem(selectedCategory.id, item.id)}
                                className="rounded border border-red-300 px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                              >
                                删
                              </button>
                            </div>
                          </div>
                          <input
                            value={item.title}
                            onChange={(e) => updateItem(selectedCategory.id, item.id, (current) => ({ ...current, title: e.target.value }))}
                            onFocus={() => setSelectedItemId(item.id)}
                            className="mb-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                            placeholder="子类型标题"
                          />
                          <input
                            value={item.id}
                            onChange={(e) => {
                              const oldId = item.id;
                              const nextId = e.target.value;
                              updateItem(selectedCategory.id, oldId, (current) => ({ ...current, id: nextId }));
                              if (selectedItemId === oldId) setSelectedItemId(nextId);
                            }}
                            onFocus={() => setSelectedItemId(item.id)}
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                            placeholder="子类型 ID"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = createEmptyItem();
                      updateCategory(selectedCategory.id, (current) => ({
                        ...current,
                        items: [...current.items, next],
                      }));
                      setSelectedItemId(next.id);
                    }}
                    className="mt-3 w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    + 添加子类型
                  </button>
                </>
              )}
            </section>

            <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              {!selectedCategory ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                  请先选择分类。
                </div>
              ) : !selectedItem ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                  请先选择子类型。
                </div>
              ) : (() => {
                const item = selectedItem;
                const shareCategory = isShareCategory(selectedCategory.id, selectedCategory.name);
                const routeInOptions = ROUTE_OPTIONS.some((route) => route.value === item.action.route);
                return (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">子类型详情编辑：{item.title || '未命名'}</div>

                    {!shareCategory && (
                      <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-900/50">
                        <div className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">跳转设置</div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="space-y-1">
                            <span className="text-xs text-gray-600 dark:text-gray-300">跳转页面</span>
                            <select
                              value={routeInOptions ? item.action.route : '__custom__'}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === '__custom__') return;
                                updateItem(selectedCategory.id, item.id, (current) => ({
                                  ...current,
                                  action: { ...current.action, type: 'route', route: value },
                                }));
                              }}
                              className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                            >
                              {ROUTE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                              <option value="__custom__">自定义页面</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs text-gray-600 dark:text-gray-300">参数（key=value&key2=value2）</span>
                            <input
                              value={paramsToQuery(item.action.params)}
                              onChange={(e) => updateItem(selectedCategory.id, item.id, (current) => ({
                                ...current,
                                action: { ...current.action, params: queryToParams(e.target.value) },
                              }))}
                              className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                              placeholder="mode=ai-tool-leads"
                            />
                          </label>
                        </div>

                        {!routeInOptions && (
                          <label className="mt-2 block space-y-1">
                            <span className="text-xs text-gray-600 dark:text-gray-300">自定义页面路径</span>
                            <input
                              value={item.action.route}
                              onChange={(e) => updateItem(selectedCategory.id, item.id, (current) => ({
                                ...current,
                                action: { ...current.action, type: 'route', route: e.target.value },
                              }))}
                              className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                              placeholder="/pages/xxx/index"
                            />
                          </label>
                        )}
                      </div>
                    )}

                    <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-900/50">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {shareCategory ? '分享卡片（视频号）' : '演示内容（横滑卡片）'}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateItem(selectedCategory.id, item.id, (current) => ({
                            ...current,
                            demos: [...(current.demos || []), createEmptyDemo()],
                          }))}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          + 添加演示
                        </button>
                      </div>

                      <div className="space-y-3">
                        {(item.demos || []).map((demo) => {
                          const imageUploadKey = `${selectedCategory.id}-${item.id}-${demo.id}-image`;
                          const videoUploadKey = `${selectedCategory.id}-${item.id}-${demo.id}-video`;
                          return (
                            <div key={demo.id} className="rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                              <div className="mb-2 flex items-center justify-between">
                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">演示卡片</div>
                                <button
                                  type="button"
                                  onClick={() => updateItem(selectedCategory.id, item.id, (current) => ({
                                    ...current,
                                    demos: (current.demos || []).filter((entry) => entry.id !== demo.id),
                                  }))}
                                  className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                                >
                                  删除
                                </button>
                              </div>

                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="space-y-1">
                                  <span className="text-xs text-gray-600 dark:text-gray-300">标题</span>
                                  <input
                                    value={demo.title}
                                    onChange={(e) => updateDemo(selectedCategory.id, item.id, demo.id, (current) => ({ ...current, title: e.target.value }))}
                                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                  />
                                </label>
                                <label className="space-y-1">
                                  <span className="text-xs text-gray-600 dark:text-gray-300">描述（可选）</span>
                                  <input
                                    value={demo.subtitle || ''}
                                    onChange={(e) => updateDemo(selectedCategory.id, item.id, demo.id, (current) => ({ ...current, subtitle: e.target.value }))}
                                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                  />
                                </label>
                              </div>

                              {shareCategory && (
                                <div className="mt-3 rounded-md border border-purple-200 bg-purple-50/60 p-3 dark:border-purple-800/50 dark:bg-purple-900/20">
                                  <div className="mb-2 text-xs font-medium text-purple-700 dark:text-purple-300">视频号参数（官方）</div>
                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <label className="space-y-1">
                                      <span className="text-xs text-gray-600 dark:text-gray-300">finderUserName</span>
                                      <input
                                        value={String((ensureDemoAction(demo, item.action.route).params?.finderUserName as string) || '')}
                                        onChange={(e) => updateDemo(selectedCategory.id, item.id, demo.id, (current) => {
                                          const action = ensureDemoAction(current, item.action.route);
                                          const nextParams = { ...(action.params || {}), finderUserName: e.target.value };
                                          return { ...current, action: { ...action, params: nextParams } };
                                        })}
                                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                        placeholder="sphxxxxxxxx"
                                      />
                                    </label>
                                    <label className="space-y-1">
                                      <span className="text-xs text-gray-600 dark:text-gray-300">feedId</span>
                                      <input
                                        value={String((ensureDemoAction(demo, item.action.route).params?.feedId as string) || '')}
                                        onChange={(e) => updateDemo(selectedCategory.id, item.id, demo.id, (current) => {
                                          const action = ensureDemoAction(current, item.action.route);
                                          const nextParams = { ...(action.params || {}), feedId: e.target.value };
                                          return { ...current, action: { ...action, params: nextParams } };
                                        })}
                                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                        placeholder="export/UzFfAgtgekIEAQ..."
                                      />
                                    </label>
                                    <label className="space-y-1">
                                      <span className="text-xs text-gray-600 dark:text-gray-300">点赞展示（可选）</span>
                                      <input
                                        value={String((ensureDemoAction(demo, item.action.route).params?.likesText as string) || '')}
                                        onChange={(e) => updateDemo(selectedCategory.id, item.id, demo.id, (current) => {
                                          const action = ensureDemoAction(current, item.action.route);
                                          const nextParams = { ...(action.params || {}), likesText: e.target.value };
                                          return { ...current, action: { ...action, params: nextParams } };
                                        })}
                                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                        placeholder="10万+"
                                      />
                                    </label>
                                  </div>
                                  <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">分享变现将读取每张卡片的 finderUserName + feedId 调用 wx.openChannelsActivity。</p>
                                </div>
                              )}

                              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                  <span className="text-xs text-gray-600 dark:text-gray-300">封面图</span>
                                  <input
                                    value={demo.coverImageUrl || ''}
                                    onChange={(e) => updateDemo(selectedCategory.id, item.id, demo.id, (current) => ({ ...current, coverImageUrl: e.target.value }))}
                                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                    placeholder="可粘贴图片URL或直接上传"
                                  />
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={(e) => {
                                        const file = e.currentTarget.files?.[0];
                                        if (!file) return;
                                        void handleUploadDemoMedia(selectedCategory.id, item.id, demo.id, file, 'image');
                                        e.currentTarget.value = '';
                                      }}
                                      className="text-xs"
                                    />
                                    {uploadingKey === imageUploadKey && <span className="text-xs text-gray-500">上传中...</span>}
                                  </div>
                                  {!!demo.coverImageUrl && (
                                    <img src={demo.coverImageUrl} alt={demo.title} className="mt-1 h-24 w-full rounded object-cover" />
                                  )}
                                </div>

                                <div className="space-y-1">
                                  <span className="text-xs text-gray-600 dark:text-gray-300">演示视频</span>
                                  <input
                                    value={demo.demoVideoUrl || ''}
                                    onChange={(e) => updateDemo(selectedCategory.id, item.id, demo.id, (current) => ({ ...current, demoVideoUrl: e.target.value }))}
                                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                    placeholder="可粘贴视频URL或直接上传"
                                  />
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="file"
                                      accept="video/*"
                                      onChange={(e) => {
                                        const file = e.currentTarget.files?.[0];
                                        if (!file) return;
                                        void handleUploadDemoMedia(selectedCategory.id, item.id, demo.id, file, 'video');
                                        e.currentTarget.value = '';
                                      }}
                                      className="text-xs"
                                    />
                                    {uploadingKey === videoUploadKey && <span className="text-xs text-gray-500">上传中...</span>}
                                  </div>
                                  {!!demo.demoVideoUrl && (
                                    <video src={demo.demoVideoUrl} controls className="mt-1 h-24 w-full rounded object-cover" />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </section>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">高级模式用于复杂批量编辑；保存时会自动做结构校验与归一化。</p>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="h-[520px] w-full rounded-xl border border-gray-300 bg-gray-50 p-3 font-mono text-xs leading-6 text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
            {!jsonParseResult.ok && <p className="text-sm text-red-500">JSON 错误：{jsonParseResult.error}</p>}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {saving ? '保存中...' : '保存并发布'}
          </button>
          <button
            onClick={() => void fetchConfig()}
            disabled={loading || saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200"
          >
            重新加载
          </button>
          {loading && <span className="text-sm text-gray-500">加载中...</span>}
        </div>
        {!!message && <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">{message}</p>}
      </div>
    </div>
  );
}
