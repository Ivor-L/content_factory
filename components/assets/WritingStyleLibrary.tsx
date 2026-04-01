"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Plus, Sparkles, UploadCloud } from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { WritingStyleProfileOverview } from "@/components/assets/WritingStyleProfileOverview";

type WritingStyleSummary = {
  id: string;
  name: string;
  description?: string | null;
  channel?: string | null;
  extractionStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    documents: number;
    chunks: number;
    profiles: number;
  };
  currentProfile?: {
    id: string;
    status?: string;
    sampleGaps?: string | null;
    sampleImprovement?: string | null;
    createdAt?: string;
  } | null;
};

type WritingStyleDetail = WritingStyleSummary & {
  metadata?: Record<string, any> | null;
  currentProfile?: {
    id: string;
    status?: string;
    version?: number;
    profileJson?: Record<string, any> | null;
    sampleGaps?: string | null;
    sampleImprovement?: string | null;
    createdAt?: string;
    updatedAt?: string;
  } | null;
};

type WritingStyleDocument = {
  id: string;
  title: string;
  channel?: string | null;
  sourceType?: string | null;
  status?: string;
  metadata?: Record<string, any> | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    chunks: number;
  };
};

type WritingStyleChunk = {
  id: string;
  chunkIndex: number;
  content: string;
  cardType?: string | null;
  riskLevel?: string | null;
  score?: number | null;
  createdAt?: string;
};

type WritingStyleLibraryProps = {
  showHeader?: boolean;
};

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/15 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-white/20";

const statusClass = (status?: string | null) => {
  const normalized = (status || "").toUpperCase();
  if (normalized === "READY" || normalized === "COMPLETED") {
    return "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-100 dark:border-emerald-500/30";
  }
  if (normalized === "PROCESSING" || normalized === "TRIGGERED") {
    return "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/15 dark:text-amber-100 dark:border-amber-500/30";
  }
  if (normalized === "FAILED") {
    return "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-500/15 dark:text-rose-100 dark:border-rose-500/30";
  }
  return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700/40 dark:text-gray-100 dark:border-gray-600";
};

function prettifyJson(value?: Record<string, any> | null) {
  if (!value) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export function WritingStyleLibrary({ showHeader = true }: WritingStyleLibraryProps) {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [styles, setStyles] = useState<WritingStyleSummary[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<WritingStyleDetail | null>(null);
  const [documents, setDocuments] = useState<WritingStyleDocument[]>([]);
  const [chunks, setChunks] = useState<WritingStyleChunk[]>([]);

  const [loadingStyles, setLoadingStyles] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [styleName, setStyleName] = useState("");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkInputKey, setBulkInputKey] = useState(0);
  const detailRefreshingRef = useRef(false);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const selectedStyleIdRef = useRef<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthToken(data.session?.access_token ?? null);
      setCurrentUserId(data.session?.user?.id ?? null);
      setAuthChecked(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null);
      setCurrentUserId(session?.user?.id ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const requiresAuth = authChecked && !authToken;

  const fetchStyles = useCallback(async () => {
    if (!authToken) return;
    setLoadingStyles(true);
    try {
      const res = await fetch("/api/assets/writing-styles", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "获取写作风格失败");
      }
      const rows = Array.isArray(payload.data) ? (payload.data as WritingStyleSummary[]) : [];
      setStyles(rows);
      if (!selectedStyleId && rows.length > 0) {
        setSelectedStyleId(rows[0].id);
      }
      if (selectedStyleId && !rows.find((row) => row.id === selectedStyleId)) {
        setSelectedStyleId(rows[0]?.id ?? null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取写作风格失败");
    } finally {
      setLoadingStyles(false);
    }
  }, [authToken, selectedStyleId]);

  const fetchStyleDetail = useCallback(
    async (styleId: string, options?: { silent?: boolean }) => {
      if (!authToken) return;
      const silent = Boolean(options?.silent);
      if (silent && detailRefreshingRef.current) return;

      detailRefreshingRef.current = true;
      if (!silent) {
        setLoadingDetail(true);
      }
      try {
        const [detailRes, docsRes, chunksRes] = await Promise.all([
          fetch(`/api/assets/writing-styles/${styleId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
            cache: "no-store",
          }),
          fetch(`/api/assets/writing-styles/${styleId}/documents?limit=200`, {
            headers: { Authorization: `Bearer ${authToken}` },
            cache: "no-store",
          }),
          fetch(`/api/assets/writing-styles/${styleId}/chunks?limit=500`, {
            headers: { Authorization: `Bearer ${authToken}` },
            cache: "no-store",
          }),
        ]);

        const [detailPayload, docsPayload, chunksPayload] = await Promise.all([
          detailRes.json().catch(() => ({})),
          docsRes.json().catch(() => ({})),
          chunksRes.json().catch(() => ({})),
        ]);

        if (!detailRes.ok) {
          throw new Error(detailPayload.error || "获取写作风格详情失败");
        }
        if (!docsRes.ok) {
          throw new Error(docsPayload.error || "获取内容列表失败");
        }
        if (!chunksRes.ok) {
          throw new Error(chunksPayload.error || "获取切片列表失败");
        }

        setSelectedStyle((detailPayload.data || null) as WritingStyleDetail | null);
        setDocuments(Array.isArray(docsPayload.data) ? docsPayload.data : []);
        setChunks(Array.isArray(chunksPayload.data) ? chunksPayload.data : []);
      } catch (error) {
        if (!silent) {
          toast.error(error instanceof Error ? error.message : "加载详情失败");
        }
      } finally {
        if (!silent) {
          setLoadingDetail(false);
        }
        detailRefreshingRef.current = false;
      }
    },
    [authToken]
  );

  const fetchStylesRef = useRef(fetchStyles);
  useEffect(() => {
    fetchStylesRef.current = fetchStyles;
  }, [fetchStyles]);

  const fetchStyleDetailRef = useRef(fetchStyleDetail);
  useEffect(() => {
    fetchStyleDetailRef.current = fetchStyleDetail;
  }, [fetchStyleDetail]);

  useEffect(() => {
    if (!authChecked || !authToken) return;
    void fetchStyles();
  }, [authChecked, authToken, fetchStyles]);

  useEffect(() => {
    if (!selectedStyleId) {
      setSelectedStyle(null);
      setDocuments([]);
      setChunks([]);
      return;
    }
    void fetchStyleDetail(selectedStyleId);
  }, [selectedStyleId, fetchStyleDetail]);

  useEffect(() => {
    selectedStyleIdRef.current = selectedStyleId;
  }, [selectedStyleId]);

  useEffect(() => {
    setShowRawJson(false);
  }, [selectedStyle?.currentProfile?.id]);

  useEffect(() => {
    if (!authToken || !currentUserId) {
      if (realtimeChannelRef.current) {
        void supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      return;
    }

    const channel = supabase
      .channel(`writing-style-extraction-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "writing_styles",
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          const updatedId = (payload.new as { id?: string })?.id;
          if (!updatedId) return;
          fetchStylesRef.current?.();
          if (selectedStyleIdRef.current === updatedId) {
            fetchStyleDetailRef.current?.(updatedId, { silent: true });
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
      }
      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null;
      }
    };
  }, [authToken, currentUserId]);


  const selectedStyleSummary = useMemo(
    () => styles.find((item) => item.id === selectedStyleId) || null,
    [styles, selectedStyleId]
  );
  const normalizedSelectedStatus = (selectedStyle?.extractionStatus || "").toUpperCase();
  const canCancelExtraction = normalizedSelectedStatus === "PROCESSING" || normalizedSelectedStatus === "TRIGGERED";

  const handleCreateStyle = async (event: FormEvent) => {
    event.preventDefault();
    if (!authToken) {
      toast.error("请先登录");
      return;
    }
    if (!styleName.trim()) {
      toast.error("请填写写作风格名称");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/assets/writing-styles", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: styleName.trim(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "创建写作风格失败");
      }
      const created = payload.data as WritingStyleSummary;
      setStyles((prev) => [created, ...prev]);
      setSelectedStyleId(created.id);
      setStyleName("");
      setShowCreateModal(false);
      toast.success("写作风格已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建写作风格失败");
    } finally {
      setCreating(false);
    }
  };

  const handleBulkUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!authToken || !selectedStyleId) {
      toast.error("请先选择写作风格");
      return;
    }
    if (!bulkFile) {
      toast.error("请先选择 Excel 文件");
      return;
    }

    setBulkUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", bulkFile);

      const res = await fetch(`/api/assets/writing-styles/${selectedStyleId}/bulk-upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });
      const rawText = await res.text();
      const payload = (() => {
        if (!rawText) return {};
        try {
          return JSON.parse(rawText);
        } catch {
          return {};
        }
      })();
      if (!res.ok) {
        const serverError =
          typeof payload?.error === "string" ? payload.error : "";
        const responseSnippet = serverError
          ? ""
          : rawText
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 120);
        throw new Error(
          serverError ||
            `批量上传失败（HTTP ${res.status}${responseSnippet ? `: ${responseSnippet}` : ""}）`
        );
      }

      const createdDocuments = Number(payload?.data?.createdDocuments ?? 0);
      const failedCount = Array.isArray(payload?.data?.failedRows)
        ? payload.data.failedRows.length
        : 0;
      const uploadWarning =
        typeof payload?.data?.uploadWarning === "string"
          ? payload.data.uploadWarning
          : "";

      setBulkFile(null);
      setBulkInputKey((value) => value + 1);
      await fetchStyles();
      await fetchStyleDetail(selectedStyleId);
      toast.success(`批量上传完成：成功 ${createdDocuments} 条，失败 ${failedCount} 条`);
      if (uploadWarning) {
        toast.error(uploadWarning, {
          duration: 6000,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量上传失败");
    } finally {
      setBulkUploading(false);
    }
  };

  const handleExtractStyle = async () => {
    if (!authToken || !selectedStyleId) {
      toast.error("请先选择写作风格");
      return;
    }

    setExtracting(true);
    try {
      const res = await fetch(`/api/assets/writing-styles/${selectedStyleId}/extract`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "提炼失败");
      }
      const webhookUrl =
        typeof payload?.data?.webhookUrl === "string" ? payload.data.webhookUrl : "";
      const callbackUrl =
        typeof payload?.data?.callbackUrl === "string" ? payload.data.callbackUrl : "";
      toast.success(
        webhookUrl
          ? `已触发风格提炼，目标：${webhookUrl}${callbackUrl ? `；回调：${callbackUrl}` : ""}`
          : "已触发风格提炼，请稍候查看结果"
      );
      await fetchStyles();
      await fetchStyleDetail(selectedStyleId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提炼失败");
    } finally {
      setExtracting(false);
    }
  };

  const handleCancelExtraction = async () => {
    if (!authToken || !selectedStyleId) {
      toast.error("请先选择写作风格");
      return;
    }

    setCancelling(true);
    try {
      const res = await fetch(`/api/assets/writing-styles/${selectedStyleId}/extract`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "取消提炼失败");
      }
      toast.success("已取消提炼任务");
      await fetchStyles();
      await fetchStyleDetail(selectedStyleId, { silent: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消提炼失败");
    } finally {
      setCancelling(false);
    }
  };

  const handleStyleDelete = async (styleId: string) => {
    if (!authToken) {
      toast.error("请先登录");
      return;
    }
    const target = styles.find((item) => item.id === styleId);
    const confirmText = `确定删除写作风格「${target?.name || "未命名"}」吗？`;
    if (typeof window !== "undefined" && !window.confirm(confirmText)) {
      return;
    }

    try {
      const res = await fetch(`/api/assets/writing-styles/${styleId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "删除失败");
      }
      const next = styles.filter((item) => item.id !== styleId);
      setStyles(next);
      if (selectedStyleId === styleId) {
        setSelectedStyleId(next[0]?.id ?? null);
      }
      toast.success("写作风格已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const statusLabel = (status?: string | null) => {
    const normalized = (status || "").toUpperCase();
    if (normalized === "READY" || normalized === "COMPLETED") return "已完成";
    if (normalized === "PROCESSING" || normalized === "TRIGGERED") return "处理中";
    if (normalized === "FAILED") return "失败";
    if (normalized === "IDLE") return "待提炼";
    return status || "-";
  };

  if (requiresAuth) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
        请先登录后管理写作风格。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          {showHeader && (
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">写作风格</h1>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            每个风格支持批量上传多篇内容，上传后自动切片，再点击提炼风格。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100"
        >
          <Plus className="h-4 w-4" />
          新建写作风格
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">风格列表</p>
            <button
              type="button"
              onClick={() => void fetchStyles()}
              className="text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              刷新
            </button>
          </div>
          {loadingStyles ? (
            <div className="flex items-center justify-center py-6 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : styles.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              还没有写作风格，点击右上角“新建写作风格”。
            </p>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto px-1 pb-1">
              {styles.map((style) => {
                const active = style.id === selectedStyleId;
                return (
                  <div
                    key={style.id}
                    className={cn(
                      "rounded-xl border px-3 py-2 transition",
                      active
                        ? "border-gray-900 bg-gray-50 dark:border-white dark:bg-gray-800"
                        : "border-gray-100 bg-white hover:border-gray-200 dark:border-gray-700 dark:bg-gray-900"
                    )}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setSelectedStyleId(style.id)}
                    >
                      <p className="line-clamp-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {style.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800">
                          文档 {style._count?.documents ?? 0}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800">
                          切片 {style._count?.chunks ?? 0}
                        </span>
                        <span className={cn("rounded-full border px-2 py-0.5", statusClass(style.extractionStatus))}>
                          {statusLabel(style.extractionStatus)}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleStyleDelete(style.id)}
                      className="mt-2 text-xs text-red-500 hover:text-red-600"
                    >
                      删除
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {!selectedStyleId ? (
            <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              请先选择或创建一个写作风格。
            </div>
          ) : loadingDetail ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              <p className="mt-2">正在加载风格详情...</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {selectedStyle?.name || selectedStyleSummary?.name || "未命名风格"}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      上传批量内容后自动切片，点击“提炼风格”即可生成结构化风格规则。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleExtractStyle()}
                      disabled={extracting || canCancelExtraction}
                      className="inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-gray-100"
                    >
                      {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {extracting ? "提炼中..." : "提炼风格"}
                    </button>
                    {canCancelExtraction && (
                      <button
                        type="button"
                        onClick={() => void handleCancelExtraction()}
                        disabled={cancelling}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:border-gray-600"
                      >
                        {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
                        {cancelling ? "取消中..." : "取消提炼"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className={cn("rounded-full border px-2 py-0.5", statusClass(selectedStyle?.extractionStatus))}>
                    提炼状态：{statusLabel(selectedStyle?.extractionStatus)}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    文档：{documents.length}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    切片：{chunks.length}
                  </span>
                </div>
              </div>

              <form
                onSubmit={handleBulkUpload}
                className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-white">批量上传（Excel）</p>
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    模版字段：`标题`、`内容`（内容必填）。不需要填写渠道和风格说明。
                  </p>
                  <a
                    href="/samples/writing-style-batch-template.xlsx"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    download
                  >
                    <FileText className="h-4 w-4" />
                    下载 Excel 模版
                  </a>
                  <input
                    key={bulkInputKey}
                    type="file"
                    className={inputClass}
                    accept=".xlsx,.xls,.csv"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const file = event.target.files?.[0] ?? null;
                      setBulkFile(file);
                    }}
                  />
                  <button
                    type="submit"
                    disabled={bulkUploading || !bulkFile}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-gray-100"
                  >
                    {bulkUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UploadCloud className="h-4 w-4" />
                    )}
                    {bulkUploading ? "上传中..." : "批量上传并切片"}
                  </button>
                </div>
              </form>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">已上传内容</p>
                  {documents.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">暂无内容</p>
                  ) : (
                    <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto">
                      {documents.map((doc) => (
                        <div key={doc.id} className="rounded-xl border border-gray-100 px-3 py-2 dark:border-gray-800">
                          <p className="line-clamp-1 text-sm font-medium text-gray-900 dark:text-white">{doc.title}</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            切片 {doc._count?.chunks ?? 0}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">切片预览</p>
                  {chunks.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">暂无切片</p>
                  ) : (
                    <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto">
                      {chunks.map((chunk) => (
                        <div key={chunk.id} className="rounded-xl border border-gray-100 px-3 py-2 dark:border-gray-800">
                          <p className="text-xs text-gray-500 dark:text-gray-400">#{chunk.chunkIndex}</p>
                          <p className="mt-1 line-clamp-3 text-sm text-gray-700 dark:text-gray-200">{chunk.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">提炼结果</p>
                {!selectedStyle?.currentProfile ? (
                  <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">暂无提炼结果，点击“提炼风格”生成。</p>
                ) : (
                  <div className="mt-3 space-y-4">
                    <WritingStyleProfileOverview
                      profile={selectedStyle.currentProfile.profileJson}
                      sampleGaps={selectedStyle.currentProfile.sampleGaps}
                      sampleImprovement={selectedStyle.currentProfile.sampleImprovement}
                    />
                    <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-950/40">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">JSON 原文</p>
                        <button
                          type="button"
                          onClick={() => setShowRawJson((value) => !value)}
                          className="text-xs font-medium text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                        >
                          {showRawJson ? "收起" : "展开"}
                        </button>
                      </div>
                      {showRawJson && (
                        <pre className="mt-3 max-h-[360px] overflow-auto rounded-xl border border-gray-100 bg-white p-3 text-xs leading-relaxed text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                          {prettifyJson(selectedStyle.currentProfile.profileJson) || "(空)"}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">新建写作风格</h3>
              <button
                type="button"
                onClick={() => {
                  if (creating) return;
                  setShowCreateModal(false);
                }}
                className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                关闭
              </button>
            </div>
            <form onSubmit={handleCreateStyle} className="space-y-3">
              <input
                className={inputClass}
                placeholder="风格名称（必填）"
                value={styleName}
                onChange={(event) => setStyleName(event.target.value)}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-gray-100"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {creating ? "创建中..." : "创建风格"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
