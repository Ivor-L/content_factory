"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Zap,
  Image,
  Video,
  Film,
  RefreshCw,
  PenTool,
  User,
  BookOpen,
  Sparkles,
  MessageSquare,
  FileText,
  Loader2,
  Check,
  Save,
  Pencil,
  X,
  Download,
  Upload,
} from "lucide-react";

interface CreditConfig {
  id: string;
  featureKey: string;
  featureName: string;
  category: string;
  modelKey: string | null;
  amount: number;
  cost: number | null;
  sellingPrice: number | null;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
  successCount: number;
  failureCount: number;
  usedByAgent?: boolean;
  agentCapabilities?: Array<{
    id: string;
    title: string;
    skillName: string;
  }>;
}

type LocalEdit = {
  amount?: number;
  cost?: number | null;
  sellingPrice?: number | null;
  enabled?: boolean;
};

type AgentCreditAudit = {
  ok: boolean;
  total: number;
  okCount: number;
  missingFeatureKey: Array<{ id: string; title: string }>;
  missingCreditConfig: Array<{ id: string; title: string; featureKey?: string; fallbackEstimatedCredits?: number }>;
  disabledCreditConfig: Array<{ id: string; title: string; featureKey?: string; amount?: number }>;
};

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType }> = {
  canvas_image: { label: "Canvas 图片", icon: Image },
  canvas_video: { label: "Canvas 视频", icon: Video },
  storyboard: { label: "分镜 / 视频生成", icon: Film },
  replication: { label: "爆款复刻", icon: RefreshCw },
  writing_style: { label: "写作风格", icon: PenTool },
  digital_human: { label: "数字人视频", icon: User },
  knowledge_video: { label: "知识视频", icon: BookOpen },
  smart_creation: { label: "智能创作", icon: Sparkles },
  ai_agent: { label: "AI 对话助手", icon: MessageSquare },
  content_generation: { label: "内容生成 / 分析", icon: FileText },
};

const categoryOrder = [
  "canvas_image",
  "canvas_video",
  "storyboard",
  "smart_creation",
  "content_generation",
  "replication",
  "ai_agent",
  "writing_style",
  "digital_human",
  "knowledge_video",
];

const EXCHANGE_RATE = 100; // 1元 = 100积分

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function calcMargin(sellingPrice: number | null | undefined, cost: number | null | undefined): number | null {
  if (sellingPrice == null || cost == null || sellingPrice === 0) return null;
  return (sellingPrice - cost) / sellingPrice * 100;
}

function profitColor(profit: number) {
  if (profit > 0) return "text-green-600 dark:text-green-400";
  if (profit < 0) return "text-red-500 dark:text-red-400";
  return "text-gray-400";
}

function isSeedanceCredit(config: Pick<CreditConfig, "featureKey">) {
  return config.featureKey.startsWith("storyboard_video:bytedance/seedance-");
}

function getCreditDisplayName(config: CreditConfig) {
  if (!isSeedanceCredit(config)) return config.featureName;

  const isCompat = config.featureKey.includes(".0");
  const isFast = config.featureKey.includes("fast");
  const version = isFast ? "Seedance 2.0 Fast" : "Seedance 2.0";
  return `分镜视频生成 · ${version}${isCompat ? "（兼容写法）" : "（标准写法）"}`;
}

function shouldHideConfig(config: CreditConfig) {
  return config.featureKey.startsWith("monetization_");
}

// CSV export
function exportCSV(configs: CreditConfig[]) {
  const headers = ["featureKey", "featureName", "modelKey", "category", "cost(元)", "sellingPrice(元)", "amount(积分)", "enabled", "successCount", "failureCount", "agentCapabilities"];
  const rows = configs.map((c) => [
    c.featureKey,
    c.featureName,
    c.modelKey ?? "",
    c.category,
    c.cost ?? "",
    c.sellingPrice ?? "",
    c.amount,
    c.enabled ? "true" : "false",
    c.successCount,
    c.failureCount,
    c.agentCapabilities?.map((item) => item.id).join(";") ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `credit-configs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadTemplate() {
  // Template only needs featureKey + cost + sellingPrice; other fields are auto-computed
  const headers = ["featureKey", "featureName", "modelKey", "cost(元)", "sellingPrice(元)"];
  const example = [
    ["canvas_image:nano-banana", "Canvas 图片 · Nano Banana", "nano-banana", "0.01", "0.05"],
  ];
  const csv = [headers, ...example].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "credit-configs-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminCreditsPage() {
  const router = useRouter();
  const [configs, setConfigs] = useState<CreditConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [localEdits, setLocalEdits] = useState<Map<string, LocalEdit>>(new Map());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [errorIds, setErrorIds] = useState<Map<string, string>>(new Map());
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [token, setToken] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [agentAudit, setAgentAudit] = useState<AgentCreditAudit | null>(null);
  const [fixingAgentAudit, setFixingAgentAudit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const fetchConfigs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/credits", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const text = await res.text();
      if (!text) return;
      const json = JSON.parse(text);
      if (json.data) setConfigs(json.data);
      if (json.agentCreditAudit) setAgentAudit(json.agentCreditAudit);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchConfigs();
  }, [token, fetchConfigs]);

  const startEdit = (id: string) => setEditingIds((prev) => new Set(prev).add(id));

  const cancelEdit = (id: string) => {
    setEditingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    setLocalEdits((prev) => { const m = new Map(prev); m.delete(id); return m; });
    setErrorIds((prev) => { const m = new Map(prev); m.delete(id); return m; });
  };

  const setEdit = (id: string, patch: LocalEdit) => {
    setLocalEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(id) ?? {};
      const merged = { ...current, ...patch };

      // 售价变动时自动换算积分
      if ("sellingPrice" in patch && typeof patch.sellingPrice === "number") {
        merged.amount = Math.round(patch.sellingPrice * EXCHANGE_RATE);
      }

      next.set(id, merged);
      return next;
    });
  };

  const fixAgentAudit = async (action: "fix_all" | "create_missing" | "enable_disabled" = "fix_all") => {
    if (!token) return;
    setFixingAgentAudit(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/admin/credits/agent-audit/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `修复失败 (${res.status})`);
      setAgentAudit(json.data?.audit ?? null);
      setImportResult(`Agent 积分配置已修复：创建 ${json.data?.created?.length ?? 0} 个，启用 ${json.data?.enabled?.length ?? 0} 个`);
      await fetchConfigs();
    } catch (e: any) {
      setImportResult(`Agent 积分配置修复失败：${e.message}`);
    } finally {
      setFixingAgentAudit(false);
    }
  };

  const saveOne = async (config: CreditConfig) => {
    const edit = localEdits.get(config.id);
    if (!edit || Object.keys(edit).length === 0) { cancelEdit(config.id); return; }

    setSavingIds((prev) => new Set(prev).add(config.id));
    setErrorIds((prev) => { const m = new Map(prev); m.delete(config.id); return m; });

    try {
      const res = await fetch(`/api/admin/credits/${config.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(edit),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `保存失败 (${res.status})`);
      }
      const json = await res.json();
      setConfigs((prev) => prev.map((c) => (c.id === config.id ? json.data : c)));
      setLocalEdits((prev) => { const m = new Map(prev); m.delete(config.id); return m; });
      setEditingIds((prev) => { const s = new Set(prev); s.delete(config.id); return s; });
      setSavedIds((prev) => new Set(prev).add(config.id));
      setTimeout(() => setSavedIds((prev) => { const s = new Set(prev); s.delete(config.id); return s; }), 2000);
    } catch (e: any) {
      setErrorIds((prev) => new Map(prev).set(config.id, e.message));
    } finally {
      setSavingIds((prev) => { const s = new Set(prev); s.delete(config.id); return s; });
    }
  };

  const saveAll = async () => {
    await Promise.all(configs.filter((c) => editingIds.has(c.id)).map(saveOne));
  };

  // CSV import
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setImporting(true);
    setImportResult(null);

    try {
      // Always fetch fresh configs so featureKey→id mapping is up-to-date
      const cfgRes = await fetch("/api/admin/credits", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!cfgRes.ok) {
        setImportResult("导入失败：无法加载积分配置列表");
        return;
      }
      const cfgJson = JSON.parse(await cfgRes.text());
      const currentConfigs: CreditConfig[] = cfgJson.data ?? [];
      const configMap = new Map(currentConfigs.map((c) => [c.featureKey, c]));

      const text = await file.text();
      // Handle both \r\n (Windows/Excel) and \n line endings
      const lines = text.trim().split(/\r?\n/);
      const headers = lines[0].replace(/^\uFEFF/, "").split(",").map((h) => h.replace(/"/g, "").trim());

      const idx = {
        featureKey:   headers.indexOf("featureKey"),
        featureName:  headers.indexOf("featureName"),
        modelKey:     headers.indexOf("modelKey"),
        category:     headers.indexOf("category"),
        cost:         headers.indexOf("cost(元)"),
        sellingPrice: headers.indexOf("sellingPrice(元)"),
        amount:       headers.indexOf("amount(积分)"),
        enabled:      headers.indexOf("enabled"),
      };

      if (idx.featureKey < 0) {
        setImportResult("导入失败：CSV 缺少 featureKey 列");
        return;
      }

      let updated = 0;
      let created = 0;
      let failed = 0;
      const failedKeys: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
        const featureKey = cols[idx.featureKey];
        if (!featureKey) continue;

        const existing = configMap.get(featureKey);

        if (existing) {
          // UPDATE existing config
          const patch: Record<string, unknown> = {};
          if (idx.featureName >= 0 && cols[idx.featureName]) patch.featureName = cols[idx.featureName];
          if (idx.cost >= 0 && cols[idx.cost] !== "") {
            const v = parseFloat(cols[idx.cost]);
            if (!isNaN(v)) patch.cost = v;
          }
          if (idx.sellingPrice >= 0 && cols[idx.sellingPrice] !== "") {
            const sp = parseFloat(cols[idx.sellingPrice]);
            if (!isNaN(sp)) {
              patch.sellingPrice = sp;
              patch.amount = Math.round(sp * EXCHANGE_RATE);
            }
          }
          if (idx.amount >= 0 && cols[idx.amount] !== "" && !("amount" in patch)) {
            const v = parseInt(cols[idx.amount], 10);
            if (!isNaN(v)) patch.amount = v;
          }
          if (idx.enabled >= 0 && cols[idx.enabled] !== "" && cols[idx.enabled] === "true") {
            patch.enabled = true; // 导入只允许启用，不允许批量禁用
          }

          if (Object.keys(patch).length === 0) continue;

          const res = await fetch(`/api/admin/credits/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(patch),
          });
          if (res.ok) { updated++; } else {
            const errText = await res.text().catch(() => "");
            let errMsg = errText;
            try { errMsg = JSON.parse(errText).error || errText; } catch {}
            console.error(`[import] PATCH ${featureKey} failed (${res.status}):`, errMsg);
            failed++; failedKeys.push(`${featureKey}(${res.status}:${errMsg.slice(0, 40)})`);
          }
        } else {
          // CREATE new config
          const featureName = idx.featureName >= 0 ? cols[idx.featureName] : featureKey;
          // Auto-derive category from featureKey prefix (e.g. "ai_agent:claude" → "ai_agent")
          const category = (idx.category >= 0 && cols[idx.category])
            ? cols[idx.category]
            : featureKey.includes(":") ? featureKey.split(":")[0] : featureKey;
          const modelKey = (idx.modelKey >= 0 && cols[idx.modelKey]) ? cols[idx.modelKey] : null;

          let amount = 1;
          if (idx.sellingPrice >= 0 && cols[idx.sellingPrice] !== "") {
            const sp = parseFloat(cols[idx.sellingPrice]);
            if (!isNaN(sp)) amount = Math.round(sp * EXCHANGE_RATE);
          } else if (idx.amount >= 0 && cols[idx.amount] !== "") {
            const v = parseInt(cols[idx.amount], 10);
            if (!isNaN(v)) amount = v;
          }

          const body: Record<string, unknown> = { featureKey, featureName, category, amount };
          if (modelKey) body.modelKey = modelKey;
          if (idx.cost >= 0 && cols[idx.cost] !== "") {
            const v = parseFloat(cols[idx.cost]);
            if (!isNaN(v)) body.cost = v;
          }
          if (idx.sellingPrice >= 0 && cols[idx.sellingPrice] !== "") {
            const sp = parseFloat(cols[idx.sellingPrice]);
            if (!isNaN(sp)) body.sellingPrice = sp;
          }
          if (idx.enabled >= 0 && cols[idx.enabled] !== "" && cols[idx.enabled] === "true") {
            body.enabled = true;
          }

          const res = await fetch("/api/admin/credits", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          });
          if (res.ok) { created++; } else {
            const errText = await res.text().catch(() => "");
            let errMsg = errText;
            try { errMsg = JSON.parse(errText).error || errText; } catch {}
            console.error(`[import] POST ${featureKey} failed (${res.status}):`, errMsg);
            failed++; failedKeys.push(`${featureKey}(${res.status}:${errMsg.slice(0, 40)})`);
          }
        }
      }

      await fetchConfigs();
      const parts = [];
      if (updated > 0) parts.push(`${updated} 条更新`);
      if (created > 0) parts.push(`${created} 条新增`);
      if (failed > 0) parts.push(`${failed} 条失败`);
      const baseMsg = `导入完成：${parts.join("，") || "无变更"}`;
      setImportResult(
        failed > 0 && failedKeys.length > 0
          ? `${baseMsg}（${failedKeys.slice(0, 3).join(", ")}${failedKeys.length > 3 ? ` 等 ${failedKeys.length} 条` : ""}）`
          : baseMsg
      );
    } catch (e: any) {
      setImportResult(`导入失败：${e.message}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const dirtyCount = editingIds.size;

  const visibleConfigs = configs.filter((config) => !shouldHideConfig(config));

  const grouped = visibleConfigs.reduce<Record<string, CreditConfig[]>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  const sortedCategories = [
    ...categoryOrder.filter((k) => grouped[k]),
    ...Object.keys(grouped).filter((k) => !categoryOrder.includes(k)),
  ];

  // 汇总统计
  const totalProfit = visibleConfigs.reduce((sum, c) => {
    if (c.cost != null && c.sellingPrice != null) return sum + (c.sellingPrice - c.cost);
    return sum;
  }, 0);
  const marginItems = visibleConfigs.filter((c) => c.sellingPrice != null && c.sellingPrice > 0 && c.cost != null);
  const avgMargin = marginItems.length > 0
    ? marginItems.reduce((sum, c) => sum + (c.sellingPrice! - c.cost!) / c.sellingPrice! * 100, 0) / marginItems.length
    : null;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Zap size={20} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">积分配置</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            共 {visibleConfigs.length} 项 · 1元 = {EXCHANGE_RATE} 积分 · 修改后 60 秒内生效
          </p>
        </div>
        {/* Import / Export */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm transition-colors"
          >
            <Download size={14} />
            模板
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm transition-colors disabled:opacity-50"
          >
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            导入
          </button>
          <button
            onClick={() => exportCSV(configs)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm transition-colors"
          >
            <Download size={14} />
            导出
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
        </div>
      </div>

      {importResult && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium ${importResult.includes("失败") ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"}`}>
          {importResult}
        </div>
      )}

      {agentAudit && !agentAudit.ok && (
        <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
              <Zap size={16} className="text-amber-600 dark:text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">Agent 功能积分检查</h2>
                <span className="text-xs text-amber-700 dark:text-amber-300">{agentAudit.okCount}/{agentAudit.total} 已配置</span>
              </div>
              <div className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-200">
                {agentAudit.missingFeatureKey.length > 0 && <p>缺少 featureKey：{agentAudit.missingFeatureKey.map((item) => item.id).join(", ")}</p>}
                {agentAudit.missingCreditConfig.length > 0 && <p>缺少积分配置：{agentAudit.missingCreditConfig.map((item) => `${item.featureKey || item.id}(${item.fallbackEstimatedCredits ?? 1}积分)`).join(", ")}</p>}
                {agentAudit.disabledCreditConfig.length > 0 && <p>已禁用配置：{agentAudit.disabledCreditConfig.map((item) => item.featureKey || item.id).join(", ")}</p>}
              </div>
            </div>
            <button
              onClick={() => fixAgentAudit("fix_all")}
              disabled={fixingAgentAudit || agentAudit.missingFeatureKey.length > 0}
              className="px-3 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              title={agentAudit.missingFeatureKey.length > 0 ? "缺少 featureKey 需要开发侧先补 registry 映射" : "按 agent 能力审计结果创建缺失配置并启用已禁用配置"}
            >
              {fixingAgentAudit ? "修复中..." : "一键修复"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" />
          加载中...
        </div>
      ) : (
        <div className="space-y-4">
          {sortedCategories.map((category) => {
            const rows = grouped[category];
            const meta = CATEGORY_META[category] ?? { label: category, icon: Zap };
            const Icon = meta.icon;

            // Category-level profit sum & average margin
            const catProfit = rows.reduce((sum, c) => {
              const edit = localEdits.get(c.id) ?? {};
              const sp = edit.sellingPrice ?? c.sellingPrice;
              const cost = edit.cost ?? c.cost;
              if (sp != null && cost != null) return sum + (sp - cost);
              return sum;
            }, 0);
            const catMarginItems = rows.filter((c) => {
              const edit = localEdits.get(c.id) ?? {};
              const sp = edit.sellingPrice ?? c.sellingPrice;
              return sp != null && sp > 0 && (edit.cost ?? c.cost) != null;
            });
            const catAvgMargin = catMarginItems.length > 0
              ? catMarginItems.reduce((sum, c) => {
                  const edit = localEdits.get(c.id) ?? {};
                  const sp = (edit.sellingPrice ?? c.sellingPrice)!;
                  const cost = (edit.cost ?? c.cost)!;
                  return sum + (sp - cost) / sp * 100;
                }, 0) / catMarginItems.length
              : null;

            return (
              <div key={category} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                {/* Category Header */}
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex items-center gap-2">
                  <Icon size={15} className="text-gray-500 dark:text-gray-400" />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{meta.label}</span>
                  <span className="text-xs text-gray-400 ml-1">{rows.length} 项</span>
                  {catAvgMargin != null && (
                    <span className={`ml-auto text-xs font-medium ${profitColor(catAvgMargin)}`}>
                      平均利润率 {catAvgMargin.toFixed(1)}%
                    </span>
                  )}
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-[1fr_70px_70px_70px_70px_70px_56px_56px_60px_100px] px-4 py-2 border-b border-gray-50 dark:border-gray-700/50 gap-2">
                  {["功能 / 模型", "成本(元)", "售价(元)", "积分数", "利润(元)", "利润率(%)", "成功", "失败", "状态", "操作"].map((h) => (
                    <span key={h} className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide text-center first:text-left">
                      {h}
                    </span>
                  ))}
                </div>

                {/* Rows */}
                {rows.map((config) => {
                  const edit = localEdits.get(config.id) ?? {};
                  const isEditing = editingIds.has(config.id);
                  const isSaving = savingIds.has(config.id);
                  const isSaved = savedIds.has(config.id);
                  const errMsg = errorIds.get(config.id);

                  const currentAmount = edit.amount ?? config.amount;
                  const currentCost = "cost" in edit ? edit.cost : config.cost;
                  const currentSelling = "sellingPrice" in edit ? edit.sellingPrice : config.sellingPrice;
                  const currentEnabled = edit.enabled ?? config.enabled;

                  const profit = currentSelling != null && currentCost != null
                    ? currentSelling - currentCost
                    : null;

                  return (
                    <div
                      key={config.id}
                      className={`grid grid-cols-[1fr_70px_70px_70px_70px_70px_56px_56px_60px_100px] px-4 py-3 border-b border-gray-50 dark:border-gray-700/50 last:border-b-0 items-center gap-2 transition-all ${
                        isEditing ? "bg-amber-50 dark:bg-amber-900/10 border-l-2 border-l-amber-400" :
                        isSaved ? "bg-green-50 dark:bg-green-900/10 border-l-2 border-l-green-400" : ""
                      } ${!currentEnabled && !isEditing ? "opacity-50" : ""}`}
                    >
                      {/* Feature Name */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-sm font-medium text-gray-800 dark:text-gray-200 ${!currentEnabled && !isEditing ? "line-through" : ""}`}>
                            {getCreditDisplayName(config)}
                          </span>
                          {config.modelKey && (
                            <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded font-mono">{config.modelKey}</span>
                          )}
                          {isSeedanceCredit(config) && (
                            <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-semibold tracking-wide">
                              每秒
                            </span>
                          )}
                          {config.usedByAgent && (
                            <span
                              title={config.agentCapabilities?.map((item) => `${item.title} (${item.id})`).join("\n")}
                              className="text-[10px] bg-black text-white dark:bg-white dark:text-black px-1.5 py-0.5 rounded-full font-semibold tracking-wide"
                            >
                              Agent ×{config.agentCapabilities?.length ?? 0}
                            </span>
                          )}
                        </div>
                        {config.usedByAgent && config.agentCapabilities?.length ? (
                          <p className="text-[11px] text-indigo-500 dark:text-indigo-300 mt-0.5 truncate">
                            Agent: {config.agentCapabilities.map((item) => item.id).join(", ")}
                          </p>
                        ) : null}
                        {errMsg && <p className="text-xs text-red-500 mt-0.5">{errMsg}</p>}
                      </div>

                      {/* Cost */}
                      <div className="flex justify-center">
                        {isEditing ? (
                          <input
                            type="number" min={0} step={0.001}
                            value={currentCost ?? ""}
                            placeholder="0.00"
                            onChange={(e) => {
                              const v = e.target.value === "" ? null : parseFloat(e.target.value);
                              setEdit(config.id, { cost: v });
                            }}
                            className="w-full px-1.5 py-1 text-xs border border-amber-300 dark:border-amber-600 rounded-lg text-center bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                          />
                        ) : (
                          <span className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                            {currentCost != null ? `¥${fmt(currentCost, 4)}` : <span className="text-gray-300 dark:text-gray-600">—</span>}
                          </span>
                        )}
                      </div>

                      {/* Selling Price */}
                      <div className="flex justify-center">
                        {isEditing ? (
                          <input
                            type="number" min={0} step={0.01}
                            value={currentSelling ?? ""}
                            placeholder="0.00"
                            onChange={(e) => {
                              const v = e.target.value === "" ? null : parseFloat(e.target.value);
                              setEdit(config.id, { sellingPrice: v });
                            }}
                            className="w-full px-1.5 py-1 text-xs border border-amber-300 dark:border-amber-600 rounded-lg text-center bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                          />
                        ) : (
                          <span className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                            {currentSelling != null ? `¥${fmt(currentSelling)}` : <span className="text-gray-300 dark:text-gray-600">—</span>}
                          </span>
                        )}
                      </div>

                      {/* Credits */}
                      <div className="flex justify-center">
                        {isEditing ? (
                          <input
                            type="number" min={0} max={9999} step={1}
                            value={currentAmount}
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(9999, Math.floor(Number(e.target.value))));
                              if (!isNaN(v)) setLocalEdits((prev) => {
                                const m = new Map(prev);
                                m.set(config.id, { ...(m.get(config.id) ?? {}), amount: v });
                                return m;
                              });
                            }}
                            className="w-full px-1.5 py-1 text-xs border border-amber-300 dark:border-amber-600 rounded-lg text-center bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                          />
                        ) : (
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                            {currentAmount}
                          </span>
                        )}
                      </div>

                      {/* Profit */}
                      <div className="flex justify-center">
                        {profit != null ? (
                          <span className={`text-xs font-semibold tabular-nums ${profitColor(profit)}`}>
                            {profit >= 0 ? "+" : ""}{fmt(profit, 4)}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                        )}
                      </div>

                      {/* Margin */}
                      {(() => {
                        const margin = calcMargin(currentSelling, currentCost);
                        return (
                          <div className="flex justify-center">
                            {margin != null ? (
                              <span className={`text-xs font-semibold tabular-nums ${profitColor(margin)}`}>
                                {margin >= 0 ? "+" : ""}{margin.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Success Count */}
                      <div className="flex justify-center">
                          <span className="text-xs font-medium tabular-nums text-green-600 dark:text-green-400">
                            {config.successCount > 0 ? config.successCount : <span className="text-gray-300 dark:text-gray-600">0</span>}
                          </span>
                      </div>

                      {/* Failure Count */}
                      <div className="flex justify-center">
                        <span className="text-xs font-medium tabular-nums text-red-500 dark:text-red-400">
                          {config.failureCount > 0 ? config.failureCount : <span className="text-gray-300 dark:text-gray-600">0</span>}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="flex justify-center">
                        {isEditing ? (
                          <button
                            onClick={() => setEdit(config.id, { enabled: !currentEnabled })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${currentEnabled ? "bg-black dark:bg-white" : "bg-gray-200 dark:bg-gray-600"}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black transition-transform ${currentEnabled ? "translate-x-6" : "translate-x-1"}`} />
                          </button>
                        ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.enabled ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-gray-100 dark:bg-gray-700 text-gray-400"}`}>
                            {config.enabled ? "启用" : "禁用"}
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex justify-center items-center gap-1.5">
                        {isSaving ? (
                          <Loader2 size={16} className="animate-spin text-gray-400" />
                        ) : isSaved && !isEditing ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                            <Check size={13} />已保存
                          </span>
                        ) : isEditing ? (
                          <>
                            <button
                              onClick={() => saveOne(config)}
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-black dark:bg-white text-white dark:text-black font-semibold hover:opacity-80 transition-opacity"
                            >
                              <Save size={12} />保存
                            </button>
                            <button
                              onClick={() => cancelEdit(config.id)}
                              className="flex items-center text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <X size={12} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => startEdit(config.id)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                          >
                            <Pencil size={12} />编辑
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Overall margin summary */}
          {avgMargin != null && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">平均利润率</span>
              <span className={`text-sm font-bold tabular-nums ${profitColor(avgMargin)}`}>
                {avgMargin.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Sticky Bottom Bar */}
      {dirtyCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-4 z-20">
          <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">{dirtyCount} 项正在编辑</span>
          <button
            onClick={() => { setLocalEdits(new Map()); setEditingIds(new Set()); setErrorIds(new Map()); }}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            放弃所有更改
          </button>
          <button
            onClick={saveAll}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            <Save size={14} />保存所有修改
          </button>
        </div>
      )}
      {dirtyCount > 0 && <div className="h-24" />}
    </div>
  );
}
