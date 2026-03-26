"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Connection,
  EdgeLabelRenderer,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  getSmoothStepPath,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import clsx from "clsx";
import {
  AlignLeft,
  Clapperboard,
  Image as ImageIcon,
  Music,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Sparkles,
  UserCircle2,
  Video,
} from "lucide-react";
import { AiGlowSpinner } from "@/components/AiGlowSpinner";
import { useCanvasShell } from "@/contexts/CanvasShellContext";
import { usePathname, useRouter } from "next/navigation";
import { useCanvasProjects } from "../hooks/useCanvasProjects";
import { useCanvasResources } from "../hooks/useCanvasResources";
import { useCanvasModels } from "../hooks/useCanvasModels";
import { useCanvasOrchestrator } from "../hooks/useCanvasOrchestrator";
import {
  DEFAULT_VIEWPORT,
  flowEdgesToRuntime,
  flowNodesToRuntime,
  normalizeRuntimeCanvasData,
  summarizeNodeData,
  runtimeEdgesToFlowEdges,
  runtimeToFlowNodes,
  type MinimalFlowNodeData,
} from "../lib/canvasDataAdapters";
import { ResourceHoverPanel } from "./ResourceHoverPanel";
import type { CanvasProjectRecord } from "../types";

type CanvasResourceItem = ReturnType<typeof useCanvasResources>["resources"][number];

type CanvasNodeContextValue = {
  toggleExpanded: (nodeId: string, expanded?: boolean) => void;
  patchRuntimeData: (nodeId: string, patch: Record<string, unknown>) => void;
  focusNode: (nodeId: string) => void;
  isConnecting: boolean;
  setNodeStatus: (
    nodeId: string,
    status: MinimalFlowNodeData["status"],
    statusMessage?: string,
  ) => void;
  models: ReturnType<typeof useCanvasModels>;
  resources: ReturnType<typeof useCanvasResources>["resources"];
  resourceActions: Pick<
    ReturnType<typeof useCanvasResources>,
    "addResource" | "updateResource" | "removeResource"
  >;
  runImageNode: (nodeId: string) => Promise<void>;
  runVideoNode: (nodeId: string) => Promise<void>;
  runAudioNode: (nodeId: string) => Promise<void>;
  runDigitalHumanNode: (nodeId: string) => Promise<void>;
  runStoryboardNode: (nodeId: string) => Promise<void>;
  uploadResource: (
    file: File,
    options: { type: CanvasResourceItem["type"]; variant?: string; name?: string },
  ) => Promise<CanvasResourceItem>;
};

const fallbackModel = { id: "", label: "", provider: "" };
const noopResourceActions: CanvasNodeContextValue["resourceActions"] = {
  addResource: () => {
    throw new Error("Canvas runtime未初始化");
  },
  updateResource: () => {},
  removeResource: () => {},
};
const CanvasNodeContext = createContext<CanvasNodeContextValue>({
  toggleExpanded: () => {},
  patchRuntimeData: () => {},
  focusNode: () => {},
  isConnecting: false,
  setNodeStatus: () => {},
  models: {
    textModels: [],
    imageModels: [],
    videoModels: [],
    defaultModels: { text: fallbackModel, image: fallbackModel, video: fallbackModel },
  },
  resources: [],
  resourceActions: noopResourceActions,
  runImageNode: async () => {},
  runVideoNode: async () => {},
  runAudioNode: async () => {},
  runDigitalHumanNode: async () => {},
  runStoryboardNode: async () => {},
  uploadResource: async () => {
    throw new Error("Canvas runtime未初始化");
  },
});

function useCanvasNodeContext() {
  return useContext(CanvasNodeContext);
}

function resolveTitle(node: MinimalFlowNodeData): string {
  const rawLabel = node.runtime?.data?.label;
  if (typeof rawLabel === "string" && rawLabel.trim()) return rawLabel;
  switch (node.runtime?.type) {
    case "text":
      return "文本节点";
    case "image":
      return "图片节点";
    case "video":
      return "视频节点";
    case "audio":
      return "音频节点";
    case "digitalhuman":
      return "数字人节点";
    case "storyboard":
      return "分镜板";
    default:
      return "节点";
  }
}

const statusTone: Record<MinimalFlowNodeData["status"], string> = {
  idle: "text-slate-400",
  running: "text-amber-400",
  success: "text-emerald-400",
  error: "text-rose-400",
};

type NodeCardProps = NodeProps<Node<MinimalFlowNodeData>> & { children?: React.ReactNode };

function NodeCardShell({ id, data, selected, children }: NodeCardProps) {
  const { toggleExpanded, isConnecting } = useCanvasNodeContext();
  const title = resolveTitle(data);
  return (
    <div
      className={clsx(
        "group relative min-w-[280px] max-w-[360px] rounded-[28px] border border-white/10 bg-white/[0.04] p-4 text-white backdrop-blur transition",
        selected
          ? "shadow-[0_0_25px_rgba(15,118,255,0.35)]"
          : isConnecting
          ? "hover:border-white/60 hover:shadow-[0_0_30px_rgba(255,255,255,0.25)] hover:[animation:pulse-border_1.5s_ease-in-out_infinite]"
          : "hover:border-white/30",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ left: -14 }}
        className={clsx(
          "transition-all duration-200",
          isConnecting
            ? "!h-8 !w-8 !rounded-full !border-2 !border-white/60 !bg-white/10 opacity-100"
            : "!h-5 !w-5 !rounded-full !bg-white/80 opacity-0 group-hover:opacity-100",
        )}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ right: -14 }}
        className="!h-5 !w-5 !rounded-full !bg-white/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/50">{title}</p>
          <p className="text-[11px] text-white/40">{data.runtime.type}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx("text-[11px] font-semibold", statusTone[data.status])}>
            {data.status}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleExpanded(id);
            }}
            className="rounded-full border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40"
          >
            {data.expanded ? "收起" : "展开"}
          </button>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-white/80">
        {data.summary || "暂无内容，点击展开开始编辑。"}
      </p>
      {data.expanded && <div className="mt-4 space-y-3">{children}</div>}
    </div>
  );
}

function TextNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const { patchRuntimeData, resources, uploadResource, focusNode } = useCanvasNodeContext();
  const content = typeof data.runtime.data.content === "string" ? data.runtime.data.content : "";

  const handleChange = (value: string) => {
    patchRuntimeData(id, { content: value });
  };

  const insertMention = (resource: ReturnType<typeof useCanvasResources>["resources"][number]) => {
    const mention = `@[${resource.variant || resource.type || "res"}:${resource.id}]`;
    const textarea = textareaRef.current;
    if (!textarea) {
      handleChange(`${content} ${mention}`.trim());
      return;
    }
    const { selectionStart, selectionEnd } = textarea;
    const nextValue =
      content.slice(0, selectionStart) + mention + content.slice(selectionEnd ?? selectionStart);
    handleChange(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = selectionStart + mention.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const detectUploadType = (file: File): "image" | "video" | "audio" => {
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "image";
  };

  const handleUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resource = await uploadResource(file, {
        type: detectUploadType(file),
        name: file.name,
      });
      insertMention(resource);
    } catch (error) {
      console.error("[canvas] upload resource failed", error);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <NodeCardShell {...props}>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="开始你的创作... 输入 @ 可引用图片节点"
        className="min-h-[140px] w-full resize-none rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
      />
      <div className="flex items-center justify-between text-xs text-white/50">
        <span>提示：输入 @ 拉起资源库，直接引用已有图片/视频。</span>
        <ResourceHoverPanel
          resources={resources}
          onSelect={(resource) => {
            insertMention(resource);
            focusNode(id);
          }}
        >
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/70 transition hover:border-white/40"
          >
            <Plus className="h-3 w-3" />
            引用资源
          </button>
        </ResourceHoverPanel>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            focusNode(id);
            uploadInputRef.current?.click();
          }}
          className="rounded-full border border-dashed border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/60 transition hover:border-white/40"
        >
          上传资源
        </button>
      </div>
      <input
        type="file"
        ref={uploadInputRef}
        className="hidden"
        accept="image/*,video/*,audio/*"
        onChange={handleUploadChange}
      />
    </NodeCardShell>
  );
}

const IMAGE_RATIOS = ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"];
const VIDEO_DURATIONS = ["5", "8", "10", "15"];
const MEDIA_NODE_WIDTH = 260;

function parseRatio(ratio: string): [number, number] {
  const parts = ratio.split(":");
  const w = parseInt(parts[0] ?? "16", 10);
  const h = parseInt(parts[1] ?? "9", 10);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return [16, 9];
  return [w, h];
}

function MediaHandle({ side }: { side: "left" | "right" }) {
  const { isConnecting } = useCanvasNodeContext();
  const isTarget = side === "left";
  return (
    <Handle
      type={isTarget ? "target" : "source"}
      position={isTarget ? Position.Left : Position.Right}
      style={isTarget ? { left: -14 } : { right: -14 }}
      className={clsx(
        "transition-all duration-200",
        isTarget
          ? isConnecting
            ? "!h-8 !w-8 !rounded-full !border-2 !border-white/60 !bg-white/10 opacity-100"
            : "!h-5 !w-5 !rounded-full !bg-white/80 opacity-0 group-hover:opacity-100"
          : "!h-5 !w-5 !rounded-full !bg-white/80 opacity-0 group-hover:opacity-100",
      )}
    />
  );
}

function ImageNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const referenceUploadRef = useRef<HTMLInputElement>(null);
  const { patchRuntimeData, models, runImageNode, uploadResource, isConnecting } = useCanvasNodeContext();
  const ratio = (typeof data.runtime.data.ratio === "string" && data.runtime.data.ratio) || IMAGE_RATIOS[1];
  const [rw, rh] = parseRatio(ratio);
  const model = (typeof data.runtime.data.model === "string" && data.runtime.data.model) || models.imageModels[0]?.id || "";
  const quality = (typeof data.runtime.data.quality === "string" && data.runtime.data.quality) || "standard";
  const prompt = typeof data.runtime.data.prompt === "string" ? data.runtime.data.prompt : "";
  const outputs = Array.isArray((data.runtime.data as Record<string, unknown>).outputs)
    ? ((data.runtime.data as Record<string, unknown>).outputs as Array<{ id?: string; url?: string }>)
    : [];
  const referenceImage = typeof (data.runtime.data as Record<string, unknown>).referenceImage === "string"
    ? ((data.runtime.data as Record<string, unknown>).referenceImage as string) : "";
  const lastRunError = typeof (data.runtime.data as Record<string, unknown>).lastRunError === "string"
    ? ((data.runtime.data as Record<string, unknown>).lastRunError as string) : "";
  const isRunning = data.status === "running";

  const handleUploadReference = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resource = await uploadResource(file, { type: "image", name: file.name });
      patchRuntimeData(id, { referenceImage: resource.url });
    } catch (error) {
      console.error("[canvas] upload reference image failed", error);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div style={{ width: MEDIA_NODE_WIDTH }} className="group relative select-none">
      <MediaHandle side="left" />
      <MediaHandle side="right" />
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5 text-white/50" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">Image</span>
        </div>
        <span className={clsx("text-[10px] font-medium", statusTone[data.status])}>{data.status}</span>
      </div>
      <div
        style={{ aspectRatio: `${rw} / ${rh}` }}
        className={clsx(
          "relative overflow-hidden rounded-[20px] bg-[#1c1c1e] border transition",
          props.selected
            ? "border-white/30 shadow-[0_0_20px_rgba(15,118,255,0.3)]"
            : isConnecting
            ? "border-white/20 hover:border-white/70 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            : "border-white/10 hover:border-white/20",
        )}
      >
        {outputs[0]?.url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={outputs[0].url} alt="Generated" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-10 w-10 text-white/15" />
          </div>
        )}
        {isRunning && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="animate-pulse text-xs text-white/70">生成中...</span>
          </div>
        )}
        {lastRunError && (
          <div className="absolute inset-x-0 bottom-0 bg-rose-900/80 px-3 py-1 text-[10px] text-rose-200">{lastRunError}</div>
        )}
        <div className={clsx(
          "absolute inset-x-0 bottom-0 space-y-2 rounded-b-[20px] bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 transition-opacity",
          data.expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}>
          <textarea
            value={prompt}
            onChange={(event) => patchRuntimeData(id, { prompt: event.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="提示词..."
            rows={2}
            className="w-full resize-none rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none"
          />
          <div className="flex gap-1.5">
            <select value={ratio} onChange={(e) => patchRuntimeData(id, { ratio: e.target.value })} onClick={(e) => e.stopPropagation()}
              className="flex-1 rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white focus:outline-none">
              {IMAGE_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={model} onChange={(e) => patchRuntimeData(id, { model: e.target.value })} onClick={(e) => e.stopPropagation()}
              className="flex-1 rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white focus:outline-none">
              {models.imageModels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <select value={quality} onChange={(e) => patchRuntimeData(id, { quality: e.target.value })} onClick={(e) => e.stopPropagation()}
              className="rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white focus:outline-none">
              <option value="standard">标准</option>
              <option value="4k">4K</option>
            </select>
          </div>
          <div className="flex gap-1.5">
            <button type="button" disabled={isRunning}
              onClick={(e) => { e.stopPropagation(); void runImageNode(id); }}
              className="flex-1 rounded-xl bg-white/15 py-1.5 text-xs text-white transition hover:bg-white/25 disabled:opacity-40">
              {isRunning ? "生成中..." : "生成图片"}
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); referenceUploadRef.current?.click(); }}
              className="rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white/60 transition hover:bg-white/20">
              {referenceImage ? "换参考" : "参考图"}
            </button>
          </div>
        </div>
      </div>
      <input ref={referenceUploadRef} type="file" accept="image/*" className="hidden" onChange={handleUploadReference} />
    </div>
  );
}

function VideoNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const firstFrameUploadRef = useRef<HTMLInputElement>(null);
  const lastFrameUploadRef = useRef<HTMLInputElement>(null);
  const { patchRuntimeData, models, runVideoNode, resources, uploadResource, isConnecting } = useCanvasNodeContext();
  const prompt = typeof data.runtime.data.prompt === "string" ? data.runtime.data.prompt : "";
  const model =
    (typeof data.runtime.data.model === "string" && data.runtime.data.model) ||
    models.videoModels[0]?.id ||
    "";
  const ratio =
    (typeof data.runtime.data.ratio === "string" && data.runtime.data.ratio) || IMAGE_RATIOS[1];
  const [rw, rh] = parseRatio(ratio);
  const duration =
    (typeof data.runtime.data.duration === "string" && data.runtime.data.duration) ||
    VIDEO_DURATIONS[2];
  const outputUrl =
    typeof (data.runtime.data as Record<string, unknown>).outputUrl === "string"
      ? ((data.runtime.data as Record<string, unknown>).outputUrl as string)
      : "";
  const statusMessage =
    typeof (data.runtime.data as Record<string, unknown>).lastRunError === "string"
      ? ((data.runtime.data as Record<string, unknown>).lastRunError as string)
      : typeof (data.runtime.data as Record<string, unknown>).statusMessage === "string"
        ? ((data.runtime.data as Record<string, unknown>).statusMessage as string)
        : "";
  const taskStatus =
    typeof (data.runtime.data as Record<string, unknown>).lastTaskStatus === "string"
      ? ((data.runtime.data as Record<string, unknown>).lastTaskStatus as string)
      : "";
  const isRunning = data.status === "running";
  const imageResources = resources.filter((item) => item.type === "image");
  const firstFrameImage =
    typeof (data.runtime.data as Record<string, unknown>).firstFrameImage === "string"
      ? ((data.runtime.data as Record<string, unknown>).firstFrameImage as string)
      : typeof (data.runtime.data as Record<string, unknown>).first_frame_image === "string"
        ? ((data.runtime.data as Record<string, unknown>).first_frame_image as string)
        : "";
  const lastFrameImage =
    typeof (data.runtime.data as Record<string, unknown>).lastFrameImage === "string"
      ? ((data.runtime.data as Record<string, unknown>).lastFrameImage as string)
      : typeof (data.runtime.data as Record<string, unknown>).last_frame_image === "string"
        ? ((data.runtime.data as Record<string, unknown>).last_frame_image as string)
        : "";

  const handleReferenceUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    field: "firstFrameImage" | "lastFrameImage",
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resource = await uploadResource(file, { type: "image", name: file.name });
      patchRuntimeData(id, { [field]: resource.url });
    } catch (error) {
      console.error("[canvas] upload reference frame failed", error);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div style={{ width: MEDIA_NODE_WIDTH }} className="group relative select-none">
      <MediaHandle side="left" />
      <MediaHandle side="right" />
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Video className="h-3.5 w-3.5 text-white/50" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">Video</span>
        </div>
        <span className={clsx("text-[10px] font-medium", statusTone[data.status])}>{data.status}</span>
      </div>
      <div
        style={{ aspectRatio: `${rw} / ${rh}` }}
        className={clsx(
          "relative overflow-hidden rounded-[20px] bg-[#1c1c1e] border transition",
          props.selected
            ? "border-white/30 shadow-[0_0_20px_rgba(15,118,255,0.3)]"
            : isConnecting
            ? "border-white/20 hover:border-white/70 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            : "border-white/10 hover:border-white/20",
        )}
      >
        {outputUrl ? (
          <video src={outputUrl} controls className="h-full w-full object-cover" preload="metadata" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Play className="h-10 w-10 text-white/15" />
          </div>
        )}
        {isRunning && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="animate-pulse text-xs text-white/70">生成中...{taskStatus ? ` ${taskStatus}` : ""}</span>
          </div>
        )}
        {statusMessage && !isRunning && (
          <div className={clsx("absolute inset-x-0 bottom-0 px-3 py-1 text-[10px]", data.status === "error" ? "bg-rose-900/80 text-rose-200" : "bg-black/60 text-white/60")}>{statusMessage}</div>
        )}
        <div className={clsx(
          "absolute inset-x-0 bottom-0 space-y-2 rounded-b-[20px] bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 transition-opacity",
          data.expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}>
          <textarea
            value={prompt}
            onChange={(event) => patchRuntimeData(id, { prompt: event.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="视频剧情 / 镜头 / 氛围..."
            rows={2}
            className="w-full resize-none rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none"
          />
          <div className="flex gap-1.5">
            <select value={ratio} onChange={(e) => patchRuntimeData(id, { ratio: e.target.value })} onClick={(e) => e.stopPropagation()}
              className="flex-1 rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white focus:outline-none">
              {IMAGE_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={duration} onChange={(e) => patchRuntimeData(id, { duration: e.target.value })} onClick={(e) => e.stopPropagation()}
              className="rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white focus:outline-none">
              {VIDEO_DURATIONS.map((d) => <option key={d} value={d}>{d}s</option>)}
            </select>
          </div>
          <select value={model} onChange={(e) => patchRuntimeData(id, { model: e.target.value })} onClick={(e) => e.stopPropagation()}
            className="w-full rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white focus:outline-none">
            {models.videoModels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <div className="flex gap-1.5">
            <ResourceHoverPanel resources={imageResources} onSelect={(resource) => patchRuntimeData(id, { firstFrameImage: resource.url })} label="首帧" emptyText="暂无图片">
              <button type="button" onClick={(e) => e.stopPropagation()}
                className={clsx("flex-1 rounded-xl px-2 py-1.5 text-xs transition", firstFrameImage ? "bg-white/20 text-white" : "bg-white/10 text-white/60 hover:bg-white/15")}>
                {firstFrameImage ? "换首帧" : "首帧"}
              </button>
            </ResourceHoverPanel>
            <button type="button" onClick={(e) => { e.stopPropagation(); firstFrameUploadRef.current?.click(); }}
              className="rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white/60 transition hover:bg-white/20">↑</button>
            <ResourceHoverPanel resources={imageResources} onSelect={(resource) => patchRuntimeData(id, { lastFrameImage: resource.url })} label="尾帧" emptyText="暂无图片">
              <button type="button" onClick={(e) => e.stopPropagation()}
                className={clsx("flex-1 rounded-xl px-2 py-1.5 text-xs transition", lastFrameImage ? "bg-white/20 text-white" : "bg-white/10 text-white/60 hover:bg-white/15")}>
                {lastFrameImage ? "换尾帧" : "尾帧"}
              </button>
            </ResourceHoverPanel>
            <button type="button" onClick={(e) => { e.stopPropagation(); lastFrameUploadRef.current?.click(); }}
              className="rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white/60 transition hover:bg-white/20">↑</button>
          </div>
          <button type="button" disabled={isRunning}
            onClick={(e) => { e.stopPropagation(); void runVideoNode(id); }}
            className="w-full rounded-xl bg-white/15 py-1.5 text-xs text-white transition hover:bg-white/25 disabled:opacity-40">
            {isRunning ? "生成中..." : "生成视频"}
          </button>
        </div>
      </div>
      <input ref={firstFrameUploadRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleReferenceUpload(event, "firstFrameImage")} />
      <input ref={lastFrameUploadRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleReferenceUpload(event, "lastFrameImage")} />
    </div>
  );
}

function AudioNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const { patchRuntimeData, runAudioNode, resources, uploadResource, focusNode } = useCanvasNodeContext();
  const voiceUploadRef = useRef<HTMLInputElement>(null);
  const emotionUploadRef = useRef<HTMLInputElement>(null);
  const script = typeof data.runtime.data.script === "string" ? data.runtime.data.script : "";
  const voiceRef =
    typeof data.runtime.data.voiceReference === "string" ? data.runtime.data.voiceReference : "";
  const emotionRef =
    typeof data.runtime.data.emotionReference === "string"
      ? data.runtime.data.emotionReference
      : "";
  const voiceResources = resources.filter(
    (item) => item.type === "audio" && (!item.variant || item.variant === "voice"),
  );
  const emotionResources = resources.filter(
    (item) => item.type === "audio" && item.variant === "emotion",
  );
  const audioUrl =
    typeof (data.runtime.data as Record<string, unknown>).audioUrl === "string"
      ? ((data.runtime.data as Record<string, unknown>).audioUrl as string)
      : "";
  const statusMessage =
    typeof (data.runtime.data as Record<string, unknown>).lastRunError === "string"
      ? ((data.runtime.data as Record<string, unknown>).lastRunError as string)
      : typeof (data.runtime.data as Record<string, unknown>).audioTaskStatus === "string"
        ? `任务状态：${(data.runtime.data as Record<string, unknown>).audioTaskStatus as string}`
        : "";
  const isRunning = data.status === "running";

  const handleUploadAudio = async (
    event: ChangeEvent<HTMLInputElement>,
    field: "voiceReference" | "emotionReference",
    variant: string,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resource = await uploadResource(file, {
        type: "audio",
        variant,
        name: file.name,
      });
      patchRuntimeData(id, { [field]: resource.url });
    } catch (error) {
      console.error("[canvas] upload audio resource failed", error);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <NodeCardShell {...props}>
      {audioUrl && (
        <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <audio controls className="w-full" src={audioUrl}>
            您的浏览器不支持 audio 标签
          </audio>
        </div>
      )}
      <textarea
        value={script}
        onChange={(event) => patchRuntimeData(id, { script: event.target.value })}
        placeholder="口播文本，用于驱动语音生成"
        className="w-full resize-none rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
      />
      <input
        value={voiceRef}
        onChange={(event) => patchRuntimeData(id, { voiceReference: event.target.value })}
        placeholder="音色参考音频 URL"
        className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
        <ResourceHoverPanel
          resources={voiceResources}
          onSelect={(resource) => {
            patchRuntimeData(id, { voiceReference: resource.url });
            focusNode(id);
          }}
          label="音色库"
          emptyText="暂无音色资源，可上传音频"
        >
          <button
            type="button"
            className="rounded-full border border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] transition hover:border-white/40"
          >
            选择音色
          </button>
        </ResourceHoverPanel>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            focusNode(id);
            voiceUploadRef.current?.click();
          }}
          className="rounded-full border border-dashed border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] transition hover:border-white/40"
        >
          上传音色
        </button>
      </div>
      <input
        ref={voiceUploadRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => handleUploadAudio(event, "voiceReference", "voice")}
      />
      <input
        value={emotionRef}
        onChange={(event) => patchRuntimeData(id, { emotionReference: event.target.value })}
        placeholder="情感参考音频 URL"
        className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
        <ResourceHoverPanel
          resources={emotionResources}
          onSelect={(resource) => {
            patchRuntimeData(id, { emotionReference: resource.url });
            focusNode(id);
          }}
          label="情感库"
          emptyText="暂无情感音频，可上传音频"
        >
          <button
            type="button"
            className="rounded-full border border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] transition hover:border-white/40"
          >
            选择情感
          </button>
        </ResourceHoverPanel>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            focusNode(id);
            emotionUploadRef.current?.click();
          }}
          className="rounded-full border border-dashed border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] transition hover:border-white/40"
        >
          上传情感
        </button>
      </div>
      <input
        ref={emotionUploadRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => handleUploadAudio(event, "emotionReference", "emotion")}
      />
      <p className="text-xs text-white/50">音频节点会调用 RunningHub 工作流生成语音。</p>
      <div className="pt-2">
        <button
          type="button"
          disabled={isRunning}
          onClick={(event) => {
            event.stopPropagation();
            void runAudioNode(id);
          }}
          className={clsx(
            "w-full rounded-2xl border px-3 py-2 text-sm transition",
            isRunning
              ? "border-white/10 text-white/40"
              : "border-white/30 text-white hover:border-white/60",
          )}
        >
          {isRunning ? "生成中..." : "执行语音生成"}
        </button>
      </div>
      {statusMessage && (
        <p
          className={clsx(
            "pt-2 text-xs",
            data.status === "error" ? "text-rose-300" : "text-white/60",
          )}
        >
          {statusMessage}
        </p>
      )}
    </NodeCardShell>
  );
}

function DigitalHumanNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const { patchRuntimeData, runDigitalHumanNode, resources, uploadResource, isConnecting } = useCanvasNodeContext();
  const voiceUploadRef = useRef<HTMLInputElement>(null);
  const avatarUploadRef = useRef<HTMLInputElement>(null);
  const script = typeof data.runtime.data.script === "string" ? data.runtime.data.script : "";
  const voiceReference = typeof data.runtime.data.voiceReference === "string" ? data.runtime.data.voiceReference : "";
  const avatarImage = typeof data.runtime.data.avatarImage === "string" ? data.runtime.data.avatarImage : "";
  const outputUrl = typeof (data.runtime.data as Record<string, unknown>).outputUrl === "string"
    ? ((data.runtime.data as Record<string, unknown>).outputUrl as string) : "";
  const lastRunError = typeof (data.runtime.data as Record<string, unknown>).lastRunError === "string"
    ? ((data.runtime.data as Record<string, unknown>).lastRunError as string) : "";
  const dhStatus = typeof (data.runtime.data as Record<string, unknown>).dhStatus === "string"
    ? ((data.runtime.data as Record<string, unknown>).dhStatus as string) : "";
  const isRunning = data.status === "running";
  const audioResources = resources.filter((item) => item.type === "audio");
  const imageResources = resources.filter((item) => item.type === "image");

  const handleVoiceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resource = await uploadResource(file, { type: "audio", variant: "voice", name: file.name });
      patchRuntimeData(id, { voiceReference: resource.url });
    } catch (error) {
      console.error("[canvas] upload voice failed", error);
    } finally {
      event.target.value = "";
    }
  };

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resource = await uploadResource(file, { type: "image", variant: "avatar", name: file.name });
      patchRuntimeData(id, { avatarImage: resource.url });
    } catch (error) {
      console.error("[canvas] upload avatar failed", error);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div style={{ width: MEDIA_NODE_WIDTH }} className="group relative select-none">
      <MediaHandle side="left" />
      <MediaHandle side="right" />
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <UserCircle2 className="h-3.5 w-3.5 text-white/50" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">Digital Human</span>
        </div>
        <span className={clsx("text-[10px] font-medium", statusTone[data.status])}>{data.status}</span>
      </div>
      <div
        className={clsx(
          "relative min-h-[200px] overflow-hidden rounded-[20px] bg-[#1c1c1e] border transition",
          props.selected
            ? "border-white/30 shadow-[0_0_20px_rgba(15,118,255,0.3)]"
            : isConnecting
            ? "border-white/20 hover:border-white/70 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            : "border-white/10 hover:border-white/20",
        )}
      >
        {outputUrl ? (
          <video src={outputUrl} controls className="w-full" preload="metadata" />
        ) : avatarImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={avatarImage} alt="Avatar" className="w-full object-cover opacity-60" />
        ) : (
          <div className="flex min-h-[180px] w-full items-center justify-center">
            <UserCircle2 className="h-14 w-14 text-white/15" />
          </div>
        )}
        {isRunning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
            <span className="animate-pulse text-xs text-white/70">生成中{dhStatus ? ` · ${dhStatus}` : "..."}</span>
          </div>
        )}
        {lastRunError && !isRunning && (
          <div className="absolute inset-x-0 bottom-0 bg-rose-900/80 px-3 py-1 text-[10px] text-rose-200">{lastRunError}</div>
        )}
        <div className={clsx(
          "space-y-2 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 transition-opacity",
          data.expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}>
          <textarea
            value={script}
            onChange={(event) => patchRuntimeData(id, { script: event.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="文案/口播脚本..."
            rows={3}
            className="w-full resize-none rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none"
          />
          <div className="flex gap-1.5">
            <ResourceHoverPanel
              resources={audioResources}
              onSelect={(resource) => patchRuntimeData(id, { voiceReference: resource.url })}
              label="音色库"
              emptyText="暂无音色资源"
            >
              <button type="button" onClick={(e) => e.stopPropagation()}
                className={clsx("flex-1 rounded-xl px-2 py-1.5 text-xs transition", voiceReference ? "bg-white/20 text-white" : "bg-white/10 text-white/60 hover:bg-white/15")}>
                {voiceReference ? "换音色" : "选音色"}
              </button>
            </ResourceHoverPanel>
            <button type="button" onClick={(e) => { e.stopPropagation(); voiceUploadRef.current?.click(); }}
              className="rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white/60 transition hover:bg-white/20">↑</button>
            <ResourceHoverPanel
              resources={imageResources}
              onSelect={(resource) => patchRuntimeData(id, { avatarImage: resource.url })}
              label="形象库"
              emptyText="暂无形象图片"
            >
              <button type="button" onClick={(e) => e.stopPropagation()}
                className={clsx("flex-1 rounded-xl px-2 py-1.5 text-xs transition", avatarImage ? "bg-white/20 text-white" : "bg-white/10 text-white/60 hover:bg-white/15")}>
                {avatarImage ? "换形象" : "选形象"}
              </button>
            </ResourceHoverPanel>
            <button type="button" onClick={(e) => { e.stopPropagation(); avatarUploadRef.current?.click(); }}
              className="rounded-xl bg-white/10 px-2 py-1.5 text-xs text-white/60 transition hover:bg-white/20">↑</button>
          </div>
          <button type="button" disabled={isRunning}
            onClick={(e) => { e.stopPropagation(); void runDigitalHumanNode(id); }}
            className="w-full rounded-xl bg-white/15 py-1.5 text-xs text-white transition hover:bg-white/25 disabled:opacity-40">
            {isRunning ? "生成中..." : "生成数字人视频"}
          </button>
        </div>
      </div>
      <input ref={voiceUploadRef} type="file" accept="audio/*" className="hidden" onChange={handleVoiceUpload} />
      <input ref={avatarUploadRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
    </div>
  );
}

const SB_NODE_WIDTH = 560;

type StoryboardSegmentData = {
  id: string;
  order: number;
  duration?: number;
  timeRange?: string;
  originalScript?: string;
  rewrittenScript?: string;
  visualDescription?: string;
  cameraNotes?: string;
  lightingNotes?: string;
  imagePrompt?: string;
  generatedImage?: string;
  generatedVideo?: string;
  status?: string;
};

function StoryboardNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const { patchRuntimeData, runStoryboardNode, uploadResource, isConnecting } = useCanvasNodeContext();
  const videoUploadRef = useRef<HTMLInputElement>(null);

  const videoUrl = typeof (data.runtime.data as Record<string, unknown>).videoUrl === "string"
    ? ((data.runtime.data as Record<string, unknown>).videoUrl as string) : "";
  const sbStatus = typeof (data.runtime.data as Record<string, unknown>).sbStatus === "string"
    ? ((data.runtime.data as Record<string, unknown>).sbStatus as string) : "";
  const sbProgress = typeof (data.runtime.data as Record<string, unknown>).sbProgress === "number"
    ? ((data.runtime.data as Record<string, unknown>).sbProgress as number) : 0;
  const sbSegments = Array.isArray((data.runtime.data as Record<string, unknown>).sbSegments)
    ? ((data.runtime.data as Record<string, unknown>).sbSegments as StoryboardSegmentData[]) : [];
  const lastRunError = typeof (data.runtime.data as Record<string, unknown>).lastRunError === "string"
    ? ((data.runtime.data as Record<string, unknown>).lastRunError as string) : "";
  const isRunning = data.status === "running";
  const hasSegments = sbSegments.length > 0;

  const handleVideoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resource = await uploadResource(file, { type: "video", name: file.name });
      patchRuntimeData(id, { videoUrl: resource.url });
    } catch (error) {
      console.error("[canvas] upload video for storyboard failed", error);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div style={{ width: SB_NODE_WIDTH }} className="group relative select-none">
      <MediaHandle side="left" />
      <MediaHandle side="right" />

      {/* Header */}
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Clapperboard className="h-3.5 w-3.5 text-white/50" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">Storyboard</span>
          {hasSegments && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">
              {sbSegments.length} 镜头
            </span>
          )}
        </div>
        <span className={clsx("text-[10px] font-medium", statusTone[data.status])}>{data.status}</span>
      </div>

      {/* Card body */}
      <div
        className={clsx(
          "overflow-hidden rounded-[20px] border bg-[#111113] transition",
          props.selected
            ? "border-white/30 shadow-[0_0_20px_rgba(15,118,255,0.3)]"
            : isConnecting
            ? "border-white/20 hover:border-white/70 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            : "border-white/10 hover:border-white/20",
        )}
      >
        {/* Video input row */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <Video className="h-4 w-4 flex-shrink-0 text-white/40" />
          <input
            value={videoUrl}
            onChange={(e) => patchRuntimeData(id, { videoUrl: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="参考视频 URL..."
            className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder:text-white/30 focus:outline-none"
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); videoUploadRef.current?.click(); }}
            className="flex-shrink-0 rounded-lg bg-white/10 px-2 py-1 text-[10px] text-white/60 transition hover:bg-white/20"
          >
            上传
          </button>
          <button
            type="button"
            disabled={isRunning || !videoUrl}
            onClick={(e) => { e.stopPropagation(); void runStoryboardNode(id); }}
            className="flex-shrink-0 rounded-lg bg-white/15 px-3 py-1 text-[10px] font-medium text-white transition hover:bg-white/25 disabled:opacity-40"
          >
            {isRunning ? "拆解中..." : "一键复刻"}
          </button>
        </div>

        {/* Progress bar when running */}
        {isRunning && (
          <div className="h-0.5 bg-white/5">
            <div
              className="h-full bg-white/40 transition-all duration-500"
              style={{ width: `${Math.max(5, sbProgress)}%` }}
            />
          </div>
        )}

        {/* Error */}
        {lastRunError && !isRunning && (
          <div className="border-b border-white/[0.06] px-4 py-2 text-[11px] text-rose-300">{lastRunError}</div>
        )}

        {/* Status hint when no segments yet */}
        {!hasSegments && !isRunning && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-white/30">
            <Clapperboard className="h-8 w-8" />
            <p className="text-xs">上传参考视频，点击「一键复刻」自动拆解分镜</p>
          </div>
        )}

        {/* Segment rows */}
        {hasSegments && (
          <div className="max-h-[520px] divide-y divide-white/[0.04] overflow-y-auto">
            {/* Table header */}
            <div className="grid grid-cols-[32px_1fr_88px] gap-3 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-white/30">
              <span>#</span>
              <span>描述</span>
              <span>图片</span>
            </div>
            {sbSegments.map((seg) => (
              <div key={seg.id} className="grid grid-cols-[32px_1fr_88px] items-start gap-3 px-4 py-3">
                {/* Order */}
                <div className="pt-0.5 text-xs font-semibold text-white/50">{seg.order}</div>

                {/* Description */}
                <div className="space-y-1 text-[11px] leading-relaxed text-white/70">
                  {seg.visualDescription && (
                    <p className="text-white/80">{seg.visualDescription}</p>
                  )}
                  {seg.cameraNotes && (
                    <p className="text-white/40">
                      <span className="mr-1 text-white/25">镜头</span>{seg.cameraNotes}
                    </p>
                  )}
                  {seg.originalScript && (
                    <p className="rounded-lg bg-white/[0.04] px-2 py-1 text-white/50 italic">
                      {seg.originalScript}
                    </p>
                  )}
                  {seg.timeRange && (
                    <p className="text-white/30">{seg.timeRange}</p>
                  )}
                </div>

                {/* Image thumbnail */}
                <div className="aspect-square overflow-hidden rounded-xl bg-white/[0.04]">
                  {seg.generatedImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={seg.generatedImage} alt={`Shot ${seg.order}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-white/15" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Status row when waiting for breakdown */}
        {isRunning && (
          <div className="border-t border-white/[0.06] px-4 py-2 text-[11px] text-white/40">
            {sbStatus === "BREAKDOWN_PENDING" ? "n8n 工作流处理中..." : `状态：${sbStatus || "等待中"}`}
          </div>
        )}
      </div>

      <input ref={videoUploadRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
    </div>
  );
}

const nodeTypes = {
  text: TextNodeCard,
  image: ImageNodeCard,
  video: VideoNodeCard,
  audio: AudioNodeCard,
  digitalhuman: DigitalHumanNodeCard,
  storyboard: StoryboardNodeCard,
};

const NODE_PICKER_ITEMS = [
  { type: "text", icon: AlignLeft, label: "文本生成", desc: "脚本、广告词、品牌文案" },
  { type: "image", icon: ImageIcon, label: "图片生成", desc: undefined },
  { type: "video", icon: Video, label: "视频生成", desc: undefined },
  { type: "audio", icon: Music, label: "音频", desc: undefined },
  { type: "digitalhuman", icon: UserCircle2, label: "数字人", desc: "AI 数字人视频生成" },
] as const;

function NodePickerPopup({
  screenX,
  screenY,
  sourceNodeId,
  sourceNodeType,
  onPick,
  onDismiss,
}: {
  screenX: number;
  screenY: number;
  sourceNodeId: string | null;
  sourceNodeType?: string | null;
  onPick: (type: string) => void;
  onDismiss: () => void;
}) {
  if (typeof document === "undefined") return null;
  const left = Math.min(screenX + 12, window.innerWidth - 320);
  const top = Math.min(Math.max(screenY - 40, 8), window.innerHeight - 320);
  const isFromVideo = sourceNodeType === "video";
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onDismiss} />
      <div
        style={{ left, top }}
        className="fixed z-[9999] w-[300px] overflow-hidden rounded-[20px] bg-[#1a1a1c] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-2 px-2 text-sm text-white/40">
          {sourceNodeId ? "引用该节点生成" : "添加节点"}
        </p>
        {/* 一键复刻 — only when dragging from a video node */}
        {isFromVideo && (
          <button
            type="button"
            onClick={() => onPick("storyboard")}
            className="mb-1 flex w-full items-center gap-3 rounded-[14px] bg-[#ffc94a]/10 px-3 py-3 text-left transition hover:bg-[#ffc94a]/20 active:scale-[0.98]"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#ffc94a]/20">
              <Clapperboard className="h-5 w-5 text-[#ffc94a]" />
            </div>
            <div>
              <div className="text-base font-medium text-[#ffc94a]">一键复刻</div>
              <div className="text-xs text-[#ffc94a]/60">拆解爆款分镜，AI 重新生成</div>
            </div>
          </button>
        )}
        <div className="space-y-0.5">
          {NODE_PICKER_ITEMS.map((item, idx) => (
            <button
              key={item.type}
              type="button"
              onClick={() => onPick(item.type)}
              className={clsx(
                "flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition hover:bg-white/10 active:scale-[0.98]",
                idx === 0 && "bg-white/[0.07]",
              )}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-white/10">
                <item.icon className="h-5 w-5 text-white/70" />
              </div>
              <div>
                <div className="text-base font-medium text-white">{item.label}</div>
                {item.desc && <div className="text-xs text-white/40">{item.desc}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}

function ScissorsEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)",
          strokeWidth: selected ? 2 : 1.5,
          transition: "stroke 0.2s, stroke-width 0.2s",
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan absolute flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-[#1c1c1e] transition hover:border-rose-400/60 hover:bg-rose-900/80"
            onClick={() => setEdges((edges) => edges.filter((e) => e.id !== id))}
          >
            <Scissors className="h-3.5 w-3.5 text-white/80" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = {
  smoothstep: ScissorsEdge,
};

export type ReactCanvasRootProps = {
  initialProjectId?: string;
  initialPrompt?: string;
  forceProjectList?: boolean;
  initialProjects?: CanvasProjectRecord[];
  autoSelectFirstProject?: boolean;
};

export function ReactCanvasRoot({
  initialProjectId,
  initialPrompt,
  forceProjectList,
  initialProjects,
  autoSelectFirstProject,
}: ReactCanvasRootProps) {
  const preferredAutoSelect =
    typeof autoSelectFirstProject === "boolean" ? autoSelectFirstProject : !forceProjectList;
  const {
    projects,
    currentProject,
    currentProjectId,
    loadProjects,
    selectProject,
    saveProjectCanvas,
    createProject,
    loading: loadingProjects,
    error: projectError,
  } = useCanvasProjects(initialProjectId, initialProjects, {
    autoSelectFirstProject: preferredAutoSelect,
  });
  const { resources, addResource, updateResource, removeResource, syncFromCanvasData } =
    useCanvasResources();
  const models = useCanvasModels();
  const { update: updateCanvasShell, registerCommands } = useCanvasShell();

  const [nodes, setNodes] = useState<Node<MinimalFlowNodeData>[]>(() => {
    const normalized = normalizeRuntimeCanvasData(undefined, initialPrompt);
    return runtimeToFlowNodes(normalized.nodes);
  });
  const [edges, setEdges] = useState<Edge[]>(() => {
    const normalized = normalizeRuntimeCanvasData(undefined, initialPrompt);
    return runtimeEdgesToFlowEdges(normalized.edges);
  });
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [viewportKey, setViewportKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [nodePicker, setNodePicker] = useState<{
    screenX: number;
    screenY: number;
    sourceNodeId: string | null;
    sourceNodeType: string | null;
  } | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const rfInstanceRef = useRef<{ screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number } } | null>(null);
  const hydratingRef = useRef(false);
  const nodesRef = useRef<Node<MinimalFlowNodeData>[]>(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  const getNodeById = useCallback(
    (nodeId: string) => nodesRef.current.find((node) => node.id === nodeId),
    [],
  );
  const router = useRouter();
  const pathname = usePathname();
  const detailViewRef = useRef(false);
  const lastProjectIdRef = useRef<string | null>(null);
  const [visibleProjectError, setVisibleProjectError] = useState<string | null>(null);
  const toggleExpanded = useCallback((nodeId: string, nextState?: boolean) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                expanded: typeof nextState === "boolean" ? nextState : !node.data.expanded,
              },
            }
          : node,
      ),
    );
  }, []);
  const focusNode = useCallback(
    (nodeId: string) => {
      toggleExpanded(nodeId, true);
      setFocusedNodeId(nodeId);
    },
    [toggleExpanded],
  );
  const patchRuntimeData = useCallback((nodeId: string, patch: Record<string, unknown>) => {
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId) return node;
        const nextRuntime = {
          ...node.data.runtime,
          data: { ...node.data.runtime.data, ...patch },
        };
        return {
          ...node,
          data: {
            ...node.data,
            runtime: nextRuntime,
            summary: summarizeNodeData(nextRuntime),
          },
        };
      }),
    );
  }, []);
  const setNodeStatus = useCallback(
    (nodeId: string, status: MinimalFlowNodeData["status"], statusMessage?: string) => {
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          const nextRuntime =
            statusMessage && statusMessage.trim().length > 0
              ? {
                  ...node.data.runtime,
                  data: { ...node.data.runtime.data, statusMessage },
                }
              : node.data.runtime;
          return {
            ...node,
            data: {
              ...node.data,
              status,
              runtime: nextRuntime,
              summary: summarizeNodeData(nextRuntime),
            },
          };
        }),
      );
    },
    [],
  );
  const { runImageNode, runVideoNode, runAudioNode, runDigitalHumanNode, runStoryboardNode, uploadResource } = useCanvasOrchestrator({
    getNode: getNodeById,
    patchRuntimeData,
    setNodeStatus,
    models,
    addResource,
  });
  const handleReloadProjects = useCallback(() => {
    void loadProjects();
  }, [loadProjects]);
  const handleCreateProject = useCallback(() => {
    void createProject();
  }, [createProject]);
  const nodeContextValue = useMemo(
    () => ({
      toggleExpanded,
      patchRuntimeData,
      focusNode,
      isConnecting,
      setNodeStatus,
      models,
      resources,
      resourceActions: {
        addResource,
        updateResource,
        removeResource,
      },
      runImageNode,
      runVideoNode,
      runAudioNode,
      runDigitalHumanNode,
      runStoryboardNode,
      uploadResource,
    }),
    [
      toggleExpanded,
      patchRuntimeData,
      focusNode,
      isConnecting,
      setNodeStatus,
      models,
      resources,
      addResource,
      updateResource,
      removeResource,
      runImageNode,
      runVideoNode,
      runAudioNode,
      runDigitalHumanNode,
      runStoryboardNode,
      uploadResource,
    ],
  );

  useEffect(() => {
    setFocusedNodeId(null);
  }, [currentProjectId]);

  useEffect(() => {
    if (!currentProject) return;
    hydratingRef.current = true;
    const normalized = normalizeRuntimeCanvasData(currentProject.canvasData, initialPrompt);
    setNodes(runtimeToFlowNodes(normalized.nodes));
    setEdges(runtimeEdgesToFlowEdges(normalized.edges));
    syncFromCanvasData(normalized.resources);
    setViewport(normalized.viewport);
    setViewportKey((key) => key + 1);
    const timeout = setTimeout(() => {
      hydratingRef.current = false;
    }, 300);
    return () => clearTimeout(timeout);
  }, [currentProject, initialPrompt, syncFromCanvasData]);

  useEffect(() => {
    if (!currentProjectId || hydratingRef.current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await saveProjectCanvas(currentProjectId, {
          nodes: flowNodesToRuntime(nodes),
          edges: flowEdgesToRuntime(edges),
          viewport,
          resources,
        });
        if (!cancelled) {
          setAutoSaveError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "保存项目失败";
          setAutoSaveError(message);
        }
      } finally {
        if (!cancelled) {
          setIsSaving(false);
        }
      }
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentProjectId, edges, nodes, resources, viewport, saveProjectCanvas]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<MinimalFlowNodeData>>[]) => setNodes((current) => applyNodeChanges(changes, current) as Node<MinimalFlowNodeData>[]),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((current) => applyEdgeChanges(changes, current)),
    [],
  );
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            animated: false,
          },
          current,
        ),
      ),
    [],
  );
  const onConnectStart = useCallback(() => setIsConnecting(true), []);
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: { isValid: boolean | null; startHandle?: { nodeId?: string } | null }) => {
      setIsConnecting(false);
      if (!connectionState.isValid) {
        const clientX = "clientX" in event ? event.clientX : (event as TouchEvent).changedTouches?.[0]?.clientX ?? 0;
        const clientY = "clientY" in event ? event.clientY : (event as TouchEvent).changedTouches?.[0]?.clientY ?? 0;
        const sourceNodeId = connectionState.startHandle?.nodeId ?? null;
        const sourceNode = sourceNodeId ? nodesRef.current.find((n) => n.id === sourceNodeId) : null;
        setNodePicker({
          screenX: clientX,
          screenY: clientY,
          sourceNodeId,
          sourceNodeType: sourceNode?.type ?? sourceNode?.data?.runtime?.type ?? null,
        });
      }
    },
    [],
  );
  const handlePaneDoubleClick = useCallback((event: React.MouseEvent) => {
    setNodePicker({ screenX: event.clientX, screenY: event.clientY, sourceNodeId: null, sourceNodeType: null });
  }, []);
  const handlePickNode = useCallback(
    (type: string, screenX: number, screenY: number, sourceNodeId: string | null) => {
      const pos = rfInstanceRef.current?.screenToFlowPosition({ x: screenX, y: screenY }) ?? { x: screenX, y: screenY };
      const newId = `${type}_${Math.random().toString(36).slice(2, 8)}`;
      // For storyboard nodes created from a video source, pre-fill the video URL
      const sourceNode = sourceNodeId ? nodesRef.current.find((n) => n.id === sourceNodeId) : null;
      const prefilledData: Record<string, unknown> = {};
      if (type === "storyboard" && sourceNode) {
        const srcData = (sourceNode.data.runtime?.data || {}) as Record<string, unknown>;
        const srcVideoUrl = String(srcData.outputUrl || srcData.videoUrl || srcData.url || "").trim();
        if (srcVideoUrl) prefilledData.videoUrl = srcVideoUrl;
      }
      const newNode: Node<MinimalFlowNodeData> = {
        id: newId,
        type,
        position: pos,
        data: {
          runtime: { id: newId, type, position: pos, data: prefilledData },
          summary: "",
          status: "idle" as const,
          expanded: false,
        },
      };
      setNodes((prev) => [...prev, newNode]);
      if (sourceNodeId) {
        setEdges((prev) =>
          addEdge({ id: `e_${sourceNodeId}_${newId}`, source: sourceNodeId, target: newId, type: "smoothstep" }, prev),
        );
      }
      setNodePicker(null);
    },
    [],
  );

  const showProjectList = forceProjectList || (!currentProject && !loadingProjects);
  const isDetailView = !showProjectList;
  const hasProjects = projects.length > 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!projectError) {
      setVisibleProjectError(null);
      return;
    }
    setVisibleProjectError(projectError);
    const timer = window.setTimeout(() => {
      setVisibleProjectError(null);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [projectError]);

  useEffect(() => {
    if (!isDetailView || !currentProject) {
      updateCanvasShell({
        active: false,
        projectId: null,
        projectName: "",
        isSaving: false,
        saveError: null,
        currentNodeId: null,
        currentNodeLabel: null,
        currentNodeType: null,
      });
      return;
    }
    const activeNode = focusedNodeId ? getNodeById(focusedNodeId) : null;
    updateCanvasShell({
      active: true,
      projectId: currentProject.id,
      projectName: currentProject.name || "未命名项目",
      isSaving,
      saveError: autoSaveError,
      currentNodeId: activeNode?.id ?? null,
      currentNodeLabel: activeNode ? resolveTitle(activeNode.data) : null,
      currentNodeType: activeNode?.data.runtime.type ?? null,
    });
  }, [
    autoSaveError,
    currentProject,
    focusedNodeId,
    getNodeById,
    isDetailView,
    isSaving,
    updateCanvasShell,
  ]);

  useEffect(() => {
    if (!pathname) return;
    const params = new URLSearchParams();
    if (showProjectList) {
      params.set("view", "projects");
    } else if (currentProjectId) {
      params.set("projectId", currentProjectId);
    }
    const search = params.toString();
    const target = `${pathname}${search ? `?${search}` : ""}`;
    router.replace(target, { scroll: false });
  }, [showProjectList, currentProjectId, pathname, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const previousDetail = detailViewRef.current;
    const previousProject = lastProjectIdRef.current;
    if (previousDetail === isDetailView && (!isDetailView || previousProject === (currentProjectId || null))) {
      return;
    }
    detailViewRef.current = isDetailView;
    lastProjectIdRef.current = currentProjectId || null;
    const payload = isDetailView
      ? {
          type: "canvas-enter",
          projectId: currentProjectId || "",
          projectName: currentProject?.name || "",
        }
      : { type: "canvas-exit" };
    window.postMessage(payload, window.location.origin);
  }, [currentProject?.name, currentProjectId, isDetailView]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        window.postMessage({ type: "canvas-exit" }, window.location.origin);
      }
    };
  }, []);

  useEffect(() => {
    registerCommands({
      focusNode: (nodeId: string) => {
        focusNode(nodeId);
      },
      patchNode: (nodeId: string, patch: Record<string, unknown>) => {
        const target = getNodeById(nodeId);
        if (!target) return false;
        patchRuntimeData(nodeId, patch);
        return true;
      },
      runNode: async (nodeId: string) => {
        const target = getNodeById(nodeId);
        if (!target) return;
        const runtimeType = target.data.runtime.type;
        if (runtimeType === "image") {
          await runImageNode(nodeId);
          return;
        }
        if (runtimeType === "video") {
          await runVideoNode(nodeId);
          return;
        }
        if (runtimeType === "audio") {
          await runAudioNode(nodeId);
          return;
        }
        if (runtimeType === "digitalhuman") {
          await runDigitalHumanNode(nodeId);
          return;
        }
        if (runtimeType === "storyboard") {
          await runStoryboardNode(nodeId);
        }
      },
    });
    return () => registerCommands(null);
  }, [
    focusNode,
    getNodeById,
    patchRuntimeData,
    registerCommands,
    runAudioNode,
    runDigitalHumanNode,
    runImageNode,
    runStoryboardNode,
    runVideoNode,
  ]);

  if (showProjectList && loadingProjects && !hasProjects) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#05060c]">
        <AiGlowSpinner size={96} />
      </div>
    );
  }

  if (showProjectList) {
    return (
      <div className="min-h-screen bg-[#05060c] text-white">
        <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-6 py-10">
          <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <h1 className="text-4xl font-semibold tracking-tight">无限画布</h1>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReloadProjects}
                disabled={loadingProjects}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-white/50 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
              >
                <RotateCcw
                  className={clsx("h-4 w-4", {
                    "animate-spin": loadingProjects,
                  })}
                />
                刷新
              </button>
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={loadingProjects}
                className="inline-flex items-center gap-2 rounded-full bg-[#ffc94a] px-5 py-2 text-sm font-medium text-black shadow-[0_0_25px_rgba(255,201,74,0.45)] transition hover:bg-[#ffd86f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                新建项目
              </button>
            </div>
          </div>
          {visibleProjectError && (
            <div className="mb-6 rounded-3xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {visibleProjectError}
            </div>
          )}
          {hasProjects ? (
            <div className="grid flex-1 gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={loadingProjects}
                className="flex min-h-[260px] flex-col items-center justify-center rounded-[32px] border border-dashed border-white/20 bg-white/[0.02] text-white/70 transition hover:border-white/50 hover:text-white disabled:cursor-not-allowed disabled:border-white/10"
              >
                <Plus className="mb-3 h-8 w-8" />
                <span className="text-base">新建项目</span>
              </button>
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => selectProject(project.id)}
                  className="group flex min-h-[260px] flex-col overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.02] text-left transition hover:border-white/40"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden">
                    {project.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={project.thumbnail}
                        alt={project.name || "Canvas project"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/5 to-transparent text-white/40">
                        <Sparkles className="h-8 w-8" />
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05060c] via-transparent" />
                  </div>
                  <div className="flex flex-1 flex-col px-5 py-4">
                    <p className="text-lg font-medium text-white">{project.name || "未命名项目"}</p>
                    <p className="mt-1 text-xs text-white/50">
                      更新于 {new Date(project.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[32px] border border-white/10 bg-white/[0.02] px-10 py-24 text-center">
              <div className="rounded-full bg-white/5 p-4">
                <Sparkles className="h-8 w-8 text-[#ffc94a]" />
              </div>
              <p className="text-lg font-medium text-white">欢迎使用无限画布</p>
              <p className="max-w-md text-sm text-white/60">
                创建你的第一个项目，体验极简节点、AI 渲染与资源联动。
              </p>
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={loadingProjects}
                className="inline-flex items-center gap-2 rounded-full bg-[#ffc94a] px-6 py-2 text-sm font-medium text-black shadow-[0_0_25px_rgba(255,201,74,0.45)] transition hover:bg-[#ffd86f] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                创建第一个项目
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#05060c] text-white">
      <div className="flex-1 overflow-hidden">
        <CanvasNodeContext.Provider value={nodeContextValue}>
          <ReactFlow
            key={viewportKey}
            nodes={nodes}
            edges={edges}
            fitView
            className="bg-transparent text-white"
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            defaultViewport={viewport}
            onMoveEnd={(_, nextViewport) =>
              setViewport({
                x: nextViewport.x,
                y: nextViewport.y,
                zoom: nextViewport.zoom,
              })
            }
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => { rfInstanceRef.current = instance; }}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd as never}
            onPaneDoubleClick={handlePaneDoubleClick as never}
            onPaneClick={() => setNodePicker(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="rgba(255,255,255,0.08)" variant={BackgroundVariant.Dots} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </CanvasNodeContext.Provider>
      </div>
      {nodePicker && (
        <NodePickerPopup
          screenX={nodePicker.screenX}
          screenY={nodePicker.screenY}
          sourceNodeId={nodePicker.sourceNodeId}
          sourceNodeType={nodePicker.sourceNodeType}
          onPick={(type) => handlePickNode(type, nodePicker.screenX, nodePicker.screenY, nodePicker.sourceNodeId)}
          onDismiss={() => setNodePicker(null)}
        />
      )}
    </div>
  );
}
