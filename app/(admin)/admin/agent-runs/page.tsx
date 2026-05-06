"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2, RefreshCw, Search, ShieldCheck, WalletCards } from "lucide-react";

type Row = {
  run: {
    id: string;
    capabilityId: string;
    userId: string | null;
    status: string;
    mode: string;
    businessType: string | null;
    businessId: string | null;
    businessTaskId: string | null;
    businessStatus: string | null;
    createdAt: string;
    finishedAt: string | null;
    errorJson?: unknown;
  };
  hold: {
    id: string;
    runId: string;
    featureKey: string;
    estimatedCredits: number;
    status: string;
    reason: string | null;
    finishedAt: string | null;
  } | null;
  profile: {
    id: string;
    username: string | null;
    full_name: string | null;
    user_no: number | null;
    plan: string;
    is_admin: boolean;
  } | null;
};

type ApiResponse = {
  data: Row[];
  pagination: { page: number; limit: number; total: number; returned: number; pages: number };
  holdStats: Array<{ status: string; _count: { id: number }; _sum: { estimatedCredits: number | null } }>;
};

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("zh-CN") : "—";
}

function statusClass(status: string) {
  if (["succeeded", "captured"].includes(status)) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
  if (["failed", "capture_failed"].includes(status)) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  if (["released", "cancelled", "timeout"].includes(status)) return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
}

export default function AdminAgentRunsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [holdStatus, setHoldStatus] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!profile?.is_admin) { router.push("/dashboard"); return; }
      setToken(session.access_token);
    };
    init();
  }, [router]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (holdStatus) params.set("holdStatus", holdStatus);
      const res = await fetch(`/api/admin/agent-runs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [token, page, q, status, holdStatus]);

  useEffect(() => { if (token) fetchData(); }, [token, fetchData]);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-black text-white dark:bg-white dark:text-black flex items-center justify-center">
          <WalletCards size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Agent 扣费记录</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">查看 Agent run、credit hold、capture/release 状态</p>
        </div>
        <button onClick={fetchData} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        {(data?.holdStats || []).map((stat) => (
          <div key={stat.status} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="text-xs text-gray-500">{stat.status}</div>
            <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{stat._count.id}</div>
            <div className="text-xs text-gray-400">{stat._sum.estimatedCredits || 0} credits</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_160px_100px] gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="搜索 runId / capability / businessId" className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
            <option value="">Run 状态</option>
            {['running','waiting_callback','succeeded','failed','cancelled','timeout'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={holdStatus} onChange={(e) => { setHoldStatus(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
            <option value="">Hold 状态</option>
            {['held','captured','released','capture_failed'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={fetchData} className="px-3 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black text-sm">查询</button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        {loading ? (
          <div className="py-20 flex justify-center text-gray-400"><Loader2 className="animate-spin mr-2" />加载中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3">Run</th>
                  <th className="text-left px-4 py-3">用户</th>
                  <th className="text-left px-4 py-3">Run 状态</th>
                  <th className="text-left px-4 py-3">扣费</th>
                  <th className="text-left px-4 py-3">业务</th>
                  <th className="text-left px-4 py-3">时间</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data || []).map(({ run, hold, profile }) => (
                  <tr key={run.id} className="border-t border-gray-100 dark:border-gray-700 align-top">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-gray-900 dark:text-gray-100">{run.id}</div>
                      <div className="text-xs text-gray-500 mt-1">{run.capabilityId}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {profile ? (
                        <div>
                          <div className="font-medium text-gray-800 dark:text-gray-200">{profile.full_name || profile.username || profile.user_no || profile.id.slice(0, 8)}</div>
                          <div className="text-gray-400">{profile.plan}{profile.is_admin ? ' · admin' : ''}</div>
                        </div>
                      ) : <span className="text-gray-400">{run.userId || '—'}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${statusClass(run.status)}`}>{run.status}</span>
                      <div className="text-xs text-gray-400 mt-1">{run.mode}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {hold ? (
                        <div>
                          <span className={`px-2 py-1 rounded-full ${statusClass(hold.status)}`}>{hold.status}</span>
                          <div className="mt-1 font-semibold">{hold.estimatedCredits} credits</div>
                          <div className="text-gray-400">{hold.featureKey}</div>
                          {hold.reason && <div className="text-gray-400">{hold.reason}</div>}
                        </div>
                      ) : <span className="text-gray-400">no hold</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <div>{run.businessType || '—'}</div>
                      <div className="font-mono">{run.businessId || run.businessTaskId || '—'}</div>
                      <div>{run.businessStatus || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <div>{fmt(run.createdAt)}</div>
                      <div>{fmt(run.finishedAt)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
        <div>共 {data?.pagination.total ?? 0} 条，当前返回 {data?.pagination.returned ?? 0} 条</div>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1.5 rounded border disabled:opacity-40">上一页</button>
          <span className="px-2 py-1.5">{page} / {data?.pagination.pages || 1}</span>
          <button disabled={page >= (data?.pagination.pages || 1)} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded border disabled:opacity-40">下一页</button>
        </div>
      </div>
    </div>
  );
}
