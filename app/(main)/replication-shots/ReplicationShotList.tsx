'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Loader2, Plus, RefreshCcw } from 'lucide-react';

type TaskRecord = {
  id: string;
  status: string;
  sceneImageUrl?: string | null;
  createdAt?: string;
  script?: { id: string; title: string };
  product?: { id: string | null; name?: string | null };
  character?: { id: string; name?: string | null };
};

type Option = {
  id: string;
  label: string;
};

interface ReplicationShotListProps {
  initialTasks: TaskRecord[];
  scripts: Option[];
  products: Option[];
  characters: Option[];
}

const STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  PENDING: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
  SCENE_GENERATING: { label: '生成场景图', className: 'bg-blue-100 text-blue-700' },
  SCENE_PENDING_CONFIRM: { label: '等待确认', className: 'bg-amber-100 text-amber-800' },
  SHOTS_GENERATING: { label: '生成分镜', className: 'bg-purple-100 text-purple-700' },
  SHOTS_COMPLETED: { label: '分镜完成', className: 'bg-emerald-100 text-emerald-700' },
  VIDEOS_GENERATING: { label: '生成视频', className: 'bg-indigo-100 text-indigo-700' },
  COMPLETED: { label: '已完成', className: 'bg-green-100 text-green-700' },
  FAILED: { label: '失败', className: 'bg-rose-100 text-rose-700' },
};

const formatDate = (value?: string) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    return date.toLocaleString();
  } catch {
    return value;
  }
};

export function ReplicationShotList({
  initialTasks,
  scripts,
  products,
  characters,
}: ReplicationShotListProps) {
  const [tasks, setTasks] = useState<TaskRecord[]>(initialTasks || []);
  const [form, setForm] = useState({
    scriptId: '',
    productId: '',
    characterId: '',
  });
  const [creating, setCreating] = useState(false);

  const scriptOptions = useMemo(() => scripts ?? [], [scripts]);
  const productOptions = useMemo(() => products ?? [], [products]);
  const characterOptions = useMemo(() => characters ?? [], [characters]);

  const handleCreate = async () => {
    if (!form.scriptId) {
      toast.error('请选择脚本');
      return;
    }
    if (!form.characterId) {
      toast.error('请选择人物');
      return;
    }

    setCreating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('请先登录');
        return;
      }

      const res = await fetch('/api/replication-shots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          scriptId: form.scriptId,
          productId: form.productId || undefined,
          characterId: form.characterId,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || '创建任务失败');
      }

      const data = await res.json();
      if (data?.task) {
        setTasks((prev) => [data.task as TaskRecord, ...prev]);
        toast.success('已提交，开始生成场景图');
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : '创建任务失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              分镜控制模式
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              选择脚本 + 产品 + 人物即可创建新的分镜任务。
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-white text-sm font-medium transition-colors',
              'bg-black hover:bg-gray-900 disabled:bg-gray-600'
            )}
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            创建任务
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <SelectField
            label="脚本"
            placeholder="请选择脚本"
            value={form.scriptId}
            onChange={(value) => setForm((prev) => ({ ...prev, scriptId: value }))}
            options={scriptOptions}
          />
          <SelectField
            label="产品 (可选)"
            placeholder="可选产品"
            value={form.productId}
            onChange={(value) => setForm((prev) => ({ ...prev, productId: value }))}
            options={[{ id: '', label: '未选择' }, ...productOptions]}
          />
          <SelectField
            label="人物"
            placeholder="请选择人物"
            value={form.characterId}
            onChange={(value) => setForm((prev) => ({ ...prev, characterId: value }))}
            options={characterOptions}
          />
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">任务列表</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              共 {tasks.length} 条任务
            </p>
          </div>
          <button
            onClick={() => setTasks([...tasks])}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <RefreshCcw className="h-4 w-4" />
            刷新
          </button>
        </div>

        <div className="space-y-3">
          {tasks.map((task) => (
            <article
              key={task.id}
              className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <Link
                    href={`/replication-shots/${task.id}`}
                    className="text-base font-semibold text-gray-900 dark:text-white hover:underline"
                  >
                    {task.script?.title || '未命名脚本'}
                  </Link>
                  <StatusBadge status={task.status} />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  人物：{task.character?.name || '未指定'}
                  {task.product?.name ? ` · 产品：${task.product.name}` : null}
                </p>
                <p className="text-xs text-gray-400">创建于 {formatDate(task.createdAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                {task.sceneImageUrl ? (
                  <img
                    src={task.sceneImageUrl}
                    alt="scene"
                    className="w-20 h-12 object-cover rounded-xl border border-gray-100 dark:border-gray-800"
                  />
                ) : (
                  <div className="w-20 h-12 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-xs text-gray-400 flex items-center justify-center">
                    场景待定
                  </div>
                )}
                <Link
                  href={`/replication-shots/${task.id}`}
                  className="text-sm font-medium text-black dark:text-white hover:underline"
                >
                  查看详情 →
                </Link>
              </div>
            </article>
          ))}

          {tasks.length === 0 && (
            <div className="text-center text-sm text-gray-500 py-16 border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
              暂无分镜任务，创建第一个任务吧。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SelectField({
  label,
  placeholder,
  value,
  onChange,
  options,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
}) {
  return (
    <label className="space-y-2 block">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
          ▾
        </span>
      </div>
    </label>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const meta = (status && STATUS_META[status]) || STATUS_META.PENDING;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
        meta.className
      )}
    >
      {meta.label}
    </span>
  );
}
