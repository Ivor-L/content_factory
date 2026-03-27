'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Search, ChevronLeft, ChevronRight, Crown, Users } from 'lucide-react';

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free:       { label: 'Free',       color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  pro:        { label: 'Pro',        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  studio:     { label: 'Studio',     color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  enterprise: { label: 'Enterprise', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
};

type User = {
  id: string;
  user_no: number | null;
  email: string | null;
  plan: string;
  plan_expires_at: string | null;
  is_admin: boolean;
  api_key: string | null;
  updated_at: string | null;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchUsers = useCallback(async (query: string, p: number) => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const params = new URLSearchParams({ page: String(p) });
    if (query) params.set('q', query);

    const res = await fetch(`/api/admin/users?${params}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json();
    setUsers(json.data ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers(q, page);
  }, [fetchUsers, q, page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers(q, 1);
  };

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
          <button
            type="submit"
            className="px-4 py-2.5 text-sm bg-black dark:bg-white text-white dark:text-black rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
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
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    加载中...
                  </div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-gray-400">暂无用户</td>
              </tr>
            ) : users.map((user) => {
              const planInfo = PLAN_LABELS[user.plan] ?? PLAN_LABELS.free;
              const isExpired = user.plan_expires_at && new Date(user.plan_expires_at) < new Date();
              return (
                <tr key={user.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/20 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 shrink-0">
                        {user.email?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-gray-400 dark:text-gray-500">
                            {user.user_no ? `#${user.user_no}` : '—'}
                          </span>
                          {user.is_admin && <Crown size={11} className="text-amber-500 shrink-0" />}
                        </div>
                        <p className="text-sm text-gray-900 dark:text-white truncate max-w-[220px]">{user.email ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${planInfo.color}`}>
                      {planInfo.label}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {user.plan_expires_at ? (
                      <span className={`text-sm ${isExpired ? 'text-red-500' : 'text-gray-600 dark:text-gray-400'}`}>
                        {new Date(user.plan_expires_at).toLocaleDateString('zh-CN')}
                        {isExpired && <span className="ml-1 text-xs bg-red-50 dark:bg-red-900/20 text-red-500 px-1.5 py-0.5 rounded">已过期</span>}
                      </span>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {user.api_key ? (
                      <span className="font-mono text-xs text-gray-400">{user.api_key.slice(0, 12)}...</span>
                    ) : (
                      <span className="text-xs text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">未绑定</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => router.push(`/admin/users/${user.id}`)}
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
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
          >
            <ChevronLeft size={14} /> 上一页
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={users.length < 20}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
          >
            下一页 <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
