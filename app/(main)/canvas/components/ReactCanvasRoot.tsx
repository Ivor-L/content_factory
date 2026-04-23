"use client";

import { createPortal } from "react-dom";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type HTMLAttributes,
  type RefObject,
} from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  ConnectionMode,
  EdgeLabelRenderer,
  ReactFlow,
  SelectionMode,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  getBezierPath,
  useReactFlow,
  useUpdateNodeInternals,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  Handle,
  Position,
  type NodeProps,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import clsx from "clsx";
import {
  AlignLeft,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Download,
  Film,
  Grid3X3,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Locate,
  Loader2,
  Maximize2,
  MessageSquare,
  MousePointer2,
  Music,
  Pencil,
  Save,
  Trash2,
  Pause,
  Paperclip,
  Play,
  Plus,
  RotateCcw,
  Scan,
  Scissors,
  Sparkles,
  Smile,
  Upload,
  AlertTriangle,
  CheckCircle2,
  UserCircle2,
  Video,
  X,
  Zap,
  LayoutGrid,
} from "lucide-react";
import toast from "react-hot-toast";
import { AiGlowSpinner } from "@/components/AiGlowSpinner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { supabase } from "@/lib/supabaseClient";
import { useCanvasShell } from "@/contexts/CanvasShellContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTenant } from "@/hooks/useTenant";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useCanvasProjects } from "../hooks/useCanvasProjects";
import { useCanvasResources } from "../hooks/useCanvasResources";
import { useCanvasModels, type ModelOption, VIDEO_MODEL_PARAMS } from "../hooks/useCanvasModels";
import { useCanvasOrchestrator } from "../hooks/useCanvasOrchestrator";
import { useCanvasPresets } from "../hooks/useCanvasPresets";
import {
  DEFAULT_VIEWPORT,
  EMPTY_UPSTREAM,
  flowEdgesToRuntime,
  flowNodesToRuntime,
  normalizeRuntimeCanvasData,
  resolveUpstreamInputs,
  summarizeNodeData,
  runtimeEdgesToFlowEdges,
  runtimeToFlowNodes,
  type MinimalFlowNodeData,
  type UpstreamInputs,
} from "../lib/canvasDataAdapters";
import type { CanvasProjectRecord } from "../types";
import type { RuntimeCanvasNode } from "../lib/canvasDataAdapters";
import { toForcedProxyUrl } from "@/lib/mediaProxy";

const CANVAS_PERF_TRACING = process.env.NODE_ENV !== "production";
const PERF_LOG_THROTTLE_MS = 2000;

function resolveLanguageLabel(lang?: string | null): string {
  if (lang === "zh-TW") return "繁体";
  if (lang === "en") return "English";
  return "简体";
}

function inferFileExtension(url: string, fallback: string): string {
  try {
    const target = new URL(url, "https://local.canvas");
    const filename = target.pathname.split("/").pop() || "";
    const match = filename.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (match?.[1]) return match[1].toLowerCase();
  } catch {
    // ignore and fallback
  }
  return fallback;
}

function sanitizeFilename(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "download";
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return sanitized.slice(0, 120) || "download";
}

function triggerForcedDownload(url: string, filename: string) {
  if (!url || typeof document === "undefined") return;
  const safeName = sanitizeFilename(filename);
  const anchor = document.createElement("a");
  anchor.href = toForcedProxyUrl(url, safeName);
  anchor.setAttribute("download", safeName);
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function triggerCanvasDownload(url: string, prefix: string, fallbackExt: string) {
  const ext = inferFileExtension(url, fallbackExt);
  triggerForcedDownload(url, `${sanitizeFilename(prefix)}.${ext}`);
}

const CANVAS_DRAFT_STORAGE_PREFIX = "canvas-project-draft:";

function getCanvasDraftStorageKey(projectId: string): string {
  return `${CANVAS_DRAFT_STORAGE_PREFIX}${projectId}`;
}

function readCanvasDraft(projectId: string): unknown | null {
  if (typeof window === "undefined" || !projectId) return null;
  try {
    const raw = window.localStorage.getItem(getCanvasDraftStorageKey(projectId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCanvasDraft(projectId: string, canvasData: Record<string, unknown>) {
  if (typeof window === "undefined" || !projectId) return;
  try {
    window.localStorage.setItem(getCanvasDraftStorageKey(projectId), JSON.stringify({
      ...canvasData,
      savedAt: Date.now(),
    }));
  } catch {
    // ignore storage write failures
  }
}

function extractThumbnailFromNodes(runtimeNodes: RuntimeCanvasNode[]): string | null {
  for (const node of runtimeNodes) {
    const d = (node.data || {}) as Record<string, unknown>;
    if (node.type === "image") {
      const outputs = Array.isArray(d.outputs) ? d.outputs : [];
      for (const out of outputs) {
        const url =
          typeof out === "string"
            ? out
            : typeof (out as Record<string, unknown>).url === "string"
            ? ((out as Record<string, unknown>).url as string)
            : "";
        if (url) return url;
      }
      const imgUrl = typeof d.imageUrl === "string" ? d.imageUrl : "";
      if (imgUrl) return imgUrl;
    } else if (node.type === "video" || node.type === "digitalhuman") {
      const url = typeof d.outputUrl === "string" ? d.outputUrl : "";
      if (url) return url;
    }
  }
  return null;
}

function collectUpstreamInputsByTarget(
  nodes: Node<MinimalFlowNodeData>[],
  edges: Edge[],
): Map<string, UpstreamInputs> {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const buckets = new Map<
    string,
    {
      textContents: string[];
      imageUrls: string[];
      videoUrls: string[];
      audioUrls: string[];
    }
  >();

  const ensureBucket = (targetId: string) => {
    let bucket = buckets.get(targetId);
    if (!bucket) {
      bucket = { textContents: [], imageUrls: [], videoUrls: [], audioUrls: [] };
      buckets.set(targetId, bucket);
    }
    return bucket;
  };

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    if (!sourceNode) continue;
    const bucket = ensureBucket(edge.target);
    const runtimeData = (sourceNode.data.runtime?.data || {}) as Record<string, unknown>;
    const sourceType = sourceNode.type || sourceNode.data.runtime?.type || "";

    if (sourceType === "text") {
      const text = String(runtimeData.content ?? "").trim();
      if (text) bucket.textContents.push(text);
      continue;
    }
    if (sourceType === "image") {
      const outputs = Array.isArray(runtimeData.outputs) ? runtimeData.outputs : [];
      for (const out of outputs) {
        const url =
          typeof out === "string"
            ? out
            : typeof (out as Record<string, unknown>).url === "string"
            ? ((out as Record<string, unknown>).url as string)
            : "";
        if (url) bucket.imageUrls.push(url);
      }
      continue;
    }
    if (sourceType === "video" || sourceType === "digitalhuman") {
      const url = String(runtimeData.outputUrl ?? "").trim();
      if (url) bucket.videoUrls.push(url);
      continue;
    }
    if (sourceType === "audio") {
      const url = String(runtimeData.audioUrl ?? "").trim();
      if (url) bucket.audioUrls.push(url);
    }
  }

  const result = new Map<string, UpstreamInputs>();
  buckets.forEach((bucket, targetId) => {
    result.set(targetId, {
      textContents: bucket.textContents,
      imageUrls: bucket.imageUrls,
      videoUrls: bucket.videoUrls,
      audioUrls: bucket.audioUrls,
      effectivePrompt: bucket.textContents[0] ?? "",
      firstImageUrl: bucket.imageUrls[0] ?? "",
      firstVideoUrl: bucket.videoUrls[0] ?? "",
      firstAudioUrl: bucket.audioUrls[0] ?? "",
    });
  });
  return result;
}

function shallowArrayEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function upstreamInputsEqual(a: UpstreamInputs, b: UpstreamInputs): boolean {
  return (
    a.effectivePrompt === b.effectivePrompt &&
    a.firstImageUrl === b.firstImageUrl &&
    a.firstVideoUrl === b.firstVideoUrl &&
    a.firstAudioUrl === b.firstAudioUrl &&
    shallowArrayEqual(a.textContents, b.textContents) &&
    shallowArrayEqual(a.imageUrls, b.imageUrls) &&
    shallowArrayEqual(a.videoUrls, b.videoUrls) &&
    shallowArrayEqual(a.audioUrls, b.audioUrls)
  );
}

type CanvasImageProps = {
  src: string;
  alt: string;
  imageClassName?: string;
  draggable?: boolean;
  sizes?: string;
  priority?: boolean;
  onLoad?: (dims: { naturalWidth: number; naturalHeight: number }) => void;
} & Omit<HTMLAttributes<HTMLDivElement>, "onLoad">;

function CanvasImage({
  src,
  alt,
  imageClassName,
  draggable = false,
  sizes = "100vw",
  priority,
  onLoad,
  className,
  ...rest
}: CanvasImageProps) {
  return (
    <div className={clsx("relative", className)} {...rest}>
      <Image
        fill
        src={src}
        alt={alt}
        draggable={draggable}
        sizes={sizes}
        priority={priority}
        className={clsx("object-cover", imageClassName)}
        onLoadingComplete={(img) => {
          onLoad?.({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
        }}
      />
    </div>
  );
}

type CanvasResourceItem = ReturnType<typeof useCanvasResources>["resources"][number];
type DecoratedNodeCacheEntry = {
  baseNode: Node<MinimalFlowNodeData>;
  decoratedNode: Node<MinimalFlowNodeData>;
  upstreamInputs: UpstreamInputs;
};

type CanvasNodeContextValue = {
  toggleExpanded: (nodeId: string, expanded?: boolean) => void;
  patchRuntimeData: (nodeId: string, patch: Record<string, unknown>) => void;
  focusNode: (nodeId: string, multiSelect?: boolean) => void;
  focusedNodeId: string | null;
  selectedNodeIds: Set<string>;
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
  runTextNode: (nodeId: string) => Promise<void>;
  runGridNode: (nodeId: string) => Promise<void>;
  splitGridNode: (nodeId: string) => Promise<void>;
  reverseImagePrompt: (nodeId: string, mode?: "no-text" | "with-text") => Promise<void>;
  addDownstreamNodes: (
    sourceNodeId: string,
    nodes: { type: string; data: Record<string, unknown> }[],
  ) => string[];
  uploadResource: (
    file: File,
    options: { type: CanvasResourceItem["type"]; variant?: string; name?: string },
  ) => Promise<CanvasResourceItem>;
  polishPrompt: (text: string) => Promise<string>;
  openViralModal: (nodeId: string, videoUrl: string, screenX: number, screenY: number) => void;
  getNode: (nodeId: string) => Node<MinimalFlowNodeData> | undefined;
  getUpstreamInputs: (nodeId: string) => UpstreamInputs;
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
  focusedNodeId: null,
  selectedNodeIds: new Set<string>(),
  isConnecting: false,
  setNodeStatus: () => {},
  models: {
    textModels: [],
    imageModels: [],
    videoModels: [],
    digitalHumanModels: [],
    audioModels: [],
    defaultModels: { text: fallbackModel, image: fallbackModel, video: fallbackModel, digitalHuman: fallbackModel, audio: fallbackModel },
  },
  resources: [],
  resourceActions: noopResourceActions,
  runImageNode: async () => {},
  runVideoNode: async () => {},
  runAudioNode: async () => {},
  runDigitalHumanNode: async () => {},
  runStoryboardNode: async () => {},
  runTextNode: async () => {},
  runGridNode: async () => {},
  splitGridNode: async () => {},
  reverseImagePrompt: async () => {},
  addDownstreamNodes: () => [],
  uploadResource: async () => {
    throw new Error("Canvas runtime未初始化");
  },
  polishPrompt: async (text) => text,
  openViralModal: () => {},
  getNode: () => undefined,
  getUpstreamInputs: () => ({ textContents: [], imageUrls: [], videoUrls: [], audioUrls: [], effectivePrompt: "", firstImageUrl: "", firstVideoUrl: "", firstAudioUrl: "" }),
});

function useCanvasNodeContext() {
  return useContext(CanvasNodeContext);
}

type CardMagnetState = { showLeft: boolean; showRight: boolean; magnetY: number };
const DEFAULT_MAGNET: CardMagnetState = { showLeft: false, showRight: false, magnetY: 50 };
const CardMagnetContext = createContext<CardMagnetState>(DEFAULT_MAGNET);

function useCardMagnet(ref: RefObject<HTMLElement | null>): CardMagnetState {
  const [state, setState] = useState<CardMagnetState>(DEFAULT_MAGNET);
  const rafRef = useRef<number | null>(null);

  // Node-local pointer tracking keeps listener count low as node count grows.
  useEffect(() => {
    // Track the outer card shell when available so the visible trigger dot stays
    // inside the same hover region as the hidden connection handle.
    const el = ref.current?.parentElement ?? ref.current;
    if (!el) return;
    const RADIUS = 130;
    let lastMx = 0;
    let lastMy = 0;
    const scheduleUpdate = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const r = el.getBoundingClientRect();
        const mx = lastMx;
        const my = lastMy;
        const cy = r.top + r.height / 2;
        const distLeft = Math.sqrt((mx - r.left) ** 2 + (my - cy) ** 2);
        const distRight = Math.sqrt((mx - r.right) ** 2 + (my - cy) ** 2);
        const nearLeft = distLeft <= RADIUS;
        const nearRight = distRight <= RADIUS;
        if (nearLeft || nearRight) {
          const activeDist = nearLeft ? distLeft : distRight;
          const t = 1 - activeDist / RADIUS;
          const strength = t * t;
          const mousePct = ((my - r.top) / r.height) * 100;
          const magnetPct = 50 + (mousePct - 50) * strength;
          const next = {
            showLeft: nearLeft,
            showRight: nearRight,
            magnetY: Math.max(5, Math.min(95, magnetPct)),
          };
          setState((prev) => {
            const nearlySameY = Math.abs(prev.magnetY - next.magnetY) < 0.2;
            if (
              prev.showLeft === next.showLeft &&
              prev.showRight === next.showRight &&
              nearlySameY
            ) {
              return prev;
            }
            return next;
          });
          return;
        }
        setState((prev) => (prev.showLeft || prev.showRight ? DEFAULT_MAGNET : prev));
      });
    };
    const onMove = (e: MouseEvent) => {
      lastMx = e.clientX;
      lastMy = e.clientY;
      scheduleUpdate();
    };
    const onLeave = () => {
      setState((prev) => (prev.showLeft || prev.showRight ? DEFAULT_MAGNET : prev));
    };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [ref]);

  return state;
}

// CardHandle: two-layer system.
// Layer 1 — invisible ReactFlow <Handle> (opacity 0) for connection interaction.
// Layer 2 — visual circle div (pointerEvents none) that floats 20 px outside card.
// Both layers share the same Y so the visible dot and hit area stay aligned.
function CardHandle({
  side,
  magnetY,
  visible,
  isConnecting,
}: {
  side: "left" | "right";
  magnetY: number;
  visible: boolean;
  isConnecting: boolean;
}) {
  const isTarget = side === "left";
  return (
    <>
      {/* Invisible Handle — 34 × 160 px hit area, entirely outside the card */}
      <Handle
        id={isTarget ? "left" : "right"}
        type={isTarget ? "target" : "source"}
        position={isTarget ? Position.Left : Position.Right}
        style={{
          position: "absolute",
          [side]: -34,
          top: `${magnetY}%`,
          transform: "translateY(-50%)",
          width: 34,
          height: 160,
          opacity: 0,
          background: "transparent",
          border: "none",
          borderRadius: 8,
          pointerEvents: visible ? "auto" : "none",
          cursor: "crosshair",
          zIndex: 20,
        }}
      />
      {/* Visual circle — center is 20 px outside card boundary, Y tracks mouse */}
      <div
        style={{
          position: "absolute",
          [side]: -34,
          top: `${magnetY}%`,
          transform: "translateY(-50%)",
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: `1px solid ${isConnecting && isTarget ? "var(--canvas-border-strong)" : "var(--canvas-border-md)"}`,
          background: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: visible ? 1 : 0,
          transition: "top 0.1s ease-out, opacity 0.15s ease",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <Plus className="h-3 w-3 text-[var(--canvas-text-50)] pointer-events-none" />
      </div>
    </>
  );
}

function resolveTitle(node: MinimalFlowNodeData): string {
  const rawLabel = node.runtime?.data?.label;
  if (typeof rawLabel === "string" && rawLabel.trim()) return rawLabel;
  switch (node.runtime?.type) {
    case "text":
      return "文本";
    case "image":
      return "图片";
    case "video":
      return "视频";
    case "audio":
      return "音频";
    case "digitalhuman":
      return "数字人";
    case "imagetextgroup":
      return "图文创作";
    case "storyboard":
      return "分镜板";
    case "grid":
      return "九宫格";
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

const NODE_TYPE_ICONS: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  text: AlignLeft,
  audio: Music,
  imagetextgroup: LayoutGrid,
};

function EditableNodeLabel({ title, nodeId, patchRuntimeData }: { title: string; nodeId: string; patchRuntimeData: (id: string, patch: Record<string, unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) {
      patchRuntimeData(nodeId, { label: trimmed });
    }
    setEditing(false);
  }, [draft, title, nodeId, patchRuntimeData]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setEditing(false);
  }, [commit]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="flex-1 ml-1 bg-transparent text-[11px] uppercase tracking-[0.2em] text-[var(--canvas-text)] outline-none"
      />
    );
  }

  return (
    <span
      className="cursor-pointer ml-1 text-[11px] uppercase tracking-[0.2em] text-[var(--canvas-text-50)] hover:text-[var(--canvas-text-70)]"
      onDoubleClick={(e) => { e.stopPropagation(); setDraft(title); setEditing(true); setTimeout(() => inputRef.current?.select(), 0); }}
      title="双击修改名称"
    >
      {title}
    </span>
  );
}

function NodeCardShell({ id: shellId, data, selected, children }: NodeCardProps) {
  const { isConnecting, patchRuntimeData, focusNode } = useCanvasNodeContext();
  const innerRef = useRef<HTMLDivElement>(null);
  const magnet = useCardMagnet(innerRef);
  const updateNodeInternals = useUpdateNodeInternals();
  const title = resolveTitle(data);
  const NodeIcon = NODE_TYPE_ICONS[data.runtime.type] ?? AlignLeft;

  // Sync handle positions when node content changes height (e.g. image loads, panel expands)
  useEffect(() => {
    updateNodeInternals(shellId);
  }, [shellId, updateNodeInternals, data.expanded]);

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const isMultiSelect = e.ctrlKey || e.metaKey;
    focusNode(shellId, isMultiSelect);
  };

  return (
    <div
      className="min-w-[280px] max-w-[360px] select-none text-[var(--canvas-text)] cursor-pointer"
      onClick={handleCardClick}
    >
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <NodeIcon className="h-3.5 w-3.5 text-[var(--canvas-text-50)]" />
        <EditableNodeLabel title={title} nodeId={shellId} patchRuntimeData={patchRuntimeData} />
      </div>
      <div className="relative">
      <CardHandle side="left" magnetY={magnet.magnetY} visible={magnet.showLeft || isConnecting} isConnecting={isConnecting} />
      <CardHandle side="right" magnetY={magnet.magnetY} visible={magnet.showRight} isConnecting={isConnecting} />
      <div
        ref={innerRef}
        className={clsx(
          "rounded-[24px] border bg-[var(--canvas-surface)] p-4 transition",
          selected
            ? "border-[var(--canvas-border-strong)] shadow-[var(--canvas-shadow-glow-sm)]"
            : isConnecting
            ? "border-[var(--canvas-border-md)] hover:border-[var(--canvas-border-accent)] hover:shadow-[var(--canvas-shadow-glow-md)]"
            : "border-[var(--canvas-border)] hover:border-[var(--canvas-border-md)]",
        )}
      >
        <div className="space-y-3">{children}</div>
      </div>
      </div>
    </div>
  );
}

function TextNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id, selected } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const { patchRuntimeData, isConnecting, runTextNode } = useCanvasNodeContext();
  const { language: interfaceLanguage } = useLanguage();
  const languageLabel = resolveLanguageLabel(interfaceLanguage);
  const magnet = useCardMagnet(innerRef);
  const updateNodeInternals = useUpdateNodeInternals();
  const runtimeData = data.runtime.data as Record<string, unknown>;
  const mode = typeof runtimeData.mode === "string" ? runtimeData.mode : "";
  const isImageUnderstanding = mode === "image-understanding";
  const content = typeof runtimeData.content === "string" ? runtimeData.content : "";
  const isLoadingPrompt = runtimeData.isLoadingPrompt === true;
  const title = resolveTitle(data);
  const [localContent, setLocalContent] = useState(content);
  const composingRef = useRef(false);
  useEffect(() => { if (!composingRef.current) setLocalContent(content); }, [content]);

  // AI transform state
  const upstream = data.upstreamInputs ?? EMPTY_UPSTREAM;
  const hasUpstream = !!(upstream.effectivePrompt || upstream.firstImageUrl || upstream.firstVideoUrl);
  const [localInstruction, setLocalInstruction] = useState(
    typeof runtimeData.instruction === "string" ? runtimeData.instruction : "",
  );
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  const transformModel = typeof runtimeData.transformModel === "string"
    ? runtimeData.transformModel
    : "gemini-3.1-flash-lite-preview";
  const isRunning = data.status === "running";

  // Image understanding state
  const upstreamImageUrl = String(runtimeData.imageUrl || upstream.firstImageUrl || "");
  const imgUnderstandingModel = typeof runtimeData.imgUnderstandingModel === "string"
    ? runtimeData.imgUnderstandingModel
    : "gemini-3.1-flash-lite-preview";
  const [localPrompt, setLocalPrompt] = useState(
    typeof runtimeData.prompt === "string" ? runtimeData.prompt : "",
  );

  // Notify ReactFlow when textarea is resized by user (native drag handle)
  // Also prevent wheel events from propagating to ReactFlow when textarea is focused
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => updateNodeInternals(id));
    observer.observe(el);
    const wheelHandler = (e: WheelEvent) => { if (document.activeElement === el) e.stopPropagation(); };
    el.addEventListener("wheel", wheelHandler, { passive: false });
    return () => { observer.disconnect(); el.removeEventListener("wheel", wheelHandler); };
  }, [id, updateNodeInternals]);

  useEffect(() => {
    const el = instructionRef.current;
    if (!el) return;
    const wheelHandler = (e: WheelEvent) => { if (document.activeElement === el) e.stopPropagation(); };
    el.addEventListener("wheel", wheelHandler, { passive: false });
    return () => el.removeEventListener("wheel", wheelHandler);
  }, []);

  // ── Smart Create panel ───────────────────────────────────────────────────────
  const [showSmartCreate, setShowSmartCreate] = useState(false);
  const [scAuthToken, setScAuthToken] = useState<string | null>(null);
  const [scIdeaText, setScIdeaText] = useState("");
  const [scWordCount, setScWordCount] = useState("800");
  const [scStyleOptions, setScStyleOptions] = useState<{ id: string; name: string; channel?: string | null }[]>([]);
  const [scStyleLoading, setScStyleLoading] = useState(false);
  const [scSelectedStyleId, setScSelectedStyleId] = useState<string | null>(null);
  const [scSelectedStyleJson, setScSelectedStyleJson] = useState<Record<string, unknown> | null>(null);
  const [scCreating, setScCreating] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setScAuthToken(data.session?.access_token ?? null);
    });
  }, []);

  useEffect(() => {
    if (!showSmartCreate || !scAuthToken || scStyleOptions.length > 0) return;
    let cancelled = false;
    setScStyleLoading(true);
    fetch("/api/assets/writing-styles?limit=50", {
      headers: { Authorization: `Bearer ${scAuthToken}` },
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((p) => { if (!cancelled) setScStyleOptions(Array.isArray(p?.data) ? p.data : []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setScStyleLoading(false); });
    return () => { cancelled = true; };
  }, [showSmartCreate, scAuthToken, scStyleOptions.length]);

  async function handleSmartCreate() {
    if (!scIdeaText.trim() || !scAuthToken) return;
    setScCreating(true);
    patchRuntimeData(id, { isLoadingPrompt: true });
    try {
      let styleRules: Record<string, unknown> | null = scSelectedStyleJson;
      if (scSelectedStyleId && !styleRules) {
        const r = await fetch(`/api/assets/writing-styles/${scSelectedStyleId}`, {
          headers: { Authorization: `Bearer ${scAuthToken}` },
        });
        const p = await r.json();
        styleRules = (p?.data?.currentProfile?.profileJson as Record<string, unknown>) || null;
        if (styleRules) setScSelectedStyleJson(styleRules);
      }
      const reqBody: Record<string, unknown> = {
        ideaText: scIdeaText.trim(),
        title: scIdeaText.trim().slice(0, 60) || "智能创作",
        goal: { targetWordCount: Math.max(1, parseInt(scWordCount, 10) || 800) },
        language: languageLabel,
      };
      if (styleRules) reqBody.styleRules = styleRules;
      const res = await fetch("/api/creative-tasks/direct", {
        method: "POST",
        headers: { Authorization: `Bearer ${scAuthToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      const resBody = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new Error((resBody?.error as string) || "创建失败");
      const taskId = typeof (resBody?.data as Record<string, unknown>)?.id === "string"
        ? (resBody.data as Record<string, unknown>).id as string
        : null;
      if (!taskId) throw new Error("未获取到任务 ID");
      // Poll until done (max 3 min)
      for (let i = 0; i < 60; i++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 3000));
        const pr = await fetch(`/api/creative-tasks/${taskId}`, {
          headers: { Authorization: `Bearer ${scAuthToken}` },
        });
        const pd = await pr.json() as Record<string, unknown>;
        const t = pd?.data as Record<string, unknown> | null;
        if (t?.status === "COMPLETED") {
          const ao = (t?.metadata as Record<string, unknown>)?.stages as Record<string, unknown> | null;
          const draft = (ao?.draft as Record<string, unknown>)?.aiOutput as Record<string, unknown> | null;
          const titlePart = typeof draft?.["标题"] === "string" ? draft["标题"] : "";
          const bodyPart = typeof draft?.["正文"] === "string" ? draft["正文"] : "";
          const tags = Array.isArray(draft?.["标签"]) ? (draft["标签"] as string[]).join(" ") : "";
          const combined = [titlePart, bodyPart, tags].filter(Boolean).join("\n\n");
          patchRuntimeData(id, { content: combined });
          setLocalContent(combined);
          setShowSmartCreate(false);
          setScIdeaText("");
          toast.success("智能创作完成！");
          return;
        }
        if (t?.status === "GENERATE_FAILED") throw new Error("创作生成失败，请重试");
      }
      throw new Error("生成超时，请前往「我的作品」查看结果");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setScCreating(false);
      patchRuntimeData(id, { isLoadingPrompt: false });
    }
  }

  if (isImageUnderstanding) {
    return (
      <div className="select-none text-[var(--canvas-text)]" style={{ width: 280 }}>
        <div className="mb-1.5 flex items-center gap-1.5 px-1">
          <Scan className="h-3.5 w-3.5 text-[var(--canvas-text-50)]" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--canvas-text-50)]">图片理解</span>
        </div>
        <div className="relative" ref={innerRef}>
          <CardHandle side="left" magnetY={magnet.magnetY} visible={magnet.showLeft || isConnecting} isConnecting={isConnecting} />
          <CardHandle side="right" magnetY={magnet.magnetY} visible={magnet.showRight} isConnecting={isConnecting} />
          <div
            className={clsx(
              "rounded-[20px] border bg-[var(--canvas-surface-deep)] transition",
              selected
                ? "border-[var(--canvas-border-md)] shadow-[var(--canvas-shadow-glow-sm)]"
                : isConnecting
                ? "border-[var(--canvas-border)] hover:border-[var(--canvas-border-heavy)]"
                : "border-[var(--canvas-border)] hover:border-[var(--canvas-border-md)]",
            )}
          >
            {/* Model selector */}
            <div className="flex items-center gap-2 border-b border-[var(--canvas-border)] px-4 pt-3 pb-2.5">
              <span className="text-[11px] text-[var(--canvas-text-40)]">模型</span>
              <div className="ml-auto">
                <CanvasSelect
                  value={imgUnderstandingModel}
                  options={[
                    { value: "gemini-3.1-flash-lite-preview", label: "Gemini Flash Lite" },
                    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
                  ]}
                  onChange={(v) => patchRuntimeData(id, { imgUnderstandingModel: v })}
                />
              </div>
            </div>
            {/* Upstream image preview */}
            {upstreamImageUrl ? (
              <CanvasImage
                src={upstreamImageUrl}
                alt="参考图片"
                className="mx-4 mt-3 w-full overflow-hidden rounded-xl"
                style={{ maxHeight: 120 }}
                draggable={false}
              />
            ) : (
              <div className="mx-4 mt-3 flex h-[72px] items-center justify-center rounded-xl bg-[var(--canvas-hover-sm)]">
                <span className="text-[11px] text-[var(--canvas-text-30)]">等待上游图片节点</span>
              </div>
            )}
            {/* Prompt input */}
            <textarea
              value={localPrompt}
              onChange={(e) => {
                setLocalPrompt(e.target.value);
                patchRuntimeData(id, { prompt: e.target.value });
              }}
              placeholder="输入分析提示词，例如：描述这张图片的内容..."
              className="select-text mt-2 w-full resize-none bg-transparent px-4 py-2 text-sm text-[var(--canvas-text)] outline-none placeholder:text-[var(--canvas-text-30)] nopan selection:bg-blue-500/50"
              style={{ minHeight: 72, overflowY: "hidden" }}
            />
            {/* Run button */}
            <div className="flex items-center justify-between border-t border-[var(--canvas-border)] px-4 py-2.5">
              <span className="text-[11px] text-[var(--canvas-text-30)]">图片理解 · 1积分</span>
              <button
                type="button"
                disabled={isRunning || !upstreamImageUrl || !localPrompt.trim()}
                onClick={(e) => { e.stopPropagation(); void runTextNode(id); }}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--canvas-hover-lg)] px-3 py-1 text-[11px] font-medium text-[var(--canvas-text)] transition hover:bg-[var(--canvas-hover-xl)] disabled:opacity-40"
              >
                {isRunning ? (
                  <><AiGlowSpinner size={12} />分析中...</>
                ) : (
                  <><Scan className="h-3 w-3" />开始分析</>
                )}
              </button>
            </div>
            {/* Result output */}
            {content && (
              <div className="border-t border-[var(--canvas-border)] px-4 py-3">
                <p className="text-[11px] text-[var(--canvas-text-40)] mb-1.5">分析结果</p>
                <textarea
                  ref={textareaRef}
                  value={localContent}
                  onChange={(e) => {
                    setLocalContent(e.target.value);
                    if (!composingRef.current) patchRuntimeData(id, { content: e.target.value });
                  }}
                  onCompositionStart={() => { composingRef.current = true; }}
                  onCompositionEnd={(e) => {
                    composingRef.current = false;
                    patchRuntimeData(id, { content: (e.target as HTMLTextAreaElement).value });
                  }}
                  className="select-text w-full resize-none bg-transparent text-sm text-[var(--canvas-text-80)] outline-none nopan selection:bg-blue-500/50"
                  style={{ minHeight: 80, overflowY: "hidden" }}
                />
              </div>
            )}
            {isRunning && <GeneratingOverlay label="图片理解中..." />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative select-none text-[var(--canvas-text)]"
      style={{ width: 240 }}
    >
      {/* Smart Create floating button — shown when selected */}
      {selected && !isRunning && (
        <div className="absolute bottom-full left-1/2 z-10 -translate-x-1/2 -translate-y-2 flex items-center rounded-full bg-[var(--canvas-surface)] shadow-[var(--canvas-shadow-sm)]">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowSmartCreate((v) => !v); }}
            className={clsx(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition",
              showSmartCreate
                ? "bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)]"
                : "text-[var(--canvas-text)] hover:bg-[var(--canvas-hover)]",
            )}
          >
            <Sparkles className="h-3 w-3" />
            智能创作
          </button>
        </div>
      )}
      {/* Label above */}
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        {upstream.firstImageUrl ? (
          <ImageIcon className="h-3.5 w-3.5 text-[var(--canvas-text-50)]" />
        ) : (
          <AlignLeft className="h-3.5 w-3.5 text-[var(--canvas-text-50)]" />
        )}
        <EditableNodeLabel title={title} nodeId={id} patchRuntimeData={patchRuntimeData} />
      </div>
      {/* Card = textarea with handles positioned relative to it */}
      <div className="relative" ref={innerRef}>
      <CardHandle side="left" magnetY={magnet.magnetY} visible={magnet.showLeft || isConnecting} isConnecting={isConnecting} />
      <CardHandle side="right" magnetY={magnet.magnetY} visible={magnet.showRight} isConnecting={isConnecting} />
      <div
        className={clsx(
          "rounded-[20px] border bg-[var(--canvas-surface-deep)] transition",
          selected
            ? "border-[var(--canvas-border-md)] shadow-[var(--canvas-shadow-glow-sm)]"
            : isConnecting
            ? "border-[var(--canvas-border)] hover:border-[var(--canvas-border-heavy)]"
            : "border-[var(--canvas-border)] hover:border-[var(--canvas-border-md)]",
        )}
      >
        {isLoadingPrompt ? (
          <div className="space-y-2.5 px-4 py-4 animate-pulse" style={{ height: 240 }}>
            <div className="h-2.5 w-full rounded-full bg-[var(--canvas-hover-xl)]" />
            <div className="h-2.5 w-[85%] rounded-full bg-[var(--canvas-hover-lg)]" />
            <div className="h-2.5 w-[70%] rounded-full bg-[var(--canvas-hover-lg)]" />
            <div className="h-2.5 w-[90%] rounded-full bg-[var(--canvas-hover)]" />
            <div className="h-2.5 w-[60%] rounded-full bg-[var(--canvas-hover)]" />
          </div>
        ) : (
        <textarea
          ref={textareaRef}
          value={localContent}
          onChange={(e) => {
            setLocalContent(e.target.value);
            if (!composingRef.current) patchRuntimeData(id, { content: e.target.value });
          }}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            patchRuntimeData(id, { content: (e.target as HTMLTextAreaElement).value });
          }}
          placeholder="开启你的创作..."
          className="nodrag nowheel !select-text w-full bg-transparent px-4 py-4 text-sm text-[var(--canvas-text)] outline-none placeholder:text-[var(--canvas-text-30)]"
          style={{ height: 240, minHeight: 120, maxHeight: 800, resize: "vertical", overflowY: "auto" }}
        />
        )}
      </div>
      </div>{/* end inner relative */}
      {selected && (
        <NodeControlsPanel nodeWidth={240}>
          {showSmartCreate ? (
            /* ── Smart Create form — same visual style as AI transform panel ── */
            <>
              <textarea
                value={scIdeaText}
                onChange={(e) => setScIdeaText(e.target.value)}
                placeholder="输入你的观点或想法…"
                className="nodrag !select-text min-h-[72px] w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--canvas-text)] outline-none placeholder:text-[var(--canvas-text-30)] nopan selection:bg-blue-500/50"
              />
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={scWordCount}
                  onChange={(e) => setScWordCount(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="nodrag !select-text w-14 shrink-0 bg-transparent text-sm text-[var(--canvas-text-50)] outline-none nopan"
                  title="目标字数"
                />
                <span className="shrink-0 text-[11px] text-[var(--canvas-text-30)]">字</span>
                <div className="flex-1 min-w-0">
                  <select
                    value={scSelectedStyleId ?? ""}
                    onChange={(e) => { setScSelectedStyleId(e.target.value || null); setScSelectedStyleJson(null); }}
                    disabled={scStyleLoading}
                    onClick={(e) => e.stopPropagation()}
                    className="nodrag w-full appearance-none bg-transparent text-sm text-[var(--canvas-text-50)] outline-none disabled:opacity-50 truncate"
                  >
                    <option value="">{scStyleLoading ? "加载中…" : "默认风格"}</option>
                    {scStyleOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{s.channel ? ` · ${s.channel}` : ""}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={scCreating || !scIdeaText.trim()}
                  onClick={(e) => { e.stopPropagation(); void handleSmartCreate(); }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] transition hover:bg-[var(--tenant-primary-hover)] active:scale-95 disabled:opacity-40"
                >
                  {scCreating
                    ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--tenant-primary-foreground)]/20 border-t-[var(--tenant-primary-foreground)]" />
                    : <ArrowUp className="h-4 w-4" />}
                </button>
              </div>
            </>
          ) : (
            /* ── AI transform form ── */
            <>
              {/* Upstream context hint */}
              {upstream.firstImageUrl && (
                <div className="mb-2 flex items-center gap-1.5 text-[10px] text-[var(--canvas-text-30)]">
                  <ImageIcon className="h-3 w-3 shrink-0" />
                  <span className="shrink-0">上游图片</span>
                  {upstream.effectivePrompt && (
                    <span className="truncate">· {upstream.effectivePrompt.slice(0, 40)}{upstream.effectivePrompt.length > 40 ? "…" : ""}</span>
                  )}
                </div>
              )}
              {!upstream.firstImageUrl && upstream.effectivePrompt && (
                <p className="mb-2 truncate text-[10px] text-[var(--canvas-text-30)]">
                  ↑ {upstream.effectivePrompt.slice(0, 70)}{upstream.effectivePrompt.length > 70 ? "…" : ""}
                </p>
              )}
              <textarea
                ref={instructionRef}
                value={localInstruction}
                onChange={(e) => {
                  setLocalInstruction(e.target.value);
                  patchRuntimeData(id, { instruction: e.target.value });
                }}
                placeholder={hasUpstream ? "输入指令，如：翻译成英文、提取关键词、改写成广告文案..." : "输入生成指令..."}
                className="nodrag !select-text min-h-[72px] w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--canvas-text)] outline-none placeholder:text-[var(--canvas-text-30)] nopan selection:bg-blue-500/50"
              />
              <div className="mt-2 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--canvas-text-30)]" />
                <div className="flex-1">
                  <CanvasSelect
                    value={transformModel}
                    options={[
                      { value: "gemini-3.1-flash-lite-preview", label: "Gemini Flash Lite" },
                      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
                    ]}
                    onChange={(v) => patchRuntimeData(id, { transformModel: v })}
                  />
                </div>
                <button
                  type="button"
                  disabled={isRunning || !localInstruction.trim()}
                  onClick={(e) => { e.stopPropagation(); void runTextNode(id); }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] transition hover:bg-[var(--tenant-primary-hover)] active:scale-95 disabled:opacity-40"
                >
                  {isRunning
                    ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--tenant-primary-foreground)]/20 border-t-[var(--tenant-primary-foreground)]" />
                    : <ArrowUp className="h-4 w-4" />}
                </button>
              </div>
            </>
          )}
        </NodeControlsPanel>
      )}
    </div>
  );
}

const IMAGE_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16"];
const VIDEO_DURATIONS = ["5", "8", "10", "15"];
const MEDIA_NODE_WIDTH = 380;
const MEDIA_NODE_AREA = MEDIA_NODE_WIDTH * Math.round(MEDIA_NODE_WIDTH * 9 / 16); // ~81,320, reference area at 16:9
const MEDIA_CONTROLS_WIDTH = MEDIA_NODE_WIDTH * 2; // 760, independent of node width
const MEDIA_CONTROLS_OFFSET = -((MEDIA_CONTROLS_WIDTH - MEDIA_NODE_WIDTH) / 2); // centers panel under node

/** Read pixel dimensions from a local File object without uploading it. */
function getMediaDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith("image/")) {
      const img = new window.Image();
      img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0 }); };
      img.src = url;
    } else {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => { resolve({ width: video.videoWidth, height: video.videoHeight }); URL.revokeObjectURL(url); };
      video.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0 }); };
      video.src = url;
    }
  });
}

/** Find the IMAGE_RATIOS entry whose aspect ratio is closest to width/height. */
function findClosestRatio(width: number, height: number): string {
  if (!width || !height) return "16:9";
  const actual = width / height;
  let closest = "16:9";
  let minDiff = Infinity;
  for (const r of IMAGE_RATIOS) {
    const parts = r.split(":");
    const rw = Number(parts[0]);
    const rh = Number(parts[1]);
    if (!rw || !rh) continue;
    const diff = Math.abs(Math.log(actual / (rw / rh)));
    if (diff < minDiff) { minDiff = diff; closest = r; }
  }
  return closest;
}


function parseRatio(ratio: string): [number, number] {
  const parts = ratio.split(":");
  const w = parseInt(parts[0] ?? "16", 10);
  const h = parseInt(parts[1] ?? "9", 10);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return [16, 9];
  return [w, h];
}

function GeneratingOverlay({ label }: { label?: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[20px]">
      {/* dark base */}
      <div className="absolute inset-0 bg-black/75" />
      {/* pulsing glow blob */}
      <div
        className="processing-card-glow absolute inset-0"
        style={{ background: "radial-gradient(ellipse 80% 80% at 50% 50%, rgba(255,255,255,0.32) 0%, transparent 70%)" }}
      />
      {/* sweep beam */}
      <div
        className="processing-card-beam absolute inset-y-0 w-[40%]"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.38) 50%, transparent 100%)" }}
      />
      {/* status label */}
      {label && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded-full bg-[var(--canvas-surface-deep)] px-3 py-1 text-[11px] text-[var(--canvas-text)] backdrop-blur-sm">{label}</span>
        </div>
      )}
    </div>
  );
}

// ── RatioIcon ─────────────────────────────────────────────────────────────────
function RatioIcon({ ratio }: { ratio: string }) {
  const [rw, rh] = parseRatio(ratio);
  const aspect = rw / rh;
  const MAX = 13;
  const w = aspect >= 1 ? MAX : Math.round(MAX * aspect);
  const h = aspect >= 1 ? Math.round(MAX / aspect) : MAX;
  return (
    <span
      className="inline-flex flex-shrink-0 items-center justify-center rounded-[2px] border border-[var(--canvas-border-heavy)]"
      style={{ width: w, height: h }}
    />
  );
}

// ── CompositionTextarea ───────────────────────────────────────────────────────
// Buffers value locally during IME composition to prevent re-renders from
// interrupting Chinese/Japanese/Korean input methods.
function CompositionTextarea({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  const composing = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!composing.current) setLocal(value);
  }, [value]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (document.activeElement === el) e.stopPropagation();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  return (
    <textarea
      ref={textareaRef}
      value={local}
      className={`${className ?? ""} nowheel select-text`}
      placeholder={placeholder}
      onChange={(e) => {
        setLocal(e.target.value);
        if (!composing.current) onChange(e.target.value);
      }}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={(e) => {
        composing.current = false;
        onChange((e.target as HTMLTextAreaElement).value);
      }}
    />
  );
}

// ── CanvasSelect ──────────────────────────────────────────────────────────────
function CanvasSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string; icon?: React.ReactNode }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const isRatioSelect = options.length === 5 && options.every(o => o.label?.includes(":"));
  const isQualitySelect = options.length === 2 && options.every(o => ["standard", "4k"].includes(o.value));

  return (
    <div className="relative">
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
        />
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--canvas-text-50)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text-80)]"
      >
        {current?.label ?? value}
        <ChevronDown className="h-3 w-3 opacity-40" />
      </button>
      {open && isRatioSelect && (
        <div
          className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-xl bg-[var(--canvas-menu)] p-4 shadow-md"
          style={{ width: "300px" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-5 gap-3">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false); }}
                className={clsx(
                  "flex flex-col items-center justify-center rounded-lg p-3 transition",
                  opt.value === value ? "bg-[var(--canvas-hover-xl)] text-[var(--canvas-text)]" : "bg-[var(--canvas-hover-sm)] text-[var(--canvas-text-50)] hover:bg-[var(--canvas-hover)]"
                )}
              >
                {opt.icon}
                <span className="text-xs mt-1.5">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {open && isQualitySelect && (
        <div
          className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-xl bg-[var(--canvas-menu)] p-4 shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex gap-4">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false); }}
                className={clsx(
                  "flex items-center justify-center rounded-lg px-4 py-2 transition",
                  opt.value === value ? "bg-[var(--canvas-hover-xl)] text-[var(--canvas-text)]" : "bg-[var(--canvas-hover-sm)] text-[var(--canvas-text-50)] hover:bg-[var(--canvas-hover)]"
                )}
              >
                <span className="text-sm">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {open && !isRatioSelect && !isQualitySelect && (
        <div
          className="absolute top-full left-0 z-50 mt-1 min-w-[80px] overflow-hidden rounded-xl bg-[var(--canvas-menu)] py-1 shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false); }}
              className={clsx(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-[var(--canvas-hover)]",
                opt.value === value ? "text-[var(--canvas-text)]" : "text-[var(--canvas-text-50)]",
              )}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── NodeControlsPanel ─────────────────────────────────────────────────────────
type NodeControlsPanelProps = {
  width?: number;
  nodeWidth: number;
  children: React.ReactNode;
};

function NodeControlsPanel({ width = MEDIA_CONTROLS_WIDTH, nodeWidth, children }: NodeControlsPanelProps) {
  return (
    <div
      style={{ width, marginLeft: -((width - nodeWidth) / 2) }}
      className="nodrag mt-2 flex flex-col rounded-[20px] bg-[var(--canvas-surface)] px-4 pb-3 pt-3"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

// ── ModelPicker ───────────────────────────────────────────────────────────────
function ModelPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: ModelOption[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value) ?? options[0];
  return (
    <div className="relative min-w-0 flex-1">
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
        />
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs text-[var(--canvas-text-50)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text-80)]"
      >
        <Layers className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-40" />
      </button>
      {open && (
        <div
          className="absolute bottom-full left-0 z-[200] mb-1 w-64 overflow-hidden rounded-2xl bg-[var(--canvas-menu)] py-1.5 shadow-md ring-1 ring-[var(--canvas-border)]"
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(opt.id); setOpen(false); }}
              className={clsx(
                "flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--canvas-hover)]",
                opt.id === value && "bg-[var(--canvas-hover-sm)]",
              )}
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--canvas-hover)] text-[var(--canvas-text-40)]">
                <Layers className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {opt.isNew && (
                    <span className="rounded-full bg-[#3b82f6] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--canvas-text)]">新</span>
                  )}
                  <span className="text-sm font-medium text-[var(--canvas-text-90)]">{opt.label}</span>
                </div>
                {opt.description && (
                  <p className="mt-0.5 truncate text-[11px] text-[var(--canvas-text-30)]">{opt.description}</p>
                )}
              </div>
              {opt.estimatedTime && (
                <span className="flex-shrink-0 text-xs text-[var(--canvas-text-30)]">{opt.estimatedTime}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MediaHandle({ side }: { side: "left" | "right" }) {
  const { isConnecting } = useCanvasNodeContext();
  const magnet = useContext(CardMagnetContext);
  const isTarget = side === "left";
  const visible = isTarget ? magnet.showLeft || isConnecting : magnet.showRight;
  return (
    <CardHandle
      side={side}
      magnetY={magnet.magnetY}
      visible={visible}
      isConnecting={isConnecting}
    />
  );
}

function ImageNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const referenceUploadRef = useRef<HTMLInputElement>(null);
  const directUploadRef = useRef<HTMLInputElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const { patchRuntimeData, models, runImageNode, reverseImagePrompt, uploadResource, isConnecting, polishPrompt, focusedNodeId } = useCanvasNodeContext();

  const upstream = data.upstreamInputs ?? EMPTY_UPSTREAM;
  const [isPolishing, setIsPolishing] = useState(false);
  const [reverseMode, setReverseMode] = useState<"no-text" | "with-text">("no-text");
  const [showReverseMenu, setShowReverseMenu] = useState(false);
  const magnet = useCardMagnet(innerRef);
  const title = resolveTitle(data);
  const ratio = (typeof data.runtime.data.ratio === "string" && data.runtime.data.ratio) || IMAGE_RATIOS[1];
  const [rw, rh] = parseRatio(ratio);
  const model = (typeof data.runtime.data.model === "string" && data.runtime.data.model) || models.defaultModels.image.id;
  const quality = (typeof data.runtime.data.quality === "string" && data.runtime.data.quality) || "standard";
  const prompt = typeof data.runtime.data.prompt === "string" ? data.runtime.data.prompt : "";
  const outputs = Array.isArray((data.runtime.data as Record<string, unknown>).outputs)
    ? ((data.runtime.data as Record<string, unknown>).outputs as Array<{ id?: string; url?: string }>)
    : [];
  const referenceImage = typeof (data.runtime.data as Record<string, unknown>).referenceImage === "string"
    ? ((data.runtime.data as Record<string, unknown>).referenceImage as string) : "";
  const referenceImages = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    const push = (value?: string) => {
      if (typeof value === "string" && value.trim().length > 0 && !seen.has(value)) {
        seen.add(value);
        list.push(value);
      }
    };
    push(referenceImage);
    (upstream.imageUrls || []).forEach((url) => push(url));
    return list;
  }, [referenceImage, upstream.imageUrls]);
  const referenceGallery = useMemo(() => {
    const upstreamList = upstream.imageUrls || [];
    return referenceImages.map((url) => ({
      url,
      isManual: Boolean(referenceImage) && url === referenceImage,
      upstreamIndex: upstreamList.findIndex((item) => item === url),
    }));
  }, [referenceImages, referenceImage, upstream.imageUrls]);
  const referenceListItems = useMemo(
    () => referenceGallery.filter((item) => !item.isManual),
    [referenceGallery],
  );
  const referenceListCount = referenceListItems.length;
  const referenceCount = referenceImages.length;
  const hasManualReference = Boolean(referenceImage);
  const hasUpstreamReferences = (upstream.imageUrls || []).length > 0;
  const referenceTileLabel = hasManualReference
    ? "当前手动参考 · 点击更换"
    : hasUpstreamReferences
      ? "上游图片已作为参考图（点击覆盖）"
      : "添加参考图";
  const resourceTileImageUrl = hasManualReference ? referenceImage : "";
  const lastRunError = typeof (data.runtime.data as Record<string, unknown>).lastRunError === "string"
    ? ((data.runtime.data as Record<string, unknown>).lastRunError as string) : "";
  const isRunning = data.status === "running";
  const isReversingPrompt = (data.runtime.data as Record<string, unknown>).isReversingPrompt === true;
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const currentImageUrl = outputs[0]?.url ?? "";
  const [intrinsicRatio, setIntrinsicRatio] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  useEffect(() => { if (!currentImageUrl) setIntrinsicRatio(null); }, [currentImageUrl]);
  const effectiveRatio = intrinsicRatio ?? (rw / rh);
  const containerWidth = Math.round(Math.sqrt(MEDIA_NODE_AREA * effectiveRatio));
  const containerHeight = Math.round(Math.sqrt(MEDIA_NODE_AREA / effectiveRatio));

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

  const handleDirectUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const resource = await uploadResource(file, { type: "image", name: file.name });
      patchRuntimeData(id, { outputs: [{ url: resource.url }] });
    } catch (error) {
      console.error("[canvas] direct image upload failed", error);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  return (
    <>
    <CardMagnetContext.Provider value={magnet}>
    <div style={{ width: containerWidth }} className="relative select-none">
      {props.selected && (
        <div className="absolute bottom-full left-1/2 z-10 -translate-x-1/2 -translate-y-2 flex flex-col items-center gap-1.5">
          {/* Existing action buttons — only when there's a generated image */}
          {currentImageUrl && (
          <div className="flex items-center rounded-full bg-[var(--canvas-surface)] shadow-[var(--canvas-shadow-sm)]">
          <div className="group/tip relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFullscreenUrl(currentImageUrl); }}
              className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">全屏查看</span>
          </div>
          <div className="h-4 w-px bg-[var(--canvas-hover)]" />
          <div className="group/scan relative">
            {/* Reverse-mode popup menu */}
            {showReverseMenu && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-2 flex flex-col overflow-hidden rounded-xl bg-[var(--canvas-tooltip)] shadow-[var(--canvas-shadow-md)] z-20 whitespace-nowrap">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowReverseMenu(false); void reverseImagePrompt?.(id, "no-text"); }}
                  className="px-4 py-2.5 text-left text-[13px] text-[var(--canvas-text-80)] hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] transition"
                >
                  无文字
                </button>
                <div className="h-px bg-[var(--canvas-hover)] mx-3" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowReverseMenu(false); void reverseImagePrompt?.(id, "with-text"); }}
                  className="px-4 py-2.5 text-left text-[13px] text-[var(--canvas-text-80)] hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] transition"
                >
                  有文字
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={isReversingPrompt || isRunning}
              onClick={(e) => { e.stopPropagation(); setShowReverseMenu((v) => !v); }}
              className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95 disabled:opacity-40"
            >
              {isReversingPrompt
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--canvas-border-md)] border-t-white/60" />
                : <Scan className="h-4 w-4" />}
            </button>
            {!showReverseMenu && (
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/scan:opacity-100">反推提示词</span>
            )}
          </div>
          <div className="h-4 w-px bg-[var(--canvas-hover)]" />
          <div className="group/tip relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerCanvasDownload(currentImageUrl, `canvas-image-${id.slice(-6)}`, "png");
              }}
              className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95"
            >
              <Download className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">下载图片</span>
          </div>
          <div className="h-4 w-px bg-[var(--canvas-hover)]" />
          <div className="group/tip relative">
            <button
              type="button"
              disabled={isUploading}
              onClick={(e) => { e.stopPropagation(); directUploadRef.current?.click(); }}
              className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95 disabled:opacity-40"
            >
              {isUploading
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--canvas-border-md)] border-t-white/60" />
                : <Upload className="h-4 w-4" />}
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">{currentImageUrl ? "替换图片" : "上传图片"}</span>
          </div>
          </div>
          )}
        </div>
      )}
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5 text-[var(--canvas-text-50)]" />
          <EditableNodeLabel title={title} nodeId={id} patchRuntimeData={patchRuntimeData} />
          {referenceCount > 1 && (
            <span className="rounded-full bg-[var(--canvas-hover)] px-1.5 py-0.5 text-[10px] text-[var(--canvas-text-40)]">
              {referenceCount} 张参考
            </span>
          )}
        </div>
      </div>
      {/* inner relative div: handles position relative to card area only */}
      <div className="relative">
      <MediaHandle side="left" />
      <MediaHandle side="right" />
      <div
        ref={innerRef}
        style={{ height: containerHeight }}
        className={clsx(
          "relative overflow-hidden rounded-[20px] bg-[var(--canvas-surface-alt)] border transition-[border,box-shadow]",
          props.selected
            ? "border-[var(--canvas-border-strong)] shadow-[var(--canvas-shadow-glow-sm)]"
            : isConnecting
            ? "border-[var(--canvas-border-md)] hover:border-[var(--canvas-border-accent)] hover:shadow-[var(--canvas-shadow-glow-md)]"
            : "border-[var(--canvas-border)] hover:border-[var(--canvas-border-md)]",
        )}
      >
        {outputs[0]?.url ? (
          <CanvasImage
            src={outputs[0].url}
            alt="Generated"
            className="h-full w-full"
            onLoad={({ naturalWidth, naturalHeight }) => {
              if (naturalWidth && naturalHeight) {
                setIntrinsicRatio(naturalWidth / naturalHeight);
              }
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-10 w-10 text-[var(--canvas-text-15)]" />
          </div>
        )}
        {(isRunning || isUploading) && <GeneratingOverlay label={isUploading ? "上传中..." : "生成中..."} />}
        {lastRunError && (
          <div className="absolute inset-x-0 bottom-0 bg-rose-900/80 px-3 py-1 text-[10px] text-rose-200">{lastRunError}</div>
        )}
      </div>
      </div>{/* end inner relative */}
      {props.selected && (
        <div
          style={{ width: MEDIA_CONTROLS_WIDTH, marginLeft: -((MEDIA_CONTROLS_WIDTH - containerWidth) / 2), height: 220 }}
          className="nodrag mt-2 flex flex-col rounded-[20px] bg-[var(--canvas-surface)] px-4 pb-3 pt-3"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mb-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pr-1">
              <ResourceTile
                imageUrl={resourceTileImageUrl || undefined}
                icon={<ImagePlus className="h-5 w-5" />}
                label={referenceTileLabel}
                onClick={(e) => { e.stopPropagation(); referenceUploadRef.current?.click(); }}
              />
              {referenceListItems.map((item, idx) => (
                <button
                  key={`${item.url}_${idx}`}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFullscreenUrl(item.url); }}
                  className="group relative h-[52px] w-[52px] flex-shrink-0 overflow-hidden rounded-[14px] border border-[var(--canvas-border-md)] bg-[var(--canvas-hover)] transition hover:border-[var(--canvas-border-strong)]"
                  title={item.upstreamIndex >= 0 ? `上游节点 · 第 ${item.upstreamIndex + 1} 张` : "参考图"}
                >
                  <CanvasImage src={item.url} alt="" className="h-full w-full object-cover" draggable={false} />
                  <span className="pointer-events-none absolute bottom-1 left-1 rounded-md bg-black/60 px-1 text-[9px] text-white/90">
                    {item.upstreamIndex >= 0 ? `上游${item.upstreamIndex + 1}` : `参考${idx + 1}`}
                  </span>
                  <span className="pointer-events-none absolute right-1 top-1 rounded-md bg-black/45 px-1 text-[9px] text-white/80 opacity-0 transition group-hover:opacity-100">放大</span>
                </button>
              ))}
            </div>
            {referenceListCount === 0 && (
              <p className="text-[11px] text-[var(--canvas-text-30)]">连接图片节点后会自动显示在此处</p>
            )}
          </div>
          {isPolishing ? (
            <div className="flex-1 space-y-2.5 py-1 animate-pulse">
              <div className="h-2.5 w-full rounded-full bg-[var(--canvas-hover-xl)]" />
              <div className="h-2.5 w-[62%] rounded-full bg-[var(--canvas-hover-lg)]" />
              <div className="h-2.5 w-[38%] rounded-full bg-[var(--canvas-hover)]" />
            </div>
          ) : (
            <>
              {!prompt && upstream.effectivePrompt && (
                <p className="mb-1 truncate text-[10px] text-[var(--canvas-text-30)]">
                  ↑ 上游文本：{upstream.effectivePrompt.slice(0, 60)}{upstream.effectivePrompt.length > 60 ? "…" : ""}
                </p>
              )}
              <CompositionTextarea
                value={prompt}
                onChange={(v) => patchRuntimeData(id, { prompt: v })}
                placeholder={upstream.effectivePrompt ? "留空则使用上游文本..." : "描述你想生成的图片..."}
                className="nodrag select-text flex-1 w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--canvas-text)] placeholder:text-[var(--canvas-text-30)] focus:outline-none nopan selection:bg-blue-500/50"
              />
            </>
          )}
          <div className="flex items-center gap-0.5">
            <ModelPicker
              value={model}
              options={models.imageModels}
              onChange={(v) => patchRuntimeData(id, { model: v })}
            />
            <span className="text-xs text-[var(--canvas-text-15)]">·</span>
            <div className="flex items-center gap-1 rounded-lg px-2 py-1">
              <RatioIcon ratio={ratio} />
              <CanvasSelect
                value={ratio}
                options={IMAGE_RATIOS.map((r) => ({ value: r, label: r, icon: <RatioIcon ratio={r} /> }))}
                onChange={(v) => patchRuntimeData(id, { ratio: v })}
              />
            </div>
            <span className="text-xs text-[var(--canvas-text-15)]">·</span>
            <CanvasSelect
              value={quality}
              options={[{ value: "standard", label: "标准" }, { value: "4k", label: "4K" }]}
              onChange={(v) => patchRuntimeData(id, { quality: v })}
            />
            <button type="button" disabled={isRunning}
              onClick={(e) => { e.stopPropagation(); void runImageNode(id); }}
              className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] shadow transition hover:bg-[var(--tenant-primary-hover)] disabled:opacity-40">
              {isRunning ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--tenant-primary-foreground)]/20 border-t-[var(--tenant-primary-foreground)]" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}
      <input ref={referenceUploadRef} type="file" accept="image/*" className="hidden" onChange={handleUploadReference} />
      <input ref={directUploadRef} type="file" accept="image/*" className="hidden" onChange={handleDirectUpload} />
    </div>
    </CardMagnetContext.Provider>
    {fullscreenUrl && typeof document !== "undefined" && createPortal(
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={() => setFullscreenUrl(null)}
      >
        <CanvasImage
          src={fullscreenUrl}
          alt="预览图片"
          className="max-h-[90vh] max-w-[90vw]"
          imageClassName="rounded-2xl object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="fixed right-6 top-6 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerCanvasDownload(fullscreenUrl, `canvas-image-${id.slice(-6)}`, "png");
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenUrl(null);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}

function VideoNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const firstFrameUploadRef = useRef<HTMLInputElement>(null);
  const lastFrameUploadRef = useRef<HTMLInputElement>(null);
  const directUploadRef = useRef<HTMLInputElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const { patchRuntimeData, models, runVideoNode, runStoryboardNode, resources, uploadResource, isConnecting, polishPrompt, focusedNodeId, addDownstreamNodes, openViralModal } = useCanvasNodeContext();
  const { setNodes: rfSetNodes, setEdges: rfSetEdges, getNode: rfGetNode } = useReactFlow();
  const upstream = data.upstreamInputs ?? EMPTY_UPSTREAM;
  const [isPolishing, setIsPolishing] = useState(false);
  const magnet = useCardMagnet(innerRef);
  const title = resolveTitle(data);
  const prompt = typeof data.runtime.data.prompt === "string" ? data.runtime.data.prompt : "";
  const model =
    (typeof data.runtime.data.model === "string" && data.runtime.data.model) ||
    models.defaultModels.video.id;
  const ratio =
    (typeof data.runtime.data.ratio === "string" && data.runtime.data.ratio) || IMAGE_RATIOS[1];
  const [rw, rh] = parseRatio(ratio);
  const videoModelParams = VIDEO_MODEL_PARAMS[model];
  const allowedDurations = videoModelParams?.durations?.length ? videoModelParams.durations : [];
  const defaultDuration = allowedDurations.length ? allowedDurations[0] : VIDEO_DURATIONS[2];
  const rawDuration = typeof data.runtime.data.duration === "string" ? data.runtime.data.duration : defaultDuration;
  const duration = allowedDurations.length ? (allowedDurations.includes(rawDuration) ? rawDuration : defaultDuration) : rawDuration;
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
  const [isUploading, setIsUploading] = useState(false);
  const [intrinsicRatio, setIntrinsicRatio] = useState<number | null>(null);
  useEffect(() => { if (!outputUrl) setIntrinsicRatio(null); }, [outputUrl]);
  const effectiveRatio = intrinsicRatio ?? (rw / rh);
  const containerWidth = Math.round(Math.sqrt(MEDIA_NODE_AREA * effectiveRatio));
  const containerHeight = Math.round(Math.sqrt(MEDIA_NODE_AREA / effectiveRatio));
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

  const handleDirectUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const resource = await uploadResource(file, { type: "video", name: file.name });
      patchRuntimeData(id, { outputUrl: resource.url });
    } catch (error) {
      console.error("[canvas] direct video upload failed", error);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  return (
    <>
    <CardMagnetContext.Provider value={magnet}>
    <div style={{ width: containerWidth }} className="relative select-none">
      {props.selected && (
        <div className="absolute bottom-full left-1/2 z-10 -translate-x-1/2 -translate-y-2 flex items-center rounded-full bg-[var(--canvas-surface)] shadow-[var(--canvas-shadow-sm)]">
          {outputUrl && (
            <>
              <div className="group/tip relative">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFullscreenUrl(outputUrl); }}
                  className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">全屏查看</span>
              </div>
              <div className="h-4 w-px bg-[var(--canvas-hover)]" />
              <div className="group/tip relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const srcNode = rfGetNode(id);
                    const srcX = srcNode?.position.x ?? 0;
                    const srcY = srcNode?.position.y ?? 0;
                    const srcW = (srcNode?.measured?.width as number | undefined) ?? MEDIA_NODE_WIDTH;
                    const gap = 160;
                    const sbId = `storyboard_${Math.random().toString(36).slice(2, 8)}`;
                    const tlId = `timelinevideo_${Math.random().toString(36).slice(2, 8)}`;
                    const sbX = srcX + srcW + gap;
                    const tlX = sbX + SB_NODE_WIDTH + gap;
                    rfSetNodes((prev) => [
                      ...prev,
                      { id: sbId, type: "storyboard", position: { x: sbX, y: srcY }, data: { runtime: { id: sbId, type: "storyboard", position: { x: sbX, y: srcY }, data: { videoUrl: outputUrl } }, summary: "", status: "idle" as const, expanded: false } },
                      { id: tlId, type: "timelinevideo", position: { x: tlX, y: srcY }, data: { runtime: { id: tlId, type: "timelinevideo", position: { x: tlX, y: srcY }, data: { videoUrl: "", title: "时间轴视频" } }, summary: "", status: "idle" as const, expanded: false } },
                    ]);
                    rfSetEdges((prev) => {
                      let acc = addEdge({ id: `e_${id}_${sbId}`, source: id, target: sbId, type: "smoothstep" }, prev);
                      acc = addEdge({ id: `e_${sbId}_${tlId}`, source: sbId, target: tlId, type: "smoothstep" }, acc);
                      return acc;
                    });
                    setTimeout(() => { void runStoryboardNode(sbId); }, 50);
                  }}
                  className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95"
                >
                  <Clapperboard className="h-4 w-4" />
                </button>
                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">拆解分镜</span>
              </div>
              <div className="h-4 w-px bg-[var(--canvas-hover)]" />
              <div className="group/tip relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerCanvasDownload(outputUrl, `canvas-video-${id.slice(-6)}`, "mp4");
                  }}
                  className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95"
                >
                  <Download className="h-4 w-4" />
                </button>
                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">下载视频</span>
              </div>
              <div className="h-4 w-px bg-[var(--canvas-hover)]" />
            </>
          )}
          <div className="group/tip relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); directUploadRef.current?.click(); }}
              className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95"
            >
              <Upload className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">{outputUrl ? "替换视频" : "上传视频"}</span>
          </div>
        </div>
      )}
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center">
          <Video className="h-3.5 w-3.5 text-[var(--canvas-text-50)]" />
          <EditableNodeLabel title={title} nodeId={id} patchRuntimeData={patchRuntimeData} />
        </div>
      </div>
      {/* inner relative div: handles position relative to card area only */}
      <div className="relative">
      <MediaHandle side="left" />
      <MediaHandle side="right" />
      <div
        ref={innerRef}
        style={{ height: containerHeight }}
        className={clsx(
          "relative overflow-hidden rounded-[20px] bg-[var(--canvas-surface-alt)] border transition-[border,box-shadow]",
          props.selected
            ? "border-[var(--canvas-border-strong)] shadow-[var(--canvas-shadow-glow-sm)]"
            : isConnecting
            ? "border-[var(--canvas-border-md)] hover:border-[var(--canvas-border-accent)] hover:shadow-[var(--canvas-shadow-glow-md)]"
            : "border-[var(--canvas-border)] hover:border-[var(--canvas-border-md)]",
        )}
      >
        {outputUrl ? (
          <video
            src={outputUrl}
            controls
            className="h-full w-full object-cover"
            preload="metadata"
            muted
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) {
                setIntrinsicRatio(v.videoWidth / v.videoHeight);
              }
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Play className="h-10 w-10 text-[var(--canvas-text-15)]" />
          </div>
        )}
        {(isRunning || isUploading) && <GeneratingOverlay label={isUploading ? "上传中..." : `生成中${taskStatus ? ` · ${taskStatus}` : "..."}`} />}
        {statusMessage && !isRunning && (
          <div className={clsx("absolute inset-x-0 bottom-0 px-3 py-1 text-[10px]", data.status === "error" ? "bg-rose-900/80 text-rose-200" : "bg-black/60 text-[var(--canvas-text-60)]")}>{statusMessage}</div>
        )}
      </div>
      </div>{/* end inner relative */}
      {props.selected && (
        <div
          style={{ width: MEDIA_CONTROLS_WIDTH, marginLeft: -((MEDIA_CONTROLS_WIDTH - containerWidth) / 2), height: 220 }}
          className="nodrag mt-2 flex flex-col rounded-[20px] bg-[var(--canvas-surface)] px-4 pb-3 pt-3"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center gap-2">
            <ResourceTile
              imageUrl={firstFrameImage || upstream.firstImageUrl || undefined}
              icon={<ImageIcon className="h-5 w-5" />}
              label={upstream.firstImageUrl && !firstFrameImage ? "上游图片将用作首帧（点击更换）" : "添加首帧"}
              onClick={(e) => { e.stopPropagation(); firstFrameUploadRef.current?.click(); }}
            />
            <ResourceTile
              imageUrl={lastFrameImage || undefined}
              icon={<ImageIcon className="h-5 w-5" />}
              label="添加尾帧"
              onClick={(e) => { e.stopPropagation(); lastFrameUploadRef.current?.click(); }}
            />
            <button type="button" disabled={isPolishing || !prompt.trim()}
              onClick={async (e) => {
                e.stopPropagation();
                setIsPolishing(true);
                try {
                  const polished = await polishPrompt(prompt);
                  patchRuntimeData(id, { prompt: polished });
                } catch {
                  // silently fail
                } finally {
                  setIsPolishing(false);
                }
              }}
              className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[var(--canvas-hover)] px-2.5 text-[var(--canvas-text-40)] transition hover:bg-[var(--canvas-hover-lg)] hover:text-[var(--canvas-text-60)] disabled:opacity-40"
              title="AI润色">
              {isPolishing ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--canvas-border-md)] border-t-white/60" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">AI润色</span>
            </button>
          </div>
          {isPolishing ? (
            <div className="flex-1 space-y-2.5 py-1 animate-pulse">
              <div className="h-2.5 w-full rounded-full bg-[var(--canvas-hover-xl)]" />
              <div className="h-2.5 w-[62%] rounded-full bg-[var(--canvas-hover-lg)]" />
              <div className="h-2.5 w-[38%] rounded-full bg-[var(--canvas-hover)]" />
            </div>
          ) : (
            <>
              {!prompt && upstream.effectivePrompt && (
                <p className="mb-1 truncate text-[10px] text-[var(--canvas-text-30)]">
                  ↑ 上游文本：{upstream.effectivePrompt.slice(0, 60)}{upstream.effectivePrompt.length > 60 ? "…" : ""}
                </p>
              )}
              <CompositionTextarea
                value={prompt}
                onChange={(v) => patchRuntimeData(id, { prompt: v })}
                placeholder={upstream.effectivePrompt ? "留空则使用上游文本..." : "描述你想生成的视频..."}
                className="nodrag select-text flex-1 w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--canvas-text)] placeholder:text-[var(--canvas-text-30)] focus:outline-none nopan selection:bg-blue-500/50"
              />
            </>
          )}
          <div className="flex items-center gap-0.5">
            <ModelPicker
              value={model}
              options={models.videoModels}
              onChange={(v) => patchRuntimeData(id, { model: v })}
            />
            <span className="text-xs text-[var(--canvas-text-15)]">·</span>
            <div className="flex items-center gap-1 rounded-lg px-2 py-1">
              <RatioIcon ratio={ratio} />
              <CanvasSelect
                value={ratio}
                options={IMAGE_RATIOS.map((r) => ({ value: r, label: r, icon: <RatioIcon ratio={r} /> }))}
                onChange={(v) => patchRuntimeData(id, { ratio: v })}
              />
            </div>
            <span className="text-xs text-[var(--canvas-text-15)]">·</span>
            {allowedDurations.length > 0 ? (
              allowedDurations.length === 1 ? (
                <span className="px-2 text-xs text-[var(--canvas-text-40)]">{allowedDurations[0]}s</span>
              ) : (
                <CanvasSelect
                  value={duration}
                  options={allowedDurations.map((d) => ({ value: d, label: `${d}s` }))}
                  onChange={(v) => patchRuntimeData(id, { duration: v })}
                />
              )
            ) : (
              <CanvasSelect
                value={duration}
                options={VIDEO_DURATIONS.map((d) => ({ value: d, label: `${d}s` }))}
                onChange={(v) => patchRuntimeData(id, { duration: v })}
              />
            )}
            <button type="button" disabled={isRunning}
              onClick={(e) => { e.stopPropagation(); void runVideoNode(id); }}
              className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] shadow transition hover:bg-[var(--tenant-primary-hover)] disabled:opacity-40">
              {isRunning ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--tenant-primary-foreground)]/20 border-t-[var(--tenant-primary-foreground)]" />
              ) : (
                <Play className="h-4 w-4 fill-black" />
              )}
            </button>
          </div>
        </div>
      )}
      <input ref={firstFrameUploadRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleReferenceUpload(event, "firstFrameImage")} />
      <input ref={lastFrameUploadRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleReferenceUpload(event, "lastFrameImage")} />
      <input ref={directUploadRef} type="file" accept="video/*" className="hidden" onChange={handleDirectUpload} />
    </div>
    </CardMagnetContext.Provider>
    {fullscreenUrl && typeof document !== "undefined" && createPortal(
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={() => setFullscreenUrl(null)}
      >
        <video
          src={fullscreenUrl}
          controls
          autoPlay
          className="max-h-[90vh] max-w-[90vw] rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="fixed right-6 top-6 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerCanvasDownload(fullscreenUrl, `canvas-video-${id.slice(-6)}`, "mp4");
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenUrl(null);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}

const REPLICATION_COUNTRIES = [
  { id: "us", label: "美国" }, { id: "uk", label: "英国" }, { id: "ca", label: "加拿大" },
  { id: "au", label: "澳大利亚" }, { id: "de", label: "德国" }, { id: "fr", label: "法国" },
  { id: "es", label: "西班牙" }, { id: "jp", label: "日本" }, { id: "kr", label: "韩国" },
  { id: "cn", label: "中国" }, { id: "br", label: "巴西" },
];
const REPLICATION_LANGUAGES = [
  { id: "en", label: "英语" }, { id: "zh", label: "中文" }, { id: "es", label: "西班牙语" },
  { id: "fr", label: "法语" }, { id: "de", label: "德语" }, { id: "ja", label: "日语" },
  { id: "ko", label: "韩语" }, { id: "pt", label: "葡萄牙语" },
];
// ─── Project Name Editor ─────────────────────────────────────────────────────
function ProjectNameEditor({
  projectId,
  name,
  onRename,
}: {
  projectId: string;
  name: string;
  onRename: (id: string, name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [localName, setLocalName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocalName(name); }, [name]);

  const save = async () => {
    const trimmed = localName.trim();
    setEditing(false);
    if (trimmed && trimmed !== name) {
      await onRename(projectId, trimmed).catch(() => setLocalName(name));
    } else {
      setLocalName(name);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={localName}
        onChange={(e) => setLocalName(e.target.value)}
        onBlur={() => { void save(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void save(); }
          if (e.key === "Escape") { setLocalName(name); setEditing(false); }
        }}
        className="nodrag rounded-full bg-[var(--canvas-surface-80)] px-3 py-1.5 text-sm font-medium text-[var(--canvas-text-80)] backdrop-blur outline-none border border-[var(--canvas-border-md)] min-w-[80px] max-w-[220px]"
        style={{ width: Math.max(80, Math.min(220, localName.length * 9 + 24)) }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="rounded-full bg-[var(--canvas-surface-80)] px-3 py-1.5 text-sm font-medium text-[var(--canvas-text-80)] backdrop-blur transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] max-w-[220px] truncate"
      title="点击编辑项目名称"
    >
      {localName || "未命名项目"}
    </button>
  );
}

const REPLICATION_DURATIONS = ["15", "30", "60"];

function ViralReplicationModal({
  sourceNodeId,
  referenceVideoUrl,
  screenX,
  screenY,
  preCreatedNodeIds,
  onClose,
}: {
  sourceNodeId: string;
  referenceVideoUrl: string;
  screenX: number;
  screenY: number;
  preCreatedNodeIds?: { textNodeId: string; videoNodeId: string };
  onClose: () => void;
}) {
  const { addDownstreamNodes, patchRuntimeData, setNodeStatus, uploadResource, getNode, getUpstreamInputs } = useCanvasNodeContext();
  const [products, setProducts] = useState<{ id: string; name: string; sellingPoints?: string; imageUrl?: string }[]>([]);
  const [productId, setProductId] = useState("");
  const [localRefUrl, setLocalRefUrl] = useState(referenceVideoUrl);
  const [country, setCountry] = useState("us");
  const [language, setLanguage] = useState("en");
  const [duration, setDuration] = useState("15");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const videoUploadRef = useRef<HTMLInputElement>(null);
  // Track active channels for cleanup on unmount
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  useEffect(() => {
    return () => {
      channelsRef.current.forEach((ch) => { void supabase.removeChannel(ch); });
      channelsRef.current = [];
    };
  }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      fetch("/api/products", { credentials: "include", headers })
        .then((r) => r.json())
        .then((body) => {
          const list = (body as { data?: { id: string; name: string; sellingPoints?: string; imageUrl?: string }[] }).data ?? [];
          setProducts(list);
          if (list.length > 0) setProductId(list[0].id);
        })
        .catch(() => {})
        .finally(() => setLoadingProducts(false));
    }).catch(() => setLoadingProducts(false));
  }, []);

  const handleSubmit = async () => {
    if (!productId || !localRefUrl.trim()) return;
    setLoading(true);
    setNodeStatus(sourceNodeId, "running");
    try {
      const product = products.find((p) => p.id === productId);

      const [REDACTED] = `你是一位精通视频逆向工程与商业叙事逻辑拆解的专家。你的核心能力是透过像素表象，提取视频的"爆款基因"，同时精准还原视频中的口播文案。

# Goal
输出一份标准 JSON 分析报告，包含两部分：
1. 视觉蓝图（blueprint 部分）：保留原视频运镜、节奏和情绪逻辑，作为"母版"供下游AI填入新产品
2. 口播文案（breakdown 部分）：提取视频中的口播/旁白内容，结构化为三段式

# Output Format
请严格输出 JSON，不要输出 Markdown，不要闲聊：
{
  "meta": {
    "art_style": "全局艺术风格",
    "render_quality": "渲染质量",
    "mood_atmosphere": "核心情绪氛围",
    "total_duration": "视频总时长"
  },
  "scene_breakdown": [
    {
      "id": 1,
      "time_range": "00:00 - 00:XX",
      "visual_specs": {
        "camera": "镜头信息",
        "subject_action": "主体动作",
        "lighting_environment": "环境细节",
        "auxiliary_elements": "辅助元素"
      },
      "abstract_logic": {
        "narrative_role": "叙事功能",
        "universal_instruction": "通用生成指令，包含[HERO_PRODUCT]变量"
      }
    }
  ],
  "breakdown": {
    "description": "视频整体背景描述，包含产品类别、目标受众、核心卖点概述",
    "intro": "钩子与开场白：视频前段的口播内容，原文还原或高度概括",
    "body": "核心价值与产品讲解：视频中段的口播内容，包含卖点、使用场景、用户痛点",
    "conclusion": "行动号召与结尾：视频结尾的口播内容，包含促销信息、CTA指令"
  }
}`;

      const userPrompt = `请对这个视频进行拆解分析：${localRefUrl}`;

      const { data: { session } } = await supabase.auth.getSession();
      const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) authHeaders.Authorization = `Bearer ${session.access_token}`;

      const llmResp = await fetch("/api/canvas/text-transform", {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify({
          model: "gemini-3.1-flash-lite-preview",
          [REDACTED]: [REDACTED],
          userPrompt,
        }),
      });
      if (!llmResp.ok) throw new Error("视频拆解失败");
      const llmResult = await llmResp.json() as { data?: string };
      const blueprint = llmResult.data ? JSON.parse(llmResult.data) : {};

      let newIds: string[];
      if (preCreatedNodeIds) {
        newIds = [preCreatedNodeIds.textNodeId, preCreatedNodeIds.videoNodeId];
      } else {
        const nodeDefs: { type: string; data: Record<string, unknown> }[] = [];
        for (let i = 0; i < quantity; i++) {
          nodeDefs.push({ type: "text", data: { content: JSON.stringify(blueprint, null, 2), label: `拆解结果 ${i + 1}` } });
          nodeDefs.push({ type: "text", data: { content: `复刻 ${i + 1} — 等待提示词回传...`, label: `提示词 ${i + 1}` } });
          nodeDefs.push({ type: "video", data: { label: `复刻视频 ${i + 1}`, country, blueprint, sellingPointsJson: product?.sellingPoints, productImageUrl: product?.imageUrl } });
        }
        newIds = addDownstreamNodes(sourceNodeId, nodeDefs);
        newIds.forEach((nid) => setNodeStatus(nid, "running"));
      }
      const pairIndices: number[] = preCreatedNodeIds ? [0] : Array.from({ length: quantity }, (_, i) => i * 3);

      const canvasNodePairs = pairIndices.map((pi, i) => ({
        textNodeId: newIds[pi + 1],
        videoNodeId: newIds[pi + 2],
        index: i,
      }));

      const { data: { session: sessionData } } = await supabase.auth.getSession();
      if (sessionData?.access_token) authHeaders.Authorization = `Bearer ${sessionData.access_token}`;

      const res = await fetch("/api/canvas/replication", {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify({
          referenceVideoUrl: localRefUrl.trim(),
          productId,
          targetCountry: country,
          targetLanguage: language,
          duration,
          quantity,
          canvasNodePairs,
        }),
      });
      const body = await res.json() as { replications?: { id: string; textNodeId?: string; videoNodeId?: string }[] };
      if (!res.ok || !body.replications) throw new Error("触发复刻失败");

      body.replications.forEach(({ id: repId, textNodeId, videoNodeId }) => {
        if (!textNodeId || !videoNodeId) return;
        const channel = supabase
          .channel(`canvas_rep_${repId}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "replications", filter: `id=eq.${repId}` },
            (payload) => {
              const row = payload.new as Record<string, unknown>;
              const result = (() => {
                try { return JSON.parse(row.result as string) as Record<string, unknown>; }
                catch { return {}; }
              })();
              const prompt = (result.videoPrompt || result.promptResult || result.prompt || result.script) as string | undefined;
              if (prompt && typeof prompt === "string") {
                patchRuntimeData(textNodeId, { content: prompt });
              }
              const videoUrl = (result.videoUrl || result.video_url) as string | undefined;
              if (videoUrl && typeof videoUrl === "string") {
                patchRuntimeData(videoNodeId, { outputUrl: videoUrl });
              }
              if (row.status === "completed") {
                setNodeStatus(textNodeId, "idle");
                setNodeStatus(videoNodeId, "idle");
                setNodeStatus(sourceNodeId, "idle");
                supabase.removeChannel(channel);
                channelsRef.current = channelsRef.current.filter((c) => c !== channel);
              } else if (row.status === "failed") {
                setNodeStatus(textNodeId, "error");
                setNodeStatus(videoNodeId, "error");
                setNodeStatus(sourceNodeId, "idle");
                patchRuntimeData(textNodeId, { content: "复刻失败，请重试" });
                supabase.removeChannel(channel);
                channelsRef.current = channelsRef.current.filter((c) => c !== channel);
              }
            },
          )
          .subscribe();
        channelsRef.current.push(channel);
      });

      onClose();
    } catch (err) {
      console.error("[canvas] viral replication failed", err);
      toast.error((err as Error).message || "复刻失败");
      setNodeStatus(sourceNodeId, "idle");
    } finally {
      setLoading(false);
    }
  };

  const handleVideoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("video/")) return;
    setUploading(true);
    try {
      const resource = await uploadResource(file, { type: "video", name: file.name });
      setLocalRefUrl(resource.url);
    } catch {
      // ignore
    } finally {
      setUploading(false);
    }
  };

  if (typeof document === "undefined") return null;
  const panelLeft = Math.min(Math.max(screenX - 160, 8), window.innerWidth - 336);
  const panelTop = Math.min(Math.max(screenY - 8, 8), window.innerHeight - 480);
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        style={{ left: panelLeft, top: panelTop }}
        className="fixed z-[9999] w-[320px] overflow-hidden rounded-[20px] bg-[var(--canvas-surface-deep)] shadow-[var(--canvas-shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3">
          <Zap className="h-3.5 w-3.5 text-[var(--canvas-text-50)]" />
          <span className="text-sm font-medium text-[var(--canvas-text)]">一键复刻</span>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--canvas-text-30)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)]">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="h-px bg-[var(--canvas-hover)]" />

        {/* Form */}
        <div className="space-y-3 p-4">
          {/* Reference Video */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--canvas-text-40)]">参考视频</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={localRefUrl}
                onChange={(e) => setLocalRefUrl(e.target.value)}
                placeholder="粘贴参考视频链接..."
                className="flex-1 rounded-xl border border-[var(--canvas-border)] bg-[var(--canvas-hover-sm)] px-3 py-2 text-sm text-[var(--canvas-text)] placeholder:text-[var(--canvas-text-30)] focus:border-[var(--canvas-border-strong)] focus:outline-none min-w-0"
              />
              <button
                type="button"
                onClick={() => videoUploadRef.current?.click()}
                disabled={uploading}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--canvas-border)] bg-[var(--canvas-hover-sm)] text-[var(--canvas-text-50)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] disabled:opacity-40"
                title="上传视频"
              >
                {uploading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--canvas-border-md)] border-t-white/60" /> : <Upload className="h-4 w-4" />}
              </button>
              <input ref={videoUploadRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
            </div>
          </div>
          {/* Product */}
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--canvas-text-40)]">选择产品</label>
            {loadingProducts ? (
              <div className="flex h-9 items-center rounded-xl bg-[var(--canvas-hover-sm)] px-3 text-xs text-[var(--canvas-text-30)]">加载中...</div>
            ) : products.length === 0 ? (
              <div className="flex h-9 items-center rounded-xl bg-[var(--canvas-hover-sm)] px-3 text-xs text-[var(--canvas-text-30)]">暂无产品，请先在产品库添加</div>
            ) : (
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded-xl border border-[var(--canvas-border)] bg-[var(--canvas-hover-sm)] px-3 py-2 text-sm text-[var(--canvas-text)] focus:border-[var(--canvas-border-strong)] focus:outline-none"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[var(--canvas-surface-deep)]">{p.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Country + Language */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--canvas-text-40)]">目标国家</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full rounded-xl border border-[var(--canvas-border)] bg-[var(--canvas-hover-sm)] px-3 py-2 text-sm text-[var(--canvas-text)] focus:border-[var(--canvas-border-strong)] focus:outline-none">
                {REPLICATION_COUNTRIES.map((c) => <option key={c.id} value={c.id} className="bg-[var(--canvas-surface-deep)]">{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--canvas-text-40)]">目标语言</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full rounded-xl border border-[var(--canvas-border)] bg-[var(--canvas-hover-sm)] px-3 py-2 text-sm text-[var(--canvas-text)] focus:border-[var(--canvas-border-strong)] focus:outline-none">
                {REPLICATION_LANGUAGES.map((l) => <option key={l.id} value={l.id} className="bg-[var(--canvas-surface-deep)]">{l.label}</option>)}
              </select>
            </div>
          </div>

          {/* Duration + Quantity */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--canvas-text-40)]">视频时长</label>
              <select value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full rounded-xl border border-[var(--canvas-border)] bg-[var(--canvas-hover-sm)] px-3 py-2 text-sm text-[var(--canvas-text)] focus:border-[var(--canvas-border-strong)] focus:outline-none">
                {REPLICATION_DURATIONS.map((d) => <option key={d} value={d} className="bg-[var(--canvas-surface-deep)]">{d}s</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--canvas-text-40)]">复刻数量 · {quantity}</label>
              <input
                type="range" min={1} max={10} value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10))}
                className="mt-2 w-full accent-[#ffc94a]"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-[var(--canvas-border)] px-4 py-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[var(--canvas-hover)] py-2 text-sm text-[var(--canvas-text-50)] transition hover:bg-[var(--canvas-hover)]">
            取消
          </button>
          <button
            type="button"
            disabled={loading || !productId || loadingProducts || !localRefUrl.trim()}
            onClick={() => { void handleSubmit(); }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#ffc94a] py-2 text-sm font-semibold text-black transition hover:bg-[#ffd666] disabled:opacity-40"
          >
            {loading ? (
              <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--tenant-primary-foreground)]/20 border-t-[var(--tenant-primary-foreground)]" />触发中...</>
            ) : (
              <><Zap className="h-3.5 w-3.5" />开始复刻</>
            )}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Resource Tile ────────────────────────────────────────────────────────────
// Rounded-square button for resource inputs; shows thumbnail when filled.
function ResourceTile({
  imageUrl,
  audioSet = false,
  icon,
  label,
  onClick,
}: {
  imageUrl?: string;
  audioSet?: boolean;
  icon: React.ReactNode;
  label?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const filled = !!imageUrl || audioSet;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={clsx(
        "relative h-[52px] w-[52px] flex-shrink-0 overflow-hidden rounded-[14px] transition active:scale-95",
        filled
          ? "bg-[var(--canvas-hover-lg)] text-[var(--canvas-text-80)] ring-1 ring-[var(--canvas-border-md)] hover:brightness-110"
          : "bg-[var(--canvas-hover)] text-[var(--canvas-text-35)] hover:bg-[var(--canvas-hover-lg)] hover:text-[var(--canvas-text-60)]",
      )}
    >
      {imageUrl ? (
        <CanvasImage src={imageUrl} alt="" className="h-full w-full" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {icon}
          {audioSet && <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-[#60a5fa]" />}
        </div>
      )}
    </button>
  );
}

function AudioWaveformPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [bars, setBars] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!src) return;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setBars([]);
    let cancelled = false;
    const ctx = new AudioContext();
    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        if (cancelled) return;
        const channelData = decoded.getChannelData(0);
        const numBars = 80;
        const blockSize = Math.floor(channelData.length / numBars);
        const result: number[] = [];
        for (let i = 0; i < numBars; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) sum += Math.abs(channelData[i * blockSize + j] ?? 0);
          result.push(sum / blockSize);
        }
        const max = Math.max(...result, 0.001);
        setBars(result.map((v) => v / max));
        void ctx.close();
      })
      .catch(() => { void ctx.close(); });
    return () => { cancelled = true; void ctx.close(); };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setIsPlaying(false);
    const onLoaded = () => setDuration(audio.duration);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onLoaded);
    return () => { audio.removeEventListener("ended", onEnded); audio.removeEventListener("loadedmetadata", onLoaded); };
  }, [src]);

  const tick = useCallback(function tickFrame() {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
    rafRef.current = requestAnimationFrame(tickFrame);
  }, []);

  useEffect(() => {
    if (isPlaying) { rafRef.current = requestAnimationFrame(tick); }
    else { cancelAnimationFrame(rafRef.current); }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, tick]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); setIsPlaying(false); }
    else { void audio.play(); setIsPlaying(true); }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = Math.max(0, Math.min(duration, ratio * duration));
    setCurrentTime(audio.currentTime);
  };

  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="flex h-full w-full flex-col">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      {/* Waveform area */}
      <div
        className="relative flex flex-1 cursor-pointer items-center gap-[2px] overflow-hidden px-3 py-4"
        onClick={handleSeek}
      >
        {bars.length > 0 ? (
          <>
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-full"
                style={{
                  height: `${Math.max(4, h * 100)}%`,
                  backgroundColor: i / bars.length <= progress ? "#60a5fa" : "rgba(255,255,255,0.18)",
                  transition: "background-color 0.05s",
                }}
              />
            ))}
            {/* Playhead */}
            <div
              className="pointer-events-none absolute top-2 bottom-2 w-[2px] rounded-full bg-white/60"
              style={{ left: `calc(12px + ${progress} * (100% - 24px))` }}
            />
          </>
        ) : (
          <div className="flex w-full items-center justify-center">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--canvas-border-md)] border-t-white/50" />
          </div>
        )}
      </div>
      {/* Controls */}
      <div className="flex items-center gap-2 px-3 pb-3">
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-[var(--canvas-text-80)] transition hover:bg-black/60 active:scale-95"
        >
          {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 translate-x-[1px]" />}
        </button>
        <span className="text-[11px] tabular-nums text-[var(--canvas-text-50)]">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
      </div>
    </div>
  );
}

function AudioNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const innerRef = useRef<HTMLDivElement>(null);
  const voiceUploadRef = useRef<HTMLInputElement>(null);
  const emotionUploadRef = useRef<HTMLInputElement>(null);
  const directUploadRef = useRef<HTMLInputElement>(null);
  const magnet = useCardMagnet(innerRef);
  const title = resolveTitle(data);
  const upstream = data.upstreamInputs ?? EMPTY_UPSTREAM;
  const { patchRuntimeData, models, runAudioNode, resources, uploadResource, isConnecting, polishPrompt, focusedNodeId } = useCanvasNodeContext();
  const [isPolishing, setIsPolishing] = useState(false);
  const script = typeof data.runtime.data.script === "string" ? data.runtime.data.script : "";
  const voiceRef = typeof data.runtime.data.voiceReference === "string" ? data.runtime.data.voiceReference : "";
  const emotionRef = typeof data.runtime.data.emotionReference === "string" ? data.runtime.data.emotionReference : "";
  const model = (typeof data.runtime.data.model === "string" && data.runtime.data.model) || models.defaultModels.audio?.id || models.audioModels[0]?.id || "";
  const isSunoMusic = model === "suno_music";
  const isSunoLyrics = model === "suno_lyrics";
  const isSuno = isSunoMusic || isSunoLyrics;
  const isNextide = model === "nextide";
  const audioUrl =
    typeof (data.runtime.data as Record<string, unknown>).audioUrl === "string"
      ? ((data.runtime.data as Record<string, unknown>).audioUrl as string)
      : "";
  const lastRunError =
    typeof (data.runtime.data as Record<string, unknown>).lastRunError === "string"
      ? ((data.runtime.data as Record<string, unknown>).lastRunError as string)
      : "";
  const isRunning = data.status === "running";
  const [isUploading, setIsUploading] = useState(false);
  const audioResources = resources.filter((item) => item.type === "audio" && (!item.variant || item.variant === "voice"));

  const handleUploadVoice = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resource = await uploadResource(file, { type: "audio", variant: "voice", name: file.name });
      patchRuntimeData(id, { voiceReference: resource.url });
    } catch (error) {
      console.error("[canvas] upload voice reference failed", error);
    } finally {
      event.target.value = "";
    }
  };

  const handleUploadEmotion = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resource = await uploadResource(file, { type: "audio", variant: "voice", name: file.name });
      patchRuntimeData(id, { emotionReference: resource.url });
    } catch (error) {
      console.error("[canvas] upload emotion reference failed", error);
    } finally {
      event.target.value = "";
    }
  };

  const handleDirectUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const resource = await uploadResource(file, { type: "audio", name: file.name });
      patchRuntimeData(id, { audioUrl: resource.url });
    } catch (error) {
      console.error("[canvas] direct audio upload failed", error);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  return (
    <CardMagnetContext.Provider value={magnet}>
    <div style={{ width: MEDIA_NODE_WIDTH }} className="relative select-none">
      {/* Floating action pill */}
      {props.selected && audioUrl && (
        <div className="absolute bottom-full left-1/2 z-10 -translate-x-1/2 -translate-y-2 flex items-center rounded-full bg-[var(--canvas-surface)] shadow-[var(--canvas-shadow-sm)]">
          <div className="group/tip relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerCanvasDownload(audioUrl, `canvas-audio-${id.slice(-6)}`, "mp3");
              }}
              className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95"
            >
              <Download className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">下载音频</span>
          </div>
          <div className="h-4 w-px bg-[var(--canvas-hover)]" />
          <div className="group/tip relative">
            <button
              type="button"
              disabled={isUploading}
              onClick={(e) => { e.stopPropagation(); directUploadRef.current?.click(); }}
              className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95 disabled:opacity-40"
            >
              {isUploading
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--canvas-border-md)] border-t-white/60" />
                : <Upload className="h-4 w-4" />}
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">{audioUrl ? "替换音频" : "上传音频"}</span>
          </div>
        </div>
      )}
      {props.selected && !audioUrl && (
        <div className="absolute bottom-full left-1/2 z-10 -translate-x-1/2 -translate-y-2 flex items-center rounded-full bg-[var(--canvas-surface)] shadow-[var(--canvas-shadow-sm)]">
          <div className="group/tip relative">
            <button
              type="button"
              disabled={isUploading}
              onClick={(e) => { e.stopPropagation(); directUploadRef.current?.click(); }}
              className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95 disabled:opacity-40"
            >
              {isUploading
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--canvas-border-md)] border-t-white/60" />
                : <Upload className="h-4 w-4" />}
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">上传音频</span>
          </div>
        </div>
      )}
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center">
          <Music className="h-3.5 w-3.5 text-[var(--canvas-text-50)]" />
          <EditableNodeLabel title={title} nodeId={id} patchRuntimeData={patchRuntimeData} />
        </div>
      </div>
      <div className="relative" ref={innerRef}>
        <MediaHandle side="left" />
        <MediaHandle side="right" />
        <div
          style={{ height: 240 }}
          className={clsx(
            "relative overflow-hidden rounded-[20px] bg-[var(--canvas-surface-alt)] border transition",
            props.selected
              ? "border-[var(--canvas-border-strong)] shadow-[var(--canvas-shadow-glow-sm)]"
              : isConnecting
              ? "border-[var(--canvas-border-md)] hover:border-[var(--canvas-border-accent)] hover:shadow-[var(--canvas-shadow-glow-md)]"
              : "border-[var(--canvas-border)] hover:border-[var(--canvas-border-md)]",
          )}
        >
          {audioUrl ? (
            <AudioWaveformPlayer src={audioUrl} />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music className="h-10 w-10 text-[var(--canvas-text-15)]" />
            </div>
          )}
          {(isRunning || isUploading) && <GeneratingOverlay label={isUploading ? "上传中..." : "生成中..."} />}
          {lastRunError && !isRunning && !isUploading && (
            <div className="absolute inset-x-0 bottom-0 bg-rose-900/80 px-3 py-1 text-[10px] text-rose-200">{lastRunError}</div>
          )}
        </div>
      </div>
      {props.selected && (
        <div
          style={{ width: MEDIA_CONTROLS_WIDTH, marginLeft: MEDIA_CONTROLS_OFFSET, height: 220 }}
          className="nodrag mt-2 flex flex-col rounded-[20px] bg-[var(--canvas-surface)] px-4 pb-3 pt-3"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Tool row: changes by model type */}
          {isSunoLyrics ? (
            <div className="mb-2 flex items-center gap-1.5">
              <button type="button" disabled={isRunning || !script.trim()}
                onClick={async (e) => {
                  e.stopPropagation();
                  setIsPolishing(true);
                  try {
                    const polished = await polishPrompt(script);
                    patchRuntimeData(id, { script: polished });
                  } catch { /* silently fail */ } finally { setIsPolishing(false); }
                }}
                className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[var(--canvas-hover)] px-2.5 text-[var(--canvas-text-40)] transition hover:bg-[var(--canvas-hover-lg)] hover:text-[var(--canvas-text-60)] disabled:opacity-40"
                title="AI润色">
                {isPolishing ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--canvas-border-md)] border-t-white/60" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span className="text-xs">AI润色</span>
              </button>
            </div>
          ) : isSunoMusic ? null : (
            <div className="mb-2 flex items-center gap-2">
              <ResourceTile
                audioSet={!!voiceRef}
                icon={<Music className="h-5 w-5" />}
                label="上传参考音色"
                onClick={(e) => { e.stopPropagation(); voiceUploadRef.current?.click(); }}
              />
              {isNextide && (
                <ResourceTile
                  audioSet={!!emotionRef}
                  icon={<Smile className="h-5 w-5" />}
                  label={emotionRef ? "参考情绪已上传（点击更换）" : "上传参考情绪"}
                  onClick={(e) => { e.stopPropagation(); emotionUploadRef.current?.click(); }}
                />
              )}
              <button type="button" disabled={isPolishing || !script.trim()}
                onClick={async (e) => {
                  e.stopPropagation();
                  setIsPolishing(true);
                  try {
                    const polished = await polishPrompt(script);
                    patchRuntimeData(id, { script: polished });
                  } catch { /* silently fail */ } finally { setIsPolishing(false); }
                }}
                className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[var(--canvas-hover)] px-2.5 text-[var(--canvas-text-40)] transition hover:bg-[var(--canvas-hover-lg)] hover:text-[var(--canvas-text-60)] disabled:opacity-40"
                title="AI润色">
                {isPolishing ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--canvas-border-md)] border-t-white/60" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span className="text-xs">AI润色</span>
              </button>
            </div>
          )}
          {/* Text area */}
          {isPolishing ? (
            <div className="flex-1 space-y-2.5 py-1 animate-pulse">
              <div className="h-2.5 w-full rounded-full bg-[var(--canvas-hover-xl)]" />
              <div className="h-2.5 w-[62%] rounded-full bg-[var(--canvas-hover-lg)]" />
              <div className="h-2.5 w-[38%] rounded-full bg-[var(--canvas-hover)]" />
            </div>
          ) : (
            <>
              {!script && upstream.effectivePrompt && (
                <p className="mb-1 truncate text-[10px] text-[var(--canvas-text-30)]">
                  ↑ 上游文本：{upstream.effectivePrompt.slice(0, 60)}{upstream.effectivePrompt.length > 60 ? "…" : ""}
                </p>
              )}
              <CompositionTextarea
                value={script}
                onChange={(v) => patchRuntimeData(id, { script: v })}
                placeholder={
                  isSunoLyrics ? "输入歌词主题，点击生成歌词..." :
                  isSunoMusic ? (upstream.effectivePrompt ? "留空则使用上游文本..." : "描述你想创作的音乐风格、情感...") :
                  (upstream.effectivePrompt ? "留空则使用上游文本..." : "口播文本，描述你想生成的语音内容...")
                }
                className="nodrag select-text flex-1 w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--canvas-text)] placeholder:text-[var(--canvas-text-30)] focus:outline-none nopan selection:bg-blue-500/50"
              />
            </>
          )}
          {/* Bottom bar: ModelPicker + run button */}
          <div className="flex items-center gap-1.5">
            <ModelPicker
              options={models.audioModels}
              value={model}
              onChange={(v) => patchRuntimeData(id, { model: v })}
            />
            <button type="button" disabled={isRunning}
              onClick={(e) => { e.stopPropagation(); void runAudioNode(id); }}
              className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] shadow transition hover:bg-[var(--tenant-primary-hover)] disabled:opacity-40">
              {isRunning ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--tenant-primary-foreground)]/20 border-t-[var(--tenant-primary-foreground)]" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}
      <input ref={voiceUploadRef} type="file" accept="audio/*" className="hidden" onChange={handleUploadVoice} />
      <input ref={emotionUploadRef} type="file" accept="audio/*" className="hidden" onChange={handleUploadEmotion} />
      <input ref={directUploadRef} type="file" accept="audio/*" className="hidden" onChange={handleDirectUpload} />
    </div>
    </CardMagnetContext.Provider>
  );
}

function DigitalHumanNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const { patchRuntimeData, runDigitalHumanNode, uploadResource, isConnecting, polishPrompt } = useCanvasNodeContext();
  const innerRef = useRef<HTMLDivElement>(null);
  const magnet = useCardMagnet(innerRef);
  const title = resolveTitle(data);
  const upstream = data.upstreamInputs ?? EMPTY_UPSTREAM;
  const [isPolishing, setIsPolishing] = useState(false);
  const voiceUploadRef = useRef<HTMLInputElement>(null);
  const avatarUploadRef = useRef<HTMLInputElement>(null);
  const emoAudioUploadRef = useRef<HTMLInputElement>(null);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  const script = typeof data.runtime.data.script === "string" ? data.runtime.data.script : "";
  const voiceReference = typeof data.runtime.data.voiceReference === "string" ? data.runtime.data.voiceReference : "";
  const emoAudioUrl = typeof (data.runtime.data as Record<string, unknown>).emoAudioUrl === "string"
    ? ((data.runtime.data as Record<string, unknown>).emoAudioUrl as string) : "";
  const avatarImage = typeof data.runtime.data.avatarImage === "string" ? data.runtime.data.avatarImage : "";
  const outputUrl = typeof (data.runtime.data as Record<string, unknown>).outputUrl === "string"
    ? ((data.runtime.data as Record<string, unknown>).outputUrl as string) : "";
  const lastRunError = typeof (data.runtime.data as Record<string, unknown>).lastRunError === "string"
    ? ((data.runtime.data as Record<string, unknown>).lastRunError as string) : "";
  const dhStatus = typeof (data.runtime.data as Record<string, unknown>).dhStatus === "string"
    ? ((data.runtime.data as Record<string, unknown>).dhStatus as string) : "";
  const isRunning = data.status === "running";

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

  const handleEmoAudioUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resource = await uploadResource(file, { type: "audio", variant: "voice", name: file.name });
      patchRuntimeData(id, { emoAudioUrl: resource.url });
    } catch (error) {
      console.error("[canvas] upload emo audio failed", error);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <CardMagnetContext.Provider value={magnet}>
    <div style={{ width: MEDIA_NODE_WIDTH }} className="select-none">
      <div className="mb-1.5 flex items-center px-1">
        <UserCircle2 className="h-3.5 w-3.5 text-[var(--canvas-text-50)]" />
        <EditableNodeLabel title={title} nodeId={id} patchRuntimeData={patchRuntimeData} />
      </div>
      <div className="relative" ref={innerRef}>
        <MediaHandle side="left" />
        <MediaHandle side="right" />
        <div
          style={{ height: videoAspect ? Math.round(MEDIA_NODE_WIDTH / videoAspect) : 240 }}
          className={clsx(
            "relative overflow-hidden rounded-[20px] bg-[var(--canvas-surface-alt)] border transition",
            props.selected
              ? "border-[var(--canvas-border-strong)] shadow-[var(--canvas-shadow-glow-sm)]"
              : isConnecting
              ? "border-[var(--canvas-border-md)] hover:border-[var(--canvas-border-accent)] hover:shadow-[var(--canvas-shadow-glow-md)]"
              : "border-[var(--canvas-border)] hover:border-[var(--canvas-border-md)]",
          )}
        >
          {outputUrl ? (
            <video
              src={outputUrl}
              controls
              className="h-full w-full object-cover"
              preload="metadata"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth > 0 && v.videoHeight > 0) {
                  setVideoAspect(v.videoWidth / v.videoHeight);
                }
              }}
            />
          ) : avatarImage ? (
            <CanvasImage
              src={avatarImage}
              alt="Avatar"
              className="h-full w-full"
              imageClassName="opacity-60"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <UserCircle2 className="h-10 w-10 text-[var(--canvas-text-15)]" />
            </div>
          )}
          {isRunning && <GeneratingOverlay label={`生成中${dhStatus ? ` · ${dhStatus}` : "..."}`} />}
          {lastRunError && !isRunning && (
            <div className="absolute inset-x-0 bottom-0 bg-rose-900/80 px-3 py-1 text-[10px] text-rose-200">{lastRunError}</div>
          )}
        </div>
      </div>
      {props.selected && (
        <div
          style={{ width: MEDIA_CONTROLS_WIDTH, marginLeft: MEDIA_CONTROLS_OFFSET }}
          className="nodrag mt-2 flex flex-col rounded-[20px] bg-[var(--canvas-surface)] px-4 pb-3 pt-3"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center gap-2">
            <ResourceTile
              imageUrl={avatarImage || upstream.firstImageUrl || undefined}
              icon={<ImagePlus className="h-5 w-5" />}
              label={upstream.firstImageUrl && !avatarImage ? "上游图片将用作形象" : "选择形象"}
              onClick={(e) => { e.stopPropagation(); avatarUploadRef.current?.click(); }}
            />
            <ResourceTile
              audioSet={!!(voiceReference || upstream.firstAudioUrl)}
              icon={<Music className="h-5 w-5" />}
              label={upstream.firstAudioUrl && !voiceReference ? "上游音频将用作音色" : "参考音色"}
              onClick={(e) => { e.stopPropagation(); voiceUploadRef.current?.click(); }}
            />
            <ResourceTile
              audioSet={!!emoAudioUrl}
              icon={<Music className="h-5 w-5" />}
              label="参考情感"
              onClick={(e) => { e.stopPropagation(); emoAudioUploadRef.current?.click(); }}
            />
          </div>
          {isPolishing ? (
            <div className="flex-1 space-y-2.5 py-1 animate-pulse">
              <div className="h-2.5 w-full rounded-full bg-[var(--canvas-hover-xl)]" />
              <div className="h-2.5 w-[62%] rounded-full bg-[var(--canvas-hover-lg)]" />
              <div className="h-2.5 w-[38%] rounded-full bg-[var(--canvas-hover)]" />
            </div>
          ) : (
            <>
              {!script && upstream.effectivePrompt && (
                <p className="mb-1 truncate text-[10px] text-[var(--canvas-text-30)]">
                  ↑ 上游文本：{upstream.effectivePrompt.slice(0, 60)}{upstream.effectivePrompt.length > 60 ? "…" : ""}
                </p>
              )}
              <CompositionTextarea
                value={script}
                onChange={(v) => patchRuntimeData(id, { script: v })}
                placeholder={upstream.effectivePrompt ? "留空则使用上游文本..." : "输入口播文案..."}
                className="nodrag select-text flex-1 w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--canvas-text)] placeholder:text-[var(--canvas-text-30)] focus:outline-none nopan selection:bg-blue-500/50 min-h-[60px]"
              />
            </>
          )}
          <div className="flex items-center gap-1.5 pt-2">
            <button type="button" disabled={isPolishing || !script.trim()}
              onClick={async (e) => {
                e.stopPropagation();
                setIsPolishing(true);
                try {
                  const polished = await polishPrompt(script);
                  patchRuntimeData(id, { script: polished });
                } catch {
                  // silently fail
                } finally {
                  setIsPolishing(false);
                }
              }}
              className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[var(--canvas-hover)] px-2.5 text-[var(--canvas-text-40)] transition hover:bg-[var(--canvas-hover-lg)] hover:text-[var(--canvas-text-60)] disabled:opacity-40"
              title="AI润色">
              {isPolishing ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--canvas-border-md)] border-t-white/60" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">AI润色</span>
            </button>
            <button type="button" disabled={isRunning}
              onClick={(e) => { e.stopPropagation(); void runDigitalHumanNode(id); }}
              className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] shadow transition hover:bg-[var(--tenant-primary-hover)] disabled:opacity-40">
              {isRunning ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--tenant-primary-foreground)]/20 border-t-[var(--tenant-primary-foreground)]" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}
      <input ref={voiceUploadRef} type="file" accept="audio/*" className="hidden" onChange={handleVoiceUpload} />
      <input ref={avatarUploadRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
      <input ref={emoAudioUploadRef} type="file" accept="audio/*" className="hidden" onChange={handleEmoAudioUpload} />
    </div>
    </CardMagnetContext.Provider>
  );
}

const SB_NODE_WIDTH = 560;

const SB_STATUS_LABELS: Record<string, string> = {
  PENDING_IMAGE: "待生成图",
  GENERATING_IMAGE: "生成图中",
  PENDING_VIDEO: "待生成视频",
  GENERATING_VIDEO: "生成视频中",
  COMPLETED: "已完成",
  FAILED: "失败",
};

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
  generationParams?: { reference_frame_url?: string };
};

function StoryboardNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const { patchRuntimeData, runStoryboardNode, uploadResource, isConnecting } = useCanvasNodeContext();
  const upstream = data.upstreamInputs ?? EMPTY_UPSTREAM;
  const title = resolveTitle(data);
  const videoUploadRef = useRef<HTMLInputElement>(null);
  const photoUploadRef = useRef<HTMLInputElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const magnet = useCardMagnet(innerRef);
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [photoLibrary, setPhotoLibrary] = useState<{ id: string; url: string }[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);

  const ownVideoUrl = typeof (data.runtime.data as Record<string, unknown>).videoUrl === "string"
    ? ((data.runtime.data as Record<string, unknown>).videoUrl as string) : "";
  const effectiveVideoUrl = ownVideoUrl || upstream.firstVideoUrl;

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

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const resource = await uploadResource(file, { type: "image", name: file.name });
      setPhotoLibrary((prev) => [...prev, { id: resource.id, url: resource.url }]);
    } catch (error) {
      console.error("[canvas] upload storyboard photo failed", error);
    } finally {
      setPhotoUploading(false);
      event.target.value = "";
    }
  };

  const assignPhotoToSegment = (photoUrl: string, segId: string) => {
    const updated = sbSegments.map((seg) =>
      seg.id === segId ? { ...seg, generatedImage: photoUrl } : seg,
    );
    patchRuntimeData(id, { sbSegments: updated });
  };

  return (
    <>
    <CardMagnetContext.Provider value={magnet}>
    <div style={{ width: SB_NODE_WIDTH }} className="select-none">
      {/* Header */}
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <Clapperboard className="h-3.5 w-3.5 text-[var(--canvas-text-50)]" />
        <EditableNodeLabel title={title} nodeId={id} patchRuntimeData={patchRuntimeData} />
        {hasSegments && (
          <span className="rounded-full bg-[var(--canvas-hover)] px-2 py-0.5 text-[10px] text-[var(--canvas-text-50)]">
            {sbSegments.length} 镜头
          </span>
        )}
        <div className="flex-1" />
        {hasSegments && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setFullscreen(true); }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--canvas-hover)] text-[var(--canvas-text-40)] transition hover:bg-[var(--canvas-hover-lg)] hover:text-[var(--canvas-text-80)]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Card body */}
      <div className="relative" ref={innerRef}>
        <MediaHandle side="left" />
        <MediaHandle side="right" />
        {/* Photo library panel (top-left) */}
        {hasSegments && (
          <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => photoUploadRef.current?.click()}
              disabled={photoUploading}
              className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed border-[var(--canvas-border-md)] bg-[var(--canvas-hover-sm)] transition hover:border-[var(--canvas-border-heavy)] disabled:opacity-50"
            >
              {photoUploading ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--canvas-border-md)] border-t-white/60" />
              ) : (
                <Plus className="h-5 w-5 text-[var(--canvas-text-40)]" />
              )}
            </button>
            {photoLibrary.length > 0 && (
              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                {photoLibrary.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => {
                      if (selectedSegmentId) {
                        assignPhotoToSegment(photo.url, selectedSegmentId);
                      }
                    }}
                    disabled={!selectedSegmentId}
                    className={`h-14 w-14 rounded-xl overflow-hidden border-2 transition ${
                      selectedSegmentId ? "border-[var(--canvas-border-md)] hover:border-[var(--canvas-border-heavy)]" : "border-[var(--canvas-border)] opacity-50"
                    }`}
                  >
                    <CanvasImage src={photo.url} alt="photo" className="h-full w-full" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div
          className={clsx(
            "overflow-hidden rounded-[20px] border bg-[var(--canvas-surface-deep)] transition",
            props.selected
              ? "border-[var(--canvas-border-strong)] shadow-[var(--canvas-shadow-glow-sm)]"
              : isConnecting
              ? "border-[var(--canvas-border-md)] hover:border-[var(--canvas-border-accent)] hover:shadow-[var(--canvas-shadow-glow-md)]"
              : "border-[var(--canvas-border)] hover:border-[var(--canvas-border-md)]",
          )}
        >
          {/* Idle icon panel — shown when no segments */}
          {!hasSegments && (
            <div className="relative flex h-[240px] w-full flex-col items-center justify-center gap-2 bg-[var(--canvas-bg)] text-[var(--canvas-text-20)]">
              <Clapperboard className="h-10 w-10" />
              <p className="text-xs">
                {effectiveVideoUrl ? "视频已就绪，点击一键复刻" : "上传或引用上游视频"}
              </p>
              {isRunning && <GeneratingOverlay label={`拆解中${sbStatus ? ` · ${sbStatus}` : "..."}`} />}
              {!ownVideoUrl && upstream.firstVideoUrl && (
                <div className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-[var(--canvas-text-50)] backdrop-blur-sm">
                  ↑ 上游视频
                </div>
              )}
            </div>
          )}

          {/* Progress bar */}
          {isRunning && (
            <div className="h-0.5 bg-[var(--canvas-hover-sm)]">
              <div
                className="h-full bg-white/40 transition-all duration-500"
                style={{ width: `${Math.max(5, sbProgress)}%` }}
              />
            </div>
          )}

          {/* Controls row */}
          <div className="flex items-center gap-2 border-t border-[var(--canvas-border)] px-4 py-3">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); videoUploadRef.current?.click(); }}
              className="flex-shrink-0 rounded-lg bg-[var(--canvas-hover)] px-2 py-1 text-[10px] text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover-xl)]"
            >
              上传视频
            </button>
            {ownVideoUrl && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); patchRuntimeData(id, { videoUrl: "" }); }}
                className="flex-shrink-0 rounded-lg bg-[var(--canvas-hover-sm)] px-2 py-1 text-[10px] text-[var(--canvas-text-30)] transition hover:bg-[var(--canvas-hover)]"
              >
                清除
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              disabled={isRunning || !effectiveVideoUrl}
              onClick={(e) => { e.stopPropagation(); void runStoryboardNode(id); }}
              className="flex-shrink-0 rounded-lg bg-[var(--canvas-hover-lg)] px-3 py-1 text-[10px] font-medium text-[var(--canvas-text)] transition hover:bg-[var(--canvas-hover-xl)] disabled:opacity-40"
            >
              {isRunning ? "拆解中..." : "拆解分镜"}
            </button>
          </div>

          {/* Error */}
          {lastRunError && !isRunning && (
            <div className="border-t border-[var(--canvas-border)] px-4 py-2 text-[11px] text-rose-300">{lastRunError}</div>
          )}

          {/* Segment rows */}
          {hasSegments && (
            <div className="max-h-[560px] divide-y divide-white/[0.04] overflow-y-auto border-t border-[var(--canvas-border)]">
              <div className="grid grid-cols-[32px_1fr_88px_88px_56px] gap-3 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-[var(--canvas-text-30)]">
                <span>#</span>
                <span>描述</span>
                <span>图片</span>
                <span>视频</span>
                <span>时长</span>
              </div>
              {sbSegments.map((seg) => {
                const frameImage = seg.generatedImage || "";
                const statusLabel = SB_STATUS_LABELS[seg.status || ""] || "";
                const isSelected = selectedSegmentId === seg.id;
                return (
                  <div
                    key={seg.id}
                    onClick={() => setSelectedSegmentId(seg.id)}
                    className={`grid grid-cols-[32px_1fr_88px_88px_56px] items-start gap-3 px-4 py-3 cursor-pointer transition ${
                      isSelected ? "bg-[var(--canvas-hover)]" : "hover:bg-[var(--canvas-hover-sm)]"
                    }`}
                  >
                    <div className="pt-0.5 text-xs font-semibold text-[var(--canvas-text-50)]">{seg.order + 1}</div>
                    <div className="space-y-1 text-[11px] leading-relaxed text-[var(--canvas-text-70)]">
                      {seg.visualDescription && <p className="text-[var(--canvas-text-80)]">{seg.visualDescription}</p>}
                      {seg.cameraNotes && (
                        <p className="text-[var(--canvas-text-40)]"><span className="mr-1 text-[var(--canvas-text-25)]">镜头</span>{seg.cameraNotes}</p>
                      )}
                      {seg.originalScript && (
                        <p className="rounded-lg bg-[var(--canvas-hover-sm)] px-2 py-1 text-[var(--canvas-text-50)] italic">{seg.originalScript}</p>
                      )}
                      {!seg.visualDescription && !seg.cameraNotes && !seg.originalScript && (
                        <p className="text-[var(--canvas-text-25)] italic">提示词已生成，等待合成</p>
                      )}
                      {statusLabel && (
                        <span className="inline-block rounded-full bg-[var(--canvas-hover)] px-2 py-0.5 text-[10px] text-[var(--canvas-text-40)]">{statusLabel}</span>
                      )}
                      {seg.timeRange && <p className="text-[var(--canvas-text-30)]">{seg.timeRange}</p>}
                    </div>
                    <div className="aspect-square overflow-hidden rounded-xl bg-[var(--canvas-hover-sm)]">
                      {frameImage ? (
                        <CanvasImage src={frameImage} alt={`Shot ${seg.order + 1}`} className="h-full w-full" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-[var(--canvas-text-15)]" />
                        </div>
                      )}
                    </div>
                    <div className="aspect-square overflow-hidden rounded-xl bg-[var(--canvas-hover-sm)]">
                      {seg.generatedVideo ? (
                        <video
                          src={seg.generatedVideo}
                          className="h-full w-full object-cover"
                          muted
                          loop
                          playsInline
                          onMouseEnter={(e) => { const v = e.currentTarget as HTMLVideoElement; void v.play().catch(() => {}); }}
                          onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Video className="h-5 w-5 text-[var(--canvas-text-15)]" />
                        </div>
                      )}
                    </div>
                    <div className="pt-0.5 text-[11px] text-[var(--canvas-text-40)]">
                      {seg.duration != null ? `${seg.duration}s` : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <input ref={videoUploadRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
      <input ref={photoUploadRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
    </div>
    </CardMagnetContext.Provider>
    {fullscreen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex flex-col bg-[var(--canvas-bg)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Fullscreen header */}
          <div className="flex items-center gap-3 border-b border-[var(--canvas-border)] px-6 py-4">
            <Clapperboard className="h-4 w-4 text-[var(--canvas-text-50)]" />
            <span className="text-sm text-[var(--canvas-text-70)]">分镜板 · {sbSegments.length} 镜头</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--canvas-hover)] text-[var(--canvas-text-50)] transition hover:bg-[var(--canvas-hover-lg)] hover:text-[var(--canvas-text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Fullscreen table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--canvas-border)] text-[11px] uppercase tracking-widest text-[var(--canvas-text-30)]">
                  <th className="w-12 px-6 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">描述</th>
                  <th className="w-40 px-4 py-3 text-left">图片</th>
                  <th className="w-40 px-4 py-3 text-left">视频</th>
                  <th className="w-20 px-4 py-3 text-left">时长</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {sbSegments.map((seg) => {
                  const frameImage = seg.generatedImage || "";
                  const statusLabel = SB_STATUS_LABELS[seg.status || ""] || "";
                  const isSelected = selectedSegmentId === seg.id;
                  return (
                    <tr
                      key={seg.id}
                      onClick={() => setSelectedSegmentId(seg.id)}
                      className={`cursor-pointer transition ${isSelected ? "bg-[var(--canvas-hover)]" : "hover:bg-[var(--canvas-hover-sm)]"}`}
                    >
                      <td className="px-6 py-4 text-sm font-semibold text-[var(--canvas-text-50)]">{seg.order + 1}</td>
                      <td className="max-w-sm px-4 py-4">
                        <div className="space-y-1.5 text-[13px] leading-relaxed">
                          {seg.visualDescription && <p className="text-[var(--canvas-text-80)]">{seg.visualDescription}</p>}
                          {seg.cameraNotes && (
                            <p className="text-[var(--canvas-text-40)]"><span className="mr-1 text-[var(--canvas-text-25)]">镜头</span>{seg.cameraNotes}</p>
                          )}
                          {seg.originalScript && (
                            <p className="rounded-lg bg-[var(--canvas-hover-sm)] px-2 py-1 text-[var(--canvas-text-50)] italic">{seg.originalScript}</p>
                          )}
                          {statusLabel && (
                            <span className="inline-block rounded-full bg-[var(--canvas-hover)] px-2 py-0.5 text-[11px] text-[var(--canvas-text-40)]">{statusLabel}</span>
                          )}
                          {seg.timeRange && <p className="text-[12px] text-[var(--canvas-text-30)]">{seg.timeRange}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-28 w-28 overflow-hidden rounded-xl bg-[var(--canvas-hover-sm)]">
                          {frameImage ? (
                            <CanvasImage src={frameImage} alt={`Shot ${seg.order + 1}`} className="h-full w-full" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <ImageIcon className="h-6 w-6 text-[var(--canvas-text-15)]" />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-28 w-28 overflow-hidden rounded-xl bg-[var(--canvas-hover-sm)]">
                          {seg.generatedVideo ? (
                            <video
                              src={seg.generatedVideo}
                              className="h-full w-full object-cover"
                              muted
                              loop
                              playsInline
                              onMouseEnter={(e) => { void (e.currentTarget as HTMLVideoElement).play(); }}
                              onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Video className="h-6 w-6 text-[var(--canvas-text-15)]" />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-[13px] text-[var(--canvas-text-40)]">
                        {seg.duration != null ? `${seg.duration}s` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

const PHANTOM_NODE_ID = "__connector_phantom__";
const PHANTOM_EDGE_ID = "__connector_edge__";

function GridNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const { patchRuntimeData, runGridNode, splitGridNode, uploadResource, isConnecting, polishPrompt } = useCanvasNodeContext();
  const upstream = data.upstreamInputs ?? EMPTY_UPSTREAM;
  const innerRef = useRef<HTMLDivElement>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const magnet = useCardMagnet(innerRef);
  const title = resolveTitle(data);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contentType = typeof (data.runtime.data as Record<string, unknown>).contentType === "string"
    ? ((data.runtime.data as Record<string, unknown>).contentType as string) : "产品展示";
  const scriptContent = typeof (data.runtime.data as Record<string, unknown>).scriptContent === "string"
    ? ((data.runtime.data as Record<string, unknown>).scriptContent as string) : "";
  const imageUrl = typeof (data.runtime.data as Record<string, unknown>).imageUrl === "string"
    ? ((data.runtime.data as Record<string, unknown>).imageUrl as string) : "";
  const ratio = typeof data.runtime.data.ratio === "string" && data.runtime.data.ratio ? data.runtime.data.ratio : IMAGE_RATIOS[0];
  const quality = typeof (data.runtime.data as Record<string, unknown>).quality === "string"
    ? ((data.runtime.data as Record<string, unknown>).quality as string) : "standard";
  const [rw, rh] = parseRatio(ratio);
  const gridImageUrl = typeof (data.runtime.data as Record<string, unknown>).gridImageUrl === "string"
    ? ((data.runtime.data as Record<string, unknown>).gridImageUrl as string) : "";
  const gridProgress = typeof (data.runtime.data as Record<string, unknown>).gridProgress === "number"
    ? ((data.runtime.data as Record<string, unknown>).gridProgress as number) : 0;
  const lastRunError = typeof (data.runtime.data as Record<string, unknown>).lastRunError === "string"
    ? ((data.runtime.data as Record<string, unknown>).lastRunError as string) : "";
  const isSplitting = (data.runtime.data as Record<string, unknown>).isSplitting === true;
  const isRunning = data.status === "running";
  const [isPolishing, setIsPolishing] = useState(false);
  const [intrinsicRatio, setIntrinsicRatio] = useState<number | null>(null);
  useEffect(() => { if (!gridImageUrl) setIntrinsicRatio(null); }, [gridImageUrl]);
  const effectiveRatio = intrinsicRatio ?? (rw / rh);
  const containerWidth = Math.round(Math.sqrt(MEDIA_NODE_AREA * effectiveRatio));
  const containerHeight = Math.round(Math.sqrt(MEDIA_NODE_AREA / effectiveRatio));

  const CONTENT_TYPE_PLACEHOLDERS: Record<string, string> = {
    "产品展示": "描述产品外观、材质、设计亮点...",
    "产品卖点展示": "列出核心卖点，例如：防水、轻量、高续航...",
    "剧情故事": "输入故事情节或剧情脚本...",
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resource = await uploadResource(file, { type: "image", name: file.name });
      // Reference image for generation should be stored on input field `imageUrl`.
      patchRuntimeData(id, { imageUrl: resource.url });
    } catch (error) {
      console.error("[canvas] upload grid image failed", error);
    } finally {
      event.target.value = "";
    }
  };

  const handlePolish = async () => {
    if (!scriptContent.trim()) return;
    setIsPolishing(true);
    try {
      const polished = await polishPrompt(scriptContent);
      patchRuntimeData(id, { scriptContent: polished });
    } catch (error) {
      console.error("[canvas] polish script failed", error);
    } finally {
      setIsPolishing(false);
    }
  };

  return (
    <>
    <CardMagnetContext.Provider value={magnet}>
    <div style={{ width: containerWidth }} className="relative select-none">
      {!gridImageUrl && props.selected && (
        <div className="absolute bottom-full left-1/2 z-10 -translate-x-1/2 -translate-y-2 flex items-center gap-3 rounded-full bg-[var(--canvas-surface)] px-3 py-2.5 shadow-[var(--canvas-shadow-sm)]">
          <div className="group/tip relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95"
            >
              <Upload className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">上传九宫格</span>
          </div>
        </div>
      )}
      {props.selected && gridImageUrl && (
        <div className="absolute bottom-full left-1/2 z-10 -translate-x-1/2 -translate-y-2 flex items-center rounded-full bg-[var(--canvas-surface)] shadow-[var(--canvas-shadow-sm)]">
          <div className="group/tip relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFullscreenUrl(gridImageUrl); }}
              className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">全屏查看</span>
          </div>
          <div className="h-4 w-px bg-[var(--canvas-hover)]" />
          <div className="group/tip relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerCanvasDownload(gridImageUrl, `canvas-grid-${id.slice(-6)}`, "png");
              }}
              className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95"
            >
              <Download className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">下载九宫格</span>
          </div>
          <div className="h-4 w-px bg-[var(--canvas-hover)]" />
          <div className="group/tip relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95"
            >
              <Upload className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">替换九宫格</span>
          </div>
          <div className="h-4 w-px bg-[var(--canvas-hover)]" />
          <div className="group/tip relative">
            <button
              type="button"
              disabled={isRunning}
              onClick={(e) => {
                e.stopPropagation();
                if (isSplitting) {
                  patchRuntimeData(id, { isSplitting: false });
                } else {
                  void splitGridNode?.(id);
                }
              }}
              className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95 disabled:opacity-40"
            >
              {isSplitting
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--canvas-border-md)] border-t-white/60" />
                : <LayoutGrid className="h-4 w-4" />}
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">{isSplitting ? "取消拆分" : "拆分九宫格"}</span>
          </div>
        </div>
      )}
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center">
          <Grid3X3 className="h-3.5 w-3.5 text-[var(--canvas-text-50)]" />
          <EditableNodeLabel title={title} nodeId={id} patchRuntimeData={patchRuntimeData} />
        </div>
      </div>

      <div className="relative" ref={innerRef}>
        <MediaHandle side="left" />
        <MediaHandle side="right" />

        {/* Main card */}
        <div
          className={clsx(
            "overflow-hidden rounded-[20px] bg-[var(--canvas-surface-alt)] border transition-[border,box-shadow]",
            props.selected
              ? "border-[var(--canvas-border-strong)] shadow-[var(--canvas-shadow-glow-sm)]"
              : isConnecting
              ? "border-[var(--canvas-border-md)] hover:border-[var(--canvas-border-accent)] hover:shadow-[var(--canvas-shadow-glow-md)]"
              : "border-[var(--canvas-border)] hover:border-[var(--canvas-border-md)]",
          )}
        >
          {/* Result image or placeholder */}
          <div className="relative" style={{ height: containerHeight }}>
            {gridImageUrl ? (
              <CanvasImage
                src={gridImageUrl}
                alt="九宫格"
                className="h-full w-full"
                imageClassName="object-contain"
                onLoad={({ naturalWidth, naturalHeight }) => {
                  if (naturalWidth && naturalHeight) {
                    setIntrinsicRatio(naturalWidth / naturalHeight);
                  }
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Grid3X3 className="h-12 w-12 text-[var(--canvas-text-15)]" />
              </div>
            )}
            {(isRunning || isSplitting) && (
              <GeneratingOverlay label={isSplitting ? "拆解中..." : gridProgress > 0 ? `生成中 ${gridProgress}%` : "生成中..."} />
            )}
            {lastRunError && (
              <div className="absolute inset-x-0 bottom-0 bg-rose-900/80 px-3 py-1 text-[10px] text-rose-200">{lastRunError}</div>
            )}
          </div>
        </div>
      </div>

      {/* Controls panel (visible when selected) */}
      {props.selected && (
        <div
          style={{ width: MEDIA_CONTROLS_WIDTH, marginLeft: -((MEDIA_CONTROLS_WIDTH - containerWidth) / 2) }}
          className="nodrag mt-2 flex flex-col gap-2.5 rounded-[20px] bg-[var(--canvas-surface)] px-4 pb-4 pt-3"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Top row: image tile + AI polish */}
          <div className="flex items-center gap-2">
            <ResourceTile
              imageUrl={imageUrl}
              icon={<ImagePlus className="h-5 w-5" />}
              label="上传参考图"
              onClick={() => fileInputRef.current?.click()}
            />
            {!imageUrl && upstream.firstImageUrl && (
              <ResourceTile
                imageUrl={upstream.firstImageUrl}
                icon={<ImageIcon className="h-5 w-5" />}
                label="上游图片"
                onClick={() => {}}
              />
            )}
            <button
              type="button"
              disabled={isPolishing || !scriptContent.trim()}
              onClick={handlePolish}
              className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[var(--canvas-hover)] px-2.5 text-[var(--canvas-text-40)] transition hover:bg-[var(--canvas-hover-lg)] hover:text-[var(--canvas-text-60)] disabled:opacity-40"
            >
              {isPolishing ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--canvas-border-md)] border-t-white/60" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">AI润色</span>
            </button>
          </div>

          {/* Script textarea */}
          <CompositionTextarea
            value={scriptContent}
            onChange={(v) => patchRuntimeData(id, { scriptContent: v })}
            placeholder={CONTENT_TYPE_PLACEHOLDERS[contentType] || "输入脚本内容..."}
            className="nodrag select-text min-h-[72px] w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--canvas-text)] placeholder:text-[var(--canvas-text-30)] focus:outline-none nopan selection:bg-blue-500/50"
          />

          {/* Bottom row: content type + ratio + run */}
          <div className="flex items-center gap-1">
            <CanvasSelect
              value={contentType}
              options={[
                { value: "产品展示", label: "产品展示" },
                { value: "卖点展示", label: "卖点展示" },
                { value: "剧情故事", label: "剧情故事" },
              ]}
              onChange={(v) => patchRuntimeData(id, { contentType: v })}
            />
            <span className="text-xs text-[var(--canvas-text-15)]">·</span>
            <div className="flex items-center gap-1 rounded-lg px-2 py-1">
              <RatioIcon ratio={ratio} />
              <CanvasSelect
                value={ratio}
                options={IMAGE_RATIOS.map((r) => ({ value: r, label: r, icon: <RatioIcon ratio={r} /> }))}
                onChange={(v) => patchRuntimeData(id, { ratio: v })}
              />
            </div>
            <button
              type="button"
              disabled={isRunning}
              onClick={(e) => { e.stopPropagation(); void runGridNode(id); }}
              className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] shadow transition hover:bg-[var(--tenant-primary-hover)] disabled:opacity-40"
            >
              {isRunning ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--tenant-primary-foreground)]/20 border-t-[var(--tenant-primary-foreground)]" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
    </div>
    </CardMagnetContext.Provider>
    {fullscreenUrl && typeof document !== "undefined" && createPortal(
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={() => setFullscreenUrl(null)}
      >
        <CanvasImage
          src={fullscreenUrl}
          alt="九宫格预览"
          className="max-h-[90vh] max-w-[90vw]"
          imageClassName="rounded-2xl object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="fixed right-6 top-6 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerCanvasDownload(fullscreenUrl, `canvas-grid-${id.slice(-6)}`, "png");
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenUrl(null);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}

// ─── ImageTextGroupNodeCard ────────────────────────────────────────────────────
// 专属图文创作节点：展示多张生成图片 + 正文文案
function ImageTextGroupNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const { isConnecting, patchRuntimeData: _patchRtd, setNodeStatus, getUpstreamInputs } = useCanvasNodeContext();
  const { language: itgLanguage } = useLanguage();
  const itgLanguageLabel = resolveLanguageLabel(itgLanguage);
  const innerRef = useRef<HTMLDivElement>(null);
  const magnet = useCardMagnet(innerRef);
  const updateNodeInternals = useUpdateNodeInternals();
  const [fullscreenIdx, setFullscreenIdx] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // ── Smart Create state ───────────────────────────────────────────────────────
  const [scAuthToken, setScAuthToken] = useState<string | null>(null);
  const [scStyles, setScStyles] = useState<{ id: string; name: string; previewUrl?: string | null }[]>([]);
  const [scStylesLoading, setScStylesLoading] = useState(false);
  const [scSelectedStyleId, setScSelectedStyleId] = useState<string | null>(null);
  const [scCount, setScCount] = useState(3);
  const [scCreating, setScCreating] = useState(false);
  const scChannelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      setScAuthToken(s.session?.access_token ?? null);
    });
    return () => {
      scChannelsRef.current.forEach((ch) => { void supabase.removeChannel(ch); });
      scChannelsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!scAuthToken || scStyles.length > 0) return;
    let cancelled = false;
    setScStylesLoading(true);
    fetch("/api/assets/styles?limit=50", {
      headers: { Authorization: `Bearer ${scAuthToken}` },
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((p) => {
        if (cancelled) return;
        const rows = Array.isArray(p?.data) ? p.data as { id: string; name: string; previewUrl?: string | null }[] : [];
        setScStyles(rows);
        if (rows.length > 0 && !scSelectedStyleId) setScSelectedStyleId(rows[0].id);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setScStylesLoading(false); });
    return () => { cancelled = true; };
  }, [scAuthToken, scSelectedStyleId, scStyles.length]);

  async function handleSmartCreate() {
    if (!scAuthToken || !scSelectedStyleId || scCreating) return;
    const upstream = getUpstreamInputs(id);
    const textContent = upstream.effectivePrompt || upstream.textContents.join("\n\n");
    if (!textContent.trim()) {
      toast.error("请先连接一个文本节点作为内容来源");
      return;
    }
    const title = textContent.trim().slice(0, 60) || "智能创作";
    setScCreating(true);
    setNodeStatus(id, "running");

    try {
      const res = await fetch("/api/xhs-text2img/plan", {
        method: "POST",
        headers: { Authorization: `Bearer ${scAuthToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          text: textContent.trim(),
          styleId: scSelectedStyleId,
          imageCount: scCount,
          language: itgLanguageLabel,
        }),
      });
      const body = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        const errMsg = (body?.error as string) || "提交失败";
        setNodeStatus(id, "error");
        _patchRtd(id, { lastRunError: errMsg });
        throw new Error(errMsg);
      }
      const taskId = typeof (body?.data as Record<string, unknown>)?.taskId === "string"
        ? (body.data as Record<string, unknown>).taskId as string
        : null;
      if (!taskId) throw new Error("未获取到任务 ID");

      const channel = supabase
        .channel(`itg_sc_${taskId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "creative_tasks", filter: `id=eq.${taskId}` },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            if (row.status === "COMPLETED") {
              let imgs: { index: number; url: string }[] = [];
              try {
                const raw = row.generated_images_json ?? row.generatedImagesJson;
                imgs = Array.isArray(raw)
                  ? (raw as { index: number; url: string }[])
                  : (JSON.parse(raw as string) as { index: number; url: string }[]);
              } catch { /* ignore */ }
              const copy = typeof row.idea_text === "string" ? row.idea_text
                : typeof row.ideaText === "string" ? row.ideaText : "";
              _patchRtd(id, { images: imgs, copy });
              setNodeStatus(id, "idle");
              setScCreating(false);
              supabase.removeChannel(channel);
              scChannelsRef.current = scChannelsRef.current.filter((c) => c !== channel);
              toast.success("图文创作完成！");
            } else if (row.status === "GENERATE_FAILED" || row.status === "FAILED") {
              setNodeStatus(id, "error");
              _patchRtd(id, { lastRunError: "生成失败，请重试" });
              setScCreating(false);
              supabase.removeChannel(channel);
              scChannelsRef.current = scChannelsRef.current.filter((c) => c !== channel);
              toast.error("图片生成失败，请重试");
            }
          },
        )
        .subscribe();
      scChannelsRef.current.push(channel);
      toast.success("已提交，正在生成图文…");
    } catch (err) {
      setNodeStatus(id, "error");
      setScCreating(false);
      toast.error(err instanceof Error ? err.message : "生成失败");
    }
  }

  const rtData = data.runtime.data as Record<string, unknown>;
  const images = Array.isArray(rtData.images)
    ? (rtData.images as { index: number; url: string }[])
    : [];
  const copy = typeof rtData.copy === "string" ? rtData.copy : "";
  const isRunning = data.status === "running";

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, images.length, data.expanded]);

  const handleCardClick = (e: React.MouseEvent) => { e.stopPropagation(); };

  const handleDownloadAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (images.length === 0 || isDownloading) return;
    setIsDownloading(true);
    try {
      for (const img of images) {
        triggerCanvasDownload(img.url, `canvas-itg-${img.index}`, "jpg");
        await new Promise((r) => setTimeout(r, 200));
      }
      toast.success(`已下载 ${images.length} 张图片`);
    } finally {
      setIsDownloading(false);
    }
  };

  const NODE_W = 560;

  const fullscreenPortal = fullscreenIdx !== null && images[fullscreenIdx]
    ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setFullscreenIdx(null)}
        >
          <CanvasImage
            src={images[fullscreenIdx].url}
            alt={`图片 ${fullscreenIdx + 1}`}
            className="max-h-[90vh] max-w-[90vw]"
            imageClassName="rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {/* 关闭按钮 — 右上角 */}
          <button
            className="fixed right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition"
            onClick={() => setFullscreenIdx(null)}
          >
            <X className="h-5 w-5" />
          </button>
          {/* 页码 */}
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 text-sm text-white/60">
            {fullscreenIdx + 1} / {images.length}
          </div>
          {/* 左箭头 */}
          {fullscreenIdx > 0 && (
            <button
              className="fixed left-6 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
              onClick={(e) => { e.stopPropagation(); setFullscreenIdx((v) => (v ?? 0) - 1); }}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          {/* 右箭头 */}
          {fullscreenIdx < images.length - 1 && (
            <button
              className="fixed right-6 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
              onClick={(e) => { e.stopPropagation(); setFullscreenIdx((v) => (v ?? 0) + 1); }}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <CardMagnetContext.Provider value={magnet}>
      {fullscreenPortal}
      <div style={{ width: NODE_W }} className="relative select-none" onClick={handleCardClick}>

        {/* 浮动操作栏 — 选中时显示 */}
        {props.selected && !isRunning && (
          <div className="absolute bottom-full left-1/2 z-10 -translate-x-1/2 -translate-y-2 flex flex-col items-center gap-1.5">
            {/* 下载 pill — 有图片时显示 */}
            {images.length > 0 && (
              <div className="flex items-center rounded-full bg-[var(--canvas-surface)] shadow-[var(--canvas-shadow-sm)]">
                <div className="group/tip relative">
                  <button
                    type="button"
                    disabled={isDownloading}
                    onClick={handleDownloadAll}
                    className="flex items-center justify-center rounded-full p-2.5 text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-95 disabled:opacity-40"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-1.5 whitespace-nowrap rounded-md bg-[var(--canvas-tooltip)] px-2 py-1 text-[11px] text-[var(--canvas-text-80)] opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">
                    下载全部图片
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* node label row */}
        <div className="mb-1.5 flex items-center gap-1.5 px-1">
          <LayoutGrid className="h-3.5 w-3.5 text-[var(--canvas-text-50)]" />
          <EditableNodeLabel title={resolveTitle(data)} nodeId={id} patchRuntimeData={_patchRtd} />
        </div>

        <div className="relative">
          <CardHandle side="left" magnetY={magnet.magnetY} visible={magnet.showLeft || isConnecting} isConnecting={isConnecting} />
          <CardHandle side="right" magnetY={magnet.magnetY} visible={magnet.showRight} isConnecting={isConnecting} />
          <div
            ref={innerRef}
            className={clsx(
              "rounded-[24px] border bg-[var(--canvas-surface)] p-4 transition",
              props.selected
                ? "border-[var(--canvas-border-strong)] shadow-[var(--canvas-shadow-glow-sm)]"
                : isConnecting
                ? "border-[var(--canvas-border-md)] hover:border-[var(--canvas-border-accent)] hover:shadow-[var(--canvas-shadow-glow-md)]"
                : "border-[var(--canvas-border)] hover:border-[var(--canvas-border-md)]",
            )}
          >
            {isRunning ? (
              /* skeleton loading */
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-[var(--canvas-hover)]" />
                  ))}
                </div>
                <div className="h-3 w-3/4 animate-pulse rounded-full bg-[var(--canvas-hover)]" />
                <div className="h-3 w-1/2 animate-pulse rounded-full bg-[var(--canvas-hover)]" />
              </div>
            ) : images.length > 0 ? (
              <div className="space-y-3">
                {/* image grid — max 3 per row */}
                <div className={clsx(
                  "grid gap-2",
                  images.length === 1 ? "grid-cols-1"
                  : images.length === 2 ? "grid-cols-2"
                  : "grid-cols-3"
                )}>
                  {images.map((img, idx) => (
                    <button
                      key={img.index}
                      type="button"
                      className="group relative overflow-hidden rounded-xl"
                      onClick={(e) => { e.stopPropagation(); setFullscreenIdx(idx); }}
                    >
                      <CanvasImage
                        src={img.url}
                        alt={`图片 ${img.index}`}
                        className="aspect-[3/4] w-full"
                        imageClassName="transition group-hover:brightness-90"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                        <Maximize2 className="h-5 w-5 text-white drop-shadow" />
                      </div>
                    </button>
                  ))}
                </div>
                {/* copy text */}
                {copy && (
                  <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--canvas-text-70)]">
                    {copy.length > 150 ? copy.slice(0, 150) + "…" : copy}
                  </p>
                )}
                <p className="text-[11px] text-[var(--canvas-text-30)]">{images.length} 张图片 · 点击图片查看大图</p>
              </div>
            ) : (
              /* empty placeholder */
              <div className="flex h-36 flex-col items-center justify-center gap-2 text-[var(--canvas-text-30)]">
                <LayoutGrid className="h-8 w-8 opacity-40" />
                <span className="text-[12px]">图文创作结果将在此展示</span>
              </div>
            )}
          </div>
        </div>
        {/* 智能创作操作面板 */}
        {props.selected && (
          <div
            style={{ width: NODE_W }}
            className="nodrag mt-2 flex flex-col rounded-[20px] bg-[var(--canvas-surface)] px-4 pb-3 pt-3"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* 上游内容提示 */}
            {(() => {
              const upstream = getUpstreamInputs(id);
              return upstream.effectivePrompt ? (
                <p className="mb-2 truncate text-[10px] text-[var(--canvas-text-30)]">
                  ↑ 内容：{upstream.effectivePrompt.slice(0, 80)}{upstream.effectivePrompt.length > 80 ? "…" : ""}
                </p>
              ) : (
                <p className="mb-2 text-[10px] text-rose-400/70">请先连接文本节点作为内容来源</p>
              );
            })()}
            {/* 风格预设 */}
            <p className="mb-1.5 text-[11px] text-[var(--canvas-text-30)]">风格预设</p>
            {scStylesLoading ? (
              <div className="mb-3 flex gap-2 animate-pulse">
                {[1, 2, 3].map((n) => <div key={n} className="h-16 w-14 rounded-xl bg-[var(--canvas-hover-lg)]" />)}
              </div>
            ) : (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1 nopan">
                {scStyles.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setScSelectedStyleId(s.id); }}
                    className={clsx(
                      "flex-shrink-0 flex flex-col items-center gap-1 rounded-xl border-2 overflow-hidden transition",
                      scSelectedStyleId === s.id
                        ? "border-[var(--tenant-primary)]"
                        : "border-transparent hover:border-[var(--canvas-border-md)]",
                    )}
                  >
                    {s.previewUrl ? (
                      <CanvasImage src={s.previewUrl} alt={s.name} className="h-14 w-14" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center bg-[var(--canvas-hover)] text-[10px] text-[var(--canvas-text-30)] text-center px-1 leading-tight">
                        {s.name}
                      </div>
                    )}
                    <span className="w-14 truncate px-0.5 pb-0.5 text-center text-[10px] text-[var(--canvas-text-50)]">{s.name}</span>
                  </button>
                ))}
                {scStyles.length === 0 && !scStylesLoading && (
                  <p className="text-[11px] text-[var(--canvas-text-30)]">暂无风格预设</p>
                )}
              </div>
            )}
            {/* 生成张数 + 提交 */}
            <div className="flex items-center gap-3">
              <span className="shrink-0 text-[11px] text-[var(--canvas-text-30)]">生成张数</span>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setScCount(n); }}
                    className={clsx(
                      "flex h-7 w-7 items-center justify-center rounded-lg text-sm font-medium transition",
                      scCount === n
                        ? "bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)]"
                        : "bg-[var(--canvas-hover)] text-[var(--canvas-text-60)] hover:bg-[var(--canvas-hover-lg)]",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={scCreating || !scSelectedStyleId || !getUpstreamInputs(id).effectivePrompt}
                onClick={(e) => { e.stopPropagation(); void handleSmartCreate(); }}
                className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] shadow transition hover:bg-[var(--tenant-primary-hover)] active:scale-95 disabled:opacity-40"
              >
                {scCreating
                  ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--tenant-primary-foreground)]/20 border-t-[var(--tenant-primary-foreground)]" />
                  : <ArrowUp className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </CardMagnetContext.Provider>
  );
}

const TIMELINE_VIDEO_NODE_WIDTH = MEDIA_NODE_WIDTH;

function TimelineVideoNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data } = props;
  const { isConnecting } = useCanvasNodeContext();
  const innerRef = useRef<HTMLDivElement>(null);
  const magnet = useCardMagnet(innerRef);
  const [intrinsicRatio, setIntrinsicRatio] = useState<number | null>(null);

  const rtData = (data.runtime.data as Record<string, unknown>);
  const storyboardTaskId = typeof rtData.storyboardTaskId === "string" ? rtData.storyboardTaskId : "";
  const videoUrl = typeof rtData.videoUrl === "string" ? rtData.videoUrl : "";
  const title = typeof rtData.title === "string" && rtData.title ? rtData.title : "Untitled";

  useEffect(() => { if (!videoUrl) setIntrinsicRatio(null); }, [videoUrl]);

  const containerHeight = videoUrl && intrinsicRatio != null
    ? Math.min(320, Math.round(TIMELINE_VIDEO_NODE_WIDTH / intrinsicRatio))
    : 240;

  const handleOpenTimeline = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (storyboardTaskId) {
      window.open(`/storyboard/${storyboardTaskId}/timeline`, "_blank");
    }
  };

  return (
    <CardMagnetContext.Provider value={magnet}>
    <div style={{ width: TIMELINE_VIDEO_NODE_WIDTH }} className="select-none">
      {/* Header */}
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <Film className="h-3.5 w-3.5 text-[var(--canvas-text-50)]" />
        <span className="flex-1 truncate text-[13px] font-medium text-[var(--canvas-text-80)]">{title}</span>
        {storyboardTaskId && (
          <button
            type="button"
            onClick={handleOpenTimeline}
            className="flex items-center gap-1.5 rounded-full bg-[#ffc94a]/15 px-3 py-1 text-[11px] font-medium text-[#ffc94a] transition hover:bg-[#ffc94a]/25"
          >
            <span>在时间轴中编辑</span>
          </button>
        )}
      </div>

      {/* Card body */}
      <div className="relative" ref={innerRef}>
        <MediaHandle side="left" />
        <MediaHandle side="right" />
        <div
          style={{ height: containerHeight }}
          className={clsx(
            "relative overflow-hidden rounded-[20px] bg-[var(--canvas-surface-alt)] border transition-[border,box-shadow]",
            props.selected
              ? "border-[var(--canvas-border-strong)] shadow-[var(--canvas-shadow-glow-sm)]"
              : isConnecting
              ? "border-[var(--canvas-border-md)] hover:border-[var(--canvas-border-accent)] hover:shadow-[var(--canvas-shadow-glow-md)]"
              : "border-[var(--canvas-border)] hover:border-[var(--canvas-border-md)]",
          )}
        >
          {videoUrl ? (
            <video
              key={videoUrl}
              src={videoUrl}
              className="h-full w-full object-cover"
              controls
              muted
              playsInline
              onLoadedMetadata={(e) => {
                const v = e.currentTarget as HTMLVideoElement;
                if (v.videoWidth && v.videoHeight) setIntrinsicRatio(v.videoWidth / v.videoHeight);
              }}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--canvas-text-20)]">
              <Film className="h-10 w-10" />
              <p className="text-xs">连接分镜板节点以显示时间轴视频</p>
            </div>
          )}
          {storyboardTaskId && (
            <button
              type="button"
              onClick={handleOpenTimeline}
              className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[11px] font-medium text-[#ffc94a] backdrop-blur-sm transition hover:bg-black/90"
            >
              <Film className="h-3 w-3" />
              <span>在时间轴中编辑</span>
            </button>
          )}
        </div>
      </div>
    </div>
    </CardMagnetContext.Provider>
  );
}



function PhantomNode() {
  return <div style={{ width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />;
}

const nodeTypes = {
  text: TextNodeCard,
  image: ImageNodeCard,
  video: VideoNodeCard,
  audio: AudioNodeCard,
  digitalhuman: DigitalHumanNodeCard,
  storyboard: StoryboardNodeCard,
  grid: GridNodeCard,
  imagetextgroup: ImageTextGroupNodeCard,
  timelinevideo: TimelineVideoNodeCard,
  phantom: PhantomNode,
};

const NODE_PICKER_ITEMS = [
  { type: "text", icon: AlignLeft, label: "文本", desc: "脚本、广告词、品牌文案" },
  { type: "imagetextgroup", icon: LayoutGrid, label: "图文", desc: "图文内容创作、小红书图文" },
  { type: "image", icon: ImageIcon, label: "图片", desc: "AI 文生图、风格创作" },
  { type: "video", icon: Video, label: "视频", desc: "AI 文生视频、Sora / Veo" },
  { type: "audio", icon: Music, label: "音频", desc: "AI 音乐与语音合成" },
  { type: "digitalhuman", icon: UserCircle2, label: "数字人", desc: "AI 数字人视频生成" },
  { type: "grid", icon: Grid3X3, label: "九宫格", desc: "产品展示、故事剧情、卖点展示" },
] as const;

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
  onMouseEnter,
  active,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  active?: boolean;
  highlight?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex items-center" onMouseEnter={() => { setShow(true); onMouseEnter?.(); }} onMouseLeave={() => setShow(false)}>
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          "flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150",
          highlight && !active ? "bg-white text-black hover:bg-white/90 active:scale-95 shadow-md" :
          active ? "bg-[var(--canvas-hover)] text-[var(--canvas-text-60)]" :
          "text-[var(--canvas-text-50)] hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)]",
        )}
      >
        <Icon className={highlight && !active ? "h-4.5 w-4.5" : "h-4 w-4"} />
      </button>
      {show && (
        <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--canvas-tooltip)] px-3 py-1.5 text-xs font-medium text-[var(--canvas-text)] shadow-lg">
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#2a2a2c]" />
        </div>
      )}
    </div>
  );
}

function NodePickerPopup({
  screenX,
  screenY,
  sourceNodeId,
  sourceNodeType,
  onPick,
  onDismiss,
  onUpload,
  onPickViral,
}: {
  screenX: number;
  screenY: number;
  sourceNodeId: string | null;
  sourceNodeType?: string | null;
  onPick: (type: string) => void;
  onDismiss: () => void;
  onUpload?: () => void;
  onPickViral?: () => void;
}) {
  const [hoveredType, setHoveredType] = useState<string | null>(null);
  if (typeof document === "undefined") return null;
  const left = Math.min(screenX + 12, window.innerWidth - 320);
  const top = Math.min(Math.max(screenY - 40, 8), window.innerHeight - 320);
  const isFromVideo = sourceNodeType === "video";
  const isFromImage = sourceNodeType === "image";
  const isFromStoryboard = sourceNodeType === "storyboard";
  // Video source: only show 一键复刻 action (no generic picker items)
  const visibleItems = isFromVideo ? [] : NODE_PICKER_ITEMS;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onDismiss} />
      <div
        style={{ left: left - 24, top: top - 24, padding: 24 }}
        className="fixed z-[9999]"
        onClick={(e) => e.stopPropagation()}
      >
      <div
        className="w-[300px] overflow-hidden rounded-[20px] bg-[var(--canvas-surface-deep)] p-3 shadow-[var(--canvas-shadow-lg)]"
      >
        <p className="mb-2 px-2 text-sm text-[var(--canvas-text-40)]">
          {sourceNodeId ? "引用该节点生成" : "添加节点"}
        </p>
        {isFromVideo && (
          <>
            <button
              type="button"
              onClick={() => { onPickViral?.(); onDismiss(); }}
              onMouseEnter={() => setHoveredType("viral_action")}
              onMouseLeave={() => setHoveredType(null)}
              className={`mb-1 flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition active:scale-[0.98] ${hoveredType === "viral_action" ? "bg-[var(--canvas-hover-md)]" : ""}`}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--canvas-hover)]">
                <Zap className="h-5 w-5 text-[var(--canvas-text-80)]" />
              </div>
              <div>
                <div className="text-sm font-medium text-[var(--canvas-text)]">一键复刻</div>
                <div className={`text-xs transition-all duration-150 ${hoveredType === "viral_action" ? "text-[var(--canvas-text-50)]" : "text-[var(--canvas-text)]/0"}`}>选择产品，AI 批量生成视频</div>
              </div>
            </button>
          </>
        )}
        {isFromImage && (
          <>
          </>
        )}
        {isFromStoryboard && (
          <button
            type="button"
            onClick={() => onPick("timelinevideo")}
            className="mb-1 flex w-full items-center gap-3 rounded-[14px] bg-[#ffc94a]/10 px-3 py-3 text-left transition hover:bg-[#ffc94a]/20 active:scale-[0.98]"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#ffc94a]/20">
              <Film className="h-5 w-5 text-[#ffc94a]" />
            </div>
            <div>
              <div className="text-base font-medium text-[#ffc94a]">时间轴视频</div>
              <div className="text-xs text-[#ffc94a]/60">展示并跳转至时间轴编辑</div>
            </div>
          </button>
        )}
        <div className="space-y-0.5">
          {visibleItems.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => onPick(item.type)}
              onMouseEnter={() => setHoveredType(item.type)}
              onMouseLeave={() => setHoveredType(null)}
              className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition active:scale-[0.98] ${hoveredType === item.type ? "bg-[var(--canvas-hover)]" : ""}`}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--canvas-hover)]">
                <item.icon className="h-5 w-5 text-[var(--canvas-text-80)]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--canvas-text)]">{item.label}</div>
                {item.desc && (
                  <div className={`overflow-hidden text-xs transition-all duration-150 ${hoveredType === item.type ? "text-[var(--canvas-text-50)]" : "text-[var(--canvas-text)]/0"}`}>
                    {item.desc}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
        {onUpload && !isFromVideo && (
          <>
            <div className="my-2 h-px bg-[var(--canvas-hover)]" />
            <button
              type="button"
              onClick={() => { onUpload(); onDismiss(); }}
              className="flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition hover:bg-[var(--canvas-hover)] active:scale-[0.98]"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--canvas-hover)]">
                <Upload className="h-5 w-5 text-[var(--canvas-text-80)]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--canvas-text)]">上传图片或视频</div>
                <div className="text-xs text-[var(--canvas-text-40)]">自动创建节点到画布</div>
              </div>
            </button>
          </>
        )}
      </div>
      </div>
    </>,
    document.body,
  );
}

function ScissorsEdge({
  id,
  sourceY,
  targetY,
  selected,
  source,
  target,
}: EdgeProps) {
  const { setEdges, getNode } = useReactFlow();
  const sourceNode = getNode(source);
  const targetNode = getNode(target);
  const nodeSelected = !!(sourceNode?.selected || targetNode?.selected);
  const isHighlighted = selected || nodeSelected;
  const [flashing, setFlashing] = useState(false);
  const prevHighlighted = useRef(false);

  useEffect(() => {
    if (isHighlighted && !prevHighlighted.current) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 600);
      prevHighlighted.current = true;
      return () => clearTimeout(t);
    }
    if (!isHighlighted) {
      prevHighlighted.current = false;
    }
  }, [isHighlighted]);

  // ── Anchor geometry ────────────────────────────────────────────────────────
  // X: computed from node.position + node.measured.width (card boundary, ±1 border nudge).
  // Y: taken directly from props sourceY / targetY.
  //    The hidden Handle lives at top:50% inside the card-body .relative div, so ReactFlow
  //    always reports the true card-body centre. Critically, this is NOT affected by the
  //    controls panel that appears below the card when the node is selected — that panel
  //    sits outside the .relative div and therefore outside the Handle's containing block.
  //
  // NODE_DEFAULT_WIDTH: fallback widths when node hasn't been measured yet (first render).
  // Values match the explicit CSS widths set on each node type's root element.
  const NODE_DEFAULT_WIDTH: Record<string, number> = {
    text: 240, image: 380, video: 380, audio: 300,
    digitalhuman: 380, storyboard: 560,
  };
  const srcPos = sourceNode?.position ?? { x: 0, y: 0 };
  const srcW   = sourceNode?.measured?.width || NODE_DEFAULT_WIDTH[sourceNode?.type ?? ""] || 300;
  const tgtPos = targetNode?.position ?? { x: 0, y: 0 };
  const tgtW   = targetNode?.measured?.width || NODE_DEFAULT_WIDTH[targetNode?.type ?? ""] || 300;

  // Nearest-edge: compare centre X to determine which pair of sides to connect.
  // +1 / -1 nudge so the line tip sits just outside the border, not clipped by it.
  const sourceOnLeft = srcPos.x + srcW / 2 <= tgtPos.x + tgtW / 2;
  const edgeSX = sourceOnLeft ? srcPos.x + srcW + 1 : srcPos.x - 1;
  const edgeTX = sourceOnLeft ? tgtPos.x - 1 : tgtPos.x + tgtW + 1;
  const eSrcPos = sourceOnLeft ? Position.Right : Position.Left;
  const eTgtPos = sourceOnLeft ? Position.Left : Position.Right;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: edgeSX,
    sourceY,          // prop = hidden Handle centre = card-body vertical centre
    sourcePosition: eSrcPos,
    targetX: edgeTX,
    targetY,          // same
    targetPosition: eTgtPos,
  });

  return (
    <>
      {/* Subtle glow halo */}
      {isHighlighted && (
        <path
          d={edgePath}
          fill="none"
          stroke="var(--canvas-edge-glow)"
          strokeWidth={8}
          strokeLinecap="round"
        />
      )}
      {/* Flash burst on light-up */}
      {flashing && (
        <path
          d={edgePath}
          fill="none"
          stroke="var(--canvas-border-strong)"
          strokeWidth={3}
          strokeLinecap="round"
          style={{
            animation: "edge-flash 0.5s ease-out forwards",
          }}
        />
      )}
      {/* Shimmer moving dot */}
      {isHighlighted && (
        <path
          d={edgePath}
          fill="none"
          stroke="var(--canvas-border-heavy)"
          strokeWidth={1.5}
          strokeDasharray="16 2000"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="2016"
            to="0"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </path>
      )}
      {/* Main path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: isHighlighted ? "var(--canvas-border-heavy)" : "var(--canvas-border-strong)",
          strokeWidth: 1.5,
          transition: "stroke 0.35s ease",
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
            className="nodrag nopan absolute flex h-8 w-8 items-center justify-center rounded-full border border-[var(--canvas-border-strong)] bg-[var(--canvas-surface-alt)] transition hover:border-rose-400/60 hover:bg-rose-900/80"
            onClick={() => setEdges((edges) => edges.filter((e) => e.id !== id))}
          >
            <Scissors className="h-3.5 w-3.5 text-[var(--canvas-text-80)]" />
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
  initialMedia?: string;
  forceProjectList?: boolean;
  initialProjects?: CanvasProjectRecord[];
  autoSelectFirstProject?: boolean;
};

export function ReactCanvasRoot({
  initialProjectId,
  initialPrompt,
  initialMedia,
  forceProjectList,
  initialProjects,
  autoSelectFirstProject,
}: ReactCanvasRootProps) {
  const preferredAutoSelect =
    typeof autoSelectFirstProject === "boolean" ? autoSelectFirstProject : !forceProjectList;
  const shouldPreloadFirstProjectData = !forceProjectList || Boolean(initialProjectId);
  const {
    projects,
    currentProject,
    currentProjectId,
    loadProjects,
    selectProject,
    saveProjectCanvas,
    fetchProjectById,
    createProject,
    renameProject,
    deleteProject,
    loading: loadingProjects,
    error: projectError,
  } = useCanvasProjects(initialProjectId, initialProjects, {
    autoSelectFirstProject: preferredAutoSelect,
    preloadFirstProjectData: shouldPreloadFirstProjectData,
  });
  const { resources, addResource, updateResource, removeResource, syncFromCanvasData } =
    useCanvasResources();
  const models = useCanvasModels();
  const { update: updateCanvasShell, registerCommands } = useCanvasShell();
  const { basePath } = useTenant();
  const { language: interfaceLanguage } = useLanguage();
  const interfaceLanguageLabel = resolveLanguageLabel(interfaceLanguage);

  const [nodes, setNodes] = useState<Node<MinimalFlowNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [viewportKey, setViewportKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isManualSaving, setIsManualSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isHydrating, setIsHydrating] = useState(false);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [creditsLabel, setCreditsLabel] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [avatarInitial, setAvatarInitial] = useState<string>("?");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isPolishing, setIsPolishing] = useState(false);
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [isPresetPanelOpen, setIsPresetPanelOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renamingProjectName, setRenamingProjectName] = useState("");
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<{ id: string; name: string } | null>(null);
  const [addPanelChars, setAddPanelChars] = useState<{ id: string; name: string; avatar: string }[]>([]);
  const [addPanelProducts, setAddPanelProducts] = useState<{ id: string; name: string; images: string }[]>([]);
  const [addPanelResourcesLoading, setAddPanelResourcesLoading] = useState(false);
  const [showBackground, setShowBackground] = useState(true);
  type ChatAttachment = { id: string; localUrl: string; type: "image" | "video"; name: string };
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isChatPanelDragOver, setIsChatPanelDragOver] = useState(false);
  type ConvMessage = { id: string; role: "user" | "assistant"; content: string };
  const [isChatSideCollapsed, setIsChatSideCollapsed] = useState(true);
  const [convMessages, setConvMessages] = useState<ConvMessage[]>([]);
  const convEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [nodePicker, setNodePicker] = useState<{
    screenX: number;
    screenY: number;
    sourceNodeId: string | null;
    sourceNodeType: string | null;
  } | null>(null);
  const [viralModalSource, setViralModalSource] = useState<{ nodeId: string; videoUrl: string; screenX: number; screenY: number; preCreatedNodeIds?: { textNodeId: string; videoNodeId: string } } | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const rfInstanceRef = useRef<{
    screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number };
    fitView: (opts?: { padding?: number; duration?: number }) => void;
    setViewport: (vp: { x: number; y: number; zoom: number }, opts?: { duration?: number }) => void;
  } | null>(null);
  const hydratingRef = useRef(false);
  const lastHydratedRef = useRef<{ projectId: string; hasData: boolean } | null>(null);
  const nodesRef = useRef<Node<MinimalFlowNodeData>[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  const viewportRef = useRef(viewport);
  const resourcesRef = useRef(resources);
  const currentProjectIdRef2 = useRef(currentProjectId);
  const currentProjectUpdatedAtRef = useRef<string | null>(currentProject?.updatedAt ?? null);
  const saveProjectCanvasRef = useRef(saveProjectCanvas);
  const authTokenRef = useRef<string | null>(null);
  const restoredDraftProjectRef = useRef<Set<string>>(new Set());
  const persistenceReadyProjectRef = useRef<string | null>(null);
  const decoratedNodeCacheRef = useRef<Map<string, DecoratedNodeCacheEntry>>(new Map());
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);
  useEffect(() => {
    resourcesRef.current = resources;
  }, [resources]);
  useEffect(() => {
    currentProjectIdRef2.current = currentProjectId;
    persistenceReadyProjectRef.current = null;
    setLastSavedAt(null);
  }, [currentProjectId]);
  useEffect(() => {
    currentProjectUpdatedAtRef.current = currentProject?.updatedAt ?? null;
  }, [currentProject?.updatedAt]);
  useEffect(() => {
    saveProjectCanvasRef.current = saveProjectCanvas;
  }, [saveProjectCanvas]);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      authTokenRef.current = data.session?.access_token ?? null;
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authTokenRef.current = session?.access_token ?? null;
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  const flushProjectCanvasKeepalive = useCallback((projectId: string | null | undefined) => {
    if (!projectId || typeof window === "undefined") return;
    if (hydratingRef.current) return;
    if (persistenceReadyProjectRef.current !== projectId) return;
    const runtimeNodes = flowNodesToRuntime(nodesRef.current);
    const thumbnail = extractThumbnailFromNodes(runtimeNodes);
    const payload: Record<string, unknown> = {
      canvasData: {
        nodes: runtimeNodes,
        edges: flowEdgesToRuntime(edgesRef.current),
        viewport: viewportRef.current,
        resources: resourcesRef.current,
      },
      thumbnail,
    };
    if (currentProjectUpdatedAtRef.current) {
      payload.expectedUpdatedAt = currentProjectUpdatedAtRef.current;
    }
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authTokenRef.current) {
      headers.Authorization = `Bearer ${authTokenRef.current}`;
    }
    void fetch(`/api/canvas/projects/${projectId}`, {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      keepalive: true,
      headers,
      body,
    }).catch(() => {});
  }, []);
  const getNodeById = useCallback(
    (nodeId: string) => nodesRef.current.find((node) => node.id === nodeId),
    [],
  );
  const getUpstreamInputs = useCallback(
    (nodeId: string) => resolveUpstreamInputs(nodeId, nodesRef.current, edgesRef.current),
    [],
  );
  const router = useRouter();
  const pathname = usePathname();
  const detailViewRef = useRef(false);
  const lastProjectIdRef = useRef<string | null>(null);
  // Prevents onPaneClick from dismissing the picker immediately after onConnectEnd creates it
  const suppressNextPaneClickRef = useRef(false);
  const [visibleProjectError, setVisibleProjectError] = useState<string | null>(null);
  const patchRuntimePerfLogRef = useRef(0);
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
    (nodeId: string, multiSelect: boolean = false) => {
      toggleExpanded(nodeId, true);
      if (multiSelect) {
        setSelectedNodeIds((prev) => {
          const next = new Set(prev);
          if (next.has(nodeId)) {
            next.delete(nodeId);
          } else {
            next.add(nodeId);
          }
          return next;
        });
      } else {
        setSelectedNodeIds(new Set([nodeId]));
      }
      setFocusedNodeId(nodeId);
    },
    [toggleExpanded],
  );
  const patchRuntimeData = useCallback((nodeId: string, patch: Record<string, unknown>) => {
    const shouldTrace = CANVAS_PERF_TRACING && typeof performance !== "undefined";
    const startedAt = shouldTrace ? performance.now() : 0;
    setNodes((prev) => {
      const nextNodes = prev.map((node) => {
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
      });
      if (shouldTrace) {
        const duration = performance.now() - startedAt;
        const now = performance.now();
        if (duration > 8 && now - patchRuntimePerfLogRef.current > PERF_LOG_THROTTLE_MS) {
          console.info(
            `[canvas][perf] patchRuntimeData (${prev.length} nodes) took ${duration.toFixed(1)}ms`,
          );
          patchRuntimePerfLogRef.current = now;
        }
      }
      return nextNodes;
    });
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
  const { runImageNode, runVideoNode, runAudioNode, runDigitalHumanNode, runStoryboardNode, runTextNode, runGridNode, splitGridNode, reverseImagePrompt, uploadResource } = useCanvasOrchestrator({
    getNode: getNodeById,
    getUpstreamInputs,
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
  const polishPrompt = useCallback(async (text: string): Promise<string> => {
    if (!text.trim()) return text;
    const response = await fetch("/api/canvas/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        model: "gpt-4o-mini",
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是一个专业的AI图像/视频生成提示词优化师。请将用户输入的描述润色并优化为更适合AI生成的提示词，保持原有意图，语言更生动、细节更丰富。直接返回优化后的内容，不需要解释。",
          },
          { role: "user", content: text.trim() },
        ],
      }),
    });
    if (!response.ok) throw new Error("润色失败，请稍后重试");
    const payload = (await response.json()) as unknown;
    const choices = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices;
    const polished = choices?.[0]?.message?.content?.trim();
    return polished || text;
  }, []);

  // Add programmatic downstream nodes from a source node — returns the new node IDs
  const addDownstreamNodes = useCallback(
    (sourceNodeId: string, nodeDefs: { type: string; data: Record<string, unknown> }[]): string[] => {
      const source = nodesRef.current.find((n) => n.id === sourceNodeId);
      const sourceX = source?.position.x ?? 0;
      const sourceY = source?.position.y ?? 0;
      const sourceWidth = (source?.measured?.width as number | undefined) ?? MEDIA_NODE_WIDTH;
      const ids: string[] = [];
      const newNodes: Node<MinimalFlowNodeData>[] = [];
      const newEdges: Edge[] = [];
      const gapX = 80;
      const gapY = 340;
      nodeDefs.forEach((def, idx) => {
        const newId = `${def.type}_${Math.random().toString(36).slice(2, 8)}`;
        const newNode: Node<MinimalFlowNodeData> = {
          id: newId,
          type: def.type,
          position: { x: sourceX + sourceWidth + gapX, y: sourceY + idx * gapY },
          data: { runtime: { id: newId, type: def.type, position: { x: 0, y: 0 }, data: def.data }, summary: "", status: "idle" as const, expanded: false },
        };
        newNodes.push(newNode);
        ids.push(newId);
        newEdges.push({ id: `e_${sourceNodeId}_${newId}`, source: sourceNodeId, target: newId, type: "smoothstep" });
      });
      setNodes((prev) => [...prev, ...newNodes]);
      setEdges((prev) => {
        let acc = prev;
        newEdges.forEach((e) => { acc = addEdge(e, acc); });
        return acc;
      });
      return ids;
    },
    [],
  );
  const { presets, listPresets, savePreset, loadPreset, deletePreset } = useCanvasPresets();
  const handleSavePreset = useCallback(async () => {
    if (!presetName.trim() || selectedNodeIds.size === 0) {
      toast.error("请输入预设名称并选择节点");
      return;
    }
    const nodeIds = Array.from(selectedNodeIds);
    await savePreset(presetName, nodeIds, nodes, resources);
    setPresetName("");
    setSelectedNodeIds(new Set());
    setIsPresetPanelOpen(false);
    await listPresets();
  }, [presetName, selectedNodeIds, nodes, resources, savePreset, listPresets]);

  const handleLoadPreset = useCallback(
    async (presetId: string) => {
      const preset = await loadPreset(presetId);
      if (!preset) return;
      const offsetX = 100;
      const offsetY = 100;
      const newNodes = preset.nodes.map((n: any) => ({
        ...n,
        id: `${n.type}_${Math.random().toString(36).slice(2, 8)}`,
        position: { x: n.position.x + offsetX, y: n.position.y + offsetY },
        data: { runtime: { ...n, data: n.data }, summary: "", status: "idle" as const, expanded: false },
      }));
      setNodes((prev) => [...prev, ...newNodes]);
      toast.success("预设已加载");
    },
    [loadPreset],
  );

  const handleBatchDownload = useCallback(async () => {
    if (selectedNodeIds.size === 0) {
      toast.error("请先选择节点");
      return;
    }
    const selectedNodes = nodes.filter((n) => selectedNodeIds.has(n.id));
    const urls: string[] = [];
    selectedNodes.forEach((node) => {
      const d = node.data.runtime.data as Record<string, unknown>;
      if (node.type === "image") {
        const outputs = Array.isArray(d.outputs) ? d.outputs : [];
        outputs.forEach((out: any) => {
          if (typeof out?.url === "string") urls.push(out.url);
        });
      } else if (node.type === "video" || node.type === "digitalhuman") {
        if (typeof d.outputUrl === "string") urls.push(d.outputUrl);
      } else if (node.type === "grid") {
        const gridImages = Array.isArray(d.gridImages) ? d.gridImages : [];
        gridImages.forEach((img: any) => {
          if (typeof img?.url === "string") urls.push(img.url);
        });
      }
    });
    if (urls.length === 0) {
      toast.error("选中节点没有输出资源");
      return;
    }
    urls.forEach((url, idx) => {
      triggerCanvasDownload(url, `canvas-batch-${idx + 1}`, "bin");
    });
    toast.success(`已下载 ${urls.length} 个文件`);
  }, [selectedNodeIds, nodes]);

  useEffect(() => {
    if (isPresetPanelOpen) {
      void listPresets();
    }
  }, [isPresetPanelOpen, listPresets]);

  const nodeContextValue = useMemo(
    () => ({
      toggleExpanded,
      patchRuntimeData,
      focusNode,
      focusedNodeId,
      selectedNodeIds,
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
      runTextNode,
      runGridNode,
      splitGridNode: async (nodeId: string) => {
        patchRuntimeData(nodeId, { isSplitting: true });
        try {
          const imageUrls = await splitGridNode(nodeId);
          if (!imageUrls.length) return;
          const source = nodesRef.current.find((n) => n.id === nodeId);
          const sx = source?.position.x ?? 0;
          const sy = source?.position.y ?? 0;
          const sw = (source?.measured?.width as number | undefined) ?? MEDIA_NODE_WIDTH;
          const GAP_X = 60;
          const GAP_Y = MEDIA_NODE_WIDTH + 40;
          const newFlowNodes = imageUrls.slice(0, 9).map((url, idx) => {
            const col = idx % 3;
            const row = Math.floor(idx / 3);
            const newId = `image_${Math.random().toString(36).slice(2, 8)}`;
            return {
              id: newId,
              type: "image" as const,
              position: {
                x: sx + sw + GAP_X + col * (MEDIA_NODE_WIDTH + GAP_X),
                y: sy + row * GAP_Y,
              },
              data: {
                runtime: { id: newId, type: "image", position: { x: 0, y: 0 }, data: { currentImageUrl: url, prompt: "" } },
                summary: "",
                status: "idle" as const,
                expanded: false,
              } as MinimalFlowNodeData,
            };
          });
          const newFlowEdges = newFlowNodes.map((n) => ({
            id: `e_${nodeId}_${n.id}`,
            source: nodeId,
            target: n.id,
            type: "smoothstep",
          }));
          setNodes((prev) => [...prev, ...newFlowNodes]);
          setEdges((prev) => {
            let acc = prev;
            newFlowEdges.forEach((e) => { acc = addEdge(e as Edge, acc); });
            return acc;
          });
          patchRuntimeData(nodeId, { isSplitting: false });
          toast.success("拆分完成，已创建 9 个图片节点");
        } catch (err) {
          patchRuntimeData(nodeId, { isSplitting: false });
          toast.error((err as Error).message || "拆分失败");
        }
      },
      reverseImagePrompt: async (nodeId: string, mode: "no-text" | "with-text" = "no-text") => {
        // Immediately create text node with loading state
        const source = nodesRef.current.find((n) => n.id === nodeId);
        const sx = source?.position.x ?? 0;
        const sy = source?.position.y ?? 0;
        const sw = (source?.measured?.width as number | undefined) ?? MEDIA_NODE_WIDTH;
        const newId = `text_${Math.random().toString(36).slice(2, 8)}`;
        setNodes((prev) => [
          ...prev,
          {
            id: newId,
            type: "text",
            position: { x: sx + sw + 60, y: sy },
            data: {
              runtime: { id: newId, type: "text", position: { x: 0, y: 0 }, data: { content: "", mode: "", label: "\u63d0\u793a\u8bcd", isLoadingPrompt: true } },
              summary: "",
              status: "idle" as const,
              expanded: false,
            } as MinimalFlowNodeData,
          },
        ]);
        setEdges((prev) => addEdge({ id: `e_${nodeId}_${newId}`, source: nodeId, target: newId, type: "smoothstep" }, prev));
        patchRuntimeData(nodeId, { isReversingPrompt: true });
        try {
          const result = await reverseImagePrompt(nodeId, mode);
          patchRuntimeData(newId, { content: result, isLoadingPrompt: false });
          patchRuntimeData(nodeId, { isReversingPrompt: false });
        } catch (err) {
          patchRuntimeData(newId, { isLoadingPrompt: false });
          patchRuntimeData(nodeId, { isReversingPrompt: false });
          toast.error((err as Error).message || "反推失败");
        }
      },
      addDownstreamNodes,
      uploadResource,
      polishPrompt,
      openViralModal: (nodeId: string, videoUrl: string, screenX: number, screenY: number) => {
        setViralModalSource({ nodeId, videoUrl, screenX, screenY });
      },
      getNode: (nodeId: string) => nodesRef.current.find((n) => n.id === nodeId),
      getUpstreamInputs: (nodeId: string) => resolveUpstreamInputs(nodeId, nodesRef.current, edgesRef.current),
    }),
    [
      toggleExpanded,
      patchRuntimeData,
      focusNode,
      focusedNodeId,
      selectedNodeIds,
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
      runTextNode,
      runGridNode,
      splitGridNode,
      reverseImagePrompt,
      addDownstreamNodes,
      uploadResource,
      polishPrompt,
    ],
  );

  const nodesWithUpstream = useMemo<Node<MinimalFlowNodeData>[]>(() => {
    const upstreamByTarget = collectUpstreamInputsByTarget(nodes, edges);
    const previousCache = decoratedNodeCacheRef.current;
    const nextCache = new Map<string, DecoratedNodeCacheEntry>();

    const decorated = nodes.map((node) => {
      const upstream = upstreamByTarget.get(node.id) ?? EMPTY_UPSTREAM;
      const cached = previousCache.get(node.id);
      if (
        cached &&
        cached.baseNode === node &&
        upstreamInputsEqual(cached.upstreamInputs, upstream)
      ) {
        nextCache.set(node.id, cached);
        return cached.decoratedNode;
      }
      const decoratedNode: Node<MinimalFlowNodeData> = {
        ...node,
        data: {
          ...node.data,
          upstreamInputs: upstream,
        },
      };
      nextCache.set(node.id, {
        baseNode: node,
        decoratedNode,
        upstreamInputs: upstream,
      });
      return decoratedNode;
    });

    decoratedNodeCacheRef.current = nextCache;
    return decorated;
  }, [nodes, edges]);

  useEffect(() => {
    setFocusedNodeId(null);
  }, [currentProjectId]);

  useEffect(() => {
    if (!currentProject) {
      lastHydratedRef.current = null;
      hydratingRef.current = false;
      persistenceReadyProjectRef.current = null;
      setIsHydrating(false);
      return;
    }
    const last = lastHydratedRef.current;
    const hasData = !!currentProject.canvasData;
    // Skip re-hydrate only if same project AND has data
    if (last?.projectId === currentProject.id && last.hasData && hasData) {
      // Guard against stale hydrating state when previous hydration cleanup got interrupted.
      hydratingRef.current = false;
      setIsHydrating(false);
      return;
    }
    lastHydratedRef.current = { projectId: currentProject.id, hasData };

    // If no canvasData, fetch it first
    if (!hasData) {
      hydratingRef.current = true;
      setIsHydrating(true);
      fetchProjectById(currentProject.id, false)
        .then((project) => {
          if (project?.canvasData) {
            const normalized = normalizeRuntimeCanvasData(project.canvasData, initialPrompt);
            let hydrated = normalized;
            const shouldTryDraft =
              normalized.nodes.length === 0 &&
              normalized.edges.length === 0 &&
              normalized.resources.length === 0;
            if (shouldTryDraft) {
              const draftRaw = readCanvasDraft(currentProject.id);
              const draftNormalized = normalizeRuntimeCanvasData(draftRaw, initialPrompt);
              const hasDraftContent =
                draftNormalized.nodes.length > 0 ||
                draftNormalized.edges.length > 0 ||
                draftNormalized.resources.length > 0;
              if (hasDraftContent) {
                hydrated = draftNormalized;
                if (!restoredDraftProjectRef.current.has(currentProject.id)) {
                  restoredDraftProjectRef.current.add(currentProject.id);
                  toast.success("已恢复本地草稿");
                }
              }
            }
            setNodes(runtimeToFlowNodes(hydrated.nodes));
            setEdges(runtimeEdgesToFlowEdges(hydrated.edges));
            syncFromCanvasData(hydrated.resources);
            setViewport(hydrated.viewport);
            setViewportKey((key) => key + 1);
            persistenceReadyProjectRef.current = currentProject.id;
          }
        })
        .finally(() => {
          hydratingRef.current = false;
          setIsHydrating(false);
        });
      return;
    }

    hydratingRef.current = true;
    setIsHydrating(true);
    const normalized = normalizeRuntimeCanvasData(currentProject.canvasData, initialPrompt);
    let hydrated = normalized;
    const shouldTryDraft =
      normalized.nodes.length === 0 &&
      normalized.edges.length === 0 &&
      normalized.resources.length === 0;
    if (shouldTryDraft) {
      const draftRaw = readCanvasDraft(currentProject.id);
      const draftNormalized = normalizeRuntimeCanvasData(draftRaw, initialPrompt);
      const hasDraftContent =
        draftNormalized.nodes.length > 0 ||
        draftNormalized.edges.length > 0 ||
        draftNormalized.resources.length > 0;
      if (hasDraftContent) {
        hydrated = draftNormalized;
        if (!restoredDraftProjectRef.current.has(currentProject.id)) {
          restoredDraftProjectRef.current.add(currentProject.id);
          toast.success("已恢复本地草稿");
        }
      }
    }
    setNodes(runtimeToFlowNodes(hydrated.nodes));
    setEdges(runtimeEdgesToFlowEdges(hydrated.edges));
    syncFromCanvasData(hydrated.resources);
    setViewport(hydrated.viewport);
    setViewportKey((key) => key + 1);
    persistenceReadyProjectRef.current = currentProject.id;
    const timeout = setTimeout(() => {
      hydratingRef.current = false;
      setIsHydrating(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [currentProject, initialPrompt, syncFromCanvasData, fetchProjectById]);

  useEffect(() => {
    if (!currentProjectId || hydratingRef.current || isHydrating) return;
    if (persistenceReadyProjectRef.current !== currentProjectId) return;
    const timer = setTimeout(() => {
      writeCanvasDraft(currentProjectId, {
        nodes: flowNodesToRuntime(nodes),
        edges: flowEdgesToRuntime(edges),
        viewport,
        resources,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [currentProjectId, nodes, edges, viewport, resources, isHydrating]);

  // Flush any pending unsaved state when the component unmounts (SPA navigation away from canvas).
  // The debounce cleanup cancels the timer, so we fire one final save using refs.
  useEffect(() => {
    return () => {
      const projectId = currentProjectIdRef2.current;
      if (!projectId) return;
      if (persistenceReadyProjectRef.current !== projectId) return;
      const runtimeNodes = flowNodesToRuntime(nodesRef.current);
      const thumbnail = extractThumbnailFromNodes(runtimeNodes);
      void saveProjectCanvasRef.current(projectId, {
        nodes: runtimeNodes,
        edges: flowEdgesToRuntime(edgesRef.current),
        viewport: viewportRef.current,
        resources: resourcesRef.current,
      }, thumbnail).catch(() => {
        flushProjectCanvasKeepalive(projectId);
      });
    };
  }, [flushProjectCanvasKeepalive]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const flush = () => {
      flushProjectCanvasKeepalive(currentProjectIdRef2.current);
    };
    const handlePageHide = () => flush();
    const handleBeforeUnload = () => flush();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushProjectCanvasKeepalive]);

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
    (event: MouseEvent | TouchEvent, connectionState: { isValid: boolean | null; fromHandle?: { nodeId?: string } | null; fromNode?: { id?: string } | null }) => {
      setIsConnecting(false);
      if (!connectionState.isValid) {
        const clientX = "clientX" in event ? event.clientX : (event as TouchEvent).changedTouches?.[0]?.clientX ?? 0;
        const clientY = "clientY" in event ? event.clientY : (event as TouchEvent).changedTouches?.[0]?.clientY ?? 0;
        const sourceNodeId = connectionState.fromHandle?.nodeId ?? connectionState.fromNode?.id ?? null;
        const sourceNode = sourceNodeId ? nodesRef.current.find((n) => n.id === sourceNodeId) : null;

        // Check if drop landed inside an existing node — if so, connect to it instead of opening the picker
        if (sourceNodeId && rfInstanceRef.current) {
          const flowPos = rfInstanceRef.current.screenToFlowPosition({ x: clientX, y: clientY });
          const targetNode = nodesRef.current.find((n) => {
            if (n.id === sourceNodeId) return false;
            const w = (n.measured?.width as number | undefined) ?? 200;
            const h = (n.measured?.height as number | undefined) ?? 200;
            return (
              flowPos.x >= n.position.x &&
              flowPos.x <= n.position.x + w &&
              flowPos.y >= n.position.y &&
              flowPos.y <= n.position.y + h
            );
          });
          if (targetNode) {
            setEdges((prev) => addEdge({ id: `e_${sourceNodeId}_${targetNode.id}_${Date.now()}`, source: sourceNodeId, target: targetNode.id, type: "smoothstep" }, prev));
            return;
          }
        }

        if (sourceNodeId) {
          const flowPos = rfInstanceRef.current?.screenToFlowPosition({ x: clientX, y: clientY }) ?? { x: clientX, y: clientY };
          setNodes((prev) => [
            ...prev.filter((n) => n.id !== PHANTOM_NODE_ID),
            {
              id: PHANTOM_NODE_ID,
              type: "phantom",
              position: flowPos,
              data: { runtime: { id: PHANTOM_NODE_ID, type: "phantom", position: flowPos, data: {} }, summary: "", status: "idle" as const, expanded: false },
              selectable: false,
              draggable: false,
            },
          ]);
          setEdges((prev) => [
            ...prev.filter((e) => e.id !== PHANTOM_EDGE_ID),
            { id: PHANTOM_EDGE_ID, source: sourceNodeId, target: PHANTOM_NODE_ID, type: "smoothstep", animated: true },
          ]);
        }

        suppressNextPaneClickRef.current = true;
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

  // Clean up phantom node/edge whenever the picker closes
  useEffect(() => {
    if (!nodePicker) {
      setNodes((prev) => prev.filter((n) => n.id !== PHANTOM_NODE_ID));
      setEdges((prev) => prev.filter((e) => e.id !== PHANTOM_EDGE_ID));
    }
  }, [nodePicker]);
  const handlePickNode = useCallback(
    (type: string, screenX: number, screenY: number, sourceNodeId: string | null) => {
      const pos = rfInstanceRef.current?.screenToFlowPosition({ x: screenX, y: screenY }) ?? { x: screenX, y: screenY };
      const newId = `${type}_${Math.random().toString(36).slice(2, 8)}`;
      // For storyboard nodes created from a video source, pre-fill the video URL
      const sourceNode = sourceNodeId ? nodesRef.current.find((n) => n.id === sourceNodeId) : null;
      const prefilledData: Record<string, unknown> = {};
      if (type === "image") {
        prefilledData.ratio = "16:9";
      }
      if (type === "storyboard" && sourceNode) {
        const srcData = (sourceNode.data.runtime?.data || {}) as Record<string, unknown>;
        const srcVideoUrl = String(srcData.outputUrl || srcData.videoUrl || srcData.url || "").trim();
        if (srcVideoUrl) prefilledData.videoUrl = srcVideoUrl;
      }
      if (type === "timelinevideo" && sourceNode) {
        const srcData = (sourceNode.data.runtime?.data || {}) as Record<string, unknown>;
        // If source is a storyboard node, link to its task ID
        const srcTaskId = String(srcData.storyboardTaskId || srcData.taskId || "").trim();
        if (srcTaskId) prefilledData.storyboardTaskId = srcTaskId;
        // Also carry over any timeline video url
        const srcVideoUrl = String(srcData.timelineVideoUrl || srcData.outputUrl || "").trim();
        if (srcVideoUrl) prefilledData.videoUrl = srcVideoUrl;
      }
      if (type === "text" && sourceNode?.type === "image") {
        // Text node pulled from image → image understanding mode
        const srcData = (sourceNode.data.runtime?.data || {}) as Record<string, unknown>;
        const outputs = Array.isArray(srcData.outputs) ? srcData.outputs : [];
        const firstOutputUrl = outputs.length > 0
          ? String((outputs[0] as Record<string, unknown>).url || "").trim()
          : "";
        const imgUrl = String(firstOutputUrl || srcData.outputUrl || srcData.url || "").trim();
        prefilledData.mode = "image-understanding";
        if (imgUrl) prefilledData.imageUrl = imgUrl;
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
    },
    [],
  );

  const handleChatAttach = useCallback((files: FileList | File[]) => {
    const valid = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    valid.forEach((file) => {
      const localUrl = URL.createObjectURL(file);
      const type: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
      setChatAttachments((prev) => [
        ...prev,
        { id: Math.random().toString(36).slice(2), localUrl, type, name: file.name },
      ]);
    });
  }, []);

  const removeChatAttachment = useCallback((id: string) => {
    setChatAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed?.localUrl.startsWith("blob:")) URL.revokeObjectURL(removed.localUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearChatAttachments = useCallback(() => {
    setChatAttachments((prev) => {
      prev.forEach((a) => { if (a.localUrl.startsWith("blob:")) URL.revokeObjectURL(a.localUrl); });
      return [];
    });
  }, []);

  // Revoke all blob URLs when component unmounts to prevent memory leaks
  useEffect(() => {
    return () => {
      setChatAttachments((prev) => {
        prev.forEach((a) => { if (a.localUrl.startsWith("blob:")) URL.revokeObjectURL(a.localUrl); });
        return prev;
      });
    };
  }, []);

  // Auto-resize chat textarea
  useEffect(() => {
    const el = chatTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [chatInput]);

  const handleChatSend = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;
      setChatInput("");
      clearChatAttachments();

      // Record in conversation history
      setConvMessages((prev) => [
        ...prev,
        { id: `u_${Date.now()}`, role: "user" as const, content: trimmed },
      ]);

      // Classify intent via agent API
      let intent: string = "mixed";
      let prompt = trimmed;
      let ratio: string | undefined;
      try {
        const agentRes = await fetch("/api/canvas/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: trimmed }),
        });
        if (agentRes.ok) {
          const agent = await agentRes.json() as { intent?: string; prompt?: string; ratio?: string };
          if (agent.intent) intent = agent.intent;
          if (agent.prompt) prompt = agent.prompt;
          if (agent.ratio) ratio = agent.ratio;
        }
      } catch {
        // fallback to keyword check
        if (/图片|生图|图像|海报|封面|banner|插画/.test(trimmed)) intent = "image";
        else if (/视频|短片|广告片|动画|短视频/.test(trimmed)) intent = "video";
        else if (/数字人|虚拟人|口播/.test(trimmed)) intent = "digital_human";
        else if (/文案|脚本|标题/.test(trimmed)) intent = "text";
      }

      // Place new nodes below the lowest existing node
      const existingNodes = nodesRef.current;
      let baseY = 100;
      if (existingNodes.length > 0) {
        baseY = Math.max(...existingNodes.map((n) => n.position.y + 300));
      }
      const vp = rfInstanceRef.current;
      let baseX = 100;
      if (vp && typeof window !== "undefined") {
        const center = vp.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        baseX = Math.max(center.x - 200, 50);
      }

      const textId = `text_${Math.random().toString(36).slice(2, 8)}`;

      if (intent === "image") {
        const imageId = `image_${Math.random().toString(36).slice(2, 8)}`;
        setNodes((prev) => [
          ...prev,
          {
            id: textId, type: "text", position: { x: baseX, y: baseY },
            data: { runtime: { id: textId, type: "text", position: { x: baseX, y: baseY }, data: { content: prompt } }, summary: prompt.slice(0, 60), status: "idle" as const, expanded: true },
          },
          {
            id: imageId, type: "image", position: { x: baseX + 520, y: baseY },
            data: { runtime: { id: imageId, type: "image", position: { x: baseX + 520, y: baseY }, data: { prompt, ratio: ratio ?? "16:9", ...(chatAttachments.find((a) => a.type === "image") ? { referenceImage: chatAttachments.find((a) => a.type === "image")!.localUrl } : {}) } }, summary: "", status: "idle" as const, expanded: false },
          },
        ]);
        setEdges((prev) => addEdge({ id: `e_${textId}_${imageId}`, source: textId, target: imageId, type: "smoothstep" }, prev));
      } else if (intent === "video") {
        const videoId = `video_${Math.random().toString(36).slice(2, 8)}`;
        setNodes((prev) => [
          ...prev,
          {
            id: textId, type: "text", position: { x: baseX, y: baseY },
            data: { runtime: { id: textId, type: "text", position: { x: baseX, y: baseY }, data: { content: prompt } }, summary: prompt.slice(0, 60), status: "idle" as const, expanded: true },
          },
          {
            id: videoId, type: "video", position: { x: baseX + 520, y: baseY },
            data: { runtime: { id: videoId, type: "video", position: { x: baseX + 520, y: baseY }, data: { prompt, ratio: ratio ?? "16:9" } }, summary: "", status: "idle" as const, expanded: false },
          },
        ]);
        setEdges((prev) => addEdge({ id: `e_${textId}_${videoId}`, source: textId, target: videoId, type: "smoothstep" }, prev));
      } else if (intent === "digital_human") {
        const dhId = `digital-human_${Math.random().toString(36).slice(2, 8)}`;
        setNodes((prev) => [
          ...prev,
          {
            id: textId, type: "text", position: { x: baseX, y: baseY },
            data: { runtime: { id: textId, type: "text", position: { x: baseX, y: baseY }, data: { content: prompt } }, summary: prompt.slice(0, 60), status: "idle" as const, expanded: true },
          },
          {
            id: dhId, type: "digital-human", position: { x: baseX + 520, y: baseY },
            data: { runtime: { id: dhId, type: "digital-human", position: { x: baseX + 520, y: baseY }, data: { script: prompt } }, summary: "", status: "idle" as const, expanded: false },
          },
        ]);
        setEdges((prev) => addEdge({ id: `e_${textId}_${dhId}`, source: textId, target: dhId, type: "smoothstep" }, prev));
      } else if (intent === "text") {
        setNodes((prev) => [
          ...prev,
          {
            id: textId, type: "text", position: { x: baseX, y: baseY },
            data: { runtime: { id: textId, type: "text", position: { x: baseX, y: baseY }, data: { content: prompt } }, summary: prompt.slice(0, 60), status: "idle" as const, expanded: true },
          },
        ]);
      } else {
        // mixed / fallback: text + image (original behavior)
        const imageId = `image_${Math.random().toString(36).slice(2, 8)}`;
        setNodes((prev) => [
          ...prev,
          {
            id: textId, type: "text", position: { x: baseX, y: baseY },
            data: { runtime: { id: textId, type: "text", position: { x: baseX, y: baseY }, data: { content: prompt } }, summary: prompt.slice(0, 60), status: "idle" as const, expanded: true },
          },
          {
            id: imageId, type: "image", position: { x: baseX + 520, y: baseY },
            data: { runtime: { id: imageId, type: "image", position: { x: baseX + 520, y: baseY }, data: { prompt, ratio: ratio ?? "16:9", ...(chatAttachments.find((a) => a.type === "image") ? { referenceImage: chatAttachments.find((a) => a.type === "image")!.localUrl } : {}) } }, summary: "", status: "idle" as const, expanded: false },
          },
        ]);
        setEdges((prev) => addEdge({ id: `e_${textId}_${imageId}`, source: textId, target: imageId, type: "smoothstep" }, prev));
      }

    },
    [chatAttachments, setNodes, setEdges, clearChatAttachments, setConvMessages],
  );

  const handlePolish = useCallback(async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || isPolishing) return;
    setIsPolishing(true);
    try {
      const res = await fetch("/api/canvas/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          model: "gpt-4o-mini",
          stream: false,
          messages: [
            {
              role: "system",
              content:
                "你是一个专业的AI绘画提示词专家。将用户输入的内容美化成高质量的生图提示词，包含风格、光线、构图、细节等要素。保持与用户输入相同的语言；如果用户使用中文就用中文回应，用户使用英文就用英文回应。直接返回提示词，不要其他解释。",
            },
            { role: "user", content: trimmed },
          ],
        }),
      });
      const data = await res.json().catch(() => null);
      const polished = data?.choices?.[0]?.message?.content?.trim();
      if (polished) setChatInput(polished);
    } catch {
      // silently ignore — keep original input
    } finally {
      setIsPolishing(false);
    }
  }, [chatInput, isPolishing]);

  // Auto-scroll conversation to bottom when new messages arrive
  useEffect(() => {
    convEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convMessages]);

  const handleOpenAgentFromToolbar = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("canvas-agent:open", {
          detail: { projectId: currentProjectId, nodeId: null },
        }),
      );
    }
  }, [currentProjectId]);

  // Auto-send initialPrompt via AI assistant when canvas loads from homepage
  const initialPromptSentRef = useRef(false);
  useEffect(() => {
    if (!initialPrompt || initialPromptSentRef.current) return;
    if (!currentProjectId) return;
    initialPromptSentRef.current = true;
    // Pre-populate attachment if a media URL was passed from homepage
    if (initialMedia) {
      const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(initialMedia);
      setChatAttachments([{
        id: 'initial_media',
        localUrl: initialMedia,
        type: isVideo ? 'video' : 'image',
        name: 'media',
      }]);
    }
    const timer = setTimeout(() => {
      void handleChatSend(initialPrompt);
    }, 600);
    return () => clearTimeout(timer);
  }, [initialPrompt, initialMedia, currentProjectId, handleChatSend]);

  // Space key → hand cursor / drag pan
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      e.preventDefault();
      setIsSpaceDown(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setIsSpaceDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const showProjectList = !currentProjectId && (forceProjectList || (!currentProject && !loadingProjects));
  const isDetailView = !showProjectList;
  const hasProjects = projects.length > 0;

  useEffect(() => {
    if (!isDetailView || !currentProjectId) return;
    if (persistenceReadyProjectRef.current !== currentProjectId) return;
    if (!isHydrating) return;
    const timer = window.setTimeout(() => {
      hydratingRef.current = false;
      setIsHydrating(false);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [currentProjectId, isDetailView, isHydrating]);

  const handleManualSave = useCallback(async (options?: { silentSuccess?: boolean }) => {
    const projectId = currentProjectIdRef2.current;
    if (!projectId) return false;
    if (hydratingRef.current || isHydrating) return false;
    if (persistenceReadyProjectRef.current !== projectId) return false;
    setIsManualSaving(true);
    setIsSaving(true);
    setAutoSaveError(null);
    try {
      const runtimeNodes = flowNodesToRuntime(nodesRef.current);
      const thumbnail = extractThumbnailFromNodes(runtimeNodes);
      await saveProjectCanvas(projectId, {
        nodes: runtimeNodes,
        edges: flowEdgesToRuntime(edgesRef.current),
        viewport: viewportRef.current,
        resources: resourcesRef.current,
      }, thumbnail);
      setAutoSaveError(null);
      setLastSavedAt(Date.now());
      if (!options?.silentSuccess) {
        toast.success("画布已保存");
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存项目失败";
      setAutoSaveError(message);
      toast.error(message);
      return false;
    } finally {
      setIsManualSaving(false);
      setIsSaving(false);
    }
  }, [isHydrating, saveProjectCanvas]);

  // Back button: flush-save then clear the selected project.
  // The URL-sync effect below will then call router.replace('?view=projects').
  const handleBackToList = useCallback(async () => {
    if (currentProjectId && persistenceReadyProjectRef.current === currentProjectId) {
      try {
        const ok = await handleManualSave({ silentSuccess: true });
        if (!ok) {
          flushProjectCanvasKeepalive(currentProjectId);
          toast.error("保存未完成，已切换为后台重试保存");
        }
      } catch {
        flushProjectCanvasKeepalive(currentProjectId);
        toast.error("保存未完成，已切换为后台重试保存");
      }
    }
    selectProject(null);
  }, [currentProjectId, handleManualSave, selectProject, flushProjectCanvasKeepalive]);

  // File drag-and-drop onto canvas — creates image or video node at drop position
  const handleCanvasDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (!isDetailView) return;
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        if (!isImage && !isVideo) continue;
        const flowPos = rfInstanceRef.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? { x: e.clientX, y: e.clientY };
        const nodeType = isImage ? "image" : "video";
        const newId = `${nodeType}_${Math.random().toString(36).slice(2, 8)}`;
        // Detect dimensions from local file first (fast, no network)
        const { width, height } = await getMediaDimensions(file);
        const ratio = findClosestRatio(width, height);
        // Optimistically add node at drop position while upload happens
        const placeholderNode: Node<MinimalFlowNodeData> = {
          id: newId,
          type: nodeType,
          position: flowPos,
          data: {
            runtime: { id: newId, type: nodeType, position: flowPos, data: { label: isImage ? "图片" : "视频", uploading: true, ratio } },
            summary: isImage ? "上传中..." : "上传中...",
            status: "running",
            expanded: false,
          },
        };
        setNodes((prev) => [...prev, placeholderNode]);
        try {
          const resource = await uploadResource(file, { type: isImage ? "image" : "video", name: file.name });
          setNodes((prev) =>
            prev.map((n) => {
              if (n.id !== newId) return n;
              const updatedData = isImage
                ? { label: "图片", outputs: [{ url: resource.url }], ratio }
                : { label: "视频", outputUrl: resource.url, ratio };
              return {
                ...n,
                data: {
                  ...n.data,
                  runtime: { ...n.data.runtime, data: updatedData },
                  summary: isImage ? "已上传图片" : "已上传视频",
                  status: "success" as const,
                },
              };
            }),
          );
        } catch {
          setNodes((prev) => prev.filter((n) => n.id !== newId));
        }
      }
    },
    [isDetailView, uploadResource],
  );

  // Onboarding quick-start templates — called when canvas is empty
  const handleApplyTemplate = useCallback(
    (tpl: "text-to-image" | "text-to-video" | "image-to-video" | "text-to-digitalhuman" | "viral") => {
      const uid = () => Math.random().toString(36).slice(2, 8);
      type NewNode = Node<MinimalFlowNodeData>;
      const makeNode = (type: string, x: number, y: number, data: Record<string, unknown>): NewNode => {
        const id = `${type}_${uid()}`;
        return {
          id,
          type,
          position: { x, y },
          data: {
            runtime: { id, type, position: { x, y }, data },
            summary: "",
            status: "idle" as const,
            expanded: false,
          },
        };
      };
      const edge = (src: NewNode, tgt: NewNode) => ({
        id: `edge_${uid()}`,
        source: src.id,
        target: tgt.id,
        sourceHandle: "right",
        targetHandle: "left",
        type: "smoothstep" as const,
        animated: false,
      });

      let newNodes: NewNode[] = [];
      let newEdges: ReturnType<typeof edge>[] = [];

      if (tpl === "text-to-image") {
        const t = makeNode("text",  -320, 0, { label: "文本输入", content: "", placeholder: "描述你想生成的图片..." });
        const i = makeNode("image",  280, 0, { label: "图片生成", ratio: "16:9" });
        newNodes = [t, i];
        newEdges = [edge(t, i)];
      } else if (tpl === "text-to-video") {
        const t = makeNode("text",  -320, 0, { label: "文本输入", content: "", placeholder: "描述你想生成的视频..." });
        const v = makeNode("video",  280, 0, { label: "视频生成", ratio: "16:9" });
        newNodes = [t, v];
        newEdges = [edge(t, v)];
      } else if (tpl === "image-to-video") {
        const i = makeNode("image", -320, 0, { label: "图片生成", ratio: "16:9" });
        const v = makeNode("video",  280, 0, { label: "视频生成", ratio: "16:9" });
        newNodes = [i, v];
        newEdges = [edge(i, v)];
      } else if (tpl === "text-to-digitalhuman") {
        const t = makeNode("text",       -320, -160, { label: "文本输入", content: "", placeholder: "输入数字人台词..." });
        const a = makeNode("audio",      -320,  160, { label: "参考音频" });
        const d = makeNode("digitalhuman", 280,    0, { label: "数字人" });
        newNodes = [t, a, d];
        newEdges = [edge(t, d), edge(a, d)];
      } else if (tpl === "viral") {
        const v = makeNode("video",           -320, 0, { label: "参考视频" });
        const s = makeNode("storyboard",       280, 0, { label: "分镜板" });
        const tl = makeNode("timelinevideo",   880, 0, { label: "时间轴视频" });
        newNodes = [v, s, tl];
        newEdges = [edge(v, s), edge(s, tl)];
      }

      setNodes(newNodes);
      setEdges(newEdges);
      // Fit into view after render
      setTimeout(() => {
        rfInstanceRef.current?.fitView({ padding: 0.35, duration: 500 });
      }, 50);
    },
    [],
  );

  // Fetch characters + products when the add panel opens
  useEffect(() => {
    if (!isAddPanelOpen) return;
    setAddPanelResourcesLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      Promise.all([
        fetch("/api/characters", { credentials: "include", headers }).then((r) => r.json()).catch(() => []),
        fetch("/api/products", { credentials: "include", headers }).then((r) => r.json()).catch(() => ({ data: [] })),
      ]).then(([chars, prods]) => {
        setAddPanelChars(Array.isArray(chars) ? (chars as { id: string; name: string; avatar: string }[]) : []);
        const prodList = (prods as { data?: { id: string; name: string; images: string }[] }).data ?? [];
        setAddPanelProducts(prodList);
      }).finally(() => setAddPanelResourcesLoading(false));
    }).catch(() => setAddPanelResourcesLoading(false));
  }, [isAddPanelOpen]);

  // Create a video node at canvas center + open viral modal (sidebar "一键复刻" entry)
  const handleToolbarViralClick = useCallback(() => {
    if (typeof window === "undefined") return;
    const cx = Math.round(window.innerWidth / 2);
    const cy = Math.round(window.innerHeight / 2);
    const type = "video";
    const newId = `${type}_${Math.random().toString(36).slice(2, 8)}`;
    const pos = rfInstanceRef.current?.screenToFlowPosition({ x: cx, y: cy }) ?? { x: cx, y: cy };
    const newNode: Node<MinimalFlowNodeData> = {
      id: newId, type, position: pos,
      data: { runtime: { id: newId, type, position: pos, data: { label: "参考视频" } }, summary: "", status: "idle" as const, expanded: false },
    };
    setNodes((prev) => [...prev, newNode]);
    setViralModalSource({ nodeId: newId, videoUrl: "", screenX: cx, screenY: Math.max(cy - 100, 8) });
    setIsAddPanelOpen(false);
  }, [setNodes]);

  // Toolbar/panel upload — creates a node at canvas center after upload
  const toolbarUploadRef = useRef<HTMLInputElement>(null);
  const handleToolbarUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      for (const file of files) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        if (!isImage && !isVideo) continue;
        const nodeType = isImage ? "image" : "video";
        const vp = rfInstanceRef.current;
        const center = vp && typeof window !== "undefined"
          ? vp.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
          : { x: 0, y: 0 };
        const newId = `${nodeType}_${Math.random().toString(36).slice(2, 8)}`;
        // Detect dimensions from local file (fast, no network)
        const { width, height } = await getMediaDimensions(file);
        const ratio = findClosestRatio(width, height);
        const placeholderNode: Node<MinimalFlowNodeData> = {
          id: newId, type: nodeType, position: center,
          data: {
            runtime: { id: newId, type: nodeType, position: center, data: { label: isImage ? "图片" : "视频", uploading: true, ratio } },
            summary: "上传中...", status: "running", expanded: false,
          },
        };
        setNodes((prev) => [...prev, placeholderNode]);
        try {
          const resource = await uploadResource(file, { type: isImage ? "image" : "video", name: file.name });
          setNodes((prev) => prev.map((n) => {
            if (n.id !== newId) return n;
            const d = isImage
              ? { label: "图片", outputs: [{ url: resource.url }], ratio }
              : { label: "视频", outputUrl: resource.url, ratio };
            return { ...n, data: { ...n.data, runtime: { ...n.data.runtime, data: d }, summary: isImage ? "已上传图片" : "已上传视频", status: "success" as const } };
          }));
        } catch {
          setNodes((prev) => prev.filter((n) => n.id !== newId));
        }
      }
    },
    [uploadResource],
  );

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
      isSaving: isSaving || isManualSaving,
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
    isManualSaving,
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

  // Fetch credits balance + user profile for canvas overlay header
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;

        // Credits (same as Sidebar)
        const creditsRes = await fetch("/api/integration/credits", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (creditsRes.ok && !cancelled) {
          const data = await creditsRes.json() as { balance?: number };
          if (typeof data.balance === "number") {
            setCreditsLabel(data.balance.toLocaleString());
          }
        }

        // User avatar + initial
        const user = session.user;
        const fallbackName =
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : user.email?.split("@")[0] ?? "";
        const fallbackAvatar =
          typeof user.user_metadata?.avatar_url === "string"
            ? user.user_metadata.avatar_url
            : "";
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        const displayName = profile?.full_name ?? fallbackName;
        setAvatarUrl(profile?.avatar_url ?? fallbackAvatar);
        setAvatarInitial((displayName || user.email || "?")[0].toUpperCase());
      } catch {
        // silently ignore
      }
    };
    void load();
    return () => { cancelled = true; };
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
          return;
        }
        if (runtimeType === "grid") {
          await runGridNode(nodeId);
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
    runGridNode,
    runImageNode,
    runStoryboardNode,
    runVideoNode,
  ]);

  if (showProjectList && loadingProjects && !hasProjects) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[var(--canvas-bg)]">
        <AiGlowSpinner size={96} />
      </div>
    );
  }

  if (isDetailView && loadingProjects) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[var(--canvas-bg)]">
        <AiGlowSpinner size={96} />
      </div>
    );
  }

  if (showProjectList) {
    return (
      <>
        <div className="min-h-screen bg-[var(--canvas-bg)] text-[var(--canvas-text)]">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-6 py-10">
            <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h1 className="text-4xl font-semibold tracking-tight">无限画布</h1>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleReloadProjects}
                  disabled={loadingProjects}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--canvas-border-md)] px-4 py-2 text-sm text-[var(--canvas-text-80)] transition hover:border-[var(--canvas-border-heavy)] disabled:cursor-not-allowed disabled:border-[var(--canvas-border)] disabled:text-[var(--canvas-text-40)]"
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
                  className="inline-flex items-center gap-2 rounded-full bg-[#ffc94a] px-5 py-2 text-sm font-medium text-black shadow-none transition hover:bg-[#ffd86f] disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="flex min-h-[260px] flex-col items-center justify-center rounded-[32px] border border-dashed border-[var(--canvas-border-md)] bg-[var(--canvas-hover-sm)] text-[var(--canvas-text-70)] transition hover:border-[var(--canvas-border-heavy)] hover:text-[var(--canvas-text)] disabled:cursor-not-allowed disabled:border-[var(--canvas-border)]"
                >
                  <Plus className="mb-3 h-8 w-8" />
                  <span className="text-base">新建项目</span>
                </button>
                {projects.map((project) => (
                  <div
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => renamingProjectId !== project.id && selectProject(project.id)}
                    onKeyDown={(e) => e.key === "Enter" && renamingProjectId !== project.id && selectProject(project.id)}
                    className="group relative flex min-h-[260px] cursor-pointer flex-col overflow-hidden rounded-[32px] border border-[var(--canvas-border)] bg-[var(--canvas-surface)] text-left transition hover:border-[var(--canvas-border-heavy)]"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden">
                      {project.thumbnail ? (
                        <CanvasImage
                          src={project.thumbnail}
                          alt={project.name || "Canvas project"}
                          className="h-full w-full"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-black/80 to-black text-[var(--canvas-text-40)]">
                          <Sparkles className="h-8 w-8" />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05060c] via-transparent" />
                      {/* Action buttons — visible on hover */}
                      <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          title="重命名"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingProjectId(project.id);
                            setRenamingProjectName(project.name || "");
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-[var(--canvas-text-70)] backdrop-blur transition hover:bg-[var(--canvas-hover-xl)] hover:text-[var(--canvas-text)]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="删除"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmProject({ id: project.id, name: project.name || "未命名项目" });
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-[var(--canvas-text-70)] backdrop-blur transition hover:bg-rose-500/70 hover:text-[var(--canvas-text)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col px-5 py-4">
                      {renamingProjectId === project.id ? (
                        <input
                          autoFocus
                          value={renamingProjectName}
                          onChange={(e) => setRenamingProjectName(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              try {
                                await renameProject(project.id, renamingProjectName);
                                toast.success("重命名成功");
                              } catch {
                                toast.error("重命名失败");
                              }
                              setRenamingProjectId(null);
                            } else if (e.key === "Escape") {
                              setRenamingProjectId(null);
                            }
                          }}
                          onBlur={async () => {
                            try {
                              await renameProject(project.id, renamingProjectName);
                            } catch { /* silent */ }
                            setRenamingProjectId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full rounded-lg bg-[var(--canvas-hover)] px-2 py-1 text-lg font-medium text-[var(--canvas-text)] outline-none ring-1 ring-[var(--canvas-border-strong)] focus:ring-[var(--canvas-border-heavy)]"
                        />
                      ) : (
                        <p className="text-lg font-medium text-[var(--canvas-text)]">{project.name || "未命名项目"}</p>
                      )}
                      <p className="mt-1 text-xs text-[var(--canvas-text-50)]">
                        更新于 {new Date(project.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-[32px] border border-[var(--canvas-border)] bg-[var(--canvas-hover-sm)] px-10 py-24 text-center">
                <div className="rounded-full bg-[var(--canvas-hover-sm)] p-4">
                  <Sparkles className="h-8 w-8 text-[#ffc94a]" />
                </div>
                <p className="text-lg font-medium text-[var(--canvas-text)]">欢迎使用无限画布</p>
                <p className="max-w-md text-sm text-[var(--canvas-text-60)]">
                  创建你的第一个项目，体验极简节点、AI 渲染与资源联动。
                </p>
                <button
                  type="button"
                  onClick={handleCreateProject}
                  disabled={loadingProjects}
                  className="inline-flex items-center gap-2 rounded-full bg-[#ffc94a] px-6 py-2 text-sm font-medium text-black shadow-none transition hover:bg-[#ffd86f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  创建第一个项目
                </button>
              </div>
            )}
          </div>
        </div>
        <ConfirmModal
          isOpen={!!deleteConfirmProject}
          onClose={() => setDeleteConfirmProject(null)}
          onConfirm={async () => {
            if (!deleteConfirmProject) return;
            try {
              await deleteProject(deleteConfirmProject.id);
              toast.success("项目已删除");
            } catch (error) {
              const message = error instanceof Error ? error.message : "删除失败";
              toast.error(message);
              throw error;
            }
          }}
          title="删除项目"
          message={`确定删除「${deleteConfirmProject?.name ?? ""}」？此操作不可撤销。`}
          confirmText="删除"
          isDanger
        />
      </>
    );
  }

  return (
    <>
    <style>{`
      @keyframes edge-flash {
        0%   { stroke-opacity: 0.35; stroke-width: 3; }
        30%  { stroke-opacity: 0.2;  stroke-width: 5; }
        100% { stroke-opacity: 0;    stroke-width: 2; }
      }
    `}</style>
    <div
      className="flex h-full flex-col bg-[var(--canvas-bg)] text-[var(--canvas-text)]"
      onKeyDownCapture={(e) => {
        if (e.key === " ") {
          const tag = (e.target as HTMLElement).tagName;
          if (tag === "INPUT" || tag === "TEXTAREA") {
            e.preventDefault();
          }
        }
      }}
    >
      <div
        className={clsx(
          "relative flex-1 overflow-hidden",
          isSpaceDown
            ? "[&_.react-flow__pane]:cursor-grab [&_.react-flow__pane:active]:cursor-grabbing"
            : "[&_.react-flow__pane]:cursor-default",
        )}
        onDragOver={(e) => {
          if (!isDetailView) return;
          const hasFiles = Array.from(e.dataTransfer.types).includes("Files");
          if (!hasFiles) return;
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as globalThis.Node)) {
            setIsDragOver(false);
          }
        }}
        onDrop={handleCanvasDrop}
      >
        {/* Canvas overlay header — logo (back) · project name · credits + avatar */}
        {isDetailView && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex items-center justify-between px-4">
            {/* Left: logo button → back to project list + project name */}
            <div className="pointer-events-auto flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleBackToList}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--canvas-surface-80)] backdrop-blur transition hover:bg-[var(--canvas-hover)]"
                title="返回项目列表"
              >
                <ArrowLeft className="h-4 w-4 text-[var(--canvas-text-70)]" />
              </button>
              {currentProject?.name != null && (
                <ProjectNameEditor
                  projectId={currentProject.id}
                  name={currentProject.name}
                  onRename={renameProject}
                />
              )}
            </div>
            {/* Right: credits pill + avatar */}
            <div className="pointer-events-auto flex items-center gap-2">
              {lastSavedAt ? (
                <div className="rounded-full border border-[var(--canvas-border-md)] bg-[var(--canvas-surface-80)] px-3 py-1.5 text-xs text-[var(--canvas-text-70)] backdrop-blur">
                  已保存 {new Date(lastSavedAt).toLocaleTimeString("zh-CN", { hour12: false })}
                </div>
              ) : null}
              {autoSaveError ? (
                <div className="rounded-full border border-rose-400/60 bg-rose-500/20 px-3 py-1.5 text-xs text-rose-200 backdrop-blur">
                  保存失败
                </div>
              ) : isSaving || isManualSaving ? (
                <div className="rounded-full border border-[var(--canvas-border-md)] bg-[var(--canvas-surface-80)] px-3 py-1.5 text-xs text-[var(--canvas-text-70)] backdrop-blur">
                  保存中...
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  void handleManualSave();
                }}
                disabled={!currentProjectId || isHydrating || isManualSaving}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--canvas-border-md)] bg-[var(--canvas-surface-80)] px-3 py-1.5 text-sm text-[var(--canvas-text-80)] backdrop-blur transition hover:border-[var(--canvas-border-heavy)] disabled:cursor-not-allowed disabled:opacity-50"
                title="立即保存当前画布"
              >
                {isManualSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span>{isManualSaving ? "保存中" : "保存"}</span>
              </button>
              {creditsLabel != null && (
                <div className="flex items-center gap-1.5 rounded-full bg-[var(--canvas-surface-80)] px-3 py-1.5 text-sm text-[var(--canvas-text-80)] backdrop-blur">
                  <Zap className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  <span>{creditsLabel}</span>
                </div>
              )}
              {/* Avatar */}
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[var(--canvas-tooltip)]">
                {avatarUrl ? (
                  <CanvasImage src={avatarUrl} alt="avatar" className="h-full w-full" />
                ) : (
                  <span className="text-sm font-semibold text-[var(--canvas-text-70)]">{avatarInitial}</span>
                )}
              </div>
            </div>
          </div>
        )}
        <CanvasNodeContext.Provider value={nodeContextValue}>
          {/* Drag-over overlay */}
          {isDragOver && (
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-4 rounded-[28px] border-2 border-dashed border-[var(--canvas-border-heavy)] bg-[var(--canvas-hover-sm)] backdrop-blur-sm" />
              <div className="relative flex flex-col items-center gap-2 text-[var(--canvas-text-60)]">
                <Upload className="h-10 w-10" />
                <span className="text-sm font-medium">松开鼠标上传图片或视频</span>
              </div>
            </div>
          )}
          {/* Empty-canvas onboarding guide */}
          {isDetailView && nodes.length === 0 && !isDragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-6">
              {/* Hint row */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-full bg-[var(--canvas-surface)] px-4 py-2 text-sm font-medium text-[var(--canvas-text)] shadow-lg">
                  <MousePointer2 className="h-4 w-4 text-blue-400" />
                  <span>双击</span>
                </div>
                <span className="text-sm text-[var(--canvas-text-50)]">画布自由生成，或选择快捷模板</span>
              </div>
              {/* Quick-start buttons */}
              <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
                {([
                  { tpl: "text-to-image",         icon: ImageIcon,    label: "文生图" },
                  { tpl: "text-to-video",         icon: Video,        label: "文生视频" },
                  { tpl: "image-to-video",        icon: Play,         label: "图生视频" },
                  { tpl: "text-to-digitalhuman",  icon: UserCircle2,  label: "文字转数字人" },
                ] as const).map(({ tpl, icon: Icon, label }) => (
                  <button
                    key={tpl}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className="flex items-center gap-2 rounded-[14px] border border-[var(--canvas-border)] bg-[var(--canvas-surface)] px-4 py-2.5 text-sm text-[var(--canvas-text-70)] shadow-lg transition hover:border-[var(--canvas-border-md)] hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)] active:scale-[0.97]"
                  >
                    <Icon className="h-4 w-4 text-[var(--canvas-text-50)]" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ReactFlow
            key={viewportKey}
            nodes={nodesWithUpstream}
            edges={edges}
            fitView
            className="bg-transparent text-[var(--canvas-text)]"
            noWheelClassName="nowheel"
            panOnDrag={isSpaceDown ? [0] : [1, 2]}
            panOnScroll={true}
            panOnScrollMode={"free" as any}
            zoomOnScroll={false}
            zoomOnPinch={true}
            selectionOnDrag={!isSpaceDown}
            selectionMode={SelectionMode.Partial}
            connectionMode={ConnectionMode.Loose}
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
            onPaneClick={(e) => {
              if (suppressNextPaneClickRef.current) {
                suppressNextPaneClickRef.current = false;
                return;
              }
              setNodePicker(null);
            }}
            onDoubleClick={(e: React.MouseEvent) => {
              const target = e.target as HTMLElement;
              if (target.classList.contains("react-flow__pane")) {
                handlePaneDoubleClick(e);
              }
            }}
            proOptions={{ hideAttribution: true }}
            zoomOnDoubleClick={false}
            panActivationKeyCode={null}
            deleteKeyCode={["Delete", "Backspace"]}
            // Only render nodes visible in the viewport — avoids DOM updates for
            // off-screen nodes when state changes. React Flow v12 handles the
            // culling logic internally with this flag.
            onlyRenderVisibleElements={nodes.length > 20}
          >
            <Background color="var(--canvas-border-md)" variant={BackgroundVariant.Dots} style={{ display: showBackground ? undefined : "none" }} />
          </ReactFlow>
        </CanvasNodeContext.Provider>
        {/* Left floating toolbar */}
        <div
          className="pointer-events-none absolute left-4 top-1/2 z-20 -translate-y-1/2 flex items-center"
          onMouseLeave={() => setIsAddPanelOpen(false)}
        >
          {/* Toolbar pill — no border */}
          <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-[20px] bg-[var(--canvas-surface)] px-2 py-3 shadow-[var(--canvas-shadow-md)]">
            {/* + toggle */}
            <ToolbarBtn
              icon={isAddPanelOpen ? X : Plus}
              label={isAddPanelOpen ? "关闭" : "添加节点"}
              active={isAddPanelOpen}
              onMouseEnter={() => setIsAddPanelOpen(true)}
              onClick={() => setIsAddPanelOpen((v) => !v)}
              highlight
            />
            <div className="my-1 h-px w-6 bg-[var(--canvas-hover)]" />
            {/* Quick templates */}
            <ToolbarBtn icon={ImageIcon}    label="文生图"       onClick={() => { handleApplyTemplate("text-to-image");        setIsAddPanelOpen(false); }} />
            <ToolbarBtn icon={Video}        label="文生视频"     onClick={() => { handleApplyTemplate("text-to-video");        setIsAddPanelOpen(false); }} />
            <ToolbarBtn icon={Play}         label="图生视频"     onClick={() => { handleApplyTemplate("image-to-video");       setIsAddPanelOpen(false); }} />
            <ToolbarBtn icon={UserCircle2}  label="文字转数字人" onClick={() => { handleApplyTemplate("text-to-digitalhuman"); setIsAddPanelOpen(false); }} />
            <ToolbarBtn icon={Clapperboard} label="分镜拆解"     onClick={() => { handleApplyTemplate("viral");               setIsAddPanelOpen(false); }} />
            <div className="my-1 h-px w-6 bg-[var(--canvas-hover)]" />
            {/* Presets button */}
            <ToolbarBtn icon={LayoutGrid} label="预设" onClick={() => setIsPresetPanelOpen((v) => !v)} active={isPresetPanelOpen} />
            {/* Upload — always at bottom */}
            <ToolbarBtn icon={Upload} label="上传图片/视频" onClick={() => toolbarUploadRef.current?.click()} />
          </div>

          {/* Inline add-node panel */}
          {isAddPanelOpen && (
            <div className="pointer-events-auto ml-2 w-[280px] overflow-hidden rounded-[20px] bg-[var(--canvas-surface-deep)] p-3 shadow-[var(--canvas-shadow-lg)]" style={{ maxHeight: "80vh", overflowY: "auto" }}>
              <p className="mb-2 px-2 text-sm text-[var(--canvas-text-40)]">添加节点</p>
              {NODE_PICKER_ITEMS.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      handlePickNode(item.type, Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2), null);
                    }
                    setIsAddPanelOpen(false);
                  }}
                  className="group flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition hover:bg-[var(--canvas-hover)] active:scale-[0.98]"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--canvas-hover)]">
                    <item.icon className="h-5 w-5 text-[var(--canvas-text-80)]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--canvas-text)]">{item.label}</p>
                    <p className="overflow-hidden text-xs text-[var(--canvas-text)]/0 transition-all duration-150 group-hover:text-[var(--canvas-text-50)]">{item.desc}</p>
                  </div>
                </button>
              ))}
              <div className="my-2 h-px bg-[var(--canvas-hover)]" />
              <p className="mb-2 px-2 text-sm text-[var(--canvas-text-40)]">上传素材</p>
              <button
                type="button"
                onClick={() => { toolbarUploadRef.current?.click(); setIsAddPanelOpen(false); }}
                className="flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition hover:bg-[var(--canvas-hover)] active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-[var(--canvas-hover)]">
                  <Upload className="h-5 w-5 text-[var(--canvas-text-80)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--canvas-text)]">上传图片或视频</p>
                  <p className="text-xs text-[var(--canvas-text-40)]">自动创建节点到画布</p>
                </div>
              </button>
              <div className="my-2 h-px bg-[var(--canvas-hover)]" />
              {/* Resource library */}
              <p className="mb-2 px-2 text-sm text-[var(--canvas-text-40)]">资源库</p>
              {addPanelResourcesLoading ? (
                <div className="flex items-center justify-center py-4 text-xs text-[var(--canvas-text-30)]">加载中...</div>
              ) : (
                <>
                  {addPanelChars.length > 0 && (
                    <>
                      <p className="mb-1.5 px-2 text-[10px] uppercase tracking-widest text-[var(--canvas-text-30)]">角色</p>
                      <div className="mb-2 flex flex-wrap gap-2 px-1">
                        {addPanelChars.slice(0, 8).map((char) => {
                          const handleCharClick = () => {
                            if (typeof window === "undefined") return;
                            const cx = Math.round(window.innerWidth / 2);
                            const cy = Math.round(window.innerHeight / 2);
                            const type = "digitalhuman";
                            const newId = `${type}_${Math.random().toString(36).slice(2, 8)}`;
                            const pos = rfInstanceRef.current?.screenToFlowPosition({ x: cx, y: cy }) ?? { x: cx, y: cy };
                            setNodes((prev) => [...prev, {
                              id: newId, type, position: pos,
                              data: { runtime: { id: newId, type, position: pos, data: { avatarImage: char.avatar, label: char.name } }, summary: "", status: "idle" as const, expanded: false },
                            }]);
                            setIsAddPanelOpen(false);
                          };
                          return (
                            <button key={char.id} type="button" title={char.name} onClick={handleCharClick}
                              className="h-14 w-14 overflow-hidden rounded-[12px] bg-[var(--canvas-hover)] transition hover:brightness-110 active:scale-95">
                              {char.avatar ? <CanvasImage src={char.avatar} alt={char.name} className="h-full w-full" draggable={false} /> : <UserCircle2 className="h-6 w-6 text-[var(--canvas-text-30)]" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {addPanelProducts.length > 0 && (
                    <>
                      <p className="mb-1.5 px-2 text-[10px] uppercase tracking-widest text-[var(--canvas-text-30)]">产品</p>
                      <div className="mb-1 flex flex-wrap gap-2 px-1">
                        {addPanelProducts.slice(0, 8).map((prod) => {
                          const thumbUrl = (() => { try { const imgs = JSON.parse(prod.images) as string[]; return Array.isArray(imgs) ? imgs[0] : undefined; } catch { return undefined; } })();
                          const handleProdClick = () => {
                            if (typeof window === "undefined") return;
                            const cx = Math.round(window.innerWidth / 2);
                            const cy = Math.round(window.innerHeight / 2);
                            const type = "text";
                            const newId = `${type}_${Math.random().toString(36).slice(2, 8)}`;
                            const pos = rfInstanceRef.current?.screenToFlowPosition({ x: cx, y: cy }) ?? { x: cx, y: cy };
                            setNodes((prev) => [...prev, {
                              id: newId, type, position: pos,
                              data: { runtime: { id: newId, type, position: pos, data: { content: prod.name, label: prod.name } }, summary: "", status: "idle" as const, expanded: false },
                            }]);
                            setIsAddPanelOpen(false);
                          };
                          return (
                            <button key={prod.id} type="button" title={prod.name} onClick={handleProdClick}
                              className="h-14 w-14 overflow-hidden rounded-[12px] bg-[var(--canvas-hover)] transition hover:brightness-110 active:scale-95">
                              {thumbUrl ? <CanvasImage src={thumbUrl} alt={prod.name} className="h-full w-full" draggable={false} /> : <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--canvas-text-30)] text-center px-1">{prod.name.slice(0, 4)}</div>}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {addPanelChars.length === 0 && addPanelProducts.length === 0 && (
                    <p className="px-2 py-2 text-xs text-[var(--canvas-text-20)]">暂无角色或产品资源</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Preset panel */}
          {isPresetPanelOpen && (
            <div className="pointer-events-auto ml-2 w-[320px] overflow-hidden rounded-[20px] bg-[var(--canvas-surface-deep)] p-4 shadow-[var(--canvas-shadow-lg)]" style={{ maxHeight: "80vh", overflowY: "auto" }}>
              <p className="mb-3 text-sm font-medium text-[var(--canvas-text)]">预设管理</p>
              {selectedNodeIds.size > 0 && (
                <div className="mb-3 space-y-2">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="输入预设名称"
                    className="w-full rounded-lg bg-[var(--canvas-hover)] px-3 py-2 text-sm text-[var(--canvas-text)] placeholder:text-[var(--canvas-text-40)] outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSavePreset}
                      className="flex-1 rounded-lg bg-[var(--canvas-hover-xl)] px-3 py-2 text-sm text-[var(--canvas-text)] transition hover:bg-white/30"
                    >
                      保存预设
                    </button>
                    <button
                      type="button"
                      onClick={handleBatchDownload}
                      className="flex-1 rounded-lg bg-[var(--canvas-hover-xl)] px-3 py-2 text-sm text-[var(--canvas-text)] transition hover:bg-white/30"
                    >
                      批量下载
                    </button>
                  </div>
                  <div className="h-px bg-[var(--canvas-hover)]" />
                </div>
              )}
              <p className="mb-2 text-xs text-[var(--canvas-text-40)]">已保存的预设</p>
              {presets.length === 0 ? (
                <p className="py-4 text-center text-xs text-[var(--canvas-text-30)]">暂无预设</p>
              ) : (
                <div className="space-y-2">
                  {presets.map((preset) => (
                    <div key={preset.id} className="flex items-center justify-between rounded-lg bg-[var(--canvas-hover)] p-2">
                      <button
                        type="button"
                        onClick={() => handleLoadPreset(preset.id)}
                        className="flex-1 text-left text-xs text-[var(--canvas-text-80)] transition hover:text-[var(--canvas-text)]"
                      >
                        {preset.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePreset(preset.id)}
                        className="text-[var(--canvas-text-40)] transition hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Hidden upload input for toolbar */}
        <input ref={toolbarUploadRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleToolbarUpload} />
        {/* Bottom-left zoom control bar */}
        <div className="pointer-events-none absolute bottom-4 left-[76px] z-20">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-[var(--canvas-surface)] px-2 py-2 shadow-[var(--canvas-shadow-md)]">
            <button
              type="button"
              onClick={() => rfInstanceRef.current?.fitView({ padding: 0.15, duration: 300 })}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)]"
              title="适应屏幕"
            >
              <Locate className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowBackground((v) => !v)}
              className={clsx(
                "flex h-8 w-8 items-center justify-center rounded-full transition",
                showBackground ? "text-[var(--canvas-text-90)] hover:bg-[var(--canvas-hover)]" : "text-[var(--canvas-text-30)] hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text-60)]",
              )}
              title={showBackground ? "隐藏背景网格" : "显示背景网格"}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => rfInstanceRef.current?.fitView({ padding: 0.15, duration: 300 })}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--canvas-text-60)] transition hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text)]"
              title="居中所有节点"
            >
              <Scan className="h-4 w-4" />
            </button>
            <div className="mx-1 flex items-center gap-2">
              <input
                type="range"
                min={0.1}
                max={2.0}
                step={0.05}
                value={viewport.zoom}
                onChange={(e) => {
                  const zoom = parseFloat(e.target.value);
                  rfInstanceRef.current?.setViewport({ ...viewport, zoom });
                  setViewport((prev) => ({ ...prev, zoom }));
                }}
                className="h-1 w-24 cursor-pointer rounded-full"
                style={{ accentColor: "var(--tenant-primary)" }}
              />
            </div>
          </div>
        </div>
        {/* Right-side AI chat panel — Gemini design language */}
        {!isChatSideCollapsed && (
          <div
            className="pointer-events-auto absolute right-0 top-0 h-full w-[380px] z-30 flex flex-col bg-[var(--canvas-panel)] backdrop-blur-2xl shadow-[var(--canvas-shadow-panel)]"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsChatPanelDragOver(true); setIsDragOver(false); }}
            onDragLeave={(e) => { e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node)) setIsChatPanelDragOver(false); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsChatPanelDragOver(false); if (e.dataTransfer.files.length) handleChatAttach(e.dataTransfer.files); }}
          >

            {/* Header — no line, just spacing */}
            <div className="flex items-center gap-2 px-5 pt-5 pb-3 shrink-0">
              <span className="flex-1 text-[15px] font-semibold text-[var(--canvas-text-90)] truncate">
                {currentProject?.name || "AI 助手"}
              </span>
              <button
                type="button"
                onClick={() => setIsChatSideCollapsed(true)}
                title="收起"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--canvas-text-35)] transition-all hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text-70)]"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            {/* Panel-level drag overlay */}
            {isChatPanelDragOver && (
              <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-r-none">
                <div className="absolute inset-3 rounded-[20px] border-2 border-dashed border-[var(--canvas-border-strong)] bg-[var(--canvas-hover-sm)]" />
                <div className="relative flex flex-col items-center gap-2 text-[var(--canvas-text-50)]">
                  <Upload className="h-8 w-8" />
                  <span className="text-sm">松开上传</span>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-2 space-y-5 [scrollbar-width:none]">
              {convMessages.length === 0 && (
                <p className="text-center text-[13px] text-[var(--canvas-text-20)] mt-12 leading-relaxed">
                  描述你想创作的内容<br />我来帮你搭建节点
                </p>
              )}
              {convMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={msg.role === "user" ? "flex justify-end" : "flex justify-start items-start gap-2.5"}
                >
                  {msg.role === "user" ? (
                    <div className="max-w-[85%] rounded-[20px] rounded-tr-[6px] bg-[var(--canvas-hover)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--canvas-text-90)]">
                      {msg.content}
                    </div>
                  ) : (
                    <>
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4285f4] to-[#9b59b6]">
                        <Sparkles className="h-3 w-3 text-[var(--canvas-text)]" />
                      </div>
                      <div className="max-w-[85%] text-[14px] leading-relaxed text-[var(--canvas-text-70)]">
                        {msg.content}
                      </div>
                    </>
                  )}
                </div>
              ))}
              <div ref={convEndRef} />
            </div>

            {/* Input pill — Gemini style, no top border */}
            <div className="shrink-0 px-4 pb-5 pt-3">
              <div
                className="rounded-[24px] bg-[var(--canvas-panel-header)] px-4 pt-3.5 pb-3"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDragLeave={(e) => { e.stopPropagation(); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}
              >
                {chatAttachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {chatAttachments.map((att) => (
                      <div key={att.id} className="group/thumb relative">
                        {att.type === "image" ? (
                          <CanvasImage src={att.localUrl} alt={att.name} className="h-14 w-14 rounded-xl" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--canvas-hover)]">
                            <Play className="h-5 w-5 text-[var(--canvas-text-40)]" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeChatAttachment(att.id)}
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--canvas-btn)] text-[var(--canvas-text-60)] opacity-0 transition hover:bg-[var(--canvas-hover-xl)] group-hover/thumb:opacity-100"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  ref={chatTextareaRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleChatSend(chatInput);
                    }
                  }}
                  placeholder="描述想法，或框选节点添加上下文..."
                  rows={1}
                  className="w-full resize-none bg-transparent text-[14px] text-[var(--canvas-text-90)] outline-none placeholder:text-[var(--canvas-text-30)] leading-relaxed"
                  style={{ minHeight: 24, maxHeight: 160, overflowY: "auto" }}
                />
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => chatFileInputRef.current?.click()}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--canvas-text-35)] transition-all hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text-60)]"
                      title="上传附件"
                    >
                      <Paperclip className="h-[17px] w-[17px]" />
                    </button>
                    <button
                      type="button"
                      disabled={!chatInput.trim() || isPolishing}
                      onClick={handlePolish}
                      className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-[var(--canvas-text-35)] transition-all hover:bg-[var(--canvas-hover)] hover:text-[var(--canvas-text-60)] disabled:cursor-not-allowed disabled:opacity-25"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      润色
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={!chatInput.trim() && chatAttachments.length === 0}
                    onClick={() => void handleChatSend(chatInput)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] transition-all hover:bg-[var(--tenant-primary-hover)] disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-[17px] w-[17px]">
                      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Floating orb — shown when side panel is collapsed */}
        {isChatSideCollapsed && (
          <button
            type="button"
            onClick={() => setIsChatSideCollapsed(false)}
            title="展开 AI 助手"
            className="pointer-events-auto absolute bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--canvas-surface-alt)]/90 backdrop-blur-xl shadow-[var(--canvas-shadow-sm)] transition-all hover:scale-105 hover:shadow-[var(--canvas-shadow-md)] active:scale-95"
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#4285f4]/30 to-[#9b59b6]/30" />
            <MessageSquare className="relative h-6 w-6 text-[var(--canvas-text-80)]" />
          </button>
        )}
      </div>
    </div>
      {nodePicker && (
        <NodePickerPopup
          screenX={nodePicker.screenX}
          screenY={nodePicker.screenY}
          sourceNodeId={nodePicker.sourceNodeId}
          sourceNodeType={nodePicker.sourceNodeType}
          onPick={(type) => {
            handlePickNode(type, nodePicker.screenX, nodePicker.screenY, nodePicker.sourceNodeId);
            setNodePicker(null);
          }}
          onDismiss={() => setNodePicker(null)}
          onUpload={() => toolbarUploadRef.current?.click()}
          onPickViral={nodePicker.sourceNodeId ? () => {
            const sourceNodeId = nodePicker.sourceNodeId!;
            const sourceNode = nodesRef.current.find((n) => n.id === sourceNodeId);
            const videoUrl = (sourceNode?.data?.runtime?.data?.outputUrl as string | undefined) ?? "";
            // Pre-create downstream nodes immediately so they appear in loading state
            const newIds = addDownstreamNodes(sourceNodeId, [
              { type: "text", data: { content: "等待提示词回传...", label: "提示词" } },
              { type: "video", data: { label: "复刻视频" } },
            ]);
            newIds.forEach((nid) => setNodeStatus(nid, "running"));
            const preCreatedNodeIds = { textNodeId: newIds[0], videoNodeId: newIds[1] };
            setViralModalSource({ nodeId: sourceNodeId, videoUrl, screenX: nodePicker.screenX, screenY: nodePicker.screenY, preCreatedNodeIds });
            setNodePicker(null);
          } : undefined}
        />
      )}
    </>
  );
}
