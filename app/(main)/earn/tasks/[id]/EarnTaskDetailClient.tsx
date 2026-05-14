'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ClipboardList, Copy, ExternalLink, Loader2, PlugZap, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import type { EarnTask } from '../../types';
import { asRecord, formatDate, formatReward, parsePlatforms, platformLabel } from '../../types';
import { extractMaterialPublishDraft, waitForContentFactoryPlugin } from '../../plugin-client';

type Props = {
  task: EarnTask;
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function EarnTaskDetailClient({ task }: Props) {
  const platforms = useMemo(() => parsePlatforms(task.platforms), [task.platforms]);
  const firstPlatform = platforms[0] || 'xhs';
  const [platform, setPlatform] = useState(firstPlatform);
  const [platformAccountName, setPlatformAccountName] = useState('');
  const [platformUid, setPlatformUid] = useState('');
  const [taskMaterialId, setTaskMaterialId] = useState(task.materials?.[0]?.id || '');
  const [applying, setApplying] = useState(false);
  const [pluginBusy, setPluginBusy] = useState(false);
  const [createdUserTaskId, setCreatedUserTaskId] = useState<string | null>(null);

  const requirements = asRecord(task.requirements);
  const actionConfig = asRecord(task.actionConfig);
  const selectedMaterial = task.materials?.find(material => material.id === taskMaterialId) || task.materials?.[0] || null;

  const applyTask = async () => {
    setApplying(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/earn/tasks/${task.id}/apply`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          platformUid,
          platformAccountName,
          taskMaterialId: taskMaterialId || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '接单失败');
      setCreatedUserTaskId(json.data?.id || null);
      toast.success(json.existing ? '你已经领取过这个任务' : '任务已领取');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '接单失败');
    } finally {
      setApplying(false);
    }
  };

  const copyMaterial = async () => {
    const payload = selectedMaterial?.payload;
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload || {}, null, 2);
    await navigator.clipboard.writeText(text);
    toast.success('素材已复制');
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

      const draft = extractMaterialPublishDraft(selectedMaterial?.payload);
      await plugin.publish({
        platform,
        taskId: task.id,
        title: draft.title || task.title,
        description: draft.description || task.description,
        tags: draft.tags,
        mediaUrls: draft.mediaUrls,
        material: selectedMaterial?.payload,
      });
      toast.success('已打开插件发布辅助');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '插件执行失败');
    } finally {
      setPluginBusy(false);
    }
  };

  const syncPluginAccounts = async () => {
    setPluginBusy(true);
    try {
      const plugin = await waitForContentFactoryPlugin();
      if (!plugin) throw new Error('未检测到浏览器插件，请安装或刷新页面后重试');
      await plugin.syncAccounts();
      toast.success('已触发插件账号同步');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '账号同步失败');
    } finally {
      setPluginBusy(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <main className="space-y-6">
        <Link href="/earn" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-950 dark:hover:text-white">
          <ArrowLeft size={16} />
          返回淘金广场
        </Link>

        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                {(platforms.length ? platforms : ['all']).map(item => (
                  <span key={item} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {item === 'all' ? '全平台' : platformLabel(item)}
                  </span>
                ))}
                {task.requiresPlugin && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                    <PlugZap size={13} />
                    需要插件
                  </span>
                )}
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-gray-950 dark:text-white">{task.title}</h1>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-gray-600 dark:text-gray-300">{task.description}</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-4 text-right dark:bg-amber-950/40">
              <div className="text-xs font-medium text-amber-700 dark:text-amber-300">任务奖励</div>
              <div className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">{formatReward(task.rewardAmount)}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Metric label="截止时间" value={formatDate(task.deadlineAt)} />
            <Metric label="名额" value={`${task.currentParticipants}/${task.maxParticipants || '不限'}`} />
            <Metric label="保留时间" value={task.keepSeconds ? `${Math.round(task.keepSeconds / 3600)} 小时` : '不限制'} />
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-gray-950 dark:text-white">
              <ClipboardList size={18} />
              任务要求
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(requirements).length > 0 ? Object.entries(requirements).map(([key, value]) => (
              <div key={key} className="rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-900">
                <div className="text-xs font-semibold text-gray-500">{key}</div>
                <div className="mt-1 text-gray-900 dark:text-gray-100">{String(value)}</div>
              </div>
            )) : (
              <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-500 dark:bg-gray-900">暂无额外要求</div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-gray-950 dark:text-white">任务素材</h2>
            {selectedMaterial && (
              <button type="button" onClick={copyMaterial} className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">
                <Copy size={15} />
                复制素材
              </button>
            )}
          </div>
          {task.materials && task.materials.length > 1 && (
            <select value={taskMaterialId} onChange={(event) => setTaskMaterialId(event.target.value)} className="mb-3 h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
              {task.materials.map(material => (
                <option key={material.id} value={material.id}>{material.title || material.type}</option>
              ))}
            </select>
          )}
          {selectedMaterial ? (
            <pre className="max-h-[360px] overflow-auto rounded-md bg-gray-950 p-4 text-xs leading-6 text-gray-100">{JSON.stringify(selectedMaterial.payload || {}, null, 2)}</pre>
          ) : (
            <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-900">暂无素材，接单后按任务描述执行。</div>
          )}
        </section>
      </main>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-950 dark:text-white">
            <Send size={18} />
            领取任务
          </h2>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">执行平台</span>
              <select value={platform} onChange={(event) => setPlatform(event.target.value)} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 dark:border-gray-700 dark:bg-gray-900">
                {(platforms.length ? platforms : ['xhs', 'douyin']).map(item => <option key={item} value={item}>{platformLabel(item)}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">账号昵称</span>
              <input value={platformAccountName} onChange={(event) => setPlatformAccountName(event.target.value)} placeholder="用于审核识别" className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 dark:border-gray-700 dark:bg-gray-900" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">平台 UID</span>
              <input value={platformUid} onChange={(event) => setPlatformUid(event.target.value)} placeholder="可为空，插件同步后自动补全" className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 dark:border-gray-700 dark:bg-gray-900" />
            </label>
            <button onClick={applyTask} disabled={applying} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-gray-950 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-950">
              {applying ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              立即领取
            </button>
            {createdUserTaskId && (
              <Link href={`/earn/mine?task=${createdUserTaskId}`} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-gray-200 text-sm font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">
                去提交证据
              </Link>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-950 dark:text-white">
            <ShieldCheck size={18} />
            执行动作
          </h2>
          <div className="mt-3 space-y-2 text-sm">
            {typeof actionConfig.url === 'string' && actionConfig.url.trim() && (
              <a href={actionConfig.url} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 px-3 py-2 font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">
                <ExternalLink size={15} />
                打开任务链接
              </a>
            )}
            <button
              type="button"
              onClick={runPluginPublish}
              disabled={pluginBusy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
            >
              {pluginBusy ? <Loader2 size={15} className="animate-spin" /> : <PlugZap size={15} />}
              用插件发布辅助
            </button>
            <button
              type="button"
              onClick={syncPluginAccounts}
              disabled={pluginBusy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 px-3 py-2 font-medium hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              <ShieldCheck size={15} />
              同步插件账号
            </button>
            <Link href="/earn/mine" className="inline-flex w-full items-center justify-center rounded-md border border-gray-200 px-3 py-2 font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">
              我的淘金任务
            </Link>
          </div>
        </section>
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 font-semibold text-gray-950 dark:text-white">{value}</div>
    </div>
  );
}
