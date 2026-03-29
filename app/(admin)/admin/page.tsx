'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Search, ChevronLeft, ChevronRight, Crown, Users, X,
  Check, Loader2, CalendarDays, ShieldCheck, MessageSquare,
  UserPlus, Zap, ChevronDown, ChevronUp, History, Ban,
  Filter, CheckSquare, Square, Plus,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────
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

// ─── Types ────────────────────────────────────────────────────────────────────
type ListUser = {
  id: string;
  user_no: number | null;
  email: string | null;
  plan: string;
  plan_expires_at: string | null;
  is_admin: boolean;
  is_banned: boolean;
  api_key: string | null;
  tenant_id: string | null;
  notes: string | null;
  created_at: string | null;
  last_active_at: string | null;
};

type UserDetail = ListUser & {
  updated_at: string | null;
  referred_by: string | null;
  referral_count: number;
  referrer: { id: string; user_no: number | null; email: string | null } | null;
  logs: Array<{ id: string; action: string; changes: Record<string, unknown>; created_at: string }>;
};

type CreditsStats = {
  balance: number | null;
  totalConsumed: number | null;
  monthConsumed: number | null;
  events: Array<{ id: string; amount: number; reason: string; created_at: string }> | null;
};

type Referral = {
  id: string;
  invitee_id: string;
  email: string | null;
  user_no: number | null;
  plan: string;
  created_at: string;
};

type Tenant = {
  id: string;
  name: string;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('zh-CN') : '—';
const fmtFull = (iso: string | null) => iso ? new Date(iso).toLocaleString('zh-CN') : '—';

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return fmt(iso);
}

function isActiveRecently(last_active_at: string | null): boolean {
  if (!last_active_at) return false;
  return Date.now() - new Date(last_active_at).getTime() < 3 * 24 * 60 * 60 * 1000;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const [users, setUsers] = useState<ListUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTenant, setFilterTenant] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Drawer
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [credits, setCredits] = useState<CreditsStats | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [referrals, setReferrals] = useState<Referral[] | null>(null);
  const [referralsLoading, setReferralsLoading] = useState(false);
  const [showReferrals, setShowReferrals] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  // Edit state
  const [plan, setPlan] = useState('free');
  const [expiresAt, setExpiresAt] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [notes, setNotes] = useState('');
  const [referredByInput, setReferredByInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Manual credit addition
  const [addCreditsAmount, setAddCreditsAmount] = useState('');
  const [addCreditsLoading, setAddCreditsLoading] = useState(false);
  const [addCreditsResult, setAddCreditsResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Batch select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchPlan, setBatchPlan] = useState('pro');
  const [batchDays, setBatchDays] = useState(30);
  const [batchCreditsAmount, setBatchCreditsAmount] = useState('');
  const [batchTenantId, setBatchTenantId] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);

  // Create user modal
  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('123456');
  const [createName, setCreateName] = useState('');
  const [createPlan, setCreatePlan] = useState('free');
  const [createExpiresAt, setCreateExpiresAt] = useState('');
  const [createTenantId, setCreateTenantId] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const sessionRef = useRef<string | null>(null);
  const getToken = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;
    const { data: { session } } = await supabase.auth.getSession();
    sessionRef.current = session?.access_token ?? null;
    return sessionRef.current;
  }, []);

  // ── Fetch list ──────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async (query: string, p: number, plan: string, status: string, tenant: string) => {
    setLoading(true);
    const token = await getToken();
    if (!token) return;
    const params = new URLSearchParams({ page: String(p) });
    if (query) params.set('q', query);
    if (plan) params.set('plan', plan);
    if (status) params.set('status', status);
    if (tenant) params.set('tenant', tenant);
    const res = await fetch(`/api/admin/users?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    setUsers(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
    setSelectedIds(new Set());
  }, [getToken]);

  useEffect(() => { fetchUsers(q, page, filterPlan, filterStatus, filterTenant); }, [fetchUsers, q, page, filterPlan, filterStatus, filterTenant]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers(q, 1, filterPlan, filterStatus, filterTenant);
  };

  // ── Open drawer ─────────────────────────────────────────────────────────────
  const openDrawer = useCallback(async (userId: string) => {
    setSelectedId(userId);
    setDetail(null);
    setCredits(null);
    setReferrals(null);
    setSaved(false);
    setSaveError(null);
    setShowReferrals(false);
    setShowHistory(false);
    setShowLogs(false);
    setAddCreditsAmount('');
    setAddCreditsResult(null);
    setDetailLoading(true);

    const token = await getToken();
    if (!token) return;

    const res = await fetch(`/api/admin/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
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
    setIsBanned(d.is_banned ?? false);
    setNotes(d.notes ?? '');
    setReferredByInput('');
    setDetailLoading(false);

    setCreditsLoading(true);
    fetch(`/api/admin/users/${userId}/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setCredits(data); })
      .finally(() => setCreditsLoading(false));
  }, [getToken]);

  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setCredits(null);
  }, []);

  // ── Referrals ───────────────────────────────────────────────────────────────
  const loadReferrals = useCallback(async () => {
    if (!selectedId) return;
    setReferralsLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/admin/users/${selectedId}/referrals`, { headers: { Authorization: `Bearer ${token!}` } });
    if (res.ok) { const json = await res.json(); setReferrals(json.data ?? []); }
    setReferralsLoading(false);
  }, [selectedId, getToken]);

  const toggleReferrals = () => {
    const next = !showReferrals;
    setShowReferrals(next);
    if (next && !referrals) loadReferrals();
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    setSaveError(null);
    const token = await getToken();
    if (!token) return;

    const body: Record<string, unknown> = {
      plan, is_admin: isAdmin, is_banned: isBanned,
      notes: notes || null,
      plan_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      tenant_id: detail?.tenant_id ?? null,
    };
    if (referredByInput.trim()) body.referred_by = referredByInput.trim();

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
      setUsers(prev => prev.map(u => u.id === selectedId
        ? { ...u, plan, is_admin: isAdmin, is_banned: isBanned, notes: notes || null, plan_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null, tenant_id: detail?.tenant_id ?? null }
        : u));
      setDetail(prev => prev ? { ...prev, ...json.data } : prev);
    }
    setSaving(false);
  };

  const applyPreset = (days: number) => {
    const base = expiresAt && new Date(expiresAt) > new Date() ? new Date(expiresAt) : new Date();
    setExpiresAt(addDays(base, days));
  };

  // ── Add Credits ─────────────────────────────────────────────────────────────
  const handleAddCredits = async () => {
    if (!selectedId) return;
    const amount = Math.floor(Number(addCreditsAmount));
    if (!amount || amount <= 0) return;
    setAddCreditsLoading(true);
    setAddCreditsResult(null);
    const token = await getToken();
    try {
      const res = await fetch(`/api/admin/users/${selectedId}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token!}` },
        body: JSON.stringify({ amount }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAddCreditsResult({ ok: false, msg: json.error ?? '充值失败' });
      } else {
        setAddCreditsResult({ ok: true, msg: `已充值 ${amount} 积分` });
        setAddCreditsAmount('');
        // Refresh balance
        if (selectedId) {
          fetch(`/api/admin/users/${selectedId}/stats`, { headers: { Authorization: `Bearer ${token!}` } })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setCredits(data); })
            .catch(() => {});
        }
        setTimeout(() => setAddCreditsResult(null), 4000);
      }
    } catch {
      setAddCreditsResult({ ok: false, msg: '网络错误' });
    }
    setAddCreditsLoading(false);
  };

  // ── Batch ───────────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === users.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(users.map(u => u.id)));
    }
  };

  const runBatch = async (action: { type: string; value?: unknown }) => {
    setBatchLoading(true);
    const token = await getToken();
    await fetch('/api/admin/users/batch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token!}` },
      body: JSON.stringify({ ids: Array.from(selectedIds), action }),
    });
    setBatchLoading(false);
    setSelectedIds(new Set());
    fetchUsers(q, page, filterPlan, filterStatus, filterTenant);
  };

  const allSelected = users.length > 0 && selectedIds.size === users.length;

  const handleCreateUser = async () => {
    if (!createEmail.trim()) return;
    setCreateLoading(true);
    setCreateError(null);
    const token = await getToken();
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token!}` },
        body: JSON.stringify({
          email: createEmail.trim(),
          password: createPassword,
          plan: createPlan,
          plan_expires_at: createExpiresAt ? new Date(createExpiresAt).toISOString() : null,
          tenant_id: createTenantId || null,
          notes: createName.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '创建失败');
      setShowCreate(false);
      setCreateEmail(''); setCreatePassword(''); setCreateName('');
      setCreatePlan('free'); setCreateExpiresAt(''); setCreateTenantId('');
      fetchUsers(q, page, filterPlan, filterStatus, filterTenant);
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreateLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const loadTenants = async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/admin/tenants', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const json = await res.json();
        setTenants(json.data ?? []);
      }
    };
    loadTenants();
  }, [getToken]);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-black dark:bg-white flex items-center justify-center">
            <Users size={18} className="text-white dark:text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">用户管理</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">共 {total} 位用户</p>
          </div>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
        >
          <UserPlus size={15} />
          创建账号
        </button>
      </div>

      {/* Search + Filters */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索邮箱..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white" />
        </div>
        <div className="flex items-center gap-1.5 text-gray-400 text-sm">
          <Filter size={14} />
        </div>
        <select value={filterPlan} onChange={e => { setFilterPlan(e.target.value); setPage(1); }}
          className="px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none">
          <option value="">所有等级</option>
          {PLAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none">
          <option value="">所有状态</option>
          <option value="active">正常</option>
          <option value="expired">已过期</option>
          <option value="banned">已封禁</option>
        </select>
        <select value={filterTenant} onChange={e => { setFilterTenant(e.target.value); setPage(1); }}
          className="px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none">
          <option value="">所有租户</option>
          {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button type="submit" className="px-4 py-2.5 text-sm bg-black dark:bg-white text-white dark:text-black rounded-lg font-semibold hover:opacity-90">
          搜索
        </button>
      </form>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
            <tr>
              <th className="px-4 py-3.5 w-10">
                <button onClick={toggleSelectAll} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                  {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
              </th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">用户</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">等级</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">到期时间</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">注册 / 上次使用</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">API Key</th>
              <th className="text-right px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />加载中...
                </div>
              </td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">暂无用户</td></tr>
            ) : users.map((user) => {
              const isExpired = user.plan_expires_at && new Date(user.plan_expires_at) < new Date();
              const isSelected = selectedIds.has(user.id);
              const isDrawerOpen = user.id === selectedId;
              const isActive = isActiveRecently(user.last_active_at);
              return (
                <tr key={user.id}
                  className={`transition-colors ${isDrawerOpen ? 'bg-gray-50 dark:bg-gray-700/30' : 'hover:bg-gray-50/80 dark:hover:bg-gray-700/20'} ${user.is_banned ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-4">
                    <button onClick={e => { e.stopPropagation(); toggleSelect(user.id); }}
                      className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                      {isSelected ? <CheckSquare size={16} className="text-black dark:text-white" /> : <Square size={16} />}
                    </button>
                  </td>
                  <td className="px-4 py-4 cursor-pointer" onClick={() => openDrawer(user.id)}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${user.is_banned ? 'bg-red-100 dark:bg-red-900/30 text-red-500' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                        {user.is_banned ? <Ban size={14} /> : (user.email?.[0]?.toUpperCase() ?? '?')}
                      </div>
                      <div className="min-w-0">
                        {user.notes && (
                          <p className="text-sm font-semibold text-orange-600 dark:text-orange-400 truncate max-w-[180px]">{user.notes}</p>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-gray-400">{user.user_no ? `#${user.user_no}` : '—'}</span>
                          {user.is_admin && <Crown size={11} className="text-amber-500" />}
                          {user.is_banned && <span className="text-[10px] bg-red-100 dark:bg-red-900/20 text-red-500 px-1.5 py-0.5 rounded">已封禁</span>}
                          {isActive && <span className="text-[10px] bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded font-medium">活跃</span>}
                          {user.tenant_id && (
                            <span className="text-[10px] bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
                              {tenants.find(t => t.id === user.tenant_id)?.name ?? user.tenant_id}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-900 dark:text-white truncate max-w-[200px]">{user.email ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${PLAN_COLORS[user.plan] ?? PLAN_COLORS.free}`}>
                      {PLAN_OPTIONS.find(p => p.value === user.plan)?.label ?? 'Free'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {user.plan_expires_at ? (
                      <span className={`text-sm ${isExpired ? 'text-red-500 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                        {new Date(user.plan_expires_at).toLocaleDateString('zh-CN')}
                        {isExpired && <span className="ml-1 text-xs bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">已过期</span>}
                      </span>
                    ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-4 hidden lg:table-cell">
                    <div className="text-xs text-gray-400 space-y-0.5">
                      <p>注册: {fmt(user.created_at)}</p>
                      {user.last_active_at
                        ? <p className={isActive ? 'text-green-600 dark:text-green-400' : ''}>用: {timeAgo(user.last_active_at)}</p>
                        : <p>未使用</p>
                      }
                    </div>
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell">
                    {user.api_key
                      ? <span className="font-mono text-xs text-gray-400">{user.api_key.slice(0, 12)}...</span>
                      : <span className="text-xs text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">未绑定</span>}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button onClick={() => openDrawer(user.id)}
                      className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
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

      {/* ── Batch Action Bar ───────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-2xl shadow-2xl px-5 py-3 flex flex-wrap items-center gap-3 max-w-[90vw]">
          <span className="text-sm font-medium">已选 {selectedIds.size} 人</span>
          <div className="w-px h-5 bg-white/20 dark:bg-gray-400" />
          {/* 设置等级 */}
          <div className="flex items-center gap-2">
            <select value={batchPlan} onChange={e => setBatchPlan(e.target.value)}
              className="text-sm bg-white/10 dark:bg-gray-900/10 border border-white/20 dark:border-gray-400 rounded-lg px-2 py-1.5 text-white dark:text-gray-900">
              {PLAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <button onClick={() => runBatch({ type: 'setPlan', value: batchPlan })} disabled={batchLoading}
              className="text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5 rounded-lg font-medium hover:opacity-90 disabled:opacity-50">
              设置等级
            </button>
          </div>
          <div className="w-px h-5 bg-white/20 dark:bg-gray-400" />
          {/* 延期 */}
          <div className="flex items-center gap-2">
            <select value={batchDays} onChange={e => setBatchDays(Number(e.target.value))}
              className="text-sm bg-white/10 dark:bg-gray-900/10 border border-white/20 dark:border-gray-400 rounded-lg px-2 py-1.5 text-white dark:text-gray-900">
              <option value={7}>+7天</option>
              <option value={30}>+30天</option>
              <option value={90}>+3月</option>
              <option value={180}>+半年</option>
              <option value={365}>+1年</option>
            </select>
            <button onClick={() => runBatch({ type: 'extendDays', value: batchDays })} disabled={batchLoading}
              className="text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5 rounded-lg font-medium hover:opacity-90 disabled:opacity-50">
              延期
            </button>
          </div>
          <div className="w-px h-5 bg-white/20 dark:bg-gray-400" />
          {/* 批量充值积分 */}
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={batchCreditsAmount}
              onChange={e => setBatchCreditsAmount(e.target.value)}
              placeholder="积分数"
              className="w-20 text-sm bg-white/10 dark:bg-gray-900/10 border border-white/20 dark:border-gray-400 rounded-lg px-2 py-1.5 text-white dark:text-gray-900 placeholder-white/40 dark:placeholder-gray-400"
            />
            <button
              onClick={() => {
                const n = Math.floor(Number(batchCreditsAmount));
                if (n > 0) runBatch({ type: 'addCredits', value: n });
              }}
              disabled={batchLoading || !batchCreditsAmount || Number(batchCreditsAmount) <= 0}
              className="flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-500 disabled:opacity-50"
            >
              <Plus size={12} />充值积分
            </button>
          </div>
          <div className="w-px h-5 bg-white/20 dark:bg-gray-400" />
          {/* 批量修改租户 */}
          <div className="flex items-center gap-2">
            <select value={batchTenantId} onChange={e => setBatchTenantId(e.target.value)}
              className="text-sm bg-white/10 dark:bg-gray-900/10 border border-white/20 dark:border-gray-400 rounded-lg px-2 py-1.5 text-white dark:text-gray-900">
              <option value="">无租户</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={() => runBatch({ type: 'setTenant', value: batchTenantId })} disabled={batchLoading}
              className="text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5 rounded-lg font-medium hover:opacity-90 disabled:opacity-50">
              修改租户
            </button>
          </div>
          <div className="w-px h-5 bg-white/20 dark:bg-gray-400" />
          <button onClick={() => runBatch({ type: 'ban' })} disabled={batchLoading}
            className="text-sm text-red-400 hover:text-red-300 font-medium px-2 py-1.5">封禁</button>
          <button onClick={() => runBatch({ type: 'unban' })} disabled={batchLoading}
            className="text-sm text-green-400 hover:text-green-300 font-medium px-2 py-1.5">解封</button>
          <div className="w-px h-5 bg-white/20 dark:bg-gray-400" />
          <button onClick={() => setSelectedIds(new Set())}
            className="text-sm text-white/60 dark:text-gray-500 hover:text-white dark:hover:text-gray-900 px-2 py-1.5">
            取消
          </button>
          {batchLoading && <Loader2 size={14} className="animate-spin" />}
        </div>
      )}

      {/* ── Drawer ─────────────────────────────────────────────────────────────── */}
      {selectedId && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={closeDrawer} />
          <div className="relative z-50 w-full max-w-[520px] h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              {detail ? (
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${detail.is_banned ? 'bg-red-100 dark:bg-red-900/30 text-red-500' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    {detail.is_banned ? <Ban size={16} /> : (detail.email?.[0]?.toUpperCase() ?? '?')}
                  </div>
                  <div className="min-w-0">
                    {detail.notes && (
                      <p className="text-sm font-bold text-orange-600 dark:text-orange-400 truncate">{detail.notes}</p>
                    )}
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{detail.email}</p>
                      {detail.is_admin && <Crown size={13} className="text-amber-500 shrink-0" />}
                      {detail.is_banned && <span className="text-[10px] bg-red-100 dark:bg-red-900/20 text-red-500 px-1.5 py-0.5 rounded shrink-0">已封禁</span>}
                    </div>
                    <p className="text-xs text-gray-400 font-mono">{detail.user_no ? `#${detail.user_no}` : '—'}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-semibold text-gray-900 dark:text-white">用户详情</p>
              )}
              <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {detailLoading ? (
                <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />加载中...
                </div>
              ) : saveError && !detail ? (
                <div className="px-6 py-12 text-center text-red-500 text-sm">{saveError}</div>
              ) : detail ? (
                <div className="px-6 py-5 space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="成功推荐" value={`${detail.referral_count} 人`} icon={<UserPlus size={14} />} />
                    <StatCard label="积分余额" value={creditsLoading ? '…' : credits?.balance != null ? String(credits.balance) : '—'} icon={<Zap size={14} />} />
                    <StatCard label="本月消耗" value={creditsLoading ? '…' : credits?.monthConsumed != null ? String(credits.monthConsumed) : '—'} icon={<History size={14} />} />
                  </div>

                  {/* 会员名字 */}
                  <Section title="会员名字" icon={<MessageSquare size={14} />}>
                    <div>
                      <p className="text-xs text-gray-400 mb-2">管理员备注，仅后台可见</p>
                      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="如：张三 / 公司A"
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-none" />
                    </div>
                  </Section>

                  {/* Account info */}
                  <Section title="账号信息" icon={<CalendarDays size={14} />}>
                    <InfoGrid>
                      <InfoItem label="注册时间" value={fmtFull(detail.created_at)} />
                      <InfoItem label="最后更新" value={fmtFull(detail.updated_at)} />
                      <InfoItem label="最后使用积分" value={detail.last_active_at ? `${fmtFull(detail.last_active_at)}` : '从未使用'} />
                      <InfoItem label="到期时间"
                        value={detail.plan_expires_at ? `${fmt(detail.plan_expires_at)}${new Date(detail.plan_expires_at) < new Date() ? '（已过期）' : ''}` : '永不过期'}
                        danger={!!(detail.plan_expires_at && new Date(detail.plan_expires_at) < new Date())} />
                      <InfoItem label="API Key"
                        value={detail.api_key ? `已绑定 · ${detail.api_key.slice(0, 12)}…` : '未绑定'}
                        success={!!detail.api_key} danger={!detail.api_key} />
                    </InfoGrid>
                  </Section>

                  {/* Credits */}
                  <Section title="积分" icon={<Zap size={14} />}>
                    <InfoGrid>
                      <InfoItem label="总消耗" value={creditsLoading ? '…' : credits?.totalConsumed != null ? String(credits.totalConsumed) : '—'} />
                      <InfoItem label="本月消耗" value={creditsLoading ? '…' : credits?.monthConsumed != null ? String(credits.monthConsumed) : '—'} />
                    </InfoGrid>
                    {/* Manual add credits */}
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">手动充值积分</p>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={1}
                          value={addCreditsAmount}
                          onChange={e => setAddCreditsAmount(e.target.value)}
                          placeholder="输入积分数量"
                          className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                        />
                        <button
                          onClick={handleAddCredits}
                          disabled={addCreditsLoading || !addCreditsAmount || Number(addCreditsAmount) <= 0}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50 transition-colors shrink-0"
                        >
                          {addCreditsLoading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                          充值
                        </button>
                      </div>
                      {addCreditsResult && (
                        <p className={`text-xs mt-2 ${addCreditsResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                          {addCreditsResult.ok ? <Check size={12} className="inline mr-1" /> : null}
                          {addCreditsResult.msg}
                        </p>
                      )}
                      {!detail.api_key && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">⚠ 该用户未绑定 API Key，无法充值</p>
                      )}
                    </div>
                    <button onClick={() => setShowHistory(v => !v)}
                      className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                      <History size={12} />查看历史消耗记录
                      {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {showHistory && (
                      <div className="mt-2 rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                        {!credits?.events || credits.events.length === 0 ? (
                          <p className="text-xs text-gray-400 px-4 py-3">
                            {credits?.events === null ? '积分系统暂未开放历史记录接口' : '暂无消耗记录'}
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
                              {credits.events.map(ev => (
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

                  {/* Referrals */}
                  <Section title="推荐关系" icon={<UserPlus size={14} />}>
                    <div className="space-y-2 text-sm">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">推荐人</p>
                        {detail.referrer
                          ? <p className="text-gray-700 dark:text-gray-200">{detail.referrer.email ?? '—'}{detail.referrer.user_no && <span className="ml-2 font-mono text-xs text-gray-400">#{detail.referrer.user_no}</span>}</p>
                          : <p className="text-gray-400">无</p>}
                      </div>
                      <button onClick={toggleReferrals} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                        <Users size={12} />已推荐 {detail.referral_count} 人
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
                                  <th className="text-left px-3 py-2 text-gray-500">加入时间</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                                {referrals.map(r => (
                                  <tr key={r.id}>
                                    <td className="px-3 py-2">
                                      <p className="text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{r.email ?? '—'}</p>
                                      {r.user_no && <p className="text-gray-400 font-mono">#{r.user_no}</p>}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${PLAN_COLORS[r.plan] ?? PLAN_COLORS.free}`}>
                                        {PLAN_OPTIONS.find(p => p.value === r.plan)?.label ?? 'Free'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-gray-500">{fmt(r.created_at)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  </Section>

                  {/* Edit */}
                  <Section title="编辑权限" icon={<ShieldCheck size={14} />}>
                    <div className="space-y-4">
                      {/* Plan */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-2">会员等级</label>
                        <div className="grid grid-cols-4 gap-2">
                          {PLAN_OPTIONS.map(o => (
                            <button key={o.value} type="button" onClick={() => setPlan(o.value)}
                              className={`py-2.5 rounded-lg border text-xs font-bold text-center transition-all ${plan === o.value ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-black' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'}`}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Expiry */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-2">使用期限</label>
                        <div className="flex gap-2 mb-2">
                          {DURATION_PRESETS.map(p => (
                            <button key={p.days} type="button" onClick={() => applyPreset(p.days)}
                              className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white transition-all">
                              {p.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2 items-center">
                          <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
                            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white" />
                          {expiresAt && <button type="button" onClick={() => setExpiresAt('')} className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded">清除</button>}
                        </div>
                        {expiresAt && (
                          <p className="text-xs text-gray-400 mt-1">
                            到期 {new Date(expiresAt).toLocaleDateString('zh-CN')}（{Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)} 天后）
                          </p>
                        )}
                      </div>
                      {/* Toggles */}
                      <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
                        <Toggle label="管理员权限" desc="可访问管理后台" value={isAdmin} onChange={setIsAdmin} color="amber" />
                        <Toggle label="封禁账号" desc="封禁后用户无法登录" value={isBanned} onChange={setIsBanned} color="red" />
                      </div>
                      {/* Tenant */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-2">租户</label>
                        <select value={detail?.tenant_id ?? ''} onChange={e => {
                          if (detail) {
                            const newTenantId = e.target.value || null;
                            setDetail({ ...detail, tenant_id: newTenantId });
                          }
                        }}
                          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white">
                          <option value="">无租户</option>
                          {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      {/* Referrer */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                          设置推荐人 <span className="font-normal text-gray-400">（输入用户编号）</span>
                        </label>
                        <input type="text" value={referredByInput} onChange={e => setReferredByInput(e.target.value)} placeholder="如 10001，留空不修改"
                          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white" />
                      </div>
                    </div>
                  </Section>

                  {/* Operation Logs */}
                  {detail.logs && detail.logs.length > 0 && (
                    <Section title="操作记录" icon={<History size={14} />}>
                      <button onClick={() => setShowLogs(v => !v)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
                        查看 {detail.logs.length} 条记录 {showLogs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      {showLogs && (
                        <div className="mt-3 space-y-2">
                          {detail.logs.map(log => (
                            <div key={log.id} className="text-xs bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="font-medium text-gray-700 dark:text-gray-300">{log.action}</span>
                                <span className="text-gray-400">{fmt(log.created_at)}</span>
                              </div>
                              <p className="text-gray-500 font-mono truncate">{JSON.stringify(log.changes)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>
                  )}

                  <div className="h-4" />
                </div>
              ) : null}
            </div>

            {/* Footer */}
            {detail && (
              <div className="shrink-0 px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900">
                {saveError ? (
                  <span className="text-sm text-red-500">{saveError}</span>
                ) : saved ? (
                  <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1.5">
                    <Check size={14} strokeWidth={2.5} /> 已保存
                  </span>
                ) : <span />}
                <button onClick={handleSave} disabled={saving}
                  className="btn-openclaw flex items-center gap-2 px-5 py-2.5 text-sm font-bold disabled:opacity-50">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.5} />}
                  {saving ? '保存中...' : '保存修改'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create User Modal ──────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">创建账号</h2>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              {/* 会员名字（管理员备注） */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  会员名字 <span className="font-normal text-gray-400">（仅管理员可见）</span>
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  placeholder="如：张三 / 公司A"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                />
              </div>
              {/* 邮箱 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">邮箱</label>
                <input
                  type="email"
                  value={createEmail}
                  onChange={e => setCreateEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                />
              </div>
              {/* 租户 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">租户</label>
                <select
                  value={createTenantId}
                  onChange={e => setCreateTenantId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                >
                  <option value="">无租户</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {/* 会员等级 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">会员等级</label>
                <div className="grid grid-cols-4 gap-2">
                  {PLAN_OPTIONS.map(o => (
                    <button key={o.value} type="button" onClick={() => setCreatePlan(o.value)}
                      className={`py-2 rounded-lg border text-xs font-bold text-center transition-all ${createPlan === o.value ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-black' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* 使用期限 */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">使用期限</label>
                <div className="flex gap-1.5 mb-2">
                  {DURATION_PRESETS.map(p => (
                    <button key={p.days} type="button"
                      onClick={() => {
                        const base = createExpiresAt && new Date(createExpiresAt) > new Date() ? new Date(createExpiresAt) : new Date();
                        const d = new Date(base);
                        d.setDate(d.getDate() + p.days);
                        setCreateExpiresAt(d.toISOString().slice(0, 10));
                      }}
                      className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white transition-all">
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 items-center">
                  <input type="date" value={createExpiresAt} onChange={e => setCreateExpiresAt(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white" />
                  {createExpiresAt && <button type="button" onClick={() => setCreateExpiresAt('')} className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded">清除</button>}
                </div>
              </div>
              {createError && <p className="text-xs text-red-500">{createError}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                取消
              </button>
              <button
                onClick={handleCreateUser}
                disabled={!createEmail.trim() || createLoading}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-sm bg-black dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {createLoading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5">{icon} {label}</div>
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
function InfoItem({ label, value, danger, success }: { label: string; value: string; danger?: boolean; success?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm ${danger ? 'text-red-500 font-medium' : success ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-200'}`}>{value}</p>
    </div>
  );
}
function Toggle({ label, desc, value, onChange, color }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void; color: 'amber' | 'red' }) {
  const activeColor = color === 'red' ? 'bg-red-500' : 'bg-amber-500';
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      </div>
      <button type="button" onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${value ? activeColor : 'bg-gray-200 dark:bg-gray-600'}`}>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
