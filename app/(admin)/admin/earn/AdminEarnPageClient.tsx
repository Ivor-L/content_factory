'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ClipboardList, Loader2, Plus, RefreshCw, Save, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import type { EarnTask, EarnTaskMaterial, EarnUserTask } from '@/app/(main)/earn/types';
import { formatReward, parsePlatforms, platformLabel, taskStatusLabel } from '@/app/(main)/earn/types';

type TaskForm = {
  title: string;
  description: string;
  type: string;
  status: string;
  platforms: string;
  rewardAmount: string;
  maxParticipants: string;
  deadlineAt: string;
  requiresPlugin: boolean;
  requirements: string;
  actionConfig: string;
};

const EMPTY_FORM: TaskForm = {
  title: '',
  description: '',
  type: 'publish',
  status: 'draft',
  platforms: 'xhs',
  rewardAmount: '0',
  maxParticipants: '0',
  deadlineAt: '',
  requiresPlugin: false,
  requirements: '{}',
  actionConfig: '{}',
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function AdminEarnPageClient() {
  const [tasks, setTasks] = useState<EarnTask[]>([]);
  const [submissions, setSubmissions] = useState<EarnUserTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [materialPayload, setMaterialPayload] = useState('{\n  "title": "",\n  "content": "",\n  "tags": []\n}');
  const [materialTitle, setMaterialTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const selectedTask = useMemo(() => tasks.find(task => task.id === selectedTaskId) || null, [selectedTaskId, tasks]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [taskRes, submissionRes] = await Promise.all([
        fetch('/api/admin/earn/tasks?pageSize=100', { headers, cache: 'no-store' }),
        fetch('/api/admin/earn/submissions?pageSize=50&status=pending', { headers, cache: 'no-store' }),
      ]);
      const [taskJson, submissionJson] = await Promise.all([
        taskRes.json().catch(() => ({})),
        submissionRes.json().catch(() => ({})),
      ]);
      if (taskRes.ok) {
        setTasks(taskJson.data || []);
        setSelectedTaskId((current) => current || taskJson.data?.[0]?.id || null);
      }
      if (submissionRes.ok) setSubmissions(submissionJson.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedTask) {
      setForm(EMPTY_FORM);
      return;
    }
    setForm({
      title: selectedTask.title,
      description: selectedTask.description,
      type: selectedTask.type,
      status: selectedTask.status,
      platforms: parsePlatforms(selectedTask.platforms).join(','),
      rewardAmount: String(selectedTask.rewardAmount),
      maxParticipants: String(selectedTask.maxParticipants),
      deadlineAt: selectedTask.deadlineAt ? selectedTask.deadlineAt.slice(0, 16) : '',
      requiresPlugin: selectedTask.requiresPlugin,
      requirements: JSON.stringify(selectedTask.requirements || {}, null, 2),
      actionConfig: JSON.stringify(selectedTask.actionConfig || {}, null, 2),
    });
  }, [selectedTask]);

  const saveTask = async () => {
    setSaving(true);
    try {
      let requirements = {};
      let actionConfig = {};
      try {
        requirements = form.requirements.trim() ? JSON.parse(form.requirements) : {};
        actionConfig = form.actionConfig.trim() ? JSON.parse(form.actionConfig) : {};
      } catch {
        throw new Error('JSON 配置格式错误');
      }
      const headers = await getAuthHeaders();
      const payload = {
        ...form,
        platforms: form.platforms.split(',').map(item => item.trim()).filter(Boolean),
        rewardAmount: Number(form.rewardAmount),
        maxParticipants: Number(form.maxParticipants),
        deadlineAt: form.deadlineAt || null,
        requirements,
        actionConfig,
      };
      const res = await fetch(selectedTask ? `/api/admin/earn/tasks/${selectedTask.id}` : '/api/admin/earn/tasks', {
        method: selectedTask ? 'PATCH' : 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '保存失败');
      toast.success('任务已保存');
      setSelectedTaskId(json.data?.id || selectedTaskId);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const addMaterial = async () => {
    if (!selectedTask) return;
    setSaving(true);
    try {
      let payload = {};
      try {
        payload = materialPayload.trim() ? JSON.parse(materialPayload) : {};
      } catch {
        throw new Error('素材 JSON 格式错误');
      }
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/earn/tasks/${selectedTask.id}/materials`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: materialTitle,
          type: 'mixed',
          payload,
          enabled: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || '素材保存失败');
      toast.success('素材已添加');
      setMaterialTitle('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '素材保存失败');
    } finally {
      setSaving(false);
    }
  };

  const review = async (id: string, action: 'approve' | 'reject') => {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/earn/submissions/${id}/${action}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewNote: action === 'approve' ? '审核通过' : '请补充有效链接或截图' }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error || '审核失败');
      return;
    }
    toast.success(action === 'approve' ? '已通过' : '已拒绝');
    await load();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-950 dark:text-white">淘金任务运营台</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">创建任务、配置素材、审核用户提交。</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setSelectedTaskId(null); setForm(EMPTY_FORM); }} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
            <Plus size={16} />
            新建任务
          </button>
          <button onClick={load} className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            刷新
          </button>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
        <section className="space-y-3">
          {tasks.map(task => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedTaskId(task.id)}
              className={`w-full rounded-lg border p-4 text-left ${
                selectedTaskId === task.id
                  ? 'border-gray-950 bg-white dark:border-white dark:bg-gray-800'
                  : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-gray-500">{parsePlatforms(task.platforms).map(platformLabel).join(' / ') || '全平台'}</div>
                  <div className="mt-1 line-clamp-2 font-semibold text-gray-950 dark:text-white">{task.title}</div>
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium dark:bg-gray-700">{taskStatusLabel(task.status)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>{formatReward(task.rewardAmount)}</span>
                <span>素材 {task._count?.materials || 0}</span>
              </div>
            </button>
          ))}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 flex items-center gap-2 font-bold text-gray-950 dark:text-white">
            <ClipboardList size={18} />
            {selectedTask ? '编辑任务' : '新建任务'}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="标题" value={form.title} onChange={(value) => setForm(prev => ({ ...prev, title: value }))} className="md:col-span-2" />
            <label className="md:col-span-2 text-sm">
              <span className="mb-1 block font-medium">描述</span>
              <textarea value={form.description} onChange={(event) => setForm(prev => ({ ...prev, description: event.target.value }))} rows={4} className="w-full rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-950" />
            </label>
            <Field label="类型" value={form.type} onChange={(value) => setForm(prev => ({ ...prev, type: value }))} />
            <label className="text-sm">
              <span className="mb-1 block font-medium">状态</span>
              <select value={form.status} onChange={(event) => setForm(prev => ({ ...prev, status: event.target.value }))} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 dark:border-gray-700 dark:bg-gray-950">
                {['draft', 'active', 'paused', 'archived'].map(status => <option key={status} value={status}>{taskStatusLabel(status)}</option>)}
              </select>
            </label>
            <Field label="平台，逗号分隔" value={form.platforms} onChange={(value) => setForm(prev => ({ ...prev, platforms: value }))} />
            <Field label="奖励，分" value={form.rewardAmount} onChange={(value) => setForm(prev => ({ ...prev, rewardAmount: value }))} />
            <Field label="最大人数" value={form.maxParticipants} onChange={(value) => setForm(prev => ({ ...prev, maxParticipants: value }))} />
            <label className="text-sm">
              <span className="mb-1 block font-medium">截止时间</span>
              <input type="datetime-local" value={form.deadlineAt} onChange={(event) => setForm(prev => ({ ...prev, deadlineAt: event.target.value }))} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 dark:border-gray-700 dark:bg-gray-950" />
            </label>
            <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
              <input type="checkbox" checked={form.requiresPlugin} onChange={(event) => setForm(prev => ({ ...prev, requiresPlugin: event.target.checked }))} />
              需要浏览器插件
            </label>
            <label className="md:col-span-2 text-sm">
              <span className="mb-1 block font-medium">任务要求 JSON</span>
              <textarea value={form.requirements} onChange={(event) => setForm(prev => ({ ...prev, requirements: event.target.value }))} rows={5} className="w-full rounded-md border border-gray-200 bg-white p-3 font-mono text-xs dark:border-gray-700 dark:bg-gray-950" />
            </label>
            <label className="md:col-span-2 text-sm">
              <span className="mb-1 block font-medium">动作配置 JSON</span>
              <textarea value={form.actionConfig} onChange={(event) => setForm(prev => ({ ...prev, actionConfig: event.target.value }))} rows={4} className="w-full rounded-md border border-gray-200 bg-white p-3 font-mono text-xs dark:border-gray-700 dark:bg-gray-950" />
            </label>
          </div>
          <button onClick={saveTask} disabled={saving} className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-gray-950 px-4 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-950">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            保存任务
          </button>

          {selectedTask && (
            <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
              <h3 className="mb-3 font-semibold">任务素材</h3>
              <div className="space-y-2">
                {(selectedTask.materials as EarnTaskMaterial[] | undefined)?.map(material => (
                  <div key={material.id} className="rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-950">
                    <div className="font-medium">{material.title || material.type}</div>
                    <div className="mt-1 text-xs text-gray-500">使用 {material.usedCount} 次</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                <Field label="素材标题" value={materialTitle} onChange={setMaterialTitle} />
                <textarea value={materialPayload} onChange={(event) => setMaterialPayload(event.target.value)} rows={5} className="w-full rounded-md border border-gray-200 bg-white p-3 font-mono text-xs dark:border-gray-700 dark:bg-gray-950" />
                <button onClick={addMaterial} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-800">
                  <Plus size={15} />
                  添加素材
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="mb-4 font-bold text-gray-950 dark:text-white">待审核提交</h2>
          <div className="space-y-3">
            {submissions.map(item => (
              <div key={item.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-950 dark:text-white">{item.task?.title}</div>
                    <div className="mt-1 text-xs text-gray-500">{platformLabel(item.platform)} · {item.platformAccountName || item.platformUid || '未填账号'}</div>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-700">{taskStatusLabel(item.status)}</span>
                </div>
                {item.submissionUrl && (
                  <a href={item.submissionUrl} target="_blank" rel="noreferrer" className="mt-3 block truncate text-sm text-blue-600 hover:underline dark:text-blue-300">{item.submissionUrl}</a>
                )}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => review(item.id, 'approve')} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-green-600 px-3 text-sm font-semibold text-white">
                    <Check size={15} />
                    通过
                  </button>
                  <button onClick={() => review(item.id, 'reject')} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-600 px-3 text-sm font-semibold text-white">
                    <X size={15} />
                    拒绝
                  </button>
                </div>
              </div>
            ))}
            {submissions.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
                暂无待审核提交
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, className = '' }: { label: string; value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <label className={`text-sm ${className}`}>
      <span className="mb-1 block font-medium">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 dark:border-gray-700 dark:bg-gray-950" />
    </label>
  );
}
