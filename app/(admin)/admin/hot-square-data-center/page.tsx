"use client";

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_HOT_SQUARE_DATA_CENTER_CONFIG,
  HOT_SQUARE_DATA_CENTER_KEY,
  HOT_SQUARE_OPERATIONS_TEMPLATE,
  normalizeHotSquareDataCenterConfig,
  type HotSquareDataCenterConfigPayload,
  type HotSquareCategoryConfig,
} from '@/lib/hotSquareDataCenter';

type AdminResp = {
  data?: {
    key: string;
    name: string;
    description: string | null;
    published: boolean;
    version: number;
    config: HotSquareDataCenterConfigPayload;
  };
  error?: string;
};

function createCategory(): HotSquareCategoryConfig {
  const ts = Date.now().toString(36);
  return {
    id: `category-${ts}`,
    name: '新分类',
    enabled: true,
    collect: {
      keyword: '',
      pages: 1,
      sortType: 'general',
      noteType: '不限',
      timeFilter: '不限',
      source: 'explore_feed',
      aiMode: 0,
    },
  };
}

function ensureCollect(category: HotSquareCategoryConfig) {
  return {
    keyword: category.collect?.keyword || category.name || '',
    pages: category.collect?.pages ?? 1,
    sortType: category.collect?.sortType || 'general',
    noteType: category.collect?.noteType || '不限',
    timeFilter: category.collect?.timeFilter || '不限',
    source: category.collect?.source || 'explore_feed',
    aiMode: category.collect?.aiMode === 1 ? 1 : 0,
  } as const;
}

export default function AdminHotSquareDataCenterPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [name, setName] = useState('爆款数据中心');
  const [published, setPublished] = useState(true);
  const [version, setVersion] = useState(1);
  const [message, setMessage] = useState('');
  const [config, setConfig] = useState<HotSquareDataCenterConfigPayload>(DEFAULT_HOT_SQUARE_DATA_CENTER_CONFIG);

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

  const loadConfig = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/hot-square-data-center?key=${encodeURIComponent(HOT_SQUARE_DATA_CENTER_KEY)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as AdminResp;
      if (!res.ok || !json.data) throw new Error(json.error || '加载失败');
      setName(json.data.name || '爆款数据中心');
      setPublished(json.data.published !== false);
      setVersion(json.data.version || 1);
      setConfig(normalizeHotSquareDataCenterConfig(json.data.config));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const updateCategory = (idx: number, updater: (prev: HotSquareCategoryConfig) => HotSquareCategoryConfig) => {
    setConfig((prev) => ({
      ...prev,
      categories: prev.categories.map((item, i) => (i === idx ? updater(item) : item)),
    }));
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/hot-square-data-center', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          key: HOT_SQUARE_DATA_CENTER_KEY,
          name,
          published,
          config: normalizeHotSquareDataCenterConfig(config),
        }),
      });
      const json = await res.json() as AdminResp;
      if (!res.ok || !json.data) throw new Error(json.error || '保存失败');
      setVersion(json.data.version || version + 1);
      setConfig(normalizeHotSquareDataCenterConfig(json.data.config));
      setMessage('保存成功。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCollect = async (categoryId: string) => {
    if (!token) return;
    setCollectingId(categoryId);
    setMessage('');
    try {
      const res = await fetch('/api/admin/hot-square-data-center/collect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ categoryId }),
      });
      const json = await res.json() as { error?: string; imported?: number; fetched?: number; categoryName?: string };
      if (!res.ok) throw new Error(json.error || '采集失败');
      setMessage(`采集完成：${json.categoryName || categoryId}，抓取 ${json.fetched ?? 0} 条，入库 ${json.imported ?? 0} 条。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '采集失败');
    } finally {
      setCollectingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">爆款数据中心</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">“我的”分类展示用户个人采集；其余分类由后台配置并支持按分类采集。</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">配置名称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">标题</span>
            <input
              value={config.title}
              onChange={(e) => setConfig((prev) => ({ ...prev, title: e.target.value }))}
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
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">分类与采集配置</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfig(normalizeHotSquareDataCenterConfig(HOT_SQUARE_OPERATIONS_TEMPLATE))}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              导入运营模板
            </button>
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, categories: [...prev.categories, createCategory()] }))}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              + 新增分类
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {config.categories.map((category, idx) => (
            <div key={`${category.id}-${idx}`} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">分类 {idx + 1}</div>
                <button
                  type="button"
                  onClick={() => setConfig((prev) => ({
                    ...prev,
                    categories: prev.categories.filter((_, i) => i !== idx),
                  }))}
                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                  删除分类
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs text-gray-600 dark:text-gray-300">分类名称</span>
                  <input
                    value={category.name}
                    onChange={(e) => updateCategory(idx, (prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-gray-600 dark:text-gray-300">分类 ID</span>
                  <input
                    value={category.id}
                    onChange={(e) => updateCategory(idx, (prev) => ({ ...prev, id: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                </label>
                <label className="inline-flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    checked={category.enabled !== false}
                    onChange={(e) => updateCategory(idx, (prev) => ({ ...prev, enabled: e.target.checked }))}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">启用</span>
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs text-gray-600 dark:text-gray-300">采集关键词</span>
                  <input
                    value={category.collect?.keyword || ''}
                    onChange={(e) => updateCategory(idx, (prev) => ({
                      ...prev,
                      collect: { ...ensureCollect(prev), keyword: e.target.value },
                    }))}
                    className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    placeholder="例如：美食推荐"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-gray-600 dark:text-gray-300">分页数（1-5）</span>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={String(category.collect?.pages ?? 1)}
                    onChange={(e) => updateCategory(idx, (prev) => ({
                      ...prev,
                      collect: { ...ensureCollect(prev), pages: Number(e.target.value) || 1 },
                    }))}
                    className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-gray-600 dark:text-gray-300">排序方式</span>
                  <select
                    value={category.collect?.sortType || 'general'}
                    onChange={(e) => updateCategory(idx, (prev) => ({
                      ...prev,
                      collect: { ...ensureCollect(prev), sortType: e.target.value },
                    }))}
                    className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  >
                    <option value="general">综合</option>
                    <option value="time_descending">最新</option>
                    <option value="popularity_descending">点赞最多</option>
                    <option value="comment_descending">评论最多</option>
                    <option value="collect_descending">收藏最多</option>
                    <option value="english_preferred">英文优先</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs text-gray-600 dark:text-gray-300">笔记类型</span>
                  <select
                    value={category.collect?.noteType || '不限'}
                    onChange={(e) => updateCategory(idx, (prev) => ({
                      ...prev,
                      collect: { ...ensureCollect(prev), noteType: e.target.value },
                    }))}
                    className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  >
                    <option value="不限">不限</option>
                    <option value="视频笔记">视频笔记</option>
                    <option value="普通笔记">普通笔记</option>
                    <option value="直播笔记">直播笔记</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-gray-600 dark:text-gray-300">时间筛选</span>
                  <select
                    value={category.collect?.timeFilter || '不限'}
                    onChange={(e) => updateCategory(idx, (prev) => ({
                      ...prev,
                      collect: { ...ensureCollect(prev), timeFilter: e.target.value },
                    }))}
                    className="w-full rounded-md border border-gray-300 px-2.5 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  >
                    <option value="不限">不限</option>
                    <option value="一天内">一天内</option>
                    <option value="一周内">一周内</option>
                    <option value="半年内">半年内</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={collectingId === category.id || loading || saving}
                    onClick={() => void handleCollect(category.id)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200"
                  >
                    {collectingId === category.id ? '采集中...' : '立即采集此分类'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
          <button
            onClick={() => void loadConfig()}
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
