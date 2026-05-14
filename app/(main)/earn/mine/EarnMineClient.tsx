'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, ExternalLink, Loader2, PlugZap, RefreshCw, Send, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import type { EarnUserTask } from '../types';
import { formatReward, parsePlatforms, platformLabel, taskStatusLabel } from '../types';
import { extractMaterialPublishDraft, waitForContentFactoryPlugin } from '../plugin-client';

type Props = {
  initialItems: EarnUserTask[];
};

const STATUSES = [
  { value: '', label: '全部' },
  { value: 'doing', label: '进行中' },
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'cancelled', label: '已取消' },
];

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function EarnMineClient({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeItem = useMemo(
    () => items.find(item => item.id === activeId) || items[0] || null,
    [activeId, items],
  );

  const fetchMine = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/earn/mine?${params.toString()}`, { headers, cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems(json.data || []);
        setActiveId((current) => current && json.data?.some((item: EarnUserTask) => item.id === current) ? current : json.data?.[0]?.id || null);
      }
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchMine();
  }, [fetchMine]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950 dark:text-white">我的淘金任务</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">查看已领取任务，提交发布链接、截图和插件证据。</p>
        </div>
        <div className="flex gap-2">
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
            {STATUSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button onClick={fetchMine} className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            刷新
          </button>
          <Link href="/earn" className="inline-flex h-10 items-center rounded-md bg-gray-950 px-4 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">
            去接任务
          </Link>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="space-y-3">
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              className={`w-full rounded-lg border p-4 text-left transition ${
                activeItem?.id === item.id
                  ? 'border-gray-950 bg-gray-50 dark:border-gray-100 dark:bg-gray-900'
                  : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-gray-500">{platformLabel(item.platform)}</div>
                  <div className="mt-1 line-clamp-2 font-semibold text-gray-950 dark:text-white">{item.task?.title || '任务'}</div>
                </div>
                <StatusPill status={item.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>{formatReward(item.rewardAmount)}</span>
                <span>{new Date(item.updatedAt).toLocaleString('zh-CN')}</span>
              </div>
            </button>
          ))}
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
              暂无任务记录
            </div>
          )}
        </section>

        <section className="min-h-[480px] rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
          {activeItem ? <SubmissionPanel item={activeItem} onSubmitted={fetchMine} /> : (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">选择左侧任务查看详情</div>
          )}
        </section>
      </div>
    </div>
  );
}

function SubmissionPanel({ item, onSubmitted }: { item: EarnUserTask; onSubmitted: () => void }) {
  const [submissionUrl, setSubmissionUrl] = useState(item.submissionUrl || '');
  const [screenshotUrls, setScreenshotUrls] = useState(() => Array.isArray(item.screenshotUrls) ? item.screenshotUrls.join('\n') : '');
  const [pluginEvidence, setPluginEvidence] = useState(() => JSON.stringify(item.pluginEvidence || {}, null, 2));
  const [submitting, setSubmitting] = useState(false);
  const [pluginBusy, setPluginBusy] = useState(false);
  const canSubmit = item.status === 'doing' || item.status === 'rejected';

  const submit = async () => {
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      let evidence = {};
      try {
        evidence = pluginEvidence.trim() ? JSON.parse(pluginEvidence) : {};
      } catch {
        throw new Error('插件证据 JSON 格式不正确');
      }
      const res = await fetch(`/api/earn/mine/${item.id}/submit`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionUrl,
          screenshotUrls: screenshotUrls.split(/\n+/).map(line => line.trim()).filter(Boolean),
          pluginEvidence: evidence,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '提交失败');
      toast.success('已提交审核');
      onSubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/earn/mine/${item.id}/cancel`, { method: 'POST', headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '取消失败');
      toast.success('任务已取消');
      onSubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '取消失败');
    } finally {
      setSubmitting(false);
    }
  };

  const runPluginPublish = async () => {
    setPluginBusy(true);
    try {
      const plugin = await waitForContentFactoryPlugin();
      if (!plugin) throw new Error('未检测到浏览器插件，请安装或刷新页面后重试');
      const status = await plugin.getStatus().catch(() => null);
      if (status && status.ready === false) {
        throw new Error('插件尚未配置 API Key，请先打开插件设置完成配置');
      }
      const draft = extractMaterialPublishDraft(item.taskMaterial?.payload);
      const result = await plugin.publish({
        platform: item.platform,
        taskId: item.taskId,
        title: draft.title || item.task?.title,
        description: draft.description || item.task?.description,
        tags: draft.tags,
        mediaUrls: draft.mediaUrls,
        material: item.taskMaterial?.payload,
      });
      setPluginEvidence(JSON.stringify(result || {}, null, 2));
      toast.success('已打开插件发布辅助');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '插件执行失败');
    } finally {
      setPluginBusy(false);
    }
  };

  const submitPluginAssistedEvidence = async () => {
    setPluginBusy(true);
    try {
      const plugin = await waitForContentFactoryPlugin();
      if (!plugin) throw new Error('未检测到浏览器插件，请安装或刷新页面后重试');
      const status = await plugin.getStatus().catch(() => null);
      if (status && status.ready === false) {
        throw new Error('插件尚未配置 API Key，请先打开插件设置完成配置');
      }
      if (!submissionUrl.trim()) {
        throw new Error('请先填写发布后的作品链接');
      }

      const headers = await getAuthHeaders();
      const evidence = {
        source: 'content_factory_plugin_web_bridge',
        platform: item.platform,
        taskId: item.taskId,
        userTaskId: item.id,
        submissionUrl: submissionUrl.trim(),
        pluginStatus: status,
        capturedAt: new Date().toISOString(),
      };
      const res = await fetch(`/api/earn/mine/${item.id}/submit`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionUrl,
          screenshotUrls: screenshotUrls.split(/\n+/).map(line => line.trim()).filter(Boolean),
          pluginEvidence: evidence,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '提交失败');
      setPluginEvidence(JSON.stringify(evidence, null, 2));
      toast.success('已提交插件辅助证据');
      onSubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '插件辅助提交失败');
    } finally {
      setPluginBusy(false);
    }
  };

  const platforms = parsePlatforms(item.task?.platforms);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-gray-800 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            {(platforms.length ? platforms : [item.platform]).map(platform => (
              <span key={platform} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{platformLabel(platform)}</span>
            ))}
          </div>
          <h2 className="mt-3 text-xl font-bold text-gray-950 dark:text-white">{item.task?.title}</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{item.task?.description}</p>
        </div>
        <StatusPill status={item.status} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="奖励" value={formatReward(item.rewardAmount)} />
        <Metric label="账号" value={item.platformAccountName || item.platformUid || '未填写'} />
        <Metric label="状态" value={taskStatusLabel(item.status)} />
      </div>

      {item.taskMaterial && (
        <div>
          <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">领取素材</div>
          <pre className="max-h-52 overflow-auto rounded-md bg-gray-950 p-4 text-xs leading-6 text-gray-100">{JSON.stringify(item.taskMaterial.payload || {}, null, 2)}</pre>
        </div>
      )}

      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">发布/执行链接</span>
          <input value={submissionUrl} onChange={(event) => setSubmissionUrl(event.target.value)} disabled={!canSubmit} placeholder="https://..." className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-800" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">截图链接，每行一个</span>
          <textarea value={screenshotUrls} onChange={(event) => setScreenshotUrls(event.target.value)} disabled={!canSubmit} rows={3} className="w-full rounded-md border border-gray-200 bg-white p-3 disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-800" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">插件证据 JSON</span>
          <textarea value={pluginEvidence} onChange={(event) => setPluginEvidence(event.target.value)} disabled={!canSubmit} rows={5} className="w-full rounded-md border border-gray-200 bg-white p-3 font-mono text-xs disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-800" />
        </label>
      </div>

      {item.reviewNote && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          审核备注：{item.reviewNote}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={runPluginPublish}
          disabled={!canSubmit || submitting || pluginBusy}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
        >
          {pluginBusy ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />}
          插件发布辅助
        </button>
        <button
          onClick={submitPluginAssistedEvidence}
          disabled={!canSubmit || submitting || pluginBusy}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 px-4 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          <ClipboardCheck size={16} />
          插件辅助提交
        </button>
        <button onClick={submit} disabled={!canSubmit || submitting} className="inline-flex h-10 items-center gap-2 rounded-md bg-gray-950 px-4 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-950">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          提交审核
        </button>
        {item.status === 'doing' && (
          <button onClick={cancel} disabled={submitting} className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 px-4 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-900">
            <XCircle size={16} />
            取消任务
          </button>
        )}
        {item.submissionUrl && (
          <a href={item.submissionUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 px-4 text-sm font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">
            <ExternalLink size={16} />
            打开提交链接
          </a>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const approved = status === 'approved' || status === 'rewarded';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
      approved
        ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300'
        : status === 'rejected'
          ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
    }`}>
      {approved ? <CheckCircle2 size={13} /> : <ClipboardCheck size={13} />}
      {taskStatusLabel(status)}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-900">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 truncate font-semibold text-gray-950 dark:text-white">{value}</div>
    </div>
  );
}
