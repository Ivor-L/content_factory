"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Users, Zap, TrendingUp, TrendingDown, DollarSign,
  CheckCircle, XCircle, Activity, RefreshCw, Loader2,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";

interface PlanDist { plan: string; count: number; }
interface FeatureStat {
  featureKey: string;
  featureName: string;
  calls: number;
  success: number;
  failed: number;
  credits: number;
  revenue: number | null;
  cost: number | null;
  enabled?: boolean;
}
interface DashboardData {
  users: { total: number; active: number; planDistribution: PlanDist[] };
  thisMonth: {
    creditsConsumed: number; calls: number; success: number; failed: number;
    creditsRecharged: number; revenueCny: number;
    revenue: number; cost: number; profit: number;
  };
  overall: { calls: number; success: number; failed: number; revenue: number; cost: number; profit: number };
  features: FeatureStat[];
}

const PLAN_LABELS: Record<string, string> = {
  free: "免费", starter: "入门", pro: "专业", enterprise: "企业", lifetime: "终身",
};
const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-400", starter: "bg-blue-400", pro: "bg-violet-500",
  enterprise: "bg-amber-500", lifetime: "bg-rose-500",
};

function fmt(n: number, decimals = 2) { return n.toFixed(decimals); }
function fmtInt(n: number) { return n.toLocaleString("zh-CN"); }

function StatCard({
  label, value, sub, icon: Icon, color = "blue", trend,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color?: string; trend?: "up" | "down" | "neutral";
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    green: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400",
    red: "bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400",
    amber: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
    violet: "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400",
    gray: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon size={16} />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</div>
        {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

type SortKey = "calls" | "success" | "failed" | "revenue" | "cost" | "margin";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [filterTenant, setFilterTenant] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("calls");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle();
      if (!profile?.is_admin) { router.push("/dashboard"); return; }
      setToken(session.access_token);
    };
    init();
  }, [router]);

  useEffect(() => {
    if (!token) return;
    fetch("/api/admin/tenants", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((j) => setTenants(j.data ?? []))
      .catch(() => {});
  }, [token]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = filterTenant ? `?tenant=${filterTenant}` : "";
      const res = await fetch(`/api/admin/dashboard${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const json = await res.json();
      if (json.data) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [token, filterTenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronsUpDown size={12} className="text-gray-300" />;
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  const sortedFeatures = [...(data?.features ?? [])].sort((a, b) => {
    let av: number, bv: number;
    if (sortKey === "margin") {
      av = a.revenue != null && a.revenue > 0 ? (a.revenue - (a.cost ?? 0)) / a.revenue * 100 : -Infinity;
      bv = b.revenue != null && b.revenue > 0 ? (b.revenue - (b.cost ?? 0)) / b.revenue * 100 : -Infinity;
    } else {
      av = (a[sortKey] as number) ?? -Infinity;
      bv = (b[sortKey] as number) ?? -Infinity;
    }
    return sortAsc ? av - bv : bv - av;
  });

  const overall = data?.overall;
  const month = data?.thisMonth;
  const users = data?.users;
  const planTotal = users?.planDistribution.reduce((s, p) => s + p.count, 0) ?? 1;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Activity size={20} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">数据仪表盘</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">实时后台数据概览</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterTenant}
            onChange={(e) => setFilterTenant(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">全部租户</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-32 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> 加载中...
        </div>
      ) : data ? (
        <>
          {/* ── 用户概览 ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">用户概览</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="总用户数" value={fmtInt(users?.total ?? 0)} icon={Users} color="blue" />
              <StatCard label="近3日活跃用户" value={fmtInt(users?.active ?? 0)} sub="3天内有积分消耗" icon={Activity} color="green" />
              <StatCard label="本月调用次数" value={fmtInt(month?.calls ?? 0)} icon={Zap} color="violet" />
              <StatCard
                label="本月成功率"
                value={month?.calls ? `${((month.success / month.calls) * 100).toFixed(1)}%` : "—"}
                sub={`成功 ${fmtInt(month?.success ?? 0)} / 失败 ${fmtInt(month?.failed ?? 0)}`}
                icon={CheckCircle} color="green"
              />
            </div>
          </section>

          {/* ── 整体调用统计 ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">整体调用统计</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="总调用次数" value={fmtInt(overall?.calls ?? 0)} icon={Zap} color="blue" />
              <StatCard label="成功次数" value={fmtInt(overall?.success ?? 0)} icon={CheckCircle} color="green" />
              <StatCard label="失败次数" value={fmtInt(overall?.failed ?? 0)} icon={XCircle} color="red" />
              <StatCard
                label="整体成功率"
                value={overall?.calls ? `${((overall.success / overall.calls) * 100).toFixed(1)}%` : "—"}
                icon={Activity} color="violet"
              />
            </div>
          </section>

          {/* ── 收益统计 ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">收益统计（基于使用量）</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard label="整体收益" value={`¥${fmt(overall?.revenue ?? 0, 4)}`} sub="售价 × 成功调用次数" icon={DollarSign} color="green" />
              <StatCard label="整体成本" value={`¥${fmt(overall?.cost ?? 0, 4)}`} sub="成本 × 成功调用次数" icon={TrendingDown} color="red" />
              <StatCard
                label="整体利润"
                value={`¥${fmt(overall?.profit ?? 0, 4)}`}
                sub={overall?.revenue ? `利润率 ${(((overall.profit) / overall.revenue) * 100).toFixed(1)}%` : undefined}
                icon={TrendingUp}
                color={(overall?.profit ?? 0) >= 0 ? "green" : "red"}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <StatCard label="本月积分消耗" value={fmtInt(month?.creditsConsumed ?? 0)} sub="积分" icon={Zap} color="amber" />
              <StatCard label="本月积分充值" value={fmtInt(month?.creditsRecharged ?? 0)} sub="积分" icon={DollarSign} color="blue" />
              <StatCard label="本月收益(使用)" value={`¥${fmt(month?.revenue ?? 0, 4)}`} icon={TrendingUp} color="green" />
              <StatCard label="本月利润(使用)" value={`¥${fmt(month?.profit ?? 0, 4)}`} icon={TrendingUp} color={(month?.profit ?? 0) >= 0 ? "green" : "red"} />
            </div>
          </section>

          {/* ── 会员类型占比 ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">会员类型占比</h2>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
              <div className="flex h-4 rounded-full overflow-hidden mb-4 gap-0.5">
                {users?.planDistribution.map(({ plan, count }) => (
                  <div
                    key={plan}
                    className={`${PLAN_COLORS[plan] ?? "bg-gray-400"} transition-all`}
                    style={{ width: `${(count / planTotal) * 100}%` }}
                    title={`${PLAN_LABELS[plan] ?? plan}: ${count}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-4">
                {users?.planDistribution.map(({ plan, count }) => (
                  <div key={plan} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${PLAN_COLORS[plan] ?? "bg-gray-400"}`} />
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {PLAN_LABELS[plan] ?? plan}
                    </span>
                    <span className="text-sm font-semibold text-gray-800 dark:text-white tabular-nums">{count}</span>
                    <span className="text-xs text-gray-400">({((count / planTotal) * 100).toFixed(1)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── 功能使用明细 ── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">功能使用明细</h2>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_80px_80px_90px_90px_80px_80px] px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 gap-2">
                {(["功能", "调用次", "成功", "失败", "收益(元)", "成本(元)", "利润率", "积分消耗"] as const).map((h, i) => {
                  const keyMap: Record<string, SortKey> = { "调用次": "calls", "成功": "success", "失败": "failed", "收益(元)": "revenue", "成本(元)": "cost", "利润率": "margin" };
                  const sk = keyMap[h];
                  return (
                    <button
                      key={h}
                      onClick={sk ? () => handleSort(sk) : undefined}
                      className={`flex items-center gap-0.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide ${i === 0 ? "text-left" : "justify-center"} ${sk ? "cursor-pointer hover:text-gray-600 dark:hover:text-gray-300" : "cursor-default"}`}
                    >
                      {h}{sk && <SortIcon k={sk} />}
                    </button>
                  );
                })}
              </div>
              {sortedFeatures.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">暂无调用记录</div>
              ) : (
                sortedFeatures.map((f) => {
                  const profit = f.revenue != null && f.cost != null ? f.revenue - f.cost : null;
                  const margin = f.revenue != null && f.revenue > 0 && f.cost != null
                    ? (f.revenue - f.cost) / f.revenue * 100 : null;
                  const successRate = f.calls > 0 ? (f.success / f.calls) * 100 : 0;
                  return (
                    <div
                      key={f.featureKey}
                      className="grid grid-cols-[1fr_80px_80px_80px_90px_90px_80px_80px] px-4 py-3 border-b border-gray-50 dark:border-gray-700/50 last:border-b-0 items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{f.featureName}</div>
                          {f.calls === 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0">0 次</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 font-mono truncate">{f.featureKey}</div>
                      </div>
                      <div className="text-center text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{fmtInt(f.calls)}</div>
                      <div className="text-center text-sm text-green-600 dark:text-green-400 tabular-nums">{fmtInt(f.success)}</div>
                      <div className="text-center text-sm text-red-500 dark:text-red-400 tabular-nums">{fmtInt(f.failed)}</div>
                      <div className="text-center text-xs tabular-nums text-gray-600 dark:text-gray-300">
                        {f.revenue != null ? `¥${fmt(f.revenue, 4)}` : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </div>
                      <div className="text-center text-xs tabular-nums text-gray-600 dark:text-gray-300">
                        {f.cost != null ? `¥${fmt(f.cost, 4)}` : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </div>
                      <div className="text-center text-xs font-semibold tabular-nums">
                        {margin != null ? (
                          <span className={margin >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}>
                            {margin >= 0 ? "+" : ""}{margin.toFixed(1)}%
                          </span>
                        ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </div>
                      <div className="text-center text-xs tabular-nums text-gray-500 dark:text-gray-400">{fmtInt(f.credits)}</div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
