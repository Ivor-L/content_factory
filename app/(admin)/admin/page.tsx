'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Search, ChevronLeft, ChevronRight, Crown, Users, X,
  Check, Loader2, CalendarDays, ShieldCheck, MessageSquare,
  UserPlus, Zap, ChevronDown, ChevronUp, History,
} from 'lucide-react';

const PLAN_OPTIONS = [
  { value: 'free',       label: 'Free' },
  { value: 'pro',        label: 'Pro' },
  { value: 'studio',     label: 'Studio' },
  { value: 'enterprise', label: 'Enterprise' },
];
const PLAN_COLORS: Record<string, string> = {
  free:       'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  pro:        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  studio:     'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  enterprise: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};
const DURATION_PRESETS = [
  { label: '+7天',  days: 7 },
  { label: '+3月',  days: 90 },
  { label: '+半年', days: 180 },
  { label: '+1年',  days: 365 },
];

type ListUser = {
  id: string;
  user_no: number | null;
  email: string | null;
  plan: string;
  plan_expires_at: string | null;
  is_admin: boolean;
  api_key: string | null;
};

type UserDetail = ListUser & {
  updated_at: string | null;
  created_at: string | null;
  notes: string | null;
  referred_by: string | null;
  referral_count: number;
  referrer: { id: string; user_no: number | null; email: string | null } | null;
};

type CreditsStats = {
  balance: number | null;
  totalConsumed: number | null;
  monthConsumed: number | null;
  events: Array<{ id: string; amount: number; reason: string; created_at: string }> | null;
};

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('zh-CN');
}
function fmtFull(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN');
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [users, setUsers] = useState<ListUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [credits, setCredits] = useState<CreditsStats | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  // Edit state
  const [plan, setPlan] = useState('free');
  const [expiresAt, setExpiresAt] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [notes, setNotes] = useState('');
  const [referredByInput, setReferredByInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Referral list expand
  const [showReferrals, setShowReferrals] = useState(false);
  const [referrals, setReferrals] = useState<ListUser[] | null>(null);
  const [referralsLoading, setReferralsLoading] = useState(false);

  // History expand
  const [showHistory, setShowHistory] = useState(false);

  const sessionRef = useRef<string | null>(null);

  const getToken = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;
    const { data: { session } } = await supabase.auth.getSession();
    sessionRef.current = session?.access_token ?? null;
    return sessionRef.current;
  }, []);

  // ── fetch table ──────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async (query: string, p: number) => {
    setLoading(true);
    const token = await getToken();
    if (!token) return;
    const params = new URLSearchParams({ page: String(p) });
    if (query) params.set('q', query);
    const res = await fetch(`/api/admin/users?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setUsers(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [getToken]);

  useEffect(() => { fetchUsers(q, page); }, [fetchUsers, q, page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers(q, 1);
  };

  // ── open drawer ──────────────────────────────────────────────────────────
  const openDrawer = useCallback(async (userId: string) => {
    setSelectedId(userId);
    setDetail(null);
    setCredits(null);
    setSaved(false);
    setSaveError(null);
    setShowReferrals(false);
    setReferrals(null);
    setShowHistory(false);
    setDetailLoading(true);

    const token = await getToken();
    if (!token) return;

    const res = await fetch(`/api/admin/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setSaveError(res.status === 403 ? '无管理员权限' : '用户数据加载失败');
      setDetailLoading(false);
      return;
    }
    const json = await res.json();
    const d: UserDetail = json.data;
    setDetail(d);
    setPlan(d.plan ?? 'free');
    setExpiresAt(d.plan_expires_at ? d.plan_expires_at.slice(0, 10) : '');
    setIsAdmin(d.is_admin ?? false);
    setNotes(d.notes ?? '');
    setReferredByInput(d.referred_by ?? '');
    setDetailLoading(false);

    // Load credits stats async
    setCreditsLoading(true);
    fetch(`/api/admin/users/${userId}/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : null).then(data => {
      if (data) setCredits(data);
    }).finally(() => setCreditsLoading(false));
  }, [getToken]);

  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setCredits(null);
    setSaved(false);
    setSaveError(null);
  }, []);

  // ── load referrals ───────────────────────────────────────────────────────
  const loadReferrals = useCallback(async () => {
    if (!selectedId) return;
    setReferralsLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/admin/users?referredBy=${selectedId}`, {
      headers: { Authorization: `Bearer ${token!}` },
    });
    if (res.ok) {
      const json = await res.json();
      setReferrals(json.data ?? []);
    }
    setReferralsLoading(false);
  }, [selectedId, getToken]);

  const toggleReferrals = () => {
    const next = !showReferrals;
    setShowReferrals(next);
    if (next && !referrals) loadReferrals();
  };

  // ── save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    setSaveError(null);
    const token = await getToken();
    if (!token) return;

    const body: Record<string, unknown> = {
      plan,
      is_admin: isAdmin,
      notes: notes || null,
      plan_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    };

    // referred_by: if changed, send new value (can be user_no or UUID or empty)
    const originalReferredBy = detail?.referred_by ?? '';
    if (referredByInput !== originalReferredBy) {
      body.referred_by = referredByInput.trim() || null;
    }

    const res = await fetch(`/api/admin/users/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setSaveError(json.error ?? '保存失败');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Update list row
      setUsers(prev => prev.map(u => u.id === selectedId ? { ...u, plan, is_admin: isAdmin, plan_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null } : u));
      // Refresh detail
      const updatedDetail: UserDetail = { ...detail!, ...json.data };
      setDetail(updatedDetail);
    }
    setSaving(false);
  };

  const applyPreset = (days: number) => {
    const base = expiresAt && new Date(expiresAt) > new Date() ? new Date(expiresAt) : new Date();
    setExpiresAt(addDays(base, days));
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-black dark:bg-white flex items-center justify-center">
            <Users size={18} className="text-white dark:text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">用户管理</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">共 {total} 位用户</p>
          </div>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索邮箱..."
              className="pl-9 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white w-64"
            />
          </div>
          <button type="submit" className="px-4 py-2.5 text-sm bg-black dark:bg-white text-white dark:text-black rounded-lg font-semibold hover:opacity-90">
            搜索
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
            <tr>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">用户</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">等级</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">到期时间</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">API Key</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />加载中...
                </div>
              </td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">暂无用户</td></tr>
            ) : users.map((user) => {
              const planInfo = PLAN_OPTIONS.find(p => p.value === user.plan);
              const isExpired = user.plan_expires_at && new Date(user.plan_expires_at) < new Date();
              const isSelected = user.id === selectedId;
              return (
                <tr
                  key={user.id}
                  className={`transition-colors cursor-pointer ${isSelected ? 'bg-gray-50 dark:bg-gray-700/30' : 'hover:bg-gray-50/80 dark:hover:bg-gray-700/20'}`}
                  onClick={() => openDrawer(user.id)}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 shrink-0">
                        {user.email?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-gray-400">
                            {user.user_no ? `#${user.user_no}` : '—'}
                          </span>
                          {user.is_admin && <Crown size={11} className="text-amber-500" />}
                        </div>
                        <p className="text-sm text-gray-900 dark:text-white truncate max-w-[220px]">{user.email ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${PLAN_COLORS[user.plan] ?? PLAN_COLORS.free}`}>
                      {planInfo?.label ?? 'Free'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {user.plan_expires_at ? (
                      <span className={`text-sm ${isExpired ? 'text-red-500 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                        {new Date(user.plan_expires_at).toLocaleDateString('zh-CN')}
                        {isExpired && <span className="ml-1 text-xs bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">已过期</span>}
                      </span>
                    ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    {user.api_key
                      ? <span className="font-mono text-xs text-gray-400">{user.api_key.slice(0, 12)}...</span>
                      : <span className="text-xs text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">未绑定</span>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); openDrawer(user.id); }}
                      className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 px-1">
        <span className="text-sm text-gray-400">第 {page} 页 · 每页 20 条</span>
        <div className="flex gap-1.5">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
            <ChevronLeft size={14} /> 上一页
          </button>
          <button onClick={() => setPage(p => p + 1)} disabled={users.length < 20}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
            下一页 <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ─── Drawer ────────────────────────────────────────────────────────── */}
      {selectedId && (
        <div className="fixed inset-0 z-40 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={closeDrawer} />

          {/* Panel */}
          <div className="relative z-50 w-full max-w-[520px] h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              {detail ? (
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300 shrink-0">
                    {detail.email?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{detail.email}</p>
                      {detail.is_admin && <Crown size={13} className="text-amber-500 shrink-0" />}
                    </div>
                    <p className="text-xs text-gray-400 font-mono">{detail.user_no ? `#${detail.user_no}` : '—'}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-semibold text-gray-900 dark:text-white">用户详情</p>
              )}
              <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto">
              {detailLoading ? (
                <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />加载中...
                </div>
              ) : saveError && !detail ? (
                <div className="px-6 py-12 text-center text-red-500 text-sm">{saveError}</div>
              ) : detail ? (
                <div className="px-6 py-5 space-y-5">

                  {/* ── Stats Cards ── */}
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard
                      label="成功推荐"
                      value={`${detail.referral_count} 人`}
                      icon={<UserPlus size={14} />}
                    />
                    <StatCard
                      label="积分余额"
                      value={creditsLoading ? '…' : credits?.balance != null ? String(credits.balance) : '—'}
                      icon={<Zap size={14} />}
                    />
                    <StatCard
                      label="本月消耗"
                      value={creditsLoading ? '…' : credits?.monthConsumed != null ? String(credits.monthConsumed) : '—'}
                      icon={<History size={14} />}
                    />
                  </div>

                  {/* ── 账号信息 ── */}
                  <Section title="账号信息" icon={<CalendarDays size={14} />}>
                    <InfoGrid>
                      <InfoItem label="注册时间" value={fmtFull(detail.created_at)} />
                      <InfoItem label="最后更新" value={fmtFull(detail.updated_at)} />
                      <InfoItem
                        label="到期时间"
                        value={detail.plan_expires_at
                          ? `${fmt(detail.plan_expires_at)}${new Date(detail.plan_expires_at) < new Date() ? '（已过期）' : ''}`
                          : '永不过期'}
                        danger={!!(detail.plan_expires_at && new Date(detail.plan_expires_at) < new Date())}
                      />
                      <InfoItem
                        label="API Key"
                        value={detail.api_key ? `已绑定 · ${detail.api_key.slice(0, 12)}…` : '未绑定'}
                        success={!!detail.api_key}
                        danger={!detail.api_key}
                      />
                    </InfoGrid>
                  </Section>

                  {/* ── 积分消耗 ── */}
                  <Section title="积分消耗" icon={<Zap size={14} />}>
                    <InfoGrid>
                      <InfoItem
                        label="总消耗"
                        value={creditsLoading ? '…' : credits?.totalConsumed != null ? String(credits.totalConsumed) : '—'}
                      />
                      <InfoItem
                        label="本月消耗"
                        value={creditsLoading ? '…' : credits?.monthConsumed != null ? String(credits.monthConsumed) : '—'}
                      />
                    </InfoGrid>
                    {/* Usage history */}
                    <button
                      onClick={() => setShowHistory(v => !v)}
                      className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      <History size={12} />
                      查看历史消耗记录
                      {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {showHistory && (
                      <div className="mt-2 rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                        {!credits?.events || credits.events.length === 0 ? (
                          <p className="text-xs text-gray-400 px-4 py-3">
                            {credits?.events === null
                              ? '积分系统暂未开放历史记录接口'
                              : '暂无消耗记录'}
                          </p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                              <tr>
                                <th className="text-left px-3 py-2 text-gray-500">时间</th>
                                <th className="text-left px-3 py-2 text-gray-500">原因</th>
                                <th className="text-right px-3 py-2 text-gray-500">消耗</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                              {credits.events.map((ev) => (
                                <tr key={ev.id}>
                                  <td className="px-3 py-2 text-gray-500">{fmt(ev.created_at)}</td>
                                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{ev.reason}</td>
                                  <td className="px-3 py-2 text-right text-red-500">-{ev.amount}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </Section>

                  {/* ── 推荐关系 ── */}
                  <Section title="推荐关系" icon={<UserPlus size={14} />}>
                    <div className="space-y-2 text-sm">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">推荐人</p>
                        {detail.referrer ? (
                          <p className="text-gray-700 dark:text-gray-200">
                            {detail.referrer.email ?? '—'}
                            {detail.referrer.user_no && (
                              <span className="ml-2 font-mono text-xs text-gray-400">#{detail.referrer.user_no}</span>
                            )}
                          </p>
                        ) : (
                          <p className="text-gray-400">无</p>
                        )}
                      </div>
                      <button
                        onClick={toggleReferrals}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                      >
                        <Users size={12} />
                        已推荐 {detail.referral_count} 人
                        {showReferrals ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      {showReferrals && (
                        <div className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                          {referralsLoading ? (
                            <p className="text-xs text-gray-400 px-4 py-3">加载中...</p>
                          ) : !referrals || referrals.length === 0 ? (
                            <p className="text-xs text-gray-400 px-4 py-3">暂无推荐用户</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                  <th className="text-left px-3 py-2 text-gray-500">用户</th>
                                  <th className="text-left px-3 py-2 text-gray-500">等级</th>
                                  <th className="text-left px-3 py-2 text-gray-500">注册时间</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                                {referrals.map((r) => (
                                  <tr key={r.id}>
                                    <td className="px-3 py-2">
                                      <p className="text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{r.email ?? '—'}</p>
                                      <p className="text-gray-400 font-mono">{r.user_no ? `#${r.user_no}` : ''}</p>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${PLAN_COLORS[r.plan] ?? PLAN_COLORS.free}`}>
                                        {PLAN_OPTIONS.find(p => p.value === r.plan)?.label ?? 'Free'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-gray-500">—</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  </Section>

                  {/* ── 编辑 ── */}
                  <Section title="编辑权限" icon={<ShieldCheck size={14} />}>
                    <div className="space-y-4">
                      {/* Plan */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-2">会员等级</label>
                        <div className="grid grid-cols-4 gap-2">
                          {PLAN_OPTIONS.map((o) => (
                            <button key={o.value} type="button" onClick={() => setPlan(o.value)}
                              className={`py-2.5 rounded-lg border text-center transition-all ${
                                plan === o.value
                                  ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-black'
                                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                              }`}>
                              <p className="text-xs font-bold">{o.label}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Expiry */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-2">使用期限</label>
                        <div className="flex gap-2 mb-2">
                          {DURATION_PRESETS.map((p) => (
                            <button key={p.days} type="button" onClick={() => applyPreset(p.days)}
                              className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white transition-all">
                              {p.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2 items-center">
                          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white" />
                          {expiresAt && (
                            <button type="button" onClick={() => setExpiresAt('')}
                              className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded">清除</button>
                          )}
                        </div>
                        {expiresAt && (
                          <p className="text-xs text-gray-400 mt-1">
                            到期 {new Date(expiresAt).toLocaleDateString('zh-CN')}
                            （{Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)} 天后）
                          </p>
                        )}
                      </div>

                      {/* Admin toggle */}
                      <div className="flex items-center justify-between py-3 border-t border-gray-100 dark:border-gray-800">
                        <div>
                          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">管理员权限</p>
                          <p className="text-xs text-gray-400 mt-0.5">开启后可访问管理后台</p>
                        </div>
                        <button type="button" onClick={() => setIsAdmin(v => !v)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isAdmin ? 'bg-amber-500' : 'bg-gray-200 dark:bg-gray-600'}`}>
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isAdmin ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>

                      {/* Referrer */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                          设置推荐人 <span className="font-normal text-gray-400">（输入用户编号，如 10001）</span>
                        </label>
                        <input
                          type="text"
                          value={referredByInput}
                          onChange={(e) => setReferredByInput(e.target.value)}
                          placeholder="用户编号或留空"
                          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                        />
                      </div>
                    </div>
                  </Section>

                  {/* ── 备注 ── */}
                  <Section title="备注" icon={<MessageSquare size={14} />}>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="内部备注，仅管理员可见..."
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-none"
                    />
                  </Section>

                  {/* spacer for footer */}
                  <div className="h-4" />
                </div>
              ) : null}
            </div>

            {/* Drawer Footer */}
            {detail && (
              <div className="shrink-0 px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900">
                {saveError ? (
                  <span className="text-sm text-red-500">{saveError}</span>
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
                  className="btn-openclaw flex items-center gap-2 px-5 py-2.5 text-sm font-bold disabled:opacity-50"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.5} />}
                  {saving ? '保存中...' : '保存修改'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5">
        {icon} {label}
      </div>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
        <span className="text-gray-400">{icon}</span>
        <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>;
}

function InfoItem({
  label, value, danger, success,
}: {
  label: string;
  value: string;
  danger?: boolean;
  success?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm ${danger ? 'text-red-500 font-medium' : success ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-200'}`}>
        {value}
      </p>
    </div>
  );
}
