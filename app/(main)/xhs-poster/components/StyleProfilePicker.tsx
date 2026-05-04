'use client';

/* eslint-disable @next/next/no-img-element -- Remote tenant OSS URLs need plain img tags */

import { useMemo, useState } from 'react';
import type { StylePresetSummary } from '@/types/xhs-text2image';
import { getStylePreviewImageUrl } from '@/lib/stylePreviewImage';
import { CheckCircle2, RefreshCw, Search } from 'lucide-react';

interface StyleProfilePickerProps {
  styles: StylePresetSummary[];
  selectedStyleId: string | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelect: (style: StylePresetSummary) => void;
}

export function StyleProfilePicker({
  styles,
  selectedStyleId,
  loading,
  error,
  onRetry,
  onSelect,
}: StyleProfilePickerProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return styles;
    const lower = query.trim().toLowerCase();
    return styles.filter((style) =>
      style.name.toLowerCase().includes(lower) ||
      (style.description ?? '').toLowerCase().includes(lower)
    );
  }, [query, styles]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索视觉风格"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {loading && <span className="text-sm text-gray-500">加载中...</span>}
          {error && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
            >
              <RefreshCw className="h-4 w-4" />重新加载
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((style) => {
          const isActive = style.id === selectedStyleId;
          const status = style.status || (style.metadata as any)?.processingStatus;
          const statusLabel = status === 'READY' ? '已完成分析' : status === 'FAILED' ? '分析失败' : status === 'PENDING' ? '分析中' : null;

          return (
            <button
              key={style.id}
              type="button"
              onClick={() => onSelect(style)}
              className={`flex flex-col rounded-2xl border text-left transition-shadow ${
                isActive ? 'border-primary ring-2 ring-primary/30 shadow-lg' : 'border-gray-100 hover:border-primary/40'
              }`}
            >
              {getStylePreviewImageUrl(style) ? (
                <img
                  src={getStylePreviewImageUrl(style) ?? ""}
                  alt={style.name}
                  className="h-40 w-full rounded-t-2xl object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="h-40 w-full rounded-t-2xl bg-gradient-to-br from-amber-50 to-rose-50" />
              )}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-gray-900">{style.name}</div>
                  {isActive && <CheckCircle2 className="h-5 w-5 text-primary" />}
                </div>
                {statusLabel && (
                  <span
                    className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      status === 'READY'
                        ? 'bg-emerald-50 text-emerald-600'
                        : status === 'FAILED'
                        ? 'bg-red-50 text-red-600'
                        : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    {statusLabel}
                  </span>
                )}
                <p className="text-sm text-gray-500 line-clamp-2">
                  {style.description || '无描述'}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {!loading && !styles.length && (
        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
          暂无视觉风格，请先在资产库执行视觉分析。
        </div>
      )}

      {!loading && styles.length > 0 && !filtered.length && (
        <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
          没有匹配的风格，请调整搜索关键词。
        </div>
      )}
    </div>
  );
}
