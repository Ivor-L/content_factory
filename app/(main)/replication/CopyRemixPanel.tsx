'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Check, Loader2, UserCircle2, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { Modal } from "@/components/Modal";
import { DigitalHumanModal } from "@/components/DigitalHumanModal";

interface CopyInsights {
  copyText?: string;
  segments?: {
    intro?: string | null;
    body?: string | null;
    conclusion?: string | null;
  };
}

interface CopyRemixPanelProps {
  script?: {
    id: string;
    title: string;
    videoUrl?: string | null;
    breakdown?: string | null;
    blueprint?: string | null;
  } | null;
  copyInsights?: CopyInsights | null;
  isVideoUploaded?: boolean;
  videoUrl?: string;
}

type CopyStatus = "idle" | "pending" | "ready" | "failed";

type WritingStyleSummary = {
  id: string;
  name: string;
  description?: string | null;
  channel?: string | null;
  currentProfileId?: string | null;
};

const REMIX_WORD_COUNT_MIN = 120;
const REMIX_WORD_COUNT_MAX = 1600;
const REMIX_WORD_COUNT_DEFAULT = 500;

const clampRemixWordCount = (value: number): number => {
  if (!Number.isFinite(value)) return REMIX_WORD_COUNT_DEFAULT;
  return Math.max(REMIX_WORD_COUNT_MIN, Math.min(REMIX_WORD_COUNT_MAX, Math.round(value)));
};

const parseResult = (value?: string | null) => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const asRecord = (value: unknown): Record<string, any> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, any>;
};

const pickFirstText = (record: Record<string, any> | null, keys: string[]): string => {
  if (!record) return "";
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed) return trimmed;
  }
  return "";
};

const extractRemixCopyFromPayload = (
  payload?: Record<string, any> | null,
  seen?: WeakSet<Record<string, any>>,
): string => {
  if (!payload) return "";
  const registry = seen ?? new WeakSet<Record<string, any>>();
  if (registry.has(payload)) return "";
  registry.add(payload);
  const direct = pickFirstText(payload, [
    "remixCopy",
    "remix_copy",
    "new_copy",
    "second_copy",
    "script_content",
    "scriptContent",
    "copy_text",
    "copyText",
    "text",
    "正文",
  ]);
  if (direct) return direct;
  const nestedSources = [
    asRecord(payload.copyPayload),
    asRecord(payload.data),
    asRecord(payload.result),
  ];
  for (const nested of nestedSources) {
    const nestedText = extractRemixCopyFromPayload(nested ?? undefined, registry);
    if (nestedText) return nestedText;
  }
  return "";
};

export function CopyRemixPanel({
  script,
  copyInsights,
  isVideoUploaded,
  videoUrl,
}: CopyRemixPanelProps) {
  const { language } = useLanguage();
  const ui = useMemo(() => {
    if (language === "en") {
      return {
        missingRemixContent: "Remix copy is empty",
        missingRemixContentToast: "No remix copy was returned. Please try again later.",
        remixGenerated: "Remix copy generated",
        remixFailed: "Remix failed, please try again later",
        loadStyleFailed: "Failed to load writing styles",
        extractDone: "Voice-over copy extracted",
        extractMissingContext: "Missing script or video, cannot extract copy",
        extractTimeout: "Extraction timed out. Please try again.",
        extractMissingCopy: "No copy extracted",
        extractFailed: "Extraction failed",
        saveScriptFirst: "Please save the script before running remix",
        selectStyleFirst: "Please choose a writing style first",
        missingVideo: "Missing video, unable to run remix",
        missingReplicationId: "Missing replicationId",
        remixSubmitted: "Remix request submitted",
        triggerFailed: "Failed to trigger remix",
        tabOriginal: "Original Copy",
        tabRemix: "Remix Copy",
        done: "Done",
        failedRetry: "Failed, retry",
        submitting: "Submitting...",
        processing: "Processing...",
        regenerate: "Remix Again",
        startRemix: "Start Remix",
        oneClickRemix: "One-click Remix",
        currentStyle: "Current writing style: ",
        chooseStyleHint: "Choose a writing style before remix",
        changeStyle: "Change style",
        selectStyle: "Choose style",
        originalMissing: "No voice-over copy has been generated yet",
        extracting: "Extracting...",
        extractVoiceCopy: "Extract Voice-over Copy",
        remixGenerating: "Generating remix copy...",
        remixHint: "Click \"One-click Remix\" to generate copy",
        ideaLabel: "Angle / Idea (Optional)",
        ideaPlaceholder: "Leave blank to keep the original video angle",
        wordCountLabel: "Target word count",
        wordCountPlaceholder: `Default ${REMIX_WORD_COUNT_DEFAULT}`,
        wordCountHint: `Recommended range ${REMIX_WORD_COUNT_MIN}-${REMIX_WORD_COUNT_MAX} words.`,
        ideaHint: "You can add a new angle or product point. Leave empty to follow the original video.",
        cancel: "Cancel",
        needsScriptWarning: "Save and finish script breakdown before running remix.",
        generateWithDh: "Generate with Digital Human",
        dhTitle: "Generate Digital Human Video",
        styleModalTitle: "Choose Writing Style",
        loading: "Loading...",
        styleEmpty: "No writing styles yet. Please create one in the asset library.",
        selectedStyleToast: "Selected style",
      } as const;
    }
    if (language === "zh-TW") {
      return {
        missingRemixContent: "未獲取到二創文案內容",
        missingRemixContentToast: "未獲取到二創文案，請稍後重試",
        remixGenerated: "二創文案已生成",
        remixFailed: "二創失敗，請稍後重試",
        loadStyleFailed: "載入寫作風格失敗",
        extractDone: "口播文案已提取",
        extractMissingContext: "缺少腳本或影片，無法提取",
        extractTimeout: "提取逾時，請重試",
        extractMissingCopy: "未獲取到文案",
        extractFailed: "提取失敗",
        saveScriptFirst: "請先保存腳本後再發起二創",
        selectStyleFirst: "請先選擇寫作風格",
        missingVideo: "缺少影片，無法二創",
        missingReplicationId: "缺少 replicationId",
        remixSubmitted: "已提交二創請求",
        triggerFailed: "觸發失敗",
        tabOriginal: "原文案",
        tabRemix: "二創文案",
        done: "已完成",
        failedRetry: "失敗，重試",
        submitting: "提交中...",
        processing: "處理中...",
        regenerate: "重新二創",
        startRemix: "開始二創",
        oneClickRemix: "一鍵二創",
        currentStyle: "當前寫作風格：",
        chooseStyleHint: "請先選擇寫作風格後再進行二創",
        changeStyle: "更換寫作風格",
        selectStyle: "選擇寫作風格",
        originalMissing: "目前腳本尚未生成口播文案",
        extracting: "提取中...",
        extractVoiceCopy: "提取口播文案",
        remixGenerating: "二創文案生成中...",
        remixHint: "點擊「一鍵二創」以獲取文案",
        ideaLabel: "選題 / 觀點（可選）",
        ideaPlaceholder: "若不填寫，則默認沿用原影片觀點",
        wordCountLabel: "目標字數",
        wordCountPlaceholder: `默認 ${REMIX_WORD_COUNT_DEFAULT}`,
        wordCountHint: `建議範圍 ${REMIX_WORD_COUNT_MIN}-${REMIX_WORD_COUNT_MAX} 字。`,
        ideaHint: "可提前描述新的切入點或產品觀點，留空則直接參考原影片。",
        cancel: "取消",
        needsScriptWarning: "需要先保存腳本並完成拆解後，才能啟動二創。",
        generateWithDh: "用數字人生成",
        dhTitle: "生成數字人影片",
        styleModalTitle: "選擇寫作風格",
        loading: "載入中...",
        styleEmpty: "暫無寫作風格，可前往資源庫建立。",
        selectedStyleToast: "已選擇",
      } as const;
    }
    return {
      missingRemixContent: "未获取到二创文案内容",
      missingRemixContentToast: "未获取到二创文案，请稍后重试",
      remixGenerated: "二创文案已生成",
      remixFailed: "二创失败，请稍后重试",
      loadStyleFailed: "加载写作风格失败",
      extractDone: "口播文案已提取",
      extractMissingContext: "缺少脚本或视频，无法提取",
      extractTimeout: "提取超时，请重试",
      extractMissingCopy: "未获取到文案",
      extractFailed: "提取失败",
      saveScriptFirst: "请先保存脚本后再发起二创",
      selectStyleFirst: "请先选择写作风格",
      missingVideo: "缺少视频，无法二创",
      missingReplicationId: "缺少 replicationId",
      remixSubmitted: "已提交二创请求",
      triggerFailed: "触发失败",
      tabOriginal: "原文案",
      tabRemix: "二创文案",
      done: "已完成",
      failedRetry: "失败，重试",
      submitting: "提交中...",
      processing: "处理中...",
      regenerate: "重新二创",
      startRemix: "开始二创",
      oneClickRemix: "一键二创",
      currentStyle: "当前写作风格：",
      chooseStyleHint: "请选择写作风格后再进行二创",
      changeStyle: "更换写作风格",
      selectStyle: "选择写作风格",
      originalMissing: "当前脚本尚未生成口播文案",
      extracting: "提取中...",
      extractVoiceCopy: "提取口播文案",
      remixGenerating: "二创文案生成中...",
      remixHint: "点击“一键二创”以获取文案",
      ideaLabel: "选题 / 观点（可选）",
      ideaPlaceholder: "若不填写，则默认沿用原视频观点",
      wordCountLabel: "目标字数",
      wordCountPlaceholder: `默认 ${REMIX_WORD_COUNT_DEFAULT}`,
      wordCountHint: `建议范围 ${REMIX_WORD_COUNT_MIN}-${REMIX_WORD_COUNT_MAX} 字。`,
      ideaHint: "可提前描述新的切入点或产品观点，便于二创聚焦。留空则直接参考原视频。",
      cancel: "取消",
      needsScriptWarning: "需要先保存脚本并完成拆解后，才能启动二创。",
      generateWithDh: "用数字人生成",
      dhTitle: "生成数字人视频",
      styleModalTitle: "选择写作风格",
      loading: "加载中...",
      styleEmpty: "暂无写作风格，可前往资源库创建。",
      selectedStyleToast: "已选择",
    } as const;
  }, [language]);
  const LAST_STYLE_KEY = "copy_remix_last_style_id";
  const EXTRACT_PENDING_TTL = 10 * 60 * 1000; // 10 min
  const extractPendingKey = (id: string) => `extract_pending_${id}`;
  const scriptId = script?.id;
  const extractLanguage = language === "zh-TW" ? "zh-TW" : "zh-CN";

  const [viewMode, setViewMode] = useState<"original" | "remix">("original");
  const [status, setStatus] = useState<CopyStatus>("idle");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [remixCopy, setRemixCopy] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  const [dhModalOpen, setDhModalOpen] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [styleOptions, setStyleOptions] = useState<WritingStyleSummary[]>([]);
  const [styleOptionsLoading, setStyleOptionsLoading] = useState(false);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<WritingStyleSummary | null>(null);

  const derivedOriginal = useMemo(() => {
    if (copyInsights?.copyText) return copyInsights.copyText;
    const segments = [
      copyInsights?.segments?.intro,
      copyInsights?.segments?.body,
      copyInsights?.segments?.conclusion,
    ].filter(Boolean);
    if (segments.length) return segments.join("\n\n");
    return "";
  }, [copyInsights]);
  const [baseCopy, setBaseCopy] = useState(derivedOriginal);
  const [ideaText, setIdeaText] = useState("");
  const [wordCountInput, setWordCountInput] = useState<string>(String(REMIX_WORD_COUNT_DEFAULT));
  const [showIdeaInput, setShowIdeaInput] = useState(false);
  const baseCopyRef = useRef(baseCopy);

  useEffect(() => {
    baseCopyRef.current = baseCopy;
  }, [baseCopy]);

  useEffect(() => {
    setBaseCopy(derivedOriginal);
    setIdeaText("");
    setWordCountInput(String(REMIX_WORD_COUNT_DEFAULT));
    setShowIdeaInput(false);
  }, [derivedOriginal, script?.id]);

  // On mount (or when script changes), if no copy from props, pull persisted data from DB
  useEffect(() => {
    if (!script?.id || script.id === "__new__") return;
    if (derivedOriginal) return; // already have copy from parent props
    void refreshPersistedCopy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script?.id]);

  const hasOriginal = Boolean(baseCopy?.trim());
  const canExtract =
    Boolean(script && script.id !== "__new__") || Boolean(videoUrl);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthToken(data.session?.access_token ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!pendingId) return;
    const READY_STATUSES = new Set(["copy_ready", "script_ready"]);
    const FAILED_STATUSES = new Set(["copy_failed", "script_failed"]);
    const channel = supabase
      .channel(`copy-remix-${pendingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "replications",
          filter: `id=eq.${pendingId}`,
        },
        (payload) => {
          const row = payload.new as {
            status?: string;
            result?: string | null;
          };
          const parsed = parseResult(row.result);
          const normalizedStatus =
            typeof row.status === "string" ? row.status.toLowerCase() : "";
          if (READY_STATUSES.has(normalizedStatus)) {
            const nextCopy = extractRemixCopyFromPayload(parsed);
            if (!nextCopy) {
              setError(ui.missingRemixContent);
              setStatus("failed");
              toast.error(ui.missingRemixContentToast);
            } else {
              setRemixCopy(nextCopy);
              setError(null);
              setStatus("ready");
              toast.success(ui.remixGenerated);
              // Persist to localStorage so it survives modal close/reopen
              if (scriptId && scriptId !== "__new__" && typeof window !== "undefined") {
                window.localStorage.setItem(
                  REMIX_COPY_KEY(scriptId),
                  JSON.stringify({ copy: nextCopy, savedAt: Date.now() }),
                );
              }
            }
            setPendingId(null);
            setSubmitting(false);
          } else if (FAILED_STATUSES.has(normalizedStatus)) {
            const failureReason =
              parsed.error ||
              parsed.message ||
              ui.remixFailed;
            setError(failureReason);
            setStatus("failed");
            setPendingId(null);
            setSubmitting(false);
            toast.error(failureReason);
          } else {
            setStatus("pending");
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    pendingId,
    scriptId,
    ui.missingRemixContent,
    ui.missingRemixContentToast,
    ui.remixFailed,
    ui.remixGenerated,
  ]);

  const loadStyleOptions = useCallback(async () => {
    if (!authToken) return;
    setStyleOptionsLoading(true);
    setStyleError(null);
    try {
      const res = await fetch("/api/assets/writing-styles?limit=50&mode=selector", {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((language === "zh" ? payload?.error : null) || ui.loadStyleFailed);
      }
      const rows = (Array.isArray(payload?.data) ? payload.data : []) as WritingStyleSummary[];
      setStyleOptions(rows);
      if (rows.length > 0) {
        const preferredId =
          selectedStyle?.id ||
          (typeof window !== "undefined" ? localStorage.getItem(LAST_STYLE_KEY) : null);
        const preferred = (preferredId && rows.find((item) => item.id === preferredId)) || rows[0];
        if (preferred) {
          setSelectedStyle(preferred);
          if (typeof window !== "undefined") {
            localStorage.setItem(LAST_STYLE_KEY, preferred.id);
          }
        }
      } else {
        setSelectedStyle(null);
      }
    } catch (err) {
      setStyleOptions([]);
      setStyleError(err instanceof Error ? err.message : ui.loadStyleFailed);
    } finally {
      setStyleOptionsLoading(false);
    }
  }, [authToken, language, selectedStyle?.id, ui.loadStyleFailed]);

  useEffect(() => {
    if (styleModalOpen && styleOptions.length === 0 && !styleOptionsLoading) {
      void loadStyleOptions();
    }
  }, [styleModalOpen, loadStyleOptions, styleOptions.length, styleOptionsLoading]);

  useEffect(() => {
    if (!authToken) return;
    if (styleOptions.length > 0 || styleOptionsLoading) return;
    void loadStyleOptions();
  }, [authToken, loadStyleOptions, styleOptions.length, styleOptionsLoading]);

  const extractCopyFromBreakdown = useCallback((raw?: string | null) => {
    if (!raw) return "";
    const parsed = parseResult(raw);
    const direct =
      parsed.originalCopy ??
      parsed.original_copy ??
      parsed.copyText ??
      parsed.copy_text ??
      parsed.transcript ??
      parsed.text ??
      parsed.copyPayload?.originalCopy ??
      parsed.copyPayload?.original_copy;
    if (typeof direct === "string" && direct.trim()) {
      return direct.trim();
    }
    const segments = parsed.segments ?? {};
    const assembled = [segments.intro, segments.body, segments.conclusion]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean)
      .join("\n\n");
    return assembled;
  }, []);

  const refreshPersistedCopy = useCallback(async () => {
    if (!script?.id || script.id === "__new__") return null;
    try {
      const { data, error } = await supabase
        .from("scripts")
        .select("breakdown")
        .eq("id", script.id)
        .maybeSingle();
      if (error) {
        console.error("[CopyRemixPanel] Failed to sync subtitles", error);
        return null;
      }
      const next = extractCopyFromBreakdown(data?.breakdown);
      if (next && next !== baseCopyRef.current) {
        setBaseCopy(next);
      }
      return next || null;
    } catch (err) {
      console.error("[CopyRemixPanel] Unexpected sync error", err);
      return null;
    }
  }, [script?.id, extractCopyFromBreakdown]);

  const REMIX_COPY_KEY = (id: string) => `remix_copy_${id}`;

  // Restore last replication state when modal is reopened
  const restoreLatestReplication = useCallback(async () => {
    if (!script?.id || script.id === "__new__") return;

    // Fast path: restore from localStorage first (survives DB query failures)
    if (typeof window !== "undefined") {
      const cached = window.localStorage.getItem(REMIX_COPY_KEY(script.id));
      if (cached) {
        try {
          const { copy, savedAt } = JSON.parse(cached) as { copy: string; savedAt: number };
          const age = Date.now() - savedAt;
          if (copy && age < 7 * 24 * 60 * 60 * 1000) {
            setRemixCopy(copy);
            setStatus("ready");
            setViewMode("remix");
          } else {
            window.localStorage.removeItem(REMIX_COPY_KEY(script.id));
          }
        } catch {
          window.localStorage.removeItem(REMIX_COPY_KEY(script.id));
        }
      }
    }

    // Also query DB for freshest state (corrects stale localStorage)
    try {
      const { data, error } = await supabase
        .from("replications")
        .select("id, status, result")
        .eq("type", "COPY")
        .filter("input_params->>scriptId", "eq", script.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return;
      const READY_STATUSES = new Set(["copy_ready", "script_ready"]);
      const FAILED_STATUSES = new Set(["copy_failed", "script_failed"]);
      const normalizedStatus = (data.status ?? "").toLowerCase();
      if (READY_STATUSES.has(normalizedStatus)) {
        const parsed = parseResult(data.result);
        const copy = extractRemixCopyFromPayload(parsed);
        if (copy) {
          setRemixCopy(copy);
          setStatus("ready");
          setViewMode("remix");
          // Keep localStorage in sync
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              REMIX_COPY_KEY(script.id),
              JSON.stringify({ copy, savedAt: Date.now() }),
            );
          }
        }
      } else if (normalizedStatus === "pending") {
        setStatus("pending");
        setPendingId(data.id);
      } else if (FAILED_STATUSES.has(normalizedStatus)) {
        const parsed = parseResult(data.result);
        setError(parsed.error || parsed.message || ui.remixFailed);
        setStatus("failed");
      }
    } catch {
      // ignore — localStorage fallback already applied above
    }
  }, [script?.id, ui.remixFailed]);

  useEffect(() => {
    if (!script?.id || script.id === "__new__") return;
    const scriptId = script.id;

    void (async () => {
      // 1. Refresh copy from DB
      const persistedCopy = await refreshPersistedCopy();
      // 2. Restore 二创 status
      void restoreLatestReplication();
      // 3. Restore extraction pending state
      if (typeof window === "undefined") return;
      const key = extractPendingKey(scriptId);
      const stored = window.localStorage.getItem(key);
      if (!stored) return;
      const age = Date.now() - parseInt(stored, 10);
      if (age > EXTRACT_PENDING_TTL || persistedCopy) {
        window.localStorage.removeItem(key);
        return;
      }
      // Extraction was in progress — restore loading and start polling
      setExtracting(true);
      let attempts = 0;
      const timer = setInterval(async () => {
        attempts += 1;
        if (attempts > 60) {
          clearInterval(timer);
          setExtracting(false);
          window.localStorage.removeItem(key);
          return;
        }
        try {
          const { data } = await supabase
            .from("scripts")
            .select("breakdown")
            .eq("id", scriptId)
            .maybeSingle();
          if (!data) return;
          const next = extractCopyFromBreakdown(data.breakdown);
          if (next && next !== baseCopyRef.current) {
            clearInterval(timer);
            setBaseCopy(next);
            setExtracting(false);
            window.localStorage.removeItem(key);
            toast.success(ui.extractDone);
          }
        } catch { /* keep polling */ }
      }, 5000);
    })();
    // extractPendingKey is a stable function defined per render — deps are intentionally minimal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script?.id, refreshPersistedCopy, restoreLatestReplication, extractCopyFromBreakdown]);

  useEffect(() => {
    if (!script?.id || script.id === "__new__") return;
    const channel = supabase
      .channel(`scripts-copy-${script.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "scripts",
          filter: `id=eq.${script.id}`,
        },
        (payload) => {
          const breakdown = (payload.new as { breakdown?: string | null })?.breakdown;
          const next = extractCopyFromBreakdown(breakdown);
          if (next && next !== baseCopyRef.current) {
            setBaseCopy(next);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [script?.id, extractCopyFromBreakdown]);

  const handleExtract = useCallback(async () => {
    if (!canExtract) {
      toast.error(ui.extractMissingContext);
      return;
    }
    setExtracting(true);
    let asyncPending = false;
    // Mark extraction as pending in localStorage so it survives modal close/reopen
    const pendingKey =
      script?.id && script.id !== "__new__" && typeof window !== "undefined"
        ? extractPendingKey(script.id)
        : null;
    if (pendingKey) window.localStorage.setItem(pendingKey, Date.now().toString());
    try {
      const res = await fetch("/api/replication/copy/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script && script.id !== "__new__" ? script.id : undefined,
          videoUrl: script?.videoUrl || videoUrl,
          language: extractLanguage,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (language === "zh" ? payload?.error : null) || `${ui.extractFailed} (${res.status})`,
        );
      }

      // Async path: n8n will call /callback → save to DB → realtime fires → baseCopy updates.
      // Keep extracting=true so the button shows "提取中..."
      if (payload?.data?.status === "pending") {
        asyncPending = true;
        if (script?.id && script.id !== "__new__") {
          const scriptId = script.id;
          const INTERVAL = 5000;
          const MAX = 60;
          let attempts = 0;
          const timer = setInterval(async () => {
            attempts += 1;
            if (attempts > MAX) {
              clearInterval(timer);
              setExtracting(false);
              if (pendingKey) window.localStorage.removeItem(pendingKey);
              toast.error(ui.extractTimeout);
              return;
            }
            try {
              const { data, error } = await supabase
                .from("scripts")
                .select("breakdown")
                .eq("id", scriptId)
                .maybeSingle();
              if (error || !data) return;
              const next = extractCopyFromBreakdown(data.breakdown);
              if (next && next !== baseCopyRef.current) {
                clearInterval(timer);
                setBaseCopy(next);
                setExtracting(false);
                if (pendingKey) window.localStorage.removeItem(pendingKey);
                toast.success(ui.extractDone);
              }
            } catch {
              // ignore, keep polling
            }
          }, INTERVAL);
        }
        return; // stay in extracting state, realtime / polling will resolve it
      }

      // Sync fallback path.
      const normalized = Array.isArray(payload)
        ? payload[0] ?? {}
        : payload?.data ?? payload;
      const text =
        normalized?.text ||
        normalized?.transcript ||
        normalized?.result?.text ||
        normalized?.copyText ||
        normalized?.raw?.text;
      if (!text) throw new Error(ui.extractMissingCopy);
      setBaseCopy(text);
      if (pendingKey) window.localStorage.removeItem(pendingKey);
      void refreshPersistedCopy();
      toast.success(ui.extractDone);
    } catch (err) {
      if (pendingKey) window.localStorage.removeItem(pendingKey);
      toast.error(err instanceof Error ? err.message : ui.extractFailed);
    } finally {
      if (!asyncPending) setExtracting(false);
    }
  }, [
    canExtract,
    script,
    videoUrl,
    refreshPersistedCopy,
    extractCopyFromBreakdown,
    extractLanguage,
    language,
    ui.extractDone,
    ui.extractFailed,
    ui.extractMissingContext,
    ui.extractMissingCopy,
    ui.extractTimeout,
  ]);

  const handleTrigger = useCallback(async () => {
    if (script && script.id === "__new__") {
      toast.error(ui.saveScriptFirst);
      return;
    }
    if (!selectedStyle) {
      setStyleModalOpen(true);
      toast.error(ui.selectStyleFirst);
      return;
    }
    const resolvedVideoUrl = script?.videoUrl || videoUrl;
    if (!resolvedVideoUrl) {
      toast.error(ui.missingVideo);
      return;
    }
    setSubmitting(true);
    setStatus("pending");
    setError(null);
    try {
      const requestedWordCount = clampRemixWordCount(
        Number(wordCountInput || REMIX_WORD_COUNT_DEFAULT),
      );
      const payload: Record<string, unknown> = {
        videoUrl: resolvedVideoUrl,
        styleId: selectedStyle.id,
        word_count: requestedWordCount,
        wordCount: requestedWordCount,
      };
      if (script && script.id) {
        payload.scriptId = script.id;
      }
      if (baseCopy?.trim()) {
        payload.originalCopy = baseCopy.trim();
      }
      if (ideaText.trim()) {
        payload.idea_text = ideaText.trim();
      }
      const res = await fetch("/api/replication/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (language === "zh" ? responsePayload?.error : null) ||
            `${ui.triggerFailed} (${res.status})`,
        );
      }
      const replicationId = responsePayload.data?.replicationId;
      if (!replicationId) throw new Error(ui.missingReplicationId);
      setPendingId(replicationId);
      setShowIdeaInput(false);
      setWordCountInput(String(requestedWordCount));
      toast.success(ui.remixSubmitted, { icon: "✍️" });
    } catch (err) {
      setSubmitting(false);
      setStatus("idle");
      toast.error(err instanceof Error ? err.message : ui.triggerFailed);
    }
  }, [
    script,
    selectedStyle,
    videoUrl,
    baseCopy,
    ideaText,
    language,
    wordCountInput,
    ui.missingReplicationId,
    ui.missingVideo,
    ui.remixSubmitted,
    ui.saveScriptFirst,
    ui.selectStyleFirst,
    ui.triggerFailed,
  ]);

  const hasVideo = Boolean(script?.videoUrl || videoUrl);
  const needsScriptWarning = Boolean(script && script.id === "__new__");
  const disabled =
    submitting ||
    status === "pending" ||
    needsScriptWarning ||
    !hasVideo ||
    (!script?.videoUrl && !videoUrl && !isVideoUploaded) ||
    !selectedStyle;

  const isPending = submitting || status === "pending";
  const isReady = status === "ready";
  const isFailed = status === "failed";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex rounded-full border border-gray-200 dark:border-gray-700 p-1 bg-gray-50 dark:bg-gray-900/40">
          {[
            { id: "original", label: ui.tabOriginal },
            { id: "remix", label: ui.tabRemix },
          ].map((tab) => (
            <button
              key={tab.id}
              className={cn(
                "px-4 py-1 text-sm font-medium rounded-full transition-all",
                viewMode === tab.id
                  ? "bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-white"
                  : "text-gray-500 dark:text-gray-400",
              )}
              onClick={() => setViewMode(tab.id as "original" | "remix")}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
      <div className="flex flex-col items-end gap-1">
        {isReady && (
          <span className="text-[11px] font-semibold text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check className="w-3 h-3" strokeWidth={2.5} />
            {ui.done}
          </span>
        )}
        {isFailed && (
          <span className="text-[11px] font-semibold text-red-500 dark:text-red-400">
            {ui.failedRetry}
          </span>
        )}
        <button
          onClick={() => {
            if (!showIdeaInput) {
              setShowIdeaInput(true);
            } else {
              void handleTrigger();
            }
          }}
          disabled={disabled}
          className={cn(
            "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border flex items-center gap-2 whitespace-nowrap",
            "bg-[#FFD84D] text-gray-900 border-[#FFC300] hover:border-gray-900",
            "dark:bg-[#FFD84D] dark:text-gray-900 dark:border-[#FFC300] shadow-sm",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {submitting ? ui.submitting : ui.processing}
            </>
          ) : isReady ? (
            <>
              <Zap className="w-4 h-4" />
              {ui.regenerate}
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              {showIdeaInput ? ui.startRemix : ui.oneClickRemix}
            </>
          )}
        </button>
      </div>
    </div>
  </div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {selectedStyle ? (
            <>
              {ui.currentStyle}
              <span className="font-semibold text-gray-900 dark:text-white">
                {selectedStyle.name}
              </span>
            </>
          ) : (
            ui.chooseStyleHint
          )}
        </div>
        <button
          onClick={() => setStyleModalOpen(true)}
          className="text-xs font-semibold px-3 py-1 rounded-full border border-gray-200 dark:border-gray-600 hover:border-gray-900 dark:hover:border-gray-200 transition-all"
        >
          {selectedStyle ? ui.changeStyle : ui.selectStyle}
        </button>
      </div>
      <div className="flex-1 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white/90 dark:bg-gray-900/60 p-4 overflow-y-auto custom-scrollbar">
        {viewMode === "original" ? (
          hasOriginal ? (
            <pre className="whitespace-pre-wrap text-sm leading-6 text-gray-900 dark:text-gray-100">
              {baseCopy}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 text-sm text-gray-400 h-full">
              <p>{ui.originalMissing}</p>
              <button
                onClick={handleExtract}
                disabled={extracting || !canExtract}
                className={cn(
                  "px-4 py-2 rounded-full border text-gray-700 bg-white hover:border-black",
                  "dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:hover:border-gray-300",
                  (!canExtract || extracting) && "opacity-50 cursor-not-allowed",
                )}
              >
                {extracting ? ui.extracting : ui.extractVoiceCopy}
              </button>
            </div>
          )
        ) : status === "ready" ? (
          <pre className="whitespace-pre-wrap text-sm leading-6 text-gray-900 dark:text-gray-100">
            {remixCopy}
          </pre>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 text-sm">
            {status === "pending"
              ? ui.remixGenerating
              : error || ui.remixHint}
          </div>
        )}
      </div>
      {showIdeaInput && (
      <div className="mt-4 space-y-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            {ui.ideaLabel}
          </span>
          <textarea
            value={ideaText}
            onChange={(e) => setIdeaText(e.target.value)}
            rows={3}
            placeholder={ui.ideaPlaceholder}
            className={cn(
              "w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-gray-900",
              "border-gray-200 focus:border-gray-900 focus:ring-0",
              "dark:border-gray-700 dark:focus:border-gray-300",
            )}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            {ui.wordCountLabel}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={REMIX_WORD_COUNT_MIN}
            max={REMIX_WORD_COUNT_MAX}
            step={10}
            value={wordCountInput}
            onChange={(event) => {
              const cleaned = event.target.value.replace(/[^\d]/g, "");
              setWordCountInput(cleaned);
            }}
            onBlur={() => {
              const normalized = clampRemixWordCount(
                Number(wordCountInput || REMIX_WORD_COUNT_DEFAULT),
              );
              setWordCountInput(String(normalized));
            }}
            placeholder={ui.wordCountPlaceholder}
            className={cn(
              "w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-gray-900",
              "border-gray-200 focus:border-gray-900 focus:ring-0",
              "dark:border-gray-700 dark:focus:border-gray-300",
            )}
          />
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {ui.wordCountHint}
          </p>
        </label>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {ui.ideaHint}
          </p>
          <button
            onClick={() => {
              setShowIdeaInput(false);
              setIdeaText("");
              setWordCountInput(String(REMIX_WORD_COUNT_DEFAULT));
            }}
            className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ml-3 shrink-0"
          >
            {ui.cancel}
          </button>
        </div>
      </div>
      )}
      {needsScriptWarning ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center">
          {ui.needsScriptWarning}
        </p>
      ) : null}

      {isReady && remixCopy && (
        <button
          onClick={() => setDhModalOpen(true)}
          className={cn(
            "mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl",
            "border border-gray-200 dark:border-gray-700 text-sm font-medium",
            "hover:border-gray-900 dark:hover:border-gray-300 transition-all",
            "text-gray-700 dark:text-gray-300",
          )}
        >
          <UserCircle2 className="w-4 h-4" />
          {ui.generateWithDh}
        </button>
      )}

      {dhModalOpen && (
        <Modal
          isOpen={dhModalOpen}
          onClose={() => setDhModalOpen(false)}
          title={ui.dhTitle}
          maxWidth="max-w-5xl"
        >
          <DigitalHumanModal
            onClose={() => setDhModalOpen(false)}
            defaultScript={remixCopy}
            sourceTaskId={pendingId ?? undefined}
            hideInternalTitle
            showAssistant={false}
          />
        </Modal>
      )}

      {styleModalOpen && (
        <Modal
          isOpen={styleModalOpen}
          onClose={() => setStyleModalOpen(false)}
          title={ui.styleModalTitle}
        >
          {styleOptionsLoading ? (
            <div className="py-10 text-center text-gray-500">{ui.loading}</div>
          ) : styleError ? (
            <div className="py-10 text-center text-red-500 text-sm">{styleError}</div>
          ) : styleOptions.length === 0 ? (
            <div className="py-10 text-center text-gray-500 text-sm">
              {ui.styleEmpty}
            </div>
          ) : (
            <div className="space-y-3">
              {styleOptions.map((style) => (
                <button
                  key={style.id}
                  onClick={() => {
                    setSelectedStyle(style);
                    if (typeof window !== "undefined") {
                      localStorage.setItem(LAST_STYLE_KEY, style.id);
                    }
                    setStyleModalOpen(false);
                    toast.success(`${ui.selectedStyleToast}「${style.name}」`);
                  }}
                  className={cn(
                    "w-full border rounded-xl px-4 py-3 text-left transition-all",
                    selectedStyle?.id === style.id
                      ? "border-black dark:border-yellow-300 bg-black text-white dark:bg-yellow-300 dark:text-black"
                      : "border-gray-200 hover:border-black dark:border-gray-600 dark:hover:border-gray-200",
                  )}
                >
                  <div className="font-semibold">{style.name}</div>
                  {style.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {style.description}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
