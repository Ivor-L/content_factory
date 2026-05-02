"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_MONETIZATION_SQUARE_CONFIG,
  DEFAULT_MONETIZATION_SQUARE_KEY,
  type MonetizationSquareConfigPayload,
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

export default function AdminMonetizationSquarePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(true);
  const [name, setName] = useState('默认变现广场');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState(1);
  const [jsonText, setJsonText] = useState(JSON.stringify(DEFAULT_MONETIZATION_SQUARE_CONFIG, null, 2));
  const [message, setMessage] = useState('');

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
      setName(json.data.name || '默认变现广场');
      setDescription(json.data.description || '');
      setPublished(json.data.published !== false);
      setVersion(json.data.version || 1);
      setJsonText(JSON.stringify(json.data.config || DEFAULT_MONETIZATION_SQUARE_CONFIG, null, 2));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const parsedResult = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonText) as MonetizationSquareConfigPayload;
      return { ok: true, parsed, error: '' };
    } catch (error) {
      return {
        ok: false,
        parsed: null,
        error: error instanceof Error ? error.message : 'JSON 格式错误',
      };
    }
  }, [jsonText]);

  const handleSave = async () => {
    if (!token) return;
    if (!parsedResult.ok || !parsedResult.parsed) {
      setMessage(`保存失败：${parsedResult.error}`);
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
          config: parsedResult.parsed,
        }),
      });
      const json = await res.json() as AdminMonetizationResp;
      if (!res.ok || !json.data) {
        throw new Error(json.error || '保存失败');
      }
      setVersion(json.data.version || version + 1);
      setJsonText(JSON.stringify(json.data.config || parsedResult.parsed, null, 2));
      setMessage('保存成功，已更新发布配置。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">变现广场配置</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">在这里维护小程序变现广场的类目、类型、素材、能力跳转和提示词模板。</p>
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

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">JSON 配置</h2>
          <button
            onClick={() => setJsonText(JSON.stringify(DEFAULT_MONETIZATION_SQUARE_CONFIG, null, 2))}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            恢复默认模板
          </button>
        </div>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          className="h-[520px] w-full rounded-xl border border-gray-300 bg-gray-50 p-3 font-mono text-xs leading-6 text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        {!parsedResult.ok && <p className="text-sm text-red-500">JSON 错误：{parsedResult.error}</p>}
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
