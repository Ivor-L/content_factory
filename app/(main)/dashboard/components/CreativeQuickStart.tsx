"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ChevronDown } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/lib/supabaseClient";
import { useTenantPath } from "@/hooks/useTenant";
import { Modal } from "@/components/Modal";
import { toast } from "react-hot-toast";

const DEFAULT_WORD_COUNT = 800;
const MIN_WORD_COUNT = 1;

interface CreativeQuickStartModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type StyleProfileJson = Record<string, any>;

type WritingStyleSummaryOption = {
  id: string;
  name: string;
  channel?: string | null;
  description?: string | null;
  extractionStatus?: string | null;
  currentProfile?: {
    id: string;
    status?: string | null;
  } | null;
};

type WritingStyleListResponse = {
  data?: WritingStyleSummaryOption[];
  error?: string;
};

type WritingStyleDetailResponse = {
  data?: {
    id: string;
    currentProfile?: {
      profileJson?: StyleProfileJson | null;
    } | null;
  };
  error?: string;
};

export function CreativeQuickStartModal({
  isOpen,
  onClose,
}: CreativeQuickStartModalProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const myWorksPath = useTenantPath("/my-works");

  // ── 认证 ────────────────────────────────────────────────────────────────────
  const [authToken, setAuthToken] = useState<string | null>(null);

  // ── 表单状态 ─────────────────────────────────────────────────────────────────
  const [ideaText, setIdeaText] = useState("");
  const [wordCount, setWordCount] = useState(String(DEFAULT_WORD_COUNT));
  const [styleOptions, setStyleOptions] = useState<WritingStyleSummaryOption[]>([]);
  const [styleOptionsLoading, setStyleOptionsLoading] = useState(false);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [selectedStyleJson, setSelectedStyleJson] = useState<StyleProfileJson | null>(null);
  const [styleJsonLoading, setStyleJsonLoading] = useState(false);
  const styleDetailCache = useRef<Record<string, StyleProfileJson | undefined>>({});
  const styleDetailRequests = useRef<Record<string, Promise<StyleProfileJson | null> | undefined>>({});
  const styleFetchTokenRef = useRef(0);
  const selectedStyleIdRef = useRef<string | null>(null);

  const clearSelectedStyle = useCallback(() => {
    selectedStyleIdRef.current = null;
    styleFetchTokenRef.current += 1;
    setSelectedStyleId(null);
    setSelectedStyleJson(null);
    setStyleJsonLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAuthToken(data.session?.access_token ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setAuthToken(session?.access_token ?? null)
    );
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!authToken || !isOpen) return;
    let cancelled = false;
    setStyleOptionsLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/assets/writing-styles?limit=50", {
          headers: { Authorization: `Bearer ${authToken}` },
          cache: "no-store",
        });
        const payload: WritingStyleListResponse =
          (await res.json().catch(() => ({}))) as WritingStyleListResponse;
        if (!res.ok) {
          throw new Error(payload?.error || "获取创作风格失败");
        }
        if (cancelled) return;
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        setStyleOptions(rows);
        if (
          selectedStyleIdRef.current &&
          !rows.find((row) => row.id === selectedStyleIdRef.current)
        ) {
          clearSelectedStyle();
        }
      } catch (error) {
        if (cancelled) return;
        setStyleOptions([]);
        toast.error(error instanceof Error ? error.message : "获取创作风格失败");
        clearSelectedStyle();
      } finally {
        if (!cancelled) {
          setStyleOptionsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, isOpen, clearSelectedStyle]);

  const fetchStyleDetail = useCallback(
    async (styleId: string) => {
      if (!authToken) return null;
      const cached = styleDetailCache.current[styleId];
      if (cached) {
        return cached;
      }
      if (styleDetailRequests.current?.[styleId]) {
        return styleDetailRequests.current[styleId];
      }
      const request = (async () => {
        const res = await fetch(`/api/assets/writing-styles/${styleId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
          cache: "no-store",
        });
        const payload: WritingStyleDetailResponse =
          (await res.json().catch(() => ({}))) as WritingStyleDetailResponse;
        if (!res.ok) {
          throw new Error(payload?.error || "获取风格详情失败");
        }
        const rawProfile = payload?.data?.currentProfile?.profileJson;
        const profile =
          rawProfile && typeof rawProfile === "object" && !Array.isArray(rawProfile)
            ? (rawProfile as StyleProfileJson)
            : null;
        if (profile) {
          styleDetailCache.current[styleId] = profile;
        }
        return profile;
      })().finally(() => {
        if (styleDetailRequests.current) {
          delete styleDetailRequests.current[styleId];
        }
      });
      styleDetailRequests.current = styleDetailRequests.current || {};
      styleDetailRequests.current[styleId] = request;
      return request;
    },
    [authToken],
  );

  const handleStyleSelectChange = useCallback(
    async (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      if (!value) {
        clearSelectedStyle();
        return;
      }
      selectedStyleIdRef.current = value;
      setSelectedStyleId(value);
      setSelectedStyleJson(null);
      styleFetchTokenRef.current += 1;
      const currentToken = styleFetchTokenRef.current;
      setStyleJsonLoading(true);
      try {
        const profile = await fetchStyleDetail(value);
        if (styleFetchTokenRef.current !== currentToken) {
          return;
        }
        if (!profile) {
          clearSelectedStyle();
          toast.error("该风格尚未提炼完成，请稍后再试");
          return;
        }
        setSelectedStyleJson(profile);
      } catch (error) {
        if (styleFetchTokenRef.current !== currentToken) {
          return;
        }
        clearSelectedStyle();
        toast.error(error instanceof Error ? error.message : "获取风格详情失败");
      } finally {
        if (styleFetchTokenRef.current === currentToken) {
          setStyleJsonLoading(false);
        }
      }
    },
    [fetchStyleDetail, clearSelectedStyle],
  );

  // ── 文案生成流程 ──────────────────────────────────────────────────────────────
  const [creating, setCreating] = useState(false);

  // ── 重置表单 ─────────────────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setIdeaText("");
    setWordCount(String(DEFAULT_WORD_COUNT));
    clearSelectedStyle();
  }, [clearSelectedStyle]);

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  // ── 提交 ─────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!authToken) {
      toast.error("请先登录");
      return;
    }
    if (!ideaText.trim()) {
      toast.error("请输入你的观点或想法");
      return;
    }

    const parsedWordCount = (() => {
      const raw = wordCount.trim();
      if (!raw) return DEFAULT_WORD_COUNT;
      const n = Number(raw);
      if (!Number.isFinite(n)) return DEFAULT_WORD_COUNT;
      return Math.max(MIN_WORD_COUNT, Math.round(n));
    })();

    setCreating(true);
    const effectiveStyleId = selectedStyleIdRef.current || selectedStyleId || null;
    let resolvedStyleJson = selectedStyleJson;
    let progressToastId: string | null = toast.loading("正在创建智能创作任务…");

    try {
      if (effectiveStyleId && !resolvedStyleJson) {
        resolvedStyleJson = await fetchStyleDetail(effectiveStyleId);
        if (!resolvedStyleJson) {
          throw new Error("该创作风格尚未完成提炼，请稍后再试");
        }
        setSelectedStyleJson(resolvedStyleJson);
      }

      const payload: Record<string, unknown> = {
        ideaText: ideaText.trim(),
        title: ideaText.trim().slice(0, 60) || "智能创作任务",
        goal: { targetWordCount: parsedWordCount },
      };
      if (resolvedStyleJson) {
        payload.styleRules = resolvedStyleJson;
      }

      const res = await fetch("/api/creative-tasks/direct", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "创建失败");
      }

      const taskId = typeof body?.data?.id === "string" ? body.data.id : null;

      if (progressToastId) {
        toast.success("任务已创建，正在生成完整文案", {
          id: progressToastId,
          icon: "✨",
        });
        progressToastId = null;
      } else {
        toast.success("任务已创建，正在生成完整文案", { icon: "✨" });
      }

      resetForm();
      onClose();
      router.push(taskId ? `${myWorksPath}?taskId=${taskId}` : myWorksPath);
    } catch (error) {
      if (progressToastId) {
        toast.error(error instanceof Error ? error.message : "创建失败", {
          id: progressToastId,
        });
        progressToastId = null;
      } else {
        toast.error(error instanceof Error ? error.message : "创建失败");
      }
    } finally {
      setCreating(false);
      if (progressToastId) {
        toast.dismiss(progressToastId);
      }
    }
  };

  // ── 确认回调 ─────────────────────────────────────────────────────────────────
  const styleHelperMessage = (() => {
    if (styleOptionsLoading) {
      return "写作风格列表加载中…";
    }
    if (!styleOptions.length) {
      return "暂无可用创作风格，可前往资产中心上传历史文案后提炼。";
    }
    if (selectedStyleId) {
      if (styleJsonLoading) {
        return "正在载入该风格的提炼数据…";
      }
      if (selectedStyleJson) {
        return "已锁定该风格提炼 JSON，将用于本次生成。";
      }
      return "该风格暂未提炼完成，将使用系统默认风格生成。";
    }
    return "可选择已提炼的创作风格提升匹配度，未选择时使用系统默认。";
  })();

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleCancel}
        title="智能创作"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 观点 / 想法输入 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              你的观点 / 想法
            </label>
            <textarea
              className="mt-2 w-full min-h-[120px] rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/5 resize-none"
              placeholder="例如：讲一个关于坚持的故事，或分享一个行业洞察..."
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1.5">
              系统会自动调用你的历史文案和案例故事作为创作上下文
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
            {/* 目标字数 */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                目标字数
              </label>
              <input
                type="number"
                min={MIN_WORD_COUNT}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/5"
                value={wordCount}
                onChange={(e) => setWordCount(e.target.value)}
                placeholder={`默认 ${DEFAULT_WORD_COUNT}`}
              />
            </div>
            {/* 创作风格 */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                创作风格
                {styleOptionsLoading && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
              </label>
              <div className={`relative group ${styleOptionsLoading ? "opacity-70" : ""}`}>
                <select
                  className="peer relative z-10 w-full appearance-none rounded-2xl border border-gray-200/80 bg-white/95 px-4 py-3 pr-10 text-sm font-medium text-gray-900 shadow-[0_18px_45px_rgba(15,15,16,0.12)] transition focus:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tenant-primary-ring)] hover:-translate-y-0.5 hover:shadow-[0_22px_55px_rgba(15,15,16,0.18)] disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400 dark:border-white/12 dark:bg-white/[0.04] dark:text-white dark:shadow-[0_25px_60px_rgba(0,0,0,0.55)] dark:focus-visible:ring-white/30 dark:hover:shadow-[0_30px_70px_rgba(0,0,0,0.65)]"
                  value={selectedStyleId ?? ""}
                  onChange={handleStyleSelectChange}
                  disabled={styleOptionsLoading}
                >
                  <option value="">系统默认风格</option>
                  {styleOptions.map((style) => {
                    const status = (style.currentProfile?.status || style.extractionStatus || "").toUpperCase();
                    const statusLabel =
                      status === "READY"
                        ? "已提炼"
                        : status === "FAILED"
                          ? "提炼失败"
                          : status
                            ? "提炼中"
                            : "";
                    const channelLabel = style.channel ? ` | ${style.channel}` : "";
                    return (
                      <option key={style.id} value={style.id}>
                        {style.name}
                        {channelLabel}
                        {statusLabel ? `（${statusLabel}）` : ""}
                      </option>
                    );
                  })}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-4 z-20 flex items-center text-gray-400 transition group-hover:text-gray-900 group-focus-within:text-gray-900 dark:text-white/50 dark:group-hover:text-white dark:group-focus-within:text-white">
                  <ChevronDown className="h-4 w-4" strokeWidth={2} />
                </span>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-0 rounded-2xl border border-white/40 opacity-0 transition group-hover:opacity-60 group-focus-within:opacity-100 dark:border-white/10"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5 dark:text-gray-400/90">{styleHelperMessage}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={creating}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-gray-900 disabled:opacity-60"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {"处理中…"}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  生成文案
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 hover:border-gray-300 transition"
            >
              取消
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
