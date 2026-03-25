"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { Copy, Play, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AppCanvasRenderNode,
  CanvasRenderNodeData,
  ImageConfigNodeData,
  ImageResultNodeData,
  TextNodeData,
  VideoConfigNodeData,
  VideoResultNodeData,
} from "../types";

const statusClassMap = {
  idle: "bg-gray-100 text-gray-600 border-gray-200",
  running: "bg-blue-100 text-blue-700 border-blue-200",
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  error: "bg-rose-100 text-rose-700 border-rose-200",
} as const;

function NodeFrame({
  children,
  data,
  id,
}: {
  children: React.ReactNode;
  data: CanvasRenderNodeData;
  id: string;
}) {
  const statusLabel =
    data.status === "idle"
      ? "待执行"
      : data.status === "running"
      ? "执行中"
      : data.status === "success"
      ? "成功"
      : "失败";

  return (
    <div className="min-w-[320px] max-w-[360px] rounded-2xl border border-[var(--tenant-primary-muted)] bg-white/95 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.12)] dark:bg-gray-950/95">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{data.label}</div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            statusClassMap[data.status],
          )}
        >
          {statusLabel}
        </span>
      </div>

      {children}

      {data.message && (
        <div className="mt-3 rounded-xl border border-[var(--tenant-primary-muted)] bg-[var(--tenant-primary-soft)] px-3 py-2 text-xs text-gray-700 dark:text-gray-200">
          {data.message}
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => data.onDuplicate?.(id)}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--tenant-primary-muted)] px-2.5 py-1.5 text-xs text-gray-700 transition hover:border-[var(--tenant-primary)] dark:text-gray-200"
        >
          <Copy className="h-3.5 w-3.5" />
          复制
        </button>
        <button
          type="button"
          onClick={() => data.onDelete?.(id)}
          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除
        </button>
      </div>
    </div>
  );
}

function TextNodeBody({ id, data }: { id: string; data: TextNodeData & CanvasRenderNodeData }) {
  return (
    <>
      <textarea
        value={data.text}
        onChange={(event) => data.onPatch?.(id, { text: event.target.value })}
        placeholder="输入创意描述、提示词或脚本文案..."
        className="h-32 w-full resize-none rounded-xl border border-[var(--tenant-primary-muted)] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--tenant-primary)] dark:bg-gray-900 dark:text-gray-100"
      />
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">输出会被下游节点自动读取。</div>
    </>
  );
}

function ImageConfigNodeBody({
  id,
  data,
}: {
  id: string;
  data: ImageConfigNodeData & CanvasRenderNodeData;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={data.title}
          onChange={(event) => data.onPatch?.(id, { title: event.target.value })}
          placeholder="任务标题"
          className="col-span-2 rounded-xl border border-[var(--tenant-primary-muted)] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--tenant-primary)] dark:bg-gray-900 dark:text-gray-100"
        />
        <textarea
          value={data.prompt}
          onChange={(event) => data.onPatch?.(id, { prompt: event.target.value })}
          placeholder="可选：覆盖上游文本输入"
          className="col-span-2 h-20 resize-none rounded-xl border border-[var(--tenant-primary-muted)] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--tenant-primary)] dark:bg-gray-900 dark:text-gray-100"
        />
        <select
          value={data.styleId}
          onChange={(event) => data.onPatch?.(id, { styleId: event.target.value })}
          className="col-span-2 rounded-xl border border-[var(--tenant-primary-muted)] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--tenant-primary)] dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">选择风格</option>
          {(data.styles || []).map((style) => (
            <option key={style.id} value={style.id}>
              {style.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={5}
          value={data.imageCount}
          onChange={(event) =>
            data.onPatch?.(id, {
              imageCount: Number(event.target.value || 3),
            })
          }
          className="rounded-xl border border-[var(--tenant-primary-muted)] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--tenant-primary)] dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          type="button"
          onClick={() => data.onRun?.(id)}
          className="inline-flex items-center justify-center gap-1 rounded-xl border border-[var(--tenant-primary)] bg-[var(--tenant-primary-soft)] px-3 py-2 text-sm font-semibold text-gray-800 transition hover:bg-[var(--tenant-primary-muted)] dark:text-gray-100"
        >
          <Play className="h-4 w-4" />
          执行生图
        </button>
      </div>
    </>
  );
}

function ImageResultNodeBody({
  data,
}: {
  data: ImageResultNodeData & CanvasRenderNodeData;
}) {
  if (!data.images.length) {
    return <div className="text-xs text-gray-500 dark:text-gray-400">暂无图片输出。</div>;
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {data.images.slice(0, 4).map((url) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block overflow-hidden rounded-xl border border-[var(--tenant-primary-muted)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Generated"
              className="h-24 w-full object-cover transition group-hover:scale-[1.03]"
            />
          </a>
        ))}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">共 {data.images.length} 张</div>
    </div>
  );
}

function VideoConfigNodeBody({
  id,
  data,
}: {
  id: string;
  data: VideoConfigNodeData & CanvasRenderNodeData;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input
        value={data.productId}
        onChange={(event) => data.onPatch?.(id, { productId: event.target.value })}
        placeholder="productId"
        className="rounded-xl border border-[var(--tenant-primary-muted)] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--tenant-primary)] dark:bg-gray-900 dark:text-gray-100"
      />
      <input
        value={data.scriptId}
        onChange={(event) => data.onPatch?.(id, { scriptId: event.target.value })}
        placeholder="scriptId"
        className="rounded-xl border border-[var(--tenant-primary-muted)] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--tenant-primary)] dark:bg-gray-900 dark:text-gray-100"
      />
      <input
        value={data.targetCountry}
        onChange={(event) => data.onPatch?.(id, { targetCountry: event.target.value })}
        placeholder="targetCountry"
        className="rounded-xl border border-[var(--tenant-primary-muted)] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--tenant-primary)] dark:bg-gray-900 dark:text-gray-100"
      />
      <input
        value={data.targetLanguage}
        onChange={(event) => data.onPatch?.(id, { targetLanguage: event.target.value })}
        placeholder="targetLanguage"
        className="rounded-xl border border-[var(--tenant-primary-muted)] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--tenant-primary)] dark:bg-gray-900 dark:text-gray-100"
      />
      <input
        value={data.duration}
        onChange={(event) => data.onPatch?.(id, { duration: event.target.value })}
        placeholder="duration"
        className="rounded-xl border border-[var(--tenant-primary-muted)] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--tenant-primary)] dark:bg-gray-900 dark:text-gray-100"
      />
      <input
        value={data.quantity}
        onChange={(event) => data.onPatch?.(id, { quantity: event.target.value })}
        placeholder="quantity"
        className="rounded-xl border border-[var(--tenant-primary-muted)] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--tenant-primary)] dark:bg-gray-900 dark:text-gray-100"
      />
      <button
        type="button"
        onClick={() => data.onRun?.(id)}
        className="col-span-2 inline-flex items-center justify-center gap-1 rounded-xl border border-[var(--tenant-primary)] bg-[var(--tenant-primary-soft)] px-3 py-2 text-sm font-semibold text-gray-800 transition hover:bg-[var(--tenant-primary-muted)] dark:text-gray-100"
      >
        <Play className="h-4 w-4" />
        执行视频
      </button>
    </div>
  );
}

function VideoResultNodeBody({
  data,
}: {
  data: VideoResultNodeData & CanvasRenderNodeData;
}) {
  if (!data.videoUrl) {
    return <div className="text-xs text-gray-500 dark:text-gray-400">暂无视频输出。</div>;
  }
  return (
    <div className="space-y-2">
      <video src={data.videoUrl} controls className="w-full rounded-xl border border-[var(--tenant-primary-muted)]" />
      <a
        href={data.videoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex text-xs text-[var(--tenant-primary)] underline underline-offset-2"
      >
        打开源地址
      </a>
    </div>
  );
}

export const CanvasNode = memo(function CanvasNode({
  id,
  data,
}: NodeProps<AppCanvasRenderNode>) {
  const isConfigNode = data.kind === "imageConfig" || data.kind === "videoConfig";
  const isTextNode = data.kind === "text";
  const hasOutput = data.kind !== "imageResult" && data.kind !== "videoResult";

  return (
    <>
      {(isConfigNode || !isTextNode) && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-[var(--tenant-primary)] !bg-white"
        />
      )}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-[var(--tenant-primary)] !bg-white"
        />
      )}

      <NodeFrame id={id} data={data}>
        {data.kind === "text" && <TextNodeBody id={id} data={data} />}
        {data.kind === "imageConfig" && <ImageConfigNodeBody id={id} data={data} />}
        {data.kind === "imageResult" && <ImageResultNodeBody data={data} />}
        {data.kind === "videoConfig" && <VideoConfigNodeBody id={id} data={data} />}
        {data.kind === "videoResult" && <VideoResultNodeBody data={data} />}
      </NodeFrame>
    </>
  );
});
