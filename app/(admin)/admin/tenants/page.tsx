'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Loader2, Check, X } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  createdAt: string;
}

export default function AdminTenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!profile?.is_admin) { router.push('/dashboard'); return; }
      setToken(session.access_token);
    };
    init();
  }, [router]);

  const fetchTenants = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/tenants', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const text = await res.text();
      if (!text) return;
      const json = JSON.parse(text);
      if (json.data) setTenants(json.data);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchTenants();
  }, [token, fetchTenants]);

  const handleCreate = async () => {
    if (!newName.trim() || !token) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || '创建失败');
      }
      setNewName('');
      setSuccess('租户创建成功');
      setTimeout(() => setSuccess(null), 2000);
      await fetchTenants();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    setDeleting(prev => new Set(prev).add(id));
    try {
      await fetch('/api/admin/tenants', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      await fetchTenants();
    } finally {
      setDeleting(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <Plus size={20} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">租户管理</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            共 {tenants.length} 个租户
          </p>
        </div>
      </div>

      {/* Create Form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="输入租户名称..."
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            创建
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        {success && <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1"><Check size={12} /> {success}</p>}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          加载中...
        </div>
      ) : tenants.length === 0 ? (
        <div className="text-center py-12 text-gray-400">暂无租户</div>
      ) : (
        <div className="space-y-2">
          {tenants.map(t => (
            <div key={t.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{t.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{new Date(t.createdAt).toLocaleDateString('zh-CN')}</p>
              </div>
              <button
                onClick={() => handleDelete(t.id)}
                disabled={deleting.has(t.id)}
                className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-50"
              >
                {deleting.has(t.id) ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
