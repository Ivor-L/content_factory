'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Crown, ArrowLeft, Check, Loader2, CalendarDays, ShieldCheck } from 'lucide-react';

const PLAN_OPTIONS = [
  { value: 'free',       label: 'Free',       desc: '免费用户' },
  { value: 'pro',        label: 'Pro',        desc: '专业版' },
  { value: 'studio',     label: 'Studio',     desc: '工作室版' },
  { value: 'enterprise', label: 'Enterprise', desc: '企业版' },
];

const PLAN_COLORS: Record<string, string> = {
  free:       'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  pro:        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  studio:     'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  enterprise: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const DURATION_PRESETS = [
  { label: '7 天',  days: 7 },
  { label: '3 个月', days: 90 },
  { label: '半年',  days: 180 },
  { label: '1 年',  days: 365 },
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
  created_at: string | null;
};

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

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
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    setNowTs(Date.now());
  }, [expiresAt]);
  const expirationInfo = useMemo(() => {
    if (!expiresAt) return null;
    const target = new Date(expiresAt);
    const diffMs = target.getTime() - nowTs;
    const days = Math.max(0, Math.ceil(diffMs / 86_400_000));
    return {
      label: target.toLocaleDateString('zh-CN'),
      days,
    };
  }, [expiresAt, nowTs]);

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

  const applyPreset = (days: number) => {
    // 从当前到期时间延续，或从今天开始
    const base = expiresAt && new Date(expiresAt) > new Date()
      ? new Date(expiresAt)
      : new Date();
    setExpiresAt(addDays(base, days));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const body: Record<string, unknown> = {
      plan,
      is_admin: isAdmin,
      plan_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    };

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
      setTimeout(() => setSaved(false), 2500);
      // refresh local user state
      const json = await res.json();
      if (json.data) {
        setUser((prev) => prev ? { ...prev, ...json.data } : prev);
      }
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        加载中...
      </div>
    );
  }

  if (error && !user) {
    return <div className="text-red-500 py-16 text-center">{error}</div>;
  }

  const isExpired = user?.plan_expires_at && new Date(user.plan_expires_at) < new Date();

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => router.push('/admin')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={14} /> 返回用户列表
      </button>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-base font-bold text-gray-600 dark:text-gray-300">
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">{user?.email ?? '—'}</h1>
              {user?.is_admin && <Crown size={14} className="text-amber-500" />}
            </div>
            <p className="text-sm text-gray-400 font-mono">
              {user?.user_no ? `#${user.user_no}` : '—'}
            </p>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${PLAN_COLORS[user?.plan ?? 'free']}`}>
          {PLAN_OPTIONS.find(p => p.value === user?.plan)?.label ?? 'Free'}
        </span>
      </div>

      <div className="space-y-4">
        {/* Account info card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <CalendarDays size={15} /> 账号信息
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-1">注册时间</p>
              <p className="text-gray-700 dark:text-gray-200">
                {user?.created_at ? new Date(user.created_at).toLocaleString('zh-CN') : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">最后更新</p>
              <p className="text-gray-700 dark:text-gray-200">
                {user?.updated_at ? new Date(user.updated_at).toLocaleString('zh-CN') : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">到期时间</p>
              <p className={user?.plan_expires_at ? (isExpired ? 'text-red-500 font-medium' : 'text-gray-700 dark:text-gray-200') : 'text-gray-300 dark:text-gray-600'}>
                {user?.plan_expires_at
                  ? `${new Date(user.plan_expires_at).toLocaleDateString('zh-CN')}${isExpired ? '（已过期）' : ''}`
                  : '永不过期'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">API Key</p>
              <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
                {user?.api_key
                  ? <span className="text-green-600 dark:text-green-400">已绑定 · {user.api_key.slice(0, 12)}...</span>
                  : <span className="text-red-400">未绑定</span>
                }
              </p>
            </div>
          </div>
        </div>

        {/* Edit card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-5 flex items-center gap-2">
            <ShieldCheck size={15} /> 编辑权限
          </h2>

          <div className="space-y-5">
            {/* Plan */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">会员等级</label>
              <div className="grid grid-cols-4 gap-2">
                {PLAN_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setPlan(o.value)}
                    className={`py-2.5 px-3 rounded-lg border text-center transition-all ${
                      plan === o.value
                        ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-black'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                  >
                    <p className="text-xs font-bold">{o.label}</p>
                    <p className={`text-[10px] mt-0.5 ${plan === o.value ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-600'}`}>{o.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Expiry */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">使用期限</label>
              <div className="flex gap-2 mb-3">
                {DURATION_PRESETS.map((p) => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => applyPreset(p.days)}
                    className="flex-1 py-2 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white transition-all"
                  >
                    +{p.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="flex-1 px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                />
                {expiresAt && (
                  <button
                    type="button"
                    onClick={() => setExpiresAt('')}
                    className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded transition-colors"
                  >
                    清除
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {expiresAt && expirationInfo
                  ? `到期：${expirationInfo.label}（${expirationInfo.days} 天后）`
                  : '留空表示永不过期'}
              </p>
            </div>

            {/* Admin toggle */}
            <div className="flex items-center justify-between py-3 border-t border-gray-100 dark:border-gray-700">
              <div>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">管理员权限</p>
                <p className="text-xs text-gray-400 mt-0.5">开启后可访问管理后台</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAdmin((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  isAdmin ? 'bg-amber-500' : 'bg-gray-200 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    isAdmin ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center justify-between pt-1">
          {error ? (
            <span className="text-sm text-red-500">{error}</span>
          ) : saved ? (
            <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1.5">
              <Check size={14} strokeWidth={2.5} /> 已保存
            </span>
          ) : (
            <span />
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-openclaw flex items-center gap-2 px-6 py-2.5 text-sm font-bold disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.5} />}
            {saving ? '保存中...' : '保存修改'}
          </button>
        </div>
      </div>
    </div>
  );
}
