'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Search, ChevronLeft, ChevronRight, Crown } from 'lucide-react';

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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">用户列表</h1>
        <span className="text-sm text-gray-500">共 {total} 位用户</span>
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索邮箱..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
          />
        </div>
        <button type="submit" className="px-4 py-2 text-sm bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium hover:opacity-90">
          搜索
        </button>
      </form>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">用户编号</th>
              <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">邮箱</th>
              <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">等级</th>
              <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">到期时间</th>
              <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">API Key</th>
              <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">暂无用户</td></tr>
            ) : users.map((user) => {
              const planInfo = PLAN_LABELS[user.plan] ?? PLAN_LABELS.free;
              const isExpired = user.plan_expires_at && new Date(user.plan_expires_at) < new Date();
              return (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono">
                    {user.user_no ? `#${user.user_no}` : '—'}
                    {user.is_admin && <Crown size={12} className="inline ml-1 text-amber-500" />}
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{user.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${planInfo.color}`}>
                      {planInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {user.plan_expires_at
                      ? <span className={isExpired ? 'text-red-500' : ''}>
                          {new Date(user.plan_expires_at).toLocaleDateString('zh-CN')}
                          {isExpired && ' (已过期)'}
                        </span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    {user.api_key ? `${user.api_key.slice(0, 10)}...` : <span className="text-red-400">未绑定</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => router.push(`/admin/users/${user.id}`)}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
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

      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-gray-500">第 {page} 页，每页 20 条</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={users.length < 20}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
