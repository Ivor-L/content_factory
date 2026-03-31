'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { ChevronDown, ChevronUp, Info, RotateCcw, Sparkles } from 'lucide-react';
import type {
  CreativeTaskRecord,
  GeneratedImageItem,
  LayoutResult,
  StylePresetSummary,
  TaskStatus,
  Text2ImagePlanPayload,
} from '@/types/xhs-text2image';
import { StyleProfilePicker } from './components/StyleProfilePicker';
import { TaskStatusPanel } from './components/TaskStatusPanel';
import { ResultPreview } from './components/ResultPreview';
import { useCreativeTaskPolling } from './hooks/useCreativeTaskPolling';
import { useUserApiKey } from './hooks/useUserApiKey';
import { startText2ImageTask } from './api/text2imageClient';
import { safeParseJson, prettifyJson } from './utils/json';
import { useLanguage } from '@/contexts/LanguageContext';

const mapLanguageLabel = (lang?: string | null) => {
  if (lang === 'zh-TW') return '繁体';
  if (lang === 'en') return 'English';
  return '简体';
};

interface Text2ImageClientProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

const STYLE_CACHE_KEY = 'xhs_text2img_style_profile';

export function Text2ImageClient({ searchParams }: Text2ImageClientProps) {
  const parsedParams = useMemo(() => parseSearchParams(searchParams), [searchParams]);
  const initialStyleJson = useMemo(
    () => decodeStyleProfileParam(parsedParams.styleProfileJson),
    [parsedParams.styleProfileJson]
  );
  const initialImageCount = clampImageCount(parsedParams.imageCount);

  const [title, setTitle] = useState(parsedParams.title ?? '');
  const [text, setText] = useState(parsedParams.text ?? '');
  const [imageCount, setImageCount] = useState(initialImageCount);
  const [styleProfileJson, setStyleProfileJson] = useState(initialStyleJson);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(parsedParams.styleId ?? null);
  const [styleJsonExpanded, setStyleJsonExpanded] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [styles, setStyles] = useState<StylePresetSummary[]>([]);
  const [stylesLoading, setStylesLoading] = useState(true);
  const [stylesError, setStylesError] = useState<string | null>(null);

  const [currentTaskId, setCurrentTaskId] = useState<string | null>(() => parsedParams.taskId ?? null);
  const [layoutResult, setLayoutResult] = useState<LayoutResult | null>(null);
  const [imageResults, setImageResults] = useState<GeneratedImageItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [isCopyingAll, setIsCopyingAll] = useState(false);
  const queuedLongFallback = '图文工作流正在后台运行（通常 1-2 分钟），可继续编辑，结果会自动刷新。';
  const queuedFallback = '已启动图文排版生图任务';

  const prefillStyleIdRef = useRef(parsedParams.styleId ?? null);
  const autoStartPendingRef = useRef(parsedParams.autoStart ?? false);
  const initialJsonProvidedRef = useRef(Boolean(initialStyleJson.trim()));

  const { apiKey, loading: apiKeyLoading, error: apiKeyError } = useUserApiKey();

  const stopPollingWhenResultsReady = useCallback(
    (record: CreativeTaskRecord | null) => {
      if (!record?.status) return false;
      if (record.status === 'FAILED') return true;
      if (record.status !== 'COMPLETED') return false;
      const parsedImages = safeParseJson<GeneratedImageItem[]>(record.generated_images_json);
      return Array.isArray(parsedImages) && parsedImages.length > 0;
    },
    []
  );

  const { record, error: pollingError, isPolling, refresh: refreshTask } = useCreativeTaskPolling(
    currentTaskId,
    { enabled: Boolean(currentTaskId), stopCondition: stopPollingWhenResultsReady }
  );

  useEffect(() => {
    if (!record) return;
    const parsedLayout = safeParseJson<LayoutResult>(record.layout_result_json);
    if (parsedLayout) {
      setLayoutResult(parsedLayout);
    }
    const parsedImages = safeParseJson<GeneratedImageItem[]>(record.generated_images_json);
    if (parsedImages) {
      setImageResults(parsedImages);
    }
  }, [record]);

  const fetchStyles = useCallback(async () => {
    setStylesLoading(true);
    setStylesError(null);
    try {
      const response = await fetch('/api/assets/styles?type=xhs-visual&limit=200', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('加载风格列表失败');
      }
      const payload = await response.json();
      setStyles(payload.data ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载风格失败';
      setStylesError(message);
    } finally {
      setStylesLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStyles();
  }, [fetchStyles]);

  const handleStyleSelect = useCallback((style: StylePresetSummary, silent?: boolean) => {
    setSelectedStyleId(style.id);
    const json = extractStyleProfileJson(style);
    if (json) {
      setStyleProfileJson(json);
      if (!silent) {
        toast.success(`已应用「${style.name}」风格`);
      }
    } else if (!silent) {
      toast.error('该风格暂未完成视觉分析，请稍后再试');
    }
  }, []);

  useEffect(() => {
    if (!prefillStyleIdRef.current) return;
    if (!styles.length) return;
    const match = styles.find((style) => style.id === prefillStyleIdRef.current);
    if (!match) {
      prefillStyleIdRef.current = null;
      return;
    }
    prefillStyleIdRef.current = null;
    handleStyleSelect(match, true);
  }, [styles, handleStyleSelect]);

  useEffect(() => {
    if (initialJsonProvidedRef.current) return;
    if (typeof window === 'undefined') return;
    const cached = window.localStorage.getItem(STYLE_CACHE_KEY);
    if (cached) {
      setStyleProfileJson(cached);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (styleProfileJson.trim()) {
      window.localStorage.setItem(STYLE_CACHE_KEY, styleProfileJson);
    }
  }, [styleProfileJson]);

  const normalizeStylePayload = useCallback(() => {
    const trimmed = styleProfileJson.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed);
    } catch {
      return null;
    }
  }, [styleProfileJson]);

  const triggerWorkflow = useCallback(async () => {
    if (!apiKey) {
      toast.error('请先在设置页绑定 API Key');
      return;
    }
    if (!title.trim() || !text.trim()) {
      setFormError('标题和正文均为必填项');
      toast.error('请完善标题和正文');
      return;
    }
    if (!selectedStyleId) {
      setFormError('请选择一个风格');
      toast.error('请选择一个风格');
      return;
    }
    const normalizedStyle = normalizeStylePayload();
    if (!normalizedStyle) {
      setFormError('风格 JSON 格式不正确');
      toast.error('风格 JSON 格式不正确');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    setLayoutResult(null);
    setImageResults([]);
    const payload: Text2ImagePlanPayload = {
      title: title.trim(),
      text: text.trim(),
      styleId: selectedStyleId,
      styleProfileJson: normalizedStyle,
      imageCount,
      language: languageLabel,
    };

    try {
      const response = await startText2ImageTask(payload);
      setCurrentTaskId(response.taskId);
      setHasTriggered(true);
      const queuedMessage =
        response.queued
          ? queuedLongFallback
          : null;
      toast.success(
        queuedMessage ?? queuedFallback
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '触发工作流失败';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [apiKey, imageCount, languageLabel, normalizeStylePayload, selectedStyleId, text, title]);

  useEffect(() => {
    if (!autoStartPendingRef.current) return;
    if (!parsedParams.autoStart) return;
    if (!apiKey) return;
    if (!title.trim() || !text.trim()) return;
    if (!selectedStyleId) return;
    const normalizedStyle = normalizeStylePayload();
    if (!normalizedStyle) return;
    autoStartPendingRef.current = false;
    void triggerWorkflow();
  }, [
    apiKey,
    normalizeStylePayload,
    parsedParams.autoStart,
    selectedStyleId,
    text,
    title,
    triggerWorkflow,
  ]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void triggerWorkflow();
  };

  const handleBeautifyJson = () => {
    if (!styleProfileJson.trim()) return;
    setStyleProfileJson(prettifyJson(styleProfileJson));
  };

  const handleDownloadAll = useCallback(async () => {
    if (!imageResults.length) return;
    setIsDownloadingAll(true);
    try {
      for (const image of imageResults) {
        const response = await fetch(image.url);
        if (!response.ok) {
          throw new Error('下载图片失败');
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        const suggested = image.fileName?.split('/')?.pop() ?? `xhs_card_${image.index}.png`;
        link.download = suggested;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      }
      toast.success('已开始下载全部图片');
    } catch (error) {
      console.error('download all failed', error);
      toast.error('下载图片失败，请稍后重试');
    } finally {
      setIsDownloadingAll(false);
    }
  }, [imageResults]);

  const handleCopyAll = useCallback(async () => {
    if (!imageResults.length) return;
    setIsCopyingAll(true);
    try {
      const text = imageResults.map((image) => image.url).join('\n');
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      toast.success('已复制全部图片链接');
    } catch (error) {
      console.error('copy all failed', error);
      toast.error('复制链接失败');
    } finally {
      setIsCopyingAll(false);
    }
  }, [imageResults]);

  const effectiveStatus: TaskStatus | null = record?.status ?? (currentTaskId ? 'PROCESSING' : null);
  const taskProgress = typeof record?.progress === 'number'
    ? record.progress
    : effectiveStatus === 'COMPLETED'
    ? 100
    : effectiveStatus
    ? 10
    : 0;

  const canRegenerate = hasTriggered;

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
            <Info className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">小红书图文排版 · 文生图</h1>
            <p className="text-sm text-gray-500">输入标题与正文，选择视觉风格，自动触发 n8n 工作流排版并上传到 OSS。</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          {apiKeyLoading && <span>正在读取 API Key…</span>}
          {!apiKeyLoading && apiKey && (
            <span>已绑定 API Key：<strong>{maskApiKey(apiKey)}</strong>，提交后将自动扣除积分。</span>
          )}
          {!apiKeyLoading && !apiKey && (
            <span>
              尚未绑定 API Key，<Link href="/settings" className="text-primary underline">前往设置页面</Link> 绑定后才能触发工作流。
              {apiKeyError && <em className="ml-2 text-red-500">{apiKeyError}</em>}
            </span>
          )}
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-lg shadow-black/5">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">输入正文</h2>
            <p className="text-sm text-gray-500">标题 + 正文用于生成内容拆分和图文 copy，建议 300~800 字。</p>
          </div>
          <div className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">标题</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="请输入小红书笔记标题"
                className="mt-1 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">正文</label>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={8}
                placeholder="输入正文内容，支持多段落"
                className="mt-1 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="w-full max-w-xs">
              <label className="text-sm font-medium text-gray-700">生成张数（1-5）</label>
              <input
                type="number"
                min={1}
                max={5}
                value={imageCount}
                onChange={(event) => setImageCount(clampImageCount(Number(event.target.value)))}
                className="mt-1 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {formError && (
            <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-600">{formError}</div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isSubmitting || apiKeyLoading || !apiKey}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-gray-900 shadow-lg shadow-primary/30 transition hover:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" /> {isSubmitting ? '启动中…' : '启动图文排版'}
            </button>
            {canRegenerate && (
              <button
                type="button"
                onClick={() => triggerWorkflow()}
                disabled={isSubmitting || apiKeyLoading || !apiKey}
                className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw className="h-4 w-4" /> 再次生成
              </button>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">视觉风格</h2>
              <p className="text-sm text-gray-500">可从资产库导入的风格分析结果中选择，也支持手动粘贴 JSON。</p>
            </div>
            <button
              type="button"
              onClick={handleBeautifyJson}
              className="text-sm text-primary"
            >
              格式化 JSON
            </button>
          </div>
          <div className="mt-6">
            <StyleProfilePicker
              styles={styles}
              selectedStyleId={selectedStyleId}
              loading={stylesLoading}
              error={stylesError}
              onRetry={fetchStyles}
              onSelect={(style) => handleStyleSelect(style)}
            />
          </div>

          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={() => setStyleJsonExpanded((prev) => !prev)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-700"
            >
              <span>style_profile_json（自动带入或手动粘贴）</span>
              {styleJsonExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {styleJsonExpanded && (
              <div className="border-t border-gray-200 p-4">
                <textarea
                  value={styleProfileJson}
                  onChange={(event) => setStyleProfileJson(event.target.value)}
                  rows={10}
                  placeholder='粘贴视觉分析工作流返回的完整 JSON'
                  className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 font-mono text-xs focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <p className="mt-2 text-xs text-gray-500">
                  提交时会自动校验 JSON 格式，请确保字段完整（content_plan、image_plan 等）。
                </p>
              </div>
            )}
          </div>
        </section>
      </form>

      {currentTaskId && (
        <TaskStatusPanel
          taskId={currentTaskId}
          status={effectiveStatus}
          progress={taskProgress}
          isPolling={isPolling}
          rawError={record?.error_message ?? null}
          onRefresh={() => refreshTask()}
        />
      )}

      {pollingError && (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">
          轮询任务状态失败：{pollingError}
        </div>
      )}

      <ResultPreview
        layout={layoutResult}
        images={imageResults}
        onDownloadAll={handleDownloadAll}
        onCopyAll={handleCopyAll}
        downloading={isDownloadingAll}
        copying={isCopyingAll}
      />
    </div>
  );
}

function parseSearchParams(
  params?: Record<string, string | string[] | undefined>
): {
  title?: string;
  text?: string;
  imageCount?: number;
  styleId?: string;
  styleProfileJson?: string;
  autoStart?: boolean;
  taskId?: string;
} {
  const getValue = (key: string) => {
    const value = params?.[key];
    if (Array.isArray(value)) return value[0];
    return value ?? undefined;
  };
  const autoStartRaw = getValue('auto_start') ?? getValue('autoStart');
  const normalizedAuto = autoStartRaw?.toLowerCase();
  return {
    title: getValue('title'),
    text: getValue('text'),
    imageCount: Number(getValue('image_count') ?? getValue('count')),
    styleId: getValue('styleId'),
    styleProfileJson:
      getValue('style_profile_json') ?? getValue('styleProfileJson') ?? getValue('styleProfile'),
    autoStart: normalizedAuto === '1' || normalizedAuto === 'true',
    taskId: getValue('taskId') ?? getValue('task_id'),
  };
}

function decodeStyleProfileParam(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const attempts = new Set<string>();
  attempts.add(trimmed);
  try {
    attempts.add(decodeURIComponent(trimmed));
  } catch {
    // ignore
  }
  try {
    if (typeof atob === 'function') {
      attempts.add(atob(trimmed));
    }
  } catch {
    // ignore
  }

  for (const candidate of attempts) {
    if (isJsonLike(candidate)) {
      try {
        return prettifyJson(candidate);
      } catch {
        return candidate;
      }
    }
  }
  return trimmed;
}

function isJsonLike(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function clampImageCount(value?: number) {
  if (!Number.isFinite(value)) return 3;
  return Math.min(Math.max(Math.round(value!), 1), 5);
}

function extractStyleProfileJson(style: StylePresetSummary): string | null {
  const metadata = isPlainRecord(style.metadata) ? style.metadata : null;
  if (!metadata) return null;
  if (metadata.analysis) {
    return prettifyJson(metadata.analysis);
  }
  if (metadata.style_profile_json) {
    return prettifyJson(metadata.style_profile_json);
  }
  if (metadata.styleProfileJson) {
    return prettifyJson(metadata.styleProfileJson);
  }
  return null;
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function maskApiKey(value: string) {
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}••••${value.slice(-3)}`;
}
  const { language } = useLanguage();
  const languageLabel = useMemo(() => mapLanguageLabel(language), [language]);
