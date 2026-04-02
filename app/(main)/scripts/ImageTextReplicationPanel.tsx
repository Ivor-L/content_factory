"use client";

/* eslint-disable @next/next/no-img-element -- Replication panel shows third-party/source images and generated outputs */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Copy, Loader2, RotateCcw, Sparkles, Upload } from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "@/lib/supabaseClient";
import { IMAGE_UNDERSTANDING_PROMPT_KNOWLEDGE_SHARE } from "@/lib/imageUnderstandingPrompts";

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type StylePreset = {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  previewUrl?: string | null;
  spec?: unknown;
  metadata?: unknown;
  status?: string | null;
};

type ImageGuidanceItem = { index: number; description: string };

type Task = {
  id: string;
  status: string;
  analysisResult?: unknown;
  generatedCopy?: string | null;
  generatedImages?: string[] | null;
  imageGuidance?: ImageGuidanceItem[] | null;
  errorMessage?: string | null;
  stylePreset?: StylePreset | null;
};

interface Props {
  sourceTitle?: string | null;
  sourceText?: string | null;
  sourceImages?: string[];
  sourcePlatform?: string | null;
  sourceId?: string | null;
  sourceUrl?: string | null;
  onClose: () => void;
}

const POLL_INTERVAL = 3000;

const STATUS_LABELS: Record<string, string> = {
  BREAKDOWN_PENDING: "正在分析原帖内容…",
  BREAKDOWN_COMPLETED: "分析完成",
  BREAKDOWN_FAILED: "分析失败",
  GENERATE_PENDING: "正在生成仿写内容…",
  GENERATE_FAILED: "生成失败",
  COMPLETED: "生成完成",
};

type AnalysisStatus = "idle" | "running" | "success" | "error";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const serializeJsonValue = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed && trimmed !== "{}" && trimmed !== "[]" ? trimmed : null;
  }
  if (isPlainRecord(value) || Array.isArray(value)) {
    if (Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0) return null;
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return null;
};

const parseStyleMetadata = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (isPlainRecord(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return isPlainRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const extractStyleProfileJsonFromPreset = (style?: StylePreset | null): string | null => {
  if (!style) return null;
  const metadata = parseStyleMetadata(style.metadata);
  const candidates: unknown[] = [];
  if (metadata?.analysis) candidates.push(metadata.analysis);
  if (metadata?.style_profile_json) candidates.push(metadata.style_profile_json);
  if (metadata?.styleProfileJson) candidates.push(metadata.styleProfileJson);
  if (metadata?.style_dna) {
    const enriched: Record<string, unknown> = { style_dna: metadata.style_dna };
    if (metadata.generation_prompts) {
      enriched.generation_prompts = metadata.generation_prompts;
    }
    if (metadata.layout_blueprint) {
      enriched.layout_blueprint = metadata.layout_blueprint;
    }
    if (metadata.content_mapping) {
      enriched.content_mapping = metadata.content_mapping;
    }
    candidates.push(enriched);
  }
  if (typeof style.metadata === "string") candidates.push(style.metadata);
  if (style.spec) candidates.push(style.spec);
  for (const candidate of candidates) {
    const serialized = serializeJsonValue(candidate);
    if (serialized) return serialized;
  }
  return null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ImageTextReplicationPanel({
  sourceTitle,
  sourceText,
  sourceImages = [],
  sourcePlatform,
  sourceId,
  sourceUrl,
  onClose,
}: Props) {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [styleName, setStyleName] = useState("");
  const [styleFile, setStyleFile] = useState<File | null>(null);
  const [uploadingStyle, setUploadingStyle] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [topicHint, setTopicHint] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const fallbackSource = useMemo(() => (sourceText?.trim() || sourceTitle?.trim() || ""), [sourceText, sourceTitle]);
  const hasSourceImages = sourceImages.length > 0;
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>(hasSourceImages ? "idle" : "success");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: sourceImages.length,
  });
  const [analysisText, setAnalysisText] = useState(hasSourceImages ? "" : fallbackSource);
  const [analysisSavedAt, setAnalysisSavedAt] = useState<number | null>(null);
  const [analysisExpanded, setAnalysisExpanded] = useState(!hasSourceImages);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sourceImagesKey = useMemo(() => sourceImages.join("|"), [sourceImages]);
  const analysisStorageKey = useMemo(() => {
    const normalizedPlatform = (sourcePlatform || "unknown").toLowerCase();
    const trimmedId = sourceId?.trim();
    const trimmedUrl = sourceUrl?.trim();
    const fallbackIdentifier = sourceImagesKey ? `img:${hashString(sourceImagesKey)}` : null;
    const identifier = trimmedId
      ? `id:${trimmedId}`
      : trimmedUrl
        ? `url:${trimmedUrl}`
        : fallbackIdentifier;
    if (!identifier) return null;
    return `image-text-analysis:${normalizedPlatform}:${identifier}`;
  }, [sourcePlatform, sourceId, sourceUrl, sourceImagesKey]);

  const persistAnalysisResult = useCallback(
    (text: string) => {
      if (!analysisStorageKey || typeof window === "undefined") return;
      const trimmed = text.trim();
      if (!trimmed) {
        window.localStorage.removeItem(analysisStorageKey);
        setAnalysisSavedAt(null);
        return;
      }
      const payload = { version: 1, text: trimmed, savedAt: Date.now() };
      window.localStorage.setItem(analysisStorageKey, JSON.stringify(payload));
      setAnalysisSavedAt(payload.savedAt);
    },
    [analysisStorageKey],
  );

  const fetchPresets = useCallback(async () => {
    if (!authToken) return;
    setPresetsLoading(true);
    try {
      const res = await fetch("/api/assets/styles?limit=50", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        throw new Error(raw || "加载风格模板失败");
      }
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.styles)
        ? data.styles
        : [];
      setPresets(list);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "加载风格模板失败");
    } finally {
      setPresetsLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthToken(data.session?.access_token ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ── Load style presets once auth is ready ──────────────────────────
  useEffect(() => {
    if (presets.length === 0 && authToken) {
      fetchPresets();
    }
  }, [presets.length, authToken, fetchPresets]);

  useEffect(() => {
    return () => stopPoll();
  }, []);

  useEffect(() => {
    const hasImages = sourceImages.length > 0;
    let nextText = hasImages ? "" : fallbackSource;
    let nextStatus: AnalysisStatus = hasImages ? "idle" : "success";
    let savedAt: number | null = null;

    if (analysisStorageKey && typeof window !== "undefined") {
      const stored = window.localStorage.getItem(analysisStorageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as { text?: string; savedAt?: number };
          if (typeof parsed?.text === "string" && parsed.text.trim()) {
            nextText = parsed.text;
            nextStatus = "success";
            savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : null;
          }
        } catch (error) {
          console.warn("[replication-panel] Failed to parse stored analysis result", error);
        }
      }
    }

    setAnalysisStatus(nextStatus);
    setAnalysisError(null);
    setAnalysisProgress({
      current: nextStatus === "success" ? sourceImages.length : 0,
      total: sourceImages.length,
    });
    setAnalysisText(nextText);
    setAnalysisSavedAt(savedAt);
    setAnalysisExpanded(hasImages ? nextStatus !== "success" : true);
  }, [analysisStorageKey, fallbackSource, sourceImages.length, sourceImagesKey]);

  const requiresAnalysis = hasSourceImages;

  useEffect(() => {
    if (!analysisStorageKey || typeof window === "undefined") return;
    if (analysisStatus !== "success") return;
    const trimmed = analysisText.trim();
    if (!trimmed) return;
    const timer = window.setTimeout(() => {
      persistAnalysisResult(trimmed);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [analysisText, analysisStatus, analysisStorageKey, persistAnalysisResult]);

  function stopPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPoll(taskId: string) {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/image-text-replication/${taskId}`);
        if (!res.ok) return;
        const data = await res.json();
        const t: Task = data.task;
        setTask(t);
        const terminal = ["BREAKDOWN_COMPLETED", "BREAKDOWN_FAILED", "COMPLETED", "GENERATE_FAILED"];
        if (terminal.includes(t.status)) {
          stopPoll();
        }
      } catch {
        // keep polling
      }
    }, POLL_INTERVAL);
  }

  async function createTaskIfNeeded(): Promise<string | null> {
    if (task?.id && task.status === "BREAKDOWN_COMPLETED") return task.id;
    setStartError(null);
    const fallbackSource = (sourceText?.trim() || sourceTitle?.trim() || "").trim();
    const normalizedSourceText = (analysisText.trim() || fallbackSource).trim();
    if (!normalizedSourceText) {
      toast.error("未获取到图文内容，请先完成解析或手动填写关键信息");
      return null;
    }
    try {
      const res = await fetch("/api/image-text-replication/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceTitle,
          sourceText: normalizedSourceText,
          sourceImages,
          sourcePlatform,
          sourceId,
          sourceUrl,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error ?? "启动失败");
      }
      const data = await res.json();
      setTask({ id: data.taskId, status: data.status });
      return data.taskId as string;
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : "启动分析失败，请重试";
      const message = rawMessage.includes("Can't reach database server")
        ? "数据库未连接（127.0.0.1:54322 无响应），请先启动本地数据库或恢复隧道后重试。"
        : rawMessage;
      setStartError(message);
      toast.error(message);
      console.error(err);
      return null;
    }
  }

  function isStyleReady(style: StylePreset | undefined): boolean {
    if (!style) return false;
    if (!style.status) return true;
    const status = style.status.toUpperCase();
    return status === "READY" || status === "COMPLETED" || status === "SUCCESS";
  }

  async function handleGenerate() {
    if (requiresAnalysis && (analysisStatus !== "success" || !analysisText.trim())) {
      const reason =
        analysisStatus === "running"
          ? "正在解析参考图，请稍候"
          : analysisStatus === "error"
            ? "解析失败，请重新解析后再尝试"
            : "请先完成图文解析";
      toast.error(reason);
      return;
    }
    if (!selectedPresetId) {
      toast.error("请先选择风格模板");
      return;
    }
    const selectedStyle = presets.find((item) => item.id === selectedPresetId);
    if (!isStyleReady(selectedStyle)) {
      toast.error("模板还在解析中，请稍后再试");
      return;
    }
    const styleProfileJson = extractStyleProfileJsonFromPreset(selectedStyle);
    if (!styleProfileJson) {
      toast.error("该模板缺少图文排版风格JSON，请先完成模板解析");
      return;
    }
    setGenerating(true);
    try {
      const taskId = await createTaskIfNeeded();
      if (!taskId) return;
      const res = await fetch(`/api/image-text-replication/${taskId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stylePresetId: selectedPresetId,
          styleProfileJson,
          topicHint: topicHint.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "生成失败");
      }
      toast.success("已开始复刻，稍后在我的项目中查看");
      onClose();
      return;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败，请重试");
    } finally {
      setGenerating(false);
    }
  }

  function handleRestartFromResult() {
    stopPoll();
    setTask(null);
    setStartError(null);
  }

  async function handleUploadStyle() {
    if (!authToken) {
      toast.error("请先登录后再上传模板");
      return;
    }
    if (!styleFile) {
      toast.error("请先选择模板图片");
      return;
    }
    setUploadingStyle(true);
    try {
      const formData = new FormData();
      formData.append("file", styleFile);
      formData.append("name", styleName.trim() || styleFile.name || "未命名风格");
      formData.append("type", "xhs-visual");
      const res = await fetch("/api/assets/styles/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "上传模板失败");
      }
      const created = payload?.data as StylePreset | undefined;
      if (created?.id) {
        setSelectedPresetId(created.id);
      }
      setStyleName("");
      setStyleFile(null);
      await fetchPresets();
      setUploadModalOpen(false);
      toast.success("模板已上传，正在解析风格");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传模板失败");
    } finally {
      setUploadingStyle(false);
    }
  }

  async function handleCopy() {
    if (!task?.generatedCopy) return;
    try {
      await navigator.clipboard.writeText(task.generatedCopy);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  }

  const toAbsoluteUrl = useCallback((url: string) => {
    if (!url) return url;
    if (/^https?:/i.test(url) || url.startsWith("data:")) return url;
    if (typeof window !== "undefined" && url.startsWith("/")) {
      return `${window.location.origin}${url}`;
    }
    return url;
  }, []);

  const handleAnalyzeImages = useCallback(async () => {
    if (sourceImages.length === 0) {
      toast.error("当前参考没有可解析的图片");
      return;
    }
    setAnalysisStatus("running");
    setAnalysisError(null);
    setAnalysisProgress({ current: 0, total: sourceImages.length });
    setAnalysisSavedAt(null);
    setAnalysisExpanded(false);
    const aggregated: string[] = [];
    try {
      for (let i = 0; i < sourceImages.length; i += 1) {
        const imageUrl = sourceImages[i];
        if (!imageUrl) continue;
        const normalizedUrl = toAbsoluteUrl(imageUrl);
        if (!normalizedUrl) {
          throw new Error(`第 ${i + 1} 张图片链接无效`);
        }
        setAnalysisProgress({ current: i + 1, total: sourceImages.length });
        const res = await fetch("/api/canvas/image-understanding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: normalizedUrl,
            prompt: IMAGE_UNDERSTANDING_PROMPT_KNOWLEDGE_SHARE,
            model: "gemini-3.1-flash-lite-preview",
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const message = payload?.error || `第 ${i + 1} 张解析失败`;
          throw new Error(message);
        }
        const rawText = typeof payload?.result === "string" ? payload.result.trim() : "";
        const prefix = sourceImages.length > 1 ? `图${i + 1}` : "图文解析";
        aggregated.push(rawText ? `${prefix}：${rawText}` : `${prefix}：未能解析出有效信息`);
      }
      const combinedText = aggregated.join("\n\n");
      setAnalysisText(combinedText);
      setAnalysisStatus("success");
      setAnalysisProgress({ current: sourceImages.length, total: sourceImages.length });
       persistAnalysisResult(combinedText);
      toast.success("图文解析完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : "图文解析失败";
      if (aggregated.length > 0) {
        setAnalysisText(aggregated.join("\n\n"));
      }
      setAnalysisError(message);
      setAnalysisStatus("error");
      toast.error(message);
    }
  }, [persistAnalysisResult, sourceImages, toAbsoluteUrl]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (task?.status === "GENERATE_PENDING") {
    return <LoadingView label={STATUS_LABELS.GENERATE_PENDING} />;
  }

  if (task?.status === "GENERATE_FAILED") {
    return (
      <ErrorView
        message={task.errorMessage ?? "生成失败"}
        onRetry={handleGenerate}
      />
    );
  }

  if (task?.status === "COMPLETED") {
    return (
      <ResultView
        generatedCopy={task.generatedCopy ?? ""}
        generatedImages={task.generatedImages ?? []}
        imageGuidance={task.imageGuidance ?? []}
        sourceImages={sourceImages}
        copied={copied}
        onCopy={handleCopy}
        onRestart={handleRestartFromResult}
        onClose={onClose}
      />
    );
  }

  const trimmedAnalysisText = analysisText.trim();
  const analysisReady = requiresAnalysis ? analysisStatus === "success" && trimmedAnalysisText.length > 0 : true;
  let generationBlockedReason: string | null = null;
  if (requiresAnalysis && !analysisReady) {
    if (analysisStatus === "running") {
      generationBlockedReason = "正在解析参考图…";
    } else if (analysisStatus === "error") {
      generationBlockedReason = "解析失败，请重新解析";
    } else {
      generationBlockedReason = "请先完成图文解析";
    }
  }
  const step2ChipLabel = !requiresAnalysis
    ? "直接生成"
    : analysisStatus === "running"
      ? "解析中"
      : analysisStatus === "error"
        ? "解析失败"
        : analysisReady
          ? "解析完成"
          : "等待解析";
  const step2ChipClass =
    step2ChipLabel === "解析完成" || step2ChipLabel === "直接生成"
      ? "bg-green-100 text-green-700"
      : step2ChipLabel === "解析失败"
        ? "bg-red-100 text-red-600"
        : "bg-yellow-100 text-yellow-700";

  // 默认直接展示模板选择，不先触发分析
  return (
    <>
      <div className="flex flex-col gap-5 p-5">
        <AnalysisStepCard
          sourceImagesCount={sourceImages.length}
          canAnalyze={requiresAnalysis}
          analysisStatus={analysisStatus}
          analysisProgress={analysisProgress}
          analysisText={analysisText}
          onAnalysisTextChange={setAnalysisText}
          onAnalyze={handleAnalyzeImages}
          analysisError={analysisError}
          analysisResultVisible={analysisExpanded}
          onToggleAnalysisResult={() => setAnalysisExpanded((prev) => !prev)}
          analysisSavedAt={analysisSavedAt}
        />
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">步骤 2</p>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">图文生成</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                选择一个图文风格，并结合上一步解析结果生成新的图文。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-200">
                风格模板
              </span>
              {requiresAnalysis && (
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${step2ChipClass}`}>
                  {step2ChipLabel}
                </span>
              )}
            </div>
          </div>
          <StylePickerView
            presets={presets}
            presetsLoading={presetsLoading}
            selectedPresetId={selectedPresetId}
            onSelectPreset={setSelectedPresetId}
            onOpenUploadModal={() => setUploadModalOpen(true)}
            startError={startError}
            topicHint={topicHint}
            onTopicHintChange={setTopicHint}
            onGenerate={handleGenerate}
            generating={generating}
            disableGenerate={Boolean(generationBlockedReason)}
            disableReason={generationBlockedReason ?? undefined}
          />
        </div>
      </div>
      <UploadStyleModal
        open={uploadModalOpen}
        styleName={styleName}
        onStyleNameChange={setStyleName}
        onStyleFileChange={setStyleFile}
        onClose={() => {
          if (uploadingStyle) return;
          setUploadModalOpen(false);
        }}
        onUpload={handleUploadStyle}
        uploading={uploadingStyle}
      />
    </>
  );
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

type AnalysisStepCardProps = {
  sourceImagesCount: number;
  canAnalyze: boolean;
  analysisStatus: AnalysisStatus;
  analysisProgress: { current: number; total: number };
  analysisText: string;
  onAnalysisTextChange: (value: string) => void;
  onAnalyze: () => void;
  analysisError: string | null;
  analysisResultVisible: boolean;
  onToggleAnalysisResult: () => void;
  analysisSavedAt: number | null;
};

function AnalysisStepCard({
  sourceImagesCount,
  canAnalyze,
  analysisStatus,
  analysisProgress,
  analysisText,
  onAnalysisTextChange,
  onAnalyze,
  analysisError,
  analysisResultVisible,
  onToggleAnalysisResult,
  analysisSavedAt,
}: AnalysisStepCardProps) {
  const [copied, setCopied] = useState(false);
  const hasText = analysisText.trim().length > 0;
  const statusLabelMap: Record<AnalysisStatus, string> = {
    idle: "等待解析",
    running: "解析中",
    success: "解析完成",
    error: "解析失败",
  };
  const statusColorMap: Record<AnalysisStatus, string> = {
    idle: "bg-gray-100 text-gray-600",
    running: "bg-yellow-100 text-yellow-700",
    success: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-600",
  };
  const statusLabel = canAnalyze ? statusLabelMap[analysisStatus] : "无需解析";
  const statusClass = canAnalyze ? statusColorMap[analysisStatus] : "bg-blue-100 text-blue-700";
  const canViewResult = canAnalyze && analysisStatus === "success" && hasText;
  const showTextarea = !canAnalyze || analysisStatus !== "success" || analysisResultVisible;
  const previewSnippet = hasText ? analysisText.trim().slice(0, 160) : "";
  const savedAtLabel = analysisSavedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(analysisSavedAt))
    : null;
  const primaryButtonLabel =
    analysisStatus === "running"
      ? `解析中 (${Math.min(analysisProgress.current, analysisProgress.total)}/${analysisProgress.total || 1})`
      : canViewResult
        ? analysisResultVisible
          ? "隐藏拆解结果"
          : "查看拆解结果"
        : "开始解析";
  const primaryButtonDisabled = !canAnalyze || analysisStatus === "running";

  useEffect(() => {
    if (!hasText) setCopied(false);
  }, [hasText]);

  const handleCopy = async () => {
    if (!hasText) return;
    try {
      await navigator.clipboard.writeText(analysisText.trim());
      setCopied(true);
      toast.success("解析结果已复制");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("复制失败，请重试");
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">步骤 1</p>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">图文解析</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            系统会逐张解析参考图的主体、构图与风格，为后续生成提供模板。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-200">
            参考图 {sourceImagesCount} 张
          </span>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
      </div>
      {analysisError && (
        <div className="text-xs text-red-600 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/40 px-3 py-2 rounded-xl">
          {analysisError}
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">图文解析结果</p>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!hasText || analysisStatus === "running"}
            className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-40"
          >
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        {showTextarea ? (
          <textarea
            value={analysisText}
            onChange={(e) => onAnalysisTextChange(e.target.value)}
            placeholder="点击“开始解析”后，这里会自动填充每张参考图的视觉要点，你也可以手动补充或修改。"
            rows={5}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none"
          />
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-3 py-3 text-sm text-gray-600 dark:text-gray-300">
            <p>拆解完成，点击“查看拆解结果”以展开内容。</p>
            {previewSnippet && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 line-clamp-3 whitespace-pre-line">
                {previewSnippet}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {canAnalyze ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (analysisStatus === "running") return;
                if (canViewResult) {
                  onToggleAnalysisResult();
                } else {
                  onAnalyze();
                }
              }}
              disabled={primaryButtonDisabled}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {analysisStatus === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {primaryButtonLabel}
            </button>
            {canViewResult && (
              <button
                type="button"
                onClick={onAnalyze}
                disabled={analysisStatus === "running"}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-semibold text-gray-700 dark:text-gray-200 px-4 py-2.5 disabled:opacity-60"
              >
                <RotateCcw className="h-4 w-4" />
                重新解析
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <span>当前参考未包含图片，将直接使用已有文案，请自行补充解析内容。</span>
          </div>
        )}
        {savedAtLabel && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            已自动保存 {savedAtLabel}
          </p>
        )}
      </div>
    </div>
  );
}

function LoadingView({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-8">
      <Loader2 className="w-10 h-10 text-yellow-400 animate-spin" />
      <p className="text-sm text-gray-600 dark:text-gray-400 text-center">{label}</p>
    </div>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-8">
      <p className="text-sm text-red-500 text-center">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-sm font-medium transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
        重试
      </button>
    </div>
  );
}

function StylePickerView({
  presets,
  presetsLoading,
  selectedPresetId,
  onSelectPreset,
  onOpenUploadModal,
  startError,
  topicHint,
  onTopicHintChange,
  onGenerate,
  generating,
  disableGenerate,
  disableReason,
}: {
  presets: StylePreset[];
  presetsLoading: boolean;
  selectedPresetId: string | null;
  onSelectPreset: (id: string) => void;
  onOpenUploadModal: () => void;
  startError: string | null;
  topicHint: string;
  onTopicHintChange: (v: string) => void;
  onGenerate: () => void;
  generating: boolean;
  disableGenerate?: boolean;
  disableReason?: string;
}) {
  const isGenerateDisabled = generating || !selectedPresetId || Boolean(disableGenerate);

  return (
    <div className="flex flex-col gap-5">
      {/* Section: style choice */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            选择复刻风格
          </p>
          <button
            type="button"
            onClick={onOpenUploadModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Upload className="w-3.5 h-3.5" />
            添加预设
          </button>
        </div>

        {/* Preset grid */}
        {presetsLoading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            正在加载视觉预设...
          </div>
        ) : presets.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                  selectedPresetId === preset.id
                    ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-400/10"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                }`}
              >
                {preset.previewUrl ? (
                  <img
                    src={preset.previewUrl}
                    alt={preset.name}
                    className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-300 to-orange-400 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                    {preset.name}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {preset.status ? `状态: ${preset.status}` : preset.description || "可用模板"}
                  </p>
                </div>
                {selectedPresetId === preset.id && (
                  <Check className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0 ml-auto" />
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            暂无可用风格模板，请先在风格库创建模板
          </p>
        )}
      </div>

      {startError ? (
        <p className="text-xs text-red-500">{startError}</p>
      ) : null}

      {/* Section: topic hint */}
      <div>
        <label className="text-sm font-semibold text-gray-900 dark:text-white mb-2 block">
          写作方向 <span className="font-normal text-gray-400">(可选)</span>
        </label>
        <textarea
          value={topicHint}
          onChange={(e) => onTopicHintChange(e.target.value)}
          placeholder="例如：围绕春日护肤、宝妈好物推荐…不填则模仿原文选题"
          rows={2}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-yellow-400 focus:border-transparent resize-none"
        />
      </div>

      {/* Generate button */}
      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerateDisabled}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
      >
        {generating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {generating ? "生成中…" : "开始生成"}
      </button>
      {disableReason && isGenerateDisabled && !generating && (
        <p className="text-xs text-amber-600 text-center">{disableReason}</p>
      )}
    </div>
  );
}

function UploadStyleModal({
  open,
  styleName,
  onStyleNameChange,
  onStyleFileChange,
  onClose,
  onUpload,
  uploading,
}: {
  open: boolean;
  styleName: string;
  onStyleNameChange: (value: string) => void;
  onStyleFileChange: (file: File | null) => void;
  onClose: () => void;
  onUpload: () => void;
  uploading: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">上传视觉预设</p>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="text-xs px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            关闭
          </button>
        </div>
        <div className="space-y-3">
          <input
            value={styleName}
            onChange={(e) => onStyleNameChange(e.target.value)}
            placeholder="模板名称（可选）"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onStyleFileChange(e.target.files?.[0] ?? null)}
            className="w-full text-sm file:mr-2 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-gray-200 dark:file:bg-gray-700"
          />
          <button
            type="button"
            onClick={onUpload}
            disabled={uploading}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-sm font-semibold disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "上传中..." : "上传并解析"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultView({
  generatedCopy,
  generatedImages,
  imageGuidance,
  sourceImages,
  copied,
  onCopy,
  onRestart,
  onClose,
}: {
  generatedCopy: string;
  generatedImages: string[];
  imageGuidance: ImageGuidanceItem[];
  sourceImages: string[];
  copied: boolean;
  onCopy: () => void;
  onRestart: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-5">
      {/* Generated copy */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">生成文案</p>
          <button
            type="button"
            onClick={onCopy}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs font-medium transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        <textarea
          defaultValue={generatedCopy}
          rows={8}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white leading-relaxed resize-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
        />
      </div>

      {/* Generated images */}
      {generatedImages.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            生成图片
          </p>
          <div className="grid grid-cols-3 gap-2">
            {generatedImages.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`生成图${i + 1}`}
                className="w-full aspect-square rounded-xl object-cover"
              />
            ))}
          </div>
        </div>
      )}

      {/* Image guidance (shown only when no generated images) */}
      {generatedImages.length === 0 && imageGuidance.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            配图建议
          </p>
          <div className="space-y-2">
            {imageGuidance.map((item, i) => (
              <div
                key={i}
                className="flex gap-3 items-start p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60"
              >
                {sourceImages[item.index] ? (
                  <img
                    src={sourceImages[item.index]}
                    alt={`图${item.index + 1}`}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 text-xs text-gray-400">
                    图{item.index + 1}
                  </div>
                )}
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed pt-0.5">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onRestart}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          重新生成
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-sm font-semibold transition-colors shadow-sm"
        >
          完成
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
