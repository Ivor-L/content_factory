'use client';

/* eslint-disable @next/next/no-img-element -- Style previews use remote images with dynamic host sources */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, Sparkles, Grid3x3, UploadCloud } from 'lucide-react';
import ReplicationModuleForm from '@/app/(main)/replication/ReplicationForm';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { clampPosterCount, DEFAULT_POSTER_COUNT, POSTER_COUNT_MAX, POSTER_COUNT_MIN } from '@/lib/posterConfig';
import { getStylePreviewImageUrl } from '@/lib/stylePreviewImage';
import type { StylePresetLite } from '@/types/creative';
import { useTenant } from '@/hooks/useTenant';

type Product = { id: string; name: string; images?: string | null };
type Script = {
  id: string;
  title: string;
  videoUrl?: string | null;
  blueprint?: string | null;
  breakdown?: string | null;
  status?: string | null;
  progress?: number | null;
};
type Character = { id: string; name: string; avatar?: string | null };

interface FormDataState {
  products: Product[];
  scripts: Script[];
  characters: Character[];
}

const isPlainRecord = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const serializeJsonValue = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed && trimmed !== '{}' && trimmed !== '[]' ? trimmed : null;
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

const parseStyleMetadata = (value: unknown): Record<string, any> | null => {
  if (!value) return null;
  if (isPlainRecord(value)) return value;
  if (typeof value === 'string') {
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

const extractStyleProfileJsonForPoster = (style?: (StylePresetLite & { metadata?: any }) | null) => {
  if (!style) return null;
  const metadata = parseStyleMetadata((style as any)?.metadata);
  const candidates: unknown[] = [];
  if (metadata?.analysis) candidates.push(metadata.analysis);
  if (metadata?.style_profile_json) candidates.push(metadata.style_profile_json);
  if (metadata?.styleProfileJson) candidates.push(metadata.styleProfileJson);
  if (metadata?.style_dna) {
    const enriched: Record<string, unknown> = { style_dna: metadata.style_dna };
    if (metadata.generation_prompts) {
      enriched.generation_prompts = metadata.generation_prompts;
    } else if (metadata.promptKit) {
      enriched.promptKit = metadata.promptKit;
    }
    if (metadata.layout_blueprint) {
      enriched.layout_blueprint = metadata.layout_blueprint;
    }
    candidates.push(enriched);
  }
  if (typeof (style as any)?.metadata === 'string') {
    candidates.push((style as any).metadata as string);
  }
  if ((style as any).spec) candidates.push((style as any).spec);

  for (const candidate of candidates) {
    const serialized = serializeJsonValue(candidate);
    if (serialized) return serialized;
  }
  return null;
};

async function ensureOk<T = unknown>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = '加载数据失败';
    try {
      const payload = await response.json();
      if (typeof payload?.error === 'string') {
        message = payload.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return response.json();
}

interface QuickReplicationFormProps {
  onClose: () => void;
}

export function QuickReplicationForm({ onClose }: QuickReplicationFormProps) {
  const [state, setState] = useState<FormDataState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const [productsPayload, scriptsPayload, charactersPayload] = await Promise.all([
          ensureOk<{ data?: Product[] }>(await fetch('/api/products', { signal })),
          ensureOk<{ data?: Script[] }>(await fetch('/api/scripts', { signal })),
          ensureOk<unknown>(await fetch('/api/characters', { signal })),
        ]);

        if (signal?.aborted) return;

        const charactersArray: Character[] = (() => {
          if (Array.isArray(charactersPayload)) {
            return charactersPayload as Character[];
          }
          if (
            charactersPayload &&
            typeof charactersPayload === 'object' &&
            Array.isArray((charactersPayload as { data?: Character[] }).data)
          ) {
            return ((charactersPayload as { data?: Character[] }).data as Character[]) ?? [];
          }
          return [];
        })();

        setState({
          products: productsPayload.data ?? [],
          scripts: scriptsPayload.data ?? [],
          characters: charactersArray,
        });
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : '加载表单数据失败');
        setState(null);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p>加载中，请稍候...</p>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-sm text-gray-600">
        <AlertCircle className="h-6 w-6 text-amber-500" />
        <p>{error || '暂时无法加载复刻表单'}</p>
        <button
          type="button"
          onClick={() => loadData()}
          className="rounded-full border border-gray-200 px-4 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-300 hover:text-gray-900"
        >
          重新加载
        </button>
      </div>
    );
  }

  return (
    <ReplicationModuleForm
      products={state.products.map((product) => ({
        id: product.id,
        name: product.name,
        images: product.images ?? undefined,
      }))}
      scripts={state.scripts}
      characters={state.characters
        .filter((character) => Boolean(character.avatar))
        .map((character) => ({
          id: character.id,
          name: character.name,
          avatar: character.avatar as string,
        }))}
      mode="one-click"
      onSuccess={onClose}
    />
  );
}

interface QuickPosterFormProps {
  onClose: () => void;
  initialIdeaText?: string;
}

const createPosterFormState = (initialIdeaText = '') => ({
  title: '',
  ideaText: initialIdeaText,
  styleId: '',
  posterCount: DEFAULT_POSTER_COUNT,
});

export function QuickPosterForm({ onClose, initialIdeaText = '' }: QuickPosterFormProps) {
  const { t, language } = useLanguage();
  const languageLabel =
    language === 'zh-TW' ? '繁体' : language === 'en' ? 'English' : '简体';
  const router = useRouter();
  const copy = t?.contentCreation as any;
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [styles, setStyles] = useState<StylePresetLite[]>([]);
  const [stylesLoading, setStylesLoading] = useState(true);
  const [stylesError, setStylesError] = useState<string | null>(null);
  const [form, setForm] = useState(() => createPosterFormState(initialIdeaText));
  const [showAllStyles, setShowAllStyles] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const loadStyles = useCallback(
    async (token: string, signal?: AbortSignal) => {
      setStylesLoading(true);
      setStylesError(null);
      try {
        const res = await fetch('/api/assets/styles?limit=20', {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
        if (!res.ok) {
          const raw = await res.text();
          throw new Error(raw || '获取风格失败');
        }
        const payload = await res.json();
        const items: StylePresetLite[] = Array.isArray(payload?.data) ? payload.data : [];
        setStyles(items);
        if (!form.styleId && items.length > 0) {
          const lastStyleId = typeof window !== 'undefined'
            ? localStorage.getItem('quick_poster_last_style_id')
            : null;
          const matched = lastStyleId && items.find((s) => s.id === lastStyleId);
          setForm((prev) => ({ ...prev, styleId: matched ? lastStyleId! : items[0].id }));
        }
      } catch (error) {
        if (signal?.aborted) return;
        console.error(error);
        setStylesError(error instanceof Error ? error.message : '获取风格失败');
      } finally {
        if (!signal?.aborted) {
          setStylesLoading(false);
        }
      }
    },
    [form.styleId],
  );

  useEffect(() => {
    if (!authToken) {
      setStyles([]);
      setStylesLoading(false);
      return;
    }
    const controller = new AbortController();
    void loadStyles(authToken, controller.signal);
    return () => controller.abort();
  }, [authToken, loadStyles]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!authToken) {
      toast.error(copy?.common?.authRequired ?? '请先登录');
      return;
    }
    if (!form.ideaText.trim()) {
      toast.error(copy?.errors?.ideaRequired ?? '请填写创意/需求描述');
      return;
    }
    if (!form.styleId) {
      toast.error(copy?.errors?.styleRequired ?? '请选择一个图文风格');
      return;
    }
    if (!form.title.trim()) {
      toast.error(copy?.errors?.titleRequired ?? '请填写图文标题');
      return;
    }
    const selectedStyle = styles.find((style) => style.id === form.styleId) ?? null;
    const styleProfileJson = extractStyleProfileJsonForPoster(selectedStyle);

    setSubmitting(true);
    try {
      const response = await fetch('/api/xhs-text2img/plan', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: form.title.trim(),
          text: form.ideaText.trim(),
          styleId: form.styleId,
          imageCount: clampPosterCount(form.posterCount),
          styleProfileJson: styleProfileJson ?? undefined,
          language: languageLabel,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || copy?.errors?.directFailed || '创建失败');
      }
      const queuedMessage =
        payload?.queued && copy?.newTask?.direct?.queuedLong
          ? copy.newTask.direct.queuedLong
          : copy?.newTask?.direct?.queued ?? '已创建图文计划，生成大约需要 1-2 分钟';
      toast.success(queuedMessage);
      setForm(createPosterFormState());
      onClose();
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const displayedStyles = useMemo(
    () => (showAllStyles ? styles : styles.slice(0, 6)),
    [showAllStyles, styles],
  );

  if (!copy) {
    return null;
  }

  return (
    <form className="space-y-5 text-gray-900 dark:text-gray-100" onSubmit={handleSubmit}>
      {/* 标题 */}
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {copy.newTask?.direct?.titleLabel ?? '图文标题'}
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          placeholder={copy.newTask?.direct?.titlePlaceholder ?? '请输入图文标题，例如：春季上新图文方案'}
          className="mt-2 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-[var(--tenant-primary)] dark:focus:border-[var(--tenant-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--tenant-primary-ring)]/30 dark:focus:ring-[var(--tenant-primary-ring)]/30"
        />
      </div>

      {/* 创意描述 */}
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {copy.newTask?.ideaLabel ?? '创意/需求描述'}
        </label>
        <textarea
          value={form.ideaText}
          onChange={(event) => setForm((prev) => ({ ...prev, ideaText: event.target.value }))}
          placeholder={copy.newTask?.ideaPlaceholder ?? '写下你想推的卖点、洞察或原始脚本。'}
          rows={3}
          className="mt-2 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-[var(--tenant-primary)] dark:focus:border-[var(--tenant-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--tenant-primary-ring)]/30 dark:focus:ring-[var(--tenant-primary-ring)]/30 resize-none"
        />
      </div>

      {/* 图文风格 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {copy.newTask?.direct?.styleLabel ?? '图文风格'}
          </label>
          {styles.length > 6 && (
            <button
              type="button"
              className="text-xs font-semibold text-amber-500 dark:text-amber-400 hover:underline"
              onClick={() => setShowAllStyles((prev) => !prev)}
            >
              {showAllStyles
                ? copy.newTask?.direct?.collapseStyles ?? '收起'
                : copy.newTask?.direct?.expandStyles ?? '展开全部'}
            </button>
          )}
        </div>

        {stylesLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 py-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            {copy.newTask?.direct?.styleLoading ?? '加载风格中...'}
          </div>
        ) : stylesError ? (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {stylesError}
          </div>
        ) : styles.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-2">
            {copy.newTask?.direct?.styleEmpty ?? '请先在资产库中上传图文风格。'}
          </p>
        ) : (
          <div className="grid gap-2 grid-cols-3 sm:grid-cols-4">
            {displayedStyles.map((style) => {
              const isActive = style.id === form.styleId;
              return (
                <button
                  type="button"
                  key={style.id}
                  onClick={() => {
                    setForm((prev) => ({ ...prev, styleId: style.id }));
                    localStorage.setItem('quick_poster_last_style_id', style.id);
                  }}
                  className={cn(
                    'relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-all',
                    isActive
                      ? 'border-[var(--tenant-primary)] dark:border-[var(--tenant-primary)] bg-[var(--tenant-primary-soft)] dark:bg-[var(--tenant-primary)]/10 shadow-sm'
                      : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20 bg-white dark:bg-white/5',
                  )}
                >
                  {getStylePreviewImageUrl(style) ? (
                    <img
                      src={getStylePreviewImageUrl(style) ?? ""}
                      alt={style.name}
                      className="h-10 w-10 rounded-lg object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-white/10 text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {(style.name || '').slice(0, 2)}
                    </div>
                  )}
                  <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-300 w-full">{style.name}</p>
                  {isActive && (
                    <CheckCircle2 className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-[var(--tenant-primary)] dark:text-[var(--tenant-primary-foreground)]" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 图文张数 */}
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {copy.newTask?.direct?.posterCountLabel ?? '图文张数'}
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {[1, 3, 4, 5].map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, posterCount: clampPosterCount(count) }))}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all',
                form.posterCount === count
                  ? 'border-transparent bg-amber-400 dark:bg-amber-500 text-gray-900 shadow-sm'
                  : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-white/20 bg-white dark:bg-white/5',
              )}
            >
              {count} 张
            </button>
          ))}
          <input
            type="number"
            min={POSTER_COUNT_MIN}
            max={POSTER_COUNT_MAX}
            value={form.posterCount}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, posterCount: clampPosterCount(Number(event.target.value)) }))
            }
            className="w-20 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-sm text-gray-900 dark:text-white text-center focus:border-[var(--tenant-primary)] dark:focus:border-[var(--tenant-primary)] focus:outline-none"
          />
        </div>
        <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
          {copy.newTask?.direct?.posterCountDescription ??
            `默认 ${DEFAULT_POSTER_COUNT} 张，最多 ${POSTER_COUNT_MAX} 张，将文案均匀拆分到每张海报。`}
        </p>
      </div>

      {/* 提交 */}
      <div className="pt-1 flex justify-end">
        <button
          type="submit"
          disabled={submitting || !authToken}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-6 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-gray-900 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.newTask?.direct?.generating ?? '生成中'}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {copy.newTask?.direct?.submit ?? '图文创作'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

interface QuickGridFormProps {
  onClose: () => void;
}

const GRID_CONTENT_TYPES = [
  { value: '剧情故事', helper: '情节驱动，适合剧情或口播广告' },
  { value: '产品展示', helper: '突出产品外观、材质与质检细节' },
  { value: '卖点展示', helper: '逐条拆解卖点，适合带货场景' },
];

const GRID_ASPECT_RATIOS = [
  { value: '1:1', label: '1:1 · 九宫格' },
  { value: '9:16', label: '9:16 · 竖屏' },
  { value: '16:9', label: '16:9 · 横屏' },
];

export function QuickGridForm({ onClose }: QuickGridFormProps) {
  const router = useRouter();
  const { basePath } = useTenant();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ideaText, setIdeaText] = useState('');
  const [contentType, setContentType] = useState(GRID_CONTENT_TYPES[0].value);
  const [aspectRatio, setAspectRatio] = useState(GRID_ASPECT_RATIOS[0].value);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePickFile = () => {
    if (uploading || submitting) return;
    fileInputRef.current?.click();
  };

  const extractFileFromDataTransfer = (dataTransfer: DataTransfer | null): File | null => {
    if (!dataTransfer) return null;
    if (dataTransfer.files && dataTransfer.files.length > 0) {
      return dataTransfer.files[0] ?? null;
    }
    if (dataTransfer.items && dataTransfer.items.length > 0) {
      for (const item of Array.from(dataTransfer.items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) return file;
        }
      }
    }
    return null;
  };

  const uploadReference = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('请上传图片格式的参考图');
      return;
    }
    const nextPreview = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return nextPreview;
    });
    setImageUrl(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/upload/image', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error((payload as { error?: string }).error || '上传失败，请重试');
      }
      setImageUrl(payload.url as string);
      toast.success('已上传参考图');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败');
      setImageUrl(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    void uploadReference(file);
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    setIsDragging(false);
    const file = extractFileFromDataTransfer(event.dataTransfer);
    if (file) void uploadReference(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const canSubmit = Boolean(imageUrl) && ideaText.trim().length > 0 && !uploading && !submitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!imageUrl) {
      toast.error('请先上传一张参考图');
      return;
    }
    if (!ideaText.trim()) {
      toast.error('请填写脚本或创意描述');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/canvas/grid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptContent: ideaText.trim(),
          imageUrl,
          contentType,
          aspectRatio,
        }),
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error || '创建失败');
      }
      const taskId = (payload as { data?: { taskId?: string } })?.data?.taskId;
      toast.success('九宫格任务已创建，稍后在“我的项目”查看');
      onClose();
      const tenantPrefix = basePath || '';
      const target = `${tenantPrefix}/my-works${taskId ? `?taskId=${taskId}` : ''}`;
      router.push(target || '/my-works');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClearImage = () => {
    setImageUrl(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-4 dark:border-gray-800 dark:bg-gray-900/40">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[var(--tenant-primary-soft,#d1fae5)] p-2 text-[var(--tenant-primary-strong,#14532d)] dark:bg-[var(--tenant-primary,#16a34a)]/20 dark:text-[var(--tenant-primary-foreground,#fefce8)]">
            <Grid3x3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900 dark:text-white">九宫格创作</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">上传一张参考图并描述剧情，自动生成 3x3 故事版。</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">参考图</label>
          <div
            className={cn(
              'relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center transition',
              previewUrl
                ? 'border-transparent bg-gray-900/5 dark:bg-white/5'
                : isDragging
                  ? 'border-[var(--tenant-primary,#16a34a)] bg-[var(--tenant-primary-soft,#ecfdf5)] dark:bg-[var(--tenant-primary,#16a34a)]/10'
                  : 'border-gray-200 bg-white hover:border-[var(--tenant-primary,#16a34a)] dark:border-gray-800 dark:bg-gray-900'
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {previewUrl ? (
              <>
                <img src={previewUrl} alt="九宫格参考图" className="h-full w-full rounded-xl object-cover" />
                <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleClearImage}
                    className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white"
                  >
                    移除
                  </button>
                  <button
                    type="button"
                    onClick={handlePickFile}
                    className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-900 shadow"
                  >
                    替换
                  </button>
                </div>
              </>
            ) : (
              <>
                <UploadCloud className="h-8 w-8 text-gray-400" />
                <p className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">拖拽到此处或点击上传</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">支持 JPG/PNG，建议包含产品或主角形象</p>
                <button
                  type="button"
                  onClick={handlePickFile}
                  disabled={uploading || submitting}
                  className="mt-4 rounded-full bg-[var(--tenant-primary,#16a34a)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--tenant-primary,#16a34a)]/90 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {uploading ? '上传中…' : '选择图片'}
                </button>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">脚本 / 想法</label>
            <textarea
              value={ideaText}
              onChange={(event) => setIdeaText(event.target.value)}
              rows={6}
              placeholder="示例：3 个镜头展示博主拆箱、试用、展示发光肌，强调保湿 + 实拍质感。"
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-[var(--tenant-primary,#16a34a)] focus:ring-2 focus:ring-[var(--tenant-primary,#16a34a)]/30 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">内容类型</label>
              <div className="space-y-2">
                {GRID_CONTENT_TYPES.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 text-sm shadow-sm transition',
                      contentType === option.value
                        ? 'border-[var(--tenant-primary,#16a34a)] bg-[var(--tenant-primary-soft,#e8f7ef)] text-[var(--tenant-primary-strong,#14532d)] dark:border-[var(--tenant-primary,#16a34a)] dark:bg-[var(--tenant-primary,#16a34a)]/15 dark:text-[var(--tenant-primary-foreground,#fefce8)]'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-[var(--tenant-primary,#16a34a)]/40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200'
                    )}
                  >
                    <input
                      type="radio"
                      className="mt-1 h-4 w-4 text-[var(--tenant-primary,#16a34a)]"
                      name="grid-content-type"
                      value={option.value}
                      checked={contentType === option.value}
                      onChange={() => setContentType(option.value)}
                    />
                    <div>
                      <p className="font-semibold">{option.value}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{option.helper}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">画面比例</label>
              <select
                value={aspectRatio}
                onChange={(event) => setAspectRatio(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm shadow-sm outline-none transition focus:border-[var(--tenant-primary,#16a34a)] focus:ring-2 focus:ring-[var(--tenant-primary,#16a34a)]/30 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
              >
                {GRID_ASPECT_RATIOS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--tenant-primary,#16a34a)] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--tenant-primary,#16a34a)]/90 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? '创建中…' : '开始生成九宫格'}
        </button>
      </div>
    </form>
  );
}
