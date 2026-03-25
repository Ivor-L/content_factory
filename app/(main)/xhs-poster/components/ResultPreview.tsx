'use client';

/* eslint-disable @next/next/no-img-element -- Remote OSS URLs */

import type { GeneratedImageItem, LayoutResult } from '@/types/xhs-text2image';
import { Copy, Download, Link2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ResultPreviewProps {
  layout: LayoutResult | null;
  images: GeneratedImageItem[];
  onDownloadAll?: () => Promise<void> | void;
  onCopyAll?: () => Promise<void> | void;
  downloading?: boolean;
  copying?: boolean;
}

export function ResultPreview({ layout, images, onDownloadAll, onCopyAll, downloading, copying }: ResultPreviewProps) {
  if (!layout && images.length === 0) return null;

  const copySingleUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('已复制链接');
    } catch (error) {
      console.error('copy failed', error);
      toast.error('复制失败');
    }
  };

  return (
    <div className="space-y-6">
      {layout && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">拆解标题</p>
              <p className="text-2xl font-semibold text-gray-900">{layout.content_plan.clean_title}</p>
              <p className="mt-1 text-sm text-gray-500">图文张数：{layout.image_plan.count} 张 · 比例 {layout.image_plan.aspect_ratio}</p>
            </div>
            <div className="text-sm text-gray-500">{layout.image_plan.reason}</div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">内容结构</h3>
              {layout.content_plan.knowledge_sections.map((section) => (
                <div key={section.section_title} className="rounded-xl border border-gray-100 p-4">
                  <p className="font-medium text-gray-900">{section.section_title}</p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-600">
                    {section.points.map((point) => (
                      <li key={point.point}>
                        <span className="font-semibold text-gray-800">{point.point}：</span>
                        <span>{point.explain}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">图片规划</h3>
              {layout.image_plan.images.map((image) => (
                <div key={image.index} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-gray-900">Card {image.index} · {image.purpose}</span>
                    <span className="text-gray-400">{image.layout_hint}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    <strong>标题：</strong>{image.text_blocks.title}
                    {image.text_blocks.subtitle && <> · {image.text_blocks.subtitle}</>}
                  </p>
                  {image.text_blocks.items?.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm text-gray-600">
                      {image.text_blocks.items.map((item, idx) => (
                        <li key={`${image.index}-${idx}`}>
                          <span className="font-medium text-gray-800">{item.point}：</span>
                          {item.explain}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-gray-400">
                    Prompt: {image.prompt}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {images.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">AI 生成图片</p>
              <p className="text-sm text-gray-500">共 {images.length} 张</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onCopyAll?.()}
                disabled={copying}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Copy className="h-4 w-4" /> {copying ? '复制中...' : '复制全部链接'}
              </button>
              <button
                type="button"
                onClick={() => onDownloadAll?.()}
                disabled={downloading}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-4 w-4" /> {downloading ? '打包中...' : '下载全部图片'}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((image) => (
              <div key={image.index} className="overflow-hidden rounded-2xl border border-gray-100">
                <div className="relative h-64 bg-gray-50">
                  <img src={image.url} alt={`creative-${image.index}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => copySingleUrl(image.url)}
                    className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs text-gray-700 shadow"
                  >
                    <Link2 className="h-3.5 w-3.5" />复制
                  </button>
                </div>
                <div className="space-y-1 p-4 text-sm">
                  <p className="font-medium text-gray-900">第 {image.index} 张</p>
                  <p className="text-xs text-gray-500 break-all">{image.url}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
