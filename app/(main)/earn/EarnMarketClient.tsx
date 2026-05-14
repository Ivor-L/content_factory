'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, CheckCircle2, Clock, Filter, Gift, Loader2, PlugZap, Search, Send, WalletCards } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { EarnTask } from './types';
import { formatDate, formatReward, parsePlatforms, platformLabel } from './types';

type Props = {
  initialTasks: EarnTask[];
  initialTotal: number;
};

const TASK_TYPES = [
  { value: '', label: '全部类型' },
  { value: 'publish', label: '发布任务' },
  { value: 'collect', label: '采集任务' },
  { value: 'interaction', label: '互动任务' },
  { value: 'promotion', label: '推广任务' },
];

const PLATFORMS = [
  { value: '', label: '全部平台' },
  { value: 'xhs', label: '小红书' },
  { value: 'douyin', label: '抖音' },
];

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function EarnMarketClient({ initialTasks, initialTotal }: Props) {
  const [tasks, setTasks] = useState(initialTasks);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [platform, setPlatform] = useState('');
  const [loading, setLoading] = useState(false);

  const stats = useMemo(() => {
    const reward = tasks.reduce((sum, task) => sum + task.rewardAmount, 0);
    const pluginCount = tasks.filter(task => task.requiresPlugin).length;
    return { reward, pluginCount };
  }, [tasks]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (type) params.set('type', type);
      if (platform) params.set('platform', platform);
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/earn/tasks?${params.toString()}`, { headers, cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setTasks(json.data || []);
        setTotal(json.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [platform, query, type]);

  useEffect(() => {
    const timer = window.setTimeout(fetchTasks, 250);
    return () => window.clearTimeout(timer);
  }, [fetchTasks]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 dark:border-gray-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300">
            <BriefcaseBusiness size={14} />
            淘金广场
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950 dark:text-white">任务市场</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            领取平台任务、分发素材、提交链接或插件证据，形成从内容执行到审核奖励的闭环。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Stat icon={Send} label="可接任务" value={`${total}`} />
          <Stat icon={WalletCards} label="当前奖励池" value={formatReward(stats.reward)} />
          <Stat icon={PlugZap} label="插件任务" value={`${stats.pluginCount}`} />
        </div>
      </header>

      <section className="grid gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950 sm:grid-cols-[1fr_160px_160px_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索任务标题、要求"
            className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:focus:border-gray-100"
          />
        </label>
        <select value={type} onChange={(event) => setType(event.target.value)} className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
          {TASK_TYPES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select value={platform} onChange={(event) => setPlatform(event.target.value)} className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
          {PLATFORMS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <button
          type="button"
          onClick={fetchTasks}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-gray-950 px-4 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Filter size={16} />}
          筛选
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} />
        ))}
      </section>

      {tasks.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500 dark:border-gray-700">
          暂无符合条件的任务
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Send; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <Icon size={14} />
        {label}
      </div>
      <div className="mt-1 truncate text-base font-bold text-gray-950 dark:text-white">{value}</div>
    </div>
  );
}

function TaskCard({ task }: { task: EarnTask }) {
  const platforms = parsePlatforms(task.platforms);
  const isFull = task.maxParticipants > 0 && task.currentParticipants >= task.maxParticipants;
  return (
    <article className="flex min-h-[260px] flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {(platforms.length ? platforms : ['all']).map(item => (
              <span key={item} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {item === 'all' ? '全平台' : platformLabel(item)}
              </span>
            ))}
            {task.requiresPlugin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                <PlugZap size={12} />
                插件
              </span>
            )}
          </div>
          <h2 className="mt-3 line-clamp-2 text-lg font-bold text-gray-950 dark:text-white">{task.title}</h2>
        </div>
        <div className="shrink-0 rounded-lg bg-amber-50 px-3 py-2 text-right dark:bg-amber-950/40">
          <div className="text-xs text-amber-700 dark:text-amber-300">奖励</div>
          <div className="font-bold text-amber-800 dark:text-amber-200">{formatReward(task.rewardAmount)}</div>
        </div>
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-6 text-gray-500 dark:text-gray-400">{task.description}</p>

      <div className="mt-auto space-y-3 pt-5">
        <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
          <Info icon={Clock} text={formatDate(task.deadlineAt)} />
          <Info icon={Gift} text={`${task.currentParticipants}/${task.maxParticipants || '不限'}`} />
          <Info icon={CheckCircle2} text={isFull ? '已满' : '可领取'} />
        </div>
        <Link
          href={`/earn/tasks/${task.id}`}
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-gray-950 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950"
        >
          查看并接单
        </Link>
      </div>
    </article>
  );
}

function Info({ icon: Icon, text }: { icon: typeof Clock; text: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-md bg-gray-50 px-2 py-1.5 dark:bg-gray-900">
      <Icon size={13} className="shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
}
