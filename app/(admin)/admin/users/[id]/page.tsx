'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Crown, ArrowLeft } from 'lucide-react';

const PLAN_OPTIONS = [
  { value: 'free',       label: 'Free' },
  { value: 'pro',        label: 'Pro' },
  { value: 'studio',     label: 'Studio' },
  { value: 'enterprise', label: 'Enterprise' },
];

type UserDetail = {
  id: string;
  user_no: number | null;
  email: string | null;
  plan: string;
  plan_expires_at: string | null;
  is_admin: boolean;
  api_key: string | null;
  updated_at: string | null;
};

export default function AdminUserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState('free');
  const [expiresAt, setExpiresAt] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/users/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { setError('用户不存在'); setLoading(false); return; }
      const json = await res.json();
      const u: UserDetail = json.data;
      setUser(u);
      setPlan(u.plan ?? 'free');
      setExpiresAt(u.plan_expires_at ? u.plan_expires_at.slice(0, 10) : '');
      setIsAdmin(u.is_admin ?? false);
      setLoading(false);
    };
    load();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const body: Record<string, unknown> = { plan, is_admin: isAdmin };
    body.plan_expires_at = expiresAt ? new Date(expiresAt).toISOString() : null;

    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? '保存失败');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="text-gray-400 py-12 text-center">加载中...</div>;
  }

  if (error && !user) {
    return <div className="text-red-500 py-12 text-center">{error}</div>;
  }

  return (
    <div className="max-w-xl">
      <button
        onClick={() => router.push('/admin')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white mb-6"
      >
        <ArrowLeft size={14} /> 返回列表
      </button>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">编辑用户</h1>
        {user?.is_admin && <Crown size={16} className="text-amber-500" />}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
        {/* Read-only info */}
        <div className="px-5 py-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400 text-xs mb-1">用户编号</p>
            <p className="font-mono text-gray-700 dark:text-gray-200">
              {user?.user_no ? `#${user.user_no}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-1">邮箱</p>
            <p className="text-gray-700 dark:text-gray-200 truncate">{user?.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-1">API Key</p>
            <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
              {user?.api_key ? `${user.api_key.slice(0, 14)}...` : <span className="text-red-400">未绑定</span>}
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-1">最后更新</p>
            <p className="text-gray-500 dark:text-gray-400 text-xs">
              {user?.updated_at ? new Date(user.updated_at).toLocaleString('zh-CN') : '—'}
            </p>
          </div>
        </div>

        {/* Editable fields */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">会员等级</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            >
              {PLAN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">到期时间（留空表示永不过期）</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 flex-1">管理员权限</label>
            <button
              type="button"
              onClick={() => setIsAdmin((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                isAdmin ? 'bg-amber-500' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  isAdmin ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 flex items-center justify-between">
          {error ? (
            <span className="text-sm text-red-500">{error}</span>
          ) : saved ? (
            <span className="text-sm text-green-600">已保存</span>
          ) : (
            <span />
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
