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
  type RefObject,
} from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import clsx from "clsx";
import {
  AlignLeft,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  Clapperboard,
  Grid3X3,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Locate,
  MousePointer2,
  Music,
  Paperclip,
  Play,
  Plus,
  RotateCcw,
  Scan,
  Scissors,
  Sparkles,
  Upload,
  UserCircle2,
  Video,
  X,
  Zap,
} from "lucide-react";
import { AiGlowSpinner } from "@/components/AiGlowSpinner";
import { supabase } from "@/lib/supabaseClient";
import { useCanvasShell } from "@/contexts/CanvasShellContext";
import { useTenant } from "@/hooks/useTenant";
import { usePathname, useRouter } from "next/navigation";
import { useCanvasProjects } from "../hooks/useCanvasProjects";
import { useCanvasResources } from "../hooks/useCanvasResources";
import { useCanvasModels, type ModelOption, VIDEO_MODEL_PARAMS } from "../hooks/useCanvasModels";
import { useCanvasOrchestrator } from "../hooks/useCanvasOrchestrator";
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
import { ResourceHoverPanel } from "./ResourceHoverPanel";
import type { CanvasProjectRecord } from "../types";

type CanvasResourceItem = ReturnType<typeof useCanvasResources>["resources"][number];

type CanvasNodeContextValue = {
  toggleExpanded: (nodeId: string, expanded?: boolean) => void;
  patchRuntimeData: (nodeId: string, patch: Record<string, unknown>) => void;
  focusNode: (nodeId: string) => void;
  focusedNodeId: string | null;
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
  polishPrompt: (text: string) => Promise<string>;
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
  uploadResource: async () => {
    throw new Error("Canvas runtime未初始化");
  },
  polishPrompt: async (text) => text,
});

function useCanvasNodeContext() {
  return useContext(CanvasNodeContext);
}

type CardMagnetState = { showLeft: boolean; showRight: boolean; magnetY: number };
const DEFAULT_MAGNET: CardMagnetState = { showLeft: false, showRight: false, magnetY: 50 };
const CardMagnetContext = createContext<CardMagnetState>(DEFAULT_MAGNET);

function useCardMagnet(ref: RefObject<HTMLElement | null>): CardMagnetState {
  const [state, setState] = useState<CardMagnetState>(DEFAULT_MAGNET);
  useEffect(() => {
    // Circular detection zone radius in CSS pixels.
    // The circle is centred at the card body's left/right edge midpoint.
    const RADIUS = 130;

    const onMove = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();

      // Centre of each side in screen coordinates
      const cy = rect.top + rect.height / 2;
      const leftCX = rect.left;
      const rightCX = rect.right;

      const mx = e.clientX;
      const my = e.clientY;

      const distLeft  = Math.sqrt((mx - leftCX) ** 2 + (my - cy) ** 2);
      const distRight = Math.sqrt((mx - rightCX) ** 2 + (my - cy) ** 2);

      const nearLeft  = distLeft  <= RADIUS;
      const nearRight = distRight <= RADIUS;

      if (nearLeft || nearRight) {
        // Use the side the mouse is closest to (or left-biased on tie)
        const activeDist = nearLeft ? distLeft : distRight;

        // Quadratic strength: 1 at the zone centre, 0 at the zone edge.
        // Result: precise tracking when mouse is close to centre,
        // graceful pull-back to 50 % as it drifts toward the boundary.
        const t = 1 - activeDist / RADIUS;
        const strength = t * t;

        // MouseY as percentage of card body height
        const mousePct = ((my - rect.top) / rect.height) * 100;
        // Interpolate between card centre (50 %) and mouse Y
        const magnetPct = 50 + (mousePct - 50) * strength;

        setState({
          showLeft:  nearLeft,
          showRight: nearRight,
          magnetY:   Math.max(5, Math.min(95, magnetPct)),
        });
      } else {
        // Outside every detection zone → reset to centre
        setState((prev) =>
          prev.showLeft || prev.showRight ? DEFAULT_MAGNET : prev,
        );
      }
    };

    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [ref]);
  return state;
}

// CardHandle: two-layer system.
// Layer 1 — invisible ReactFlow <Handle> (opacity 0) for connection interaction, always at center Y.
// Layer 2 — visual circle div (pointerEvents none) that floats 20 px outside card, Y follows mouse.
// ScissorsEdge ignores the Handle position entirely and computes anchor from node geometry.
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
          top: "50%",
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
          border: `1px solid ${isConnecting && isTarget ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.28)"}`,
          background: "rgba(0,0,0,0.55)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: visible ? 1 : 0,
          transition: "top 0.1s ease-out, opacity 0.15s ease",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <Plus className="h-3 w-3 text-white/50 pointer-events-none" />
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

const NODE_TYPE_ICONS: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  text: AlignLeft,
  audio: Music,
};

function NodeCardShell({ id: shellId, data, selected, children }: NodeCardProps) {
  const { isConnecting } = useCanvasNodeContext();
  const innerRef = useRef<HTMLDivElement>(null);
  const magnet = useCardMagnet(innerRef);
  const updateNodeInternals = useUpdateNodeInternals();
  const title = resolveTitle(data);
  const NodeIcon = NODE_TYPE_ICONS[data.runtime.type] ?? AlignLeft;

  // Sync handle positions when node content changes height (e.g. image loads, panel expands)
  useEffect(() => {
    updateNodeInternals(shellId);
  }, [shellId, updateNodeInternals, data.expanded]);
  return (
    <div
      className="min-w-[280px] max-w-[360px] select-none text-white"
    >
      <div className="mb-1.5 flex items-center px-1">
        <NodeIcon className="h-3.5 w-3.5 text-white/50" />
        <span className="ml-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50">{title}</span>
      </div>
      <div className="relative" ref={innerRef}>
      <CardHandle side="left" magnetY={magnet.magnetY} visible={magnet.showLeft || isConnecting} isConnecting={isConnecting} />
      <CardHandle side="right" magnetY={magnet.magnetY} visible={magnet.showRight} isConnecting={isConnecting} />
      <div
        className={clsx(
          "rounded-[24px] border bg-[#1e1e20] p-4 transition",
          selected
            ? "border-white/30 shadow-[0_0_10px_rgba(255,255,255,0.12)]"
            : isConnecting
            ? "border-white/20 hover:border-white/70 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            : "border-white/10 hover:border-white/20",
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
  const { patchRuntimeData, isConnecting } = useCanvasNodeContext();
  const magnet = useCardMagnet(innerRef);
  const updateNodeInternals = useUpdateNodeInternals();
  const content = typeof data.runtime.data.content === "string" ? data.runtime.data.content : "";
  const title = resolveTitle(data);

  // Auto-resize textarea to content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(240, el.scrollHeight)}px`;
    // Notify ReactFlow that this node's size changed so edges recalculate
    updateNodeInternals(id);
  }, [content, id, updateNodeInternals]);

  return (
    <div
      className="select-none text-white"
      style={{ width: 240 }}
    >
      {/* Label above */}
      <div className="mb-1.5 flex items-center gap-1.5 px-1">
        <AlignLeft className="h-3.5 w-3.5 text-white/50" />
        <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">{title}</span>
      </div>
      {/* Card = textarea with handles positioned relative to it */}
      <div className="relative" style={{ minHeight: 240 }} ref={innerRef}>
      <CardHandle side="left" magnetY={magnet.magnetY} visible={magnet.showLeft || isConnecting} isConnecting={isConnecting} />
      <CardHandle side="right" magnetY={magnet.magnetY} visible={magnet.showRight} isConnecting={isConnecting} />
      <div
        className={clsx(
          "rounded-[20px] border bg-[#1a1a1c] transition",
          selected
            ? "border-white/25 shadow-[0_0_10px_rgba(255,255,255,0.12)]"
            : isConnecting
            ? "border-white/15 hover:border-white/50"
            : "border-white/10 hover:border-white/20",
        )}
      >
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => patchRuntimeData(id, { content: e.target.value })}
          placeholder="开启你的创作..."
          className="w-full resize-none bg-transparent px-4 py-4 text-sm text-white outline-none placeholder:text-white/30"
          style={{ minHeight: 240, overflowY: "hidden", transition: "height 0.15s ease" }}
        />
      </div>
      </div>{/* end inner relative */}
    </div>
  );
}

const IMAGE_RATIOS = ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"];
const VIDEO_DURATIONS = ["5", "8", "10", "15"];
const MEDIA_NODE_WIDTH = 380;
const MEDIA_CONTROLS_WIDTH = MEDIA_NODE_WIDTH * 2; // 760, independent of node width
const MEDIA_CONTROLS_OFFSET = -((MEDIA_CONTROLS_WIDTH - MEDIA_NODE_WIDTH) / 2); // centers panel under node

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
          <span className="rounded-full bg-black/40 px-3 py-1 text-[11px] text-white/70 backdrop-blur-sm">{label}</span>
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
      className="inline-flex flex-shrink-0 items-center justify-center rounded-[2px] border border-white/40"
      style={{ width: w, height: h }}
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
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? value;
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
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/50 transition hover:bg-white/8 hover:text-white/80"
      >
        {current}
        <ChevronDown className="h-3 w-3 opacity-40" />
      </button>
      {open && (
        <div
          className="absolute bottom-full left-0 z-50 mb-1 min-w-[80px] overflow-hidden rounded-xl bg-[#232325] py-1 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false); }}
              className={clsx(
                "flex w-full items-center px-3 py-2 text-left text-xs transition hover:bg-white/8",
                opt.value === value ? "text-white" : "text-white/50",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
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
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs text-white/50 transition hover:bg-white/8 hover:text-white/80"
      >
        <Layers className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-40" />
      </button>
      {open && (
        <div
          className="absolute bottom-full left-0 z-[200] mb-1 w-64 overflow-hidden rounded-2xl bg-[#232325] py-1.5 shadow-2xl ring-1 ring-white/[0.07]"
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(opt.id); setOpen(false); }}
              className={clsx(
                "flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/8",
                opt.id === value && "bg-white/5",
              )}
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/8 text-white/40">
                <Layers className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {opt.isNew && (
                    <span className="rounded-full bg-[#3b82f6] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">新</span>
                  )}
                  <span className="text-sm font-medium text-white/85">{opt.label}</span>
                </div>
                {opt.description && (
                  <p className="mt-0.5 truncate text-[11px] text-white/30">{opt.description}</p>
                )}
              </div>
              {opt.estimatedTime && (
                <span className="flex-shrink-0 text-xs text-white/30">{opt.estimatedTime}</span>
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
  const { patchRuntimeData, models, runImageNode, uploadResource, isConnecting, polishPrompt, focusedNodeId } = useCanvasNodeContext();
  const upstream = data.upstreamInputs ?? EMPTY_UPSTREAM;
  const [isPolishing, setIsPolishing] = useState(false);
  const magnet = useCardMagnet(innerRef);
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
  const lastRunError = typeof (data.runtime.data as Record<string, unknown>).lastRunError === "string"
    ? ((data.runtime.data as Record<string, unknown>).lastRunError as string) : "";
  const isRunning = data.status === "running";
  const currentImageUrl = outputs[0]?.url ?? "";
  const [intrinsicRatio, setIntrinsicRatio] = useState<number | null>(null);
  useEffect(() => { if (!currentImageUrl) setIntrinsicRatio(null); }, [currentImageUrl]);
  const containerHeight = currentImageUrl && intrinsicRatio != null
    ? Math.min(320, Math.round(MEDIA_NODE_WIDTH / intrinsicRatio))
    : 240;

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
    try {
      const resource = await uploadResource(file, { type: "image", name: file.name });
      patchRuntimeData(id, { outputs: [{ url: resource.url }] });
    } catch (error) {
      console.error("[canvas] direct image upload failed", error);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <CardMagnetContext.Provider value={magnet}>
    <div style={{ width: MEDIA_NODE_WIDTH }} className="select-none">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center">
          <ImageIcon className="h-3.5 w-3.5 text-white/50" />
          <span className="ml-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50">图片</span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); directUploadRef.current?.click(); }}
          className={clsx(
            "flex items-center gap-1 rounded-full bg-[#2a2a2c] px-3 py-1 text-[11px] text-white/50 transition hover:bg-white/15 hover:text-white/80",
            !props.selected && "invisible pointer-events-none",
          )}
        >
          <Upload className="h-3 w-3" />
          <span>{outputs[0]?.url ? "替换" : "上传"}</span>
        </button>
      </div>
      {/* inner relative div: handles position relative to card area only (no controls panel) */}
      <div className="relative" ref={innerRef}>
      <MediaHandle side="left" />
      <MediaHandle side="right" />
      <div
        style={{ height: containerHeight }}
        className={clsx(
          "relative overflow-hidden rounded-[20px] bg-[#1c1c1e] border transition-[border,box-shadow]",
          props.selected
            ? "border-white/30 shadow-[0_0_10px_rgba(255,255,255,0.12)]"
            : isConnecting
            ? "border-white/20 hover:border-white/70 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            : "border-white/10 hover:border-white/20",
        )}
      >
        {outputs[0]?.url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={outputs[0].url}
            alt="Generated"
            className="h-full w-full object-contain"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                setIntrinsicRatio(img.naturalWidth / img.naturalHeight);
              }
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-10 w-10 text-white/15" />
          </div>
        )}
        {isRunning && <GeneratingOverlay label="生成中..." />}
        {lastRunError && (
          <div className="absolute inset-x-0 bottom-0 bg-rose-900/80 px-3 py-1 text-[10px] text-rose-200">{lastRunError}</div>
        )}
      </div>
      </div>{/* end inner relative */}
      {props.selected && focusedNodeId === id && (
        <div
          style={{ width: MEDIA_CONTROLS_WIDTH, marginLeft: MEDIA_CONTROLS_OFFSET, height: 190 }}
          className="mt-2 flex flex-col rounded-[20px] bg-[#1e1e20] px-4 pb-3 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center gap-1.5">
            <button type="button"
              onClick={(e) => { e.stopPropagation(); referenceUploadRef.current?.click(); }}
              className={clsx("flex h-8 w-8 items-center justify-center rounded-[10px] transition", (referenceImage || upstream.firstImageUrl) ? "bg-white/15 text-white/70" : "bg-white/8 text-white/40 hover:bg-white/12 hover:text-white/60")}
              title={upstream.firstImageUrl && !referenceImage ? "上游图片将用作参考图" : "添加参考图"}>
              <ImagePlus className="h-4 w-4" />
            </button>
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
              className="flex h-8 items-center gap-1.5 rounded-[10px] bg-white/8 px-2.5 text-white/40 transition hover:bg-white/12 hover:text-white/60 disabled:opacity-40"
              title="AI润色">
              {isPolishing ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">AI润色</span>
            </button>
          </div>
          {isPolishing ? (
            <div className="flex-1 space-y-2.5 py-1 animate-pulse">
              <div className="h-2.5 w-full rounded-full bg-white/20" />
              <div className="h-2.5 w-[62%] rounded-full bg-white/15" />
              <div className="h-2.5 w-[38%] rounded-full bg-white/10" />
            </div>
          ) : (
            <>
              {!prompt && upstream.effectivePrompt && (
                <p className="mb-1 truncate text-[10px] text-white/30">
                  ↑ 上游文本：{upstream.effectivePrompt.slice(0, 60)}{upstream.effectivePrompt.length > 60 ? "…" : ""}
                </p>
              )}
              <textarea
                value={prompt}
                onChange={(event) => patchRuntimeData(id, { prompt: event.target.value })}
                placeholder={upstream.effectivePrompt ? "留空则使用上游文本..." : "描述你想生成的图片..."}
                className="flex-1 w-full resize-none bg-transparent text-sm leading-relaxed text-white placeholder:text-white/30 focus:outline-none"
              />
            </>
          )}
          <div className="flex items-center gap-0.5">
            <ModelPicker
              value={model}
              options={models.imageModels}
              onChange={(v) => patchRuntimeData(id, { model: v })}
            />
            <span className="text-xs text-white/15">·</span>
            <div className="flex items-center gap-1 rounded-lg px-2 py-1">
              <RatioIcon ratio={ratio} />
              <CanvasSelect
                value={ratio}
                options={IMAGE_RATIOS.map((r) => ({ value: r, label: r }))}
                onChange={(v) => patchRuntimeData(id, { ratio: v })}
              />
            </div>
            <span className="text-xs text-white/15">·</span>
            <CanvasSelect
              value={quality}
              options={[{ value: "standard", label: "标准" }, { value: "4k", label: "4K" }]}
              onChange={(v) => patchRuntimeData(id, { quality: v })}
            />
            <button type="button" disabled={isRunning}
              onClick={(e) => { e.stopPropagation(); void runImageNode(id); }}
              className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-black shadow transition hover:bg-white/90 disabled:opacity-40">
              {isRunning ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
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
  );
}

function VideoNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const firstFrameUploadRef = useRef<HTMLInputElement>(null);
  const lastFrameUploadRef = useRef<HTMLInputElement>(null);
  const directUploadRef = useRef<HTMLInputElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const { patchRuntimeData, models, runVideoNode, resources, uploadResource, isConnecting, polishPrompt, focusedNodeId } = useCanvasNodeContext();
  const upstream = data.upstreamInputs ?? EMPTY_UPSTREAM;
  const [isPolishing, setIsPolishing] = useState(false);
  const magnet = useCardMagnet(innerRef);
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
  const [intrinsicRatio, setIntrinsicRatio] = useState<number | null>(null);
  useEffect(() => { if (!outputUrl) setIntrinsicRatio(null); }, [outputUrl]);
  const containerHeight = outputUrl && intrinsicRatio != null
    ? Math.min(320, Math.round(MEDIA_NODE_WIDTH / intrinsicRatio))
    : 240;
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
    try {
      const resource = await uploadResource(file, { type: "video", name: file.name });
      patchRuntimeData(id, { outputUrl: resource.url });
    } catch (error) {
      console.error("[canvas] direct video upload failed", error);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <CardMagnetContext.Provider value={magnet}>
    <div style={{ width: MEDIA_NODE_WIDTH }} className="select-none">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center">
          <Video className="h-3.5 w-3.5 text-white/50" />
          <span className="ml-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50">视频</span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); directUploadRef.current?.click(); }}
          className={clsx(
            "flex items-center gap-1 rounded-full bg-[#2a2a2c] px-3 py-1 text-[11px] text-white/50 transition hover:bg-white/15 hover:text-white/80",
            !props.selected && "invisible pointer-events-none",
          )}
        >
          <Upload className="h-3 w-3" />
          <span>{outputUrl ? "替换" : "上传"}</span>
        </button>
      </div>
      {/* inner relative div: handles position relative to card area only */}
      <div className="relative" ref={innerRef}>
      <MediaHandle side="left" />
      <MediaHandle side="right" />
      <div
        style={{ height: containerHeight }}
        className={clsx(
          "relative overflow-hidden rounded-[20px] bg-[#1c1c1e] border transition-[border,box-shadow]",
          props.selected
            ? "border-white/30 shadow-[0_0_10px_rgba(255,255,255,0.12)]"
            : isConnecting
            ? "border-white/20 hover:border-white/70 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            : "border-white/10 hover:border-white/20",
        )}
      >
        {outputUrl ? (
          <video
            src={outputUrl}
            controls
            className="h-full w-full object-contain"
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
            <Play className="h-10 w-10 text-white/15" />
          </div>
        )}
        {isRunning && <GeneratingOverlay label={`生成中${taskStatus ? ` · ${taskStatus}` : "..."}`} />}
        {statusMessage && !isRunning && (
          <div className={clsx("absolute inset-x-0 bottom-0 px-3 py-1 text-[10px]", data.status === "error" ? "bg-rose-900/80 text-rose-200" : "bg-black/60 text-white/60")}>{statusMessage}</div>
        )}
      </div>
      </div>{/* end inner relative */}
      {props.selected && focusedNodeId === id && (
        <div
          style={{ width: MEDIA_CONTROLS_WIDTH, marginLeft: MEDIA_CONTROLS_OFFSET, height: 190 }}
          className="mt-2 flex flex-col rounded-[20px] bg-[#1e1e20] px-4 pb-3 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center gap-1.5">
            <ResourceHoverPanel resources={imageResources} onSelect={(resource) => patchRuntimeData(id, { firstFrameImage: resource.url })} label="首帧" emptyText="暂无图片">
              <button type="button" onClick={(e) => e.stopPropagation()}
                className={clsx("flex h-8 w-8 items-center justify-center rounded-[10px] transition", (firstFrameImage || upstream.firstImageUrl) ? "bg-white/15 text-white/70" : "bg-white/8 text-white/40 hover:bg-white/12 hover:text-white/60")}
                title={upstream.firstImageUrl && !firstFrameImage ? "上游图片将用作首帧" : "首帧图"}>
                <Play className="h-4 w-4" />
              </button>
            </ResourceHoverPanel>
            <ResourceHoverPanel resources={imageResources} onSelect={(resource) => patchRuntimeData(id, { lastFrameImage: resource.url })} label="尾帧" emptyText="暂无图片">
              <button type="button" onClick={(e) => e.stopPropagation()}
                className={clsx("flex h-8 w-8 items-center justify-center rounded-[10px] transition", lastFrameImage ? "bg-white/15 text-white/70" : "bg-white/8 text-white/40 hover:bg-white/12 hover:text-white/60")}
                title="尾帧图">
                <Clapperboard className="h-4 w-4" />
              </button>
            </ResourceHoverPanel>
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
              className="flex h-8 items-center gap-1.5 rounded-[10px] bg-white/8 px-2.5 text-white/40 transition hover:bg-white/12 hover:text-white/60 disabled:opacity-40"
              title="AI润色">
              {isPolishing ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">AI润色</span>
            </button>
          </div>
          {isPolishing ? (
            <div className="flex-1 space-y-2.5 py-1 animate-pulse">
              <div className="h-2.5 w-full rounded-full bg-white/20" />
              <div className="h-2.5 w-[62%] rounded-full bg-white/15" />
              <div className="h-2.5 w-[38%] rounded-full bg-white/10" />
            </div>
          ) : (
            <>
              {!prompt && upstream.effectivePrompt && (
                <p className="mb-1 truncate text-[10px] text-white/30">
                  ↑ 上游文本：{upstream.effectivePrompt.slice(0, 60)}{upstream.effectivePrompt.length > 60 ? "…" : ""}
                </p>
              )}
              <textarea
                value={prompt}
                onChange={(event) => patchRuntimeData(id, { prompt: event.target.value })}
                placeholder={upstream.effectivePrompt ? "留空则使用上游文本..." : "描述你想生成的视频..."}
                className="flex-1 w-full resize-none bg-transparent text-sm leading-relaxed text-white placeholder:text-white/30 focus:outline-none"
              />
            </>
          )}
          <div className="flex items-center gap-0.5">
            <ModelPicker
              value={model}
              options={models.videoModels}
              onChange={(v) => patchRuntimeData(id, { model: v })}
            />
            <span className="text-xs text-white/15">·</span>
            <div className="flex items-center gap-1 rounded-lg px-2 py-1">
              <RatioIcon ratio={ratio} />
              <CanvasSelect
                value={ratio}
                options={IMAGE_RATIOS.map((r) => ({ value: r, label: r }))}
                onChange={(v) => patchRuntimeData(id, { ratio: v })}
              />
            </div>
            <span className="text-xs text-white/15">·</span>
            {allowedDurations.length > 0 ? (
              allowedDurations.length === 1 ? (
                <span className="px-2 text-xs text-white/40">{allowedDurations[0]}s</span>
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
              className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-black shadow transition hover:bg-white/90 disabled:opacity-40">
              {isRunning ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
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
  );
}

function AudioNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const innerRef = useRef<HTMLDivElement>(null);
  const voiceUploadRef = useRef<HTMLInputElement>(null);
  const directUploadRef = useRef<HTMLInputElement>(null);
  const magnet = useCardMagnet(innerRef);
  const upstream = data.upstreamInputs ?? EMPTY_UPSTREAM;
  const { patchRuntimeData, models, runAudioNode, resources, uploadResource, isConnecting, polishPrompt, focusedNodeId } = useCanvasNodeContext();
  const [isPolishing, setIsPolishing] = useState(false);
  const script = typeof data.runtime.data.script === "string" ? data.runtime.data.script : "";
  const voiceRef = typeof data.runtime.data.voiceReference === "string" ? data.runtime.data.voiceReference : "";
  const model = (typeof data.runtime.data.model === "string" && data.runtime.data.model) || models.defaultModels.audio?.id || models.audioModels[0]?.id || "";
  const isSunoMusic = model === "suno_music";
  const isSunoLyrics = model === "suno_lyrics";
  const isSuno = isSunoMusic || isSunoLyrics;
  const audioUrl =
    typeof (data.runtime.data as Record<string, unknown>).audioUrl === "string"
      ? ((data.runtime.data as Record<string, unknown>).audioUrl as string)
      : "";
  const lastRunError =
    typeof (data.runtime.data as Record<string, unknown>).lastRunError === "string"
      ? ((data.runtime.data as Record<string, unknown>).lastRunError as string)
      : "";
  const isRunning = data.status === "running";
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

  const handleDirectUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resource = await uploadResource(file, { type: "audio", name: file.name });
      patchRuntimeData(id, { audioUrl: resource.url });
    } catch (error) {
      console.error("[canvas] direct audio upload failed", error);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <CardMagnetContext.Provider value={magnet}>
    <div style={{ width: MEDIA_NODE_WIDTH }} className="select-none">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center">
          <Music className="h-3.5 w-3.5 text-white/50" />
          <span className="ml-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50">音频</span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); directUploadRef.current?.click(); }}
          className={clsx(
            "flex items-center gap-1 rounded-full bg-[#2a2a2c] px-3 py-1 text-[11px] text-white/50 transition hover:bg-white/15 hover:text-white/80",
            !props.selected && "invisible pointer-events-none",
          )}
        >
          <Upload className="h-3 w-3" />
          <span>{audioUrl ? "替换" : "上传"}</span>
        </button>
      </div>
      <div className="relative" ref={innerRef}>
        <MediaHandle side="left" />
        <MediaHandle side="right" />
        <div
          style={{ height: 240 }}
          className={clsx(
            "relative overflow-hidden rounded-[20px] bg-[#1c1c1e] border transition",
            props.selected
              ? "border-white/30 shadow-[0_0_10px_rgba(255,255,255,0.12)]"
              : isConnecting
              ? "border-white/20 hover:border-white/70 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
              : "border-white/10 hover:border-white/20",
          )}
        >
          {audioUrl ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4">
              <audio controls className="w-full" src={audioUrl} />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music className="h-10 w-10 text-white/15" />
            </div>
          )}
          {isRunning && <GeneratingOverlay label="生成中..." />}
          {lastRunError && !isRunning && (
            <div className="absolute inset-x-0 bottom-0 bg-rose-900/80 px-3 py-1 text-[10px] text-rose-200">{lastRunError}</div>
          )}
        </div>
      </div>
      {props.selected && focusedNodeId === id && (
        <div
          style={{ width: MEDIA_CONTROLS_WIDTH, marginLeft: MEDIA_CONTROLS_OFFSET, height: 190 }}
          className="mt-2 flex flex-col rounded-[20px] bg-[#1e1e20] px-4 pb-3 pt-3"
          onClick={(e) => e.stopPropagation()}
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
                className="flex h-8 items-center gap-1.5 rounded-[10px] bg-white/8 px-2.5 text-white/40 transition hover:bg-white/12 hover:text-white/60 disabled:opacity-40"
                title="AI润色">
                {isPolishing ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span className="text-xs">AI润色</span>
              </button>
            </div>
          ) : isSunoMusic ? (
            <div className="mb-2 grid grid-cols-2 gap-1.5">
              <input
                type="text"
                placeholder="歌曲标题（可选）"
                value={typeof data.runtime.data.title === "string" ? data.runtime.data.title : ""}
                onChange={(e) => patchRuntimeData(id, { title: e.target.value })}
                className="col-span-2 h-7 rounded-[8px] bg-white/8 px-2 text-xs text-white/70 placeholder:text-white/30 focus:outline-none"
              />
              <input
                type="text"
                placeholder="风格标签（可选）"
                value={typeof data.runtime.data.tags === "string" ? data.runtime.data.tags : ""}
                onChange={(e) => patchRuntimeData(id, { tags: e.target.value })}
                className="h-7 rounded-[8px] bg-white/8 px-2 text-xs text-white/70 placeholder:text-white/30 focus:outline-none"
              />
              <label className="flex h-7 cursor-pointer items-center gap-2 rounded-[8px] bg-white/8 px-2">
                <input
                  type="checkbox"
                  checked={Boolean(data.runtime.data.make_instrumental)}
                  onChange={(e) => patchRuntimeData(id, { make_instrumental: e.target.checked })}
                  className="accent-white"
                />
                <span className="text-xs text-white/50">纯音乐</span>
              </label>
            </div>
          ) : (
            <div className="mb-2 flex items-center gap-1.5">
              <ResourceHoverPanel resources={audioResources} onSelect={(resource) => patchRuntimeData(id, { voiceReference: resource.url })} label="音色库" emptyText="暂无音色资源，可上传音频">
                <button type="button" onClick={(e) => e.stopPropagation()}
                  className={clsx("flex h-8 w-8 items-center justify-center rounded-[10px] transition", voiceRef ? "bg-white/15 text-white/70" : "bg-white/8 text-white/40 hover:bg-white/12 hover:text-white/60")}
                  title="选择音色">
                  <Music className="h-4 w-4" />
                </button>
              </ResourceHoverPanel>
              <button type="button" onClick={(e) => { e.stopPropagation(); voiceUploadRef.current?.click(); }}
                className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/8 text-white/40 transition hover:bg-white/12 hover:text-white/60"
                title="上传音色">
                <Upload className="h-4 w-4" />
              </button>
              <button type="button" disabled={isPolishing || !script.trim()}
                onClick={async (e) => {
                  e.stopPropagation();
                  setIsPolishing(true);
                  try {
                    const polished = await polishPrompt(script);
                    patchRuntimeData(id, { script: polished });
                  } catch { /* silently fail */ } finally { setIsPolishing(false); }
                }}
                className="flex h-8 items-center gap-1.5 rounded-[10px] bg-white/8 px-2.5 text-white/40 transition hover:bg-white/12 hover:text-white/60 disabled:opacity-40"
                title="AI润色">
                {isPolishing ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span className="text-xs">AI润色</span>
              </button>
            </div>
          )}
          {/* Text area */}
          {isPolishing ? (
            <div className="flex-1 space-y-2.5 py-1 animate-pulse">
              <div className="h-2.5 w-full rounded-full bg-white/20" />
              <div className="h-2.5 w-[62%] rounded-full bg-white/15" />
              <div className="h-2.5 w-[38%] rounded-full bg-white/10" />
            </div>
          ) : (
            <>
              {!script && upstream.effectivePrompt && (
                <p className="mb-1 truncate text-[10px] text-white/30">
                  ↑ 上游文本：{upstream.effectivePrompt.slice(0, 60)}{upstream.effectivePrompt.length > 60 ? "…" : ""}
                </p>
              )}
              <textarea
                value={script}
                onChange={(event) => patchRuntimeData(id, { script: event.target.value })}
                placeholder={
                  isSunoLyrics ? "输入歌词主题，点击生成歌词..." :
                  isSunoMusic ? (upstream.effectivePrompt ? "留空则使用上游文本..." : "描述你想创作的音乐风格、情感...") :
                  (upstream.effectivePrompt ? "留空则使用上游文本..." : "口播文本，描述你想生成的语音内容...")
                }
                className="flex-1 w-full resize-none bg-transparent text-sm leading-relaxed text-white placeholder:text-white/30 focus:outline-none"
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
              className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-black shadow transition hover:bg-white/90 disabled:opacity-40">
              {isRunning ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}
      <input ref={voiceUploadRef} type="file" accept="audio/*" className="hidden" onChange={handleUploadVoice} />
      <input ref={directUploadRef} type="file" accept="audio/*" className="hidden" onChange={handleDirectUpload} />
    </div>
    </CardMagnetContext.Provider>
  );
}

function DigitalHumanNodeCard(props: NodeProps<Node<MinimalFlowNodeData>>) {
  const { data, id } = props;
  const { patchRuntimeData, models, runDigitalHumanNode, resources, uploadResource, isConnecting, polishPrompt, focusedNodeId } = useCanvasNodeContext();
  const innerRef = useRef<HTMLDivElement>(null);
  const magnet = useCardMagnet(innerRef);
  const upstream = data.upstreamInputs ?? EMPTY_UPSTREAM;
  const [isPolishing, setIsPolishing] = useState(false);
  const voiceUploadRef = useRef<HTMLInputElement>(null);
  const avatarUploadRef = useRef<HTMLInputElement>(null);
  const script = typeof data.runtime.data.script === "string" ? data.runtime.data.script : "";
  const voiceReference = typeof data.runtime.data.voiceReference === "string" ? data.runtime.data.voiceReference : "";
  const avatarImage = typeof data.runtime.data.avatarImage === "string" ? data.runtime.data.avatarImage : "";
  const model = (typeof data.runtime.data.model === "string" && data.runtime.data.model) || models.digitalHumanModels[0]?.id || "";
  const ratio = (typeof data.runtime.data.ratio === "string" && data.runtime.data.ratio) || "auto";
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
    <CardMagnetContext.Provider value={magnet}>
    <div style={{ width: MEDIA_NODE_WIDTH }} className="select-none">
      <div className="mb-1.5 flex items-center px-1">
        <UserCircle2 className="h-3.5 w-3.5 text-white/50" />
        <span className="ml-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50">数字人</span>
      </div>
      <div className="relative" ref={innerRef}>
        <MediaHandle side="left" />
        <MediaHandle side="right" />
        <div
          style={{ height: 240 }}
          className={clsx(
            "relative overflow-hidden rounded-[20px] bg-[#1c1c1e] border transition",
            props.selected
              ? "border-white/30 shadow-[0_0_10px_rgba(255,255,255,0.12)]"
              : isConnecting
              ? "border-white/20 hover:border-white/70 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
              : "border-white/10 hover:border-white/20",
          )}
        >
          {outputUrl ? (
            <video src={outputUrl} controls className="h-full w-full object-cover" preload="metadata" />
          ) : avatarImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={avatarImage} alt="Avatar" className="h-full w-full object-cover opacity-60" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <UserCircle2 className="h-10 w-10 text-white/15" />
            </div>
          )}
          {isRunning && <GeneratingOverlay label={`生成中${dhStatus ? ` · ${dhStatus}` : "..."}`} />}
          {lastRunError && !isRunning && (
            <div className="absolute inset-x-0 bottom-0 bg-rose-900/80 px-3 py-1 text-[10px] text-rose-200">{lastRunError}</div>
          )}
        </div>
      </div>
      {props.selected && focusedNodeId === id && (
        <div
          style={{ width: MEDIA_CONTROLS_WIDTH, marginLeft: MEDIA_CONTROLS_OFFSET, height: 190 }}
          className="mt-2 flex flex-col rounded-[20px] bg-[#1e1e20] px-4 pb-3 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center gap-1.5">
            <ResourceHoverPanel resources={imageResources} onSelect={(resource) => patchRuntimeData(id, { avatarImage: resource.url })} label="形象库" emptyText="暂无形象图片">
              <button type="button" onClick={(e) => e.stopPropagation()}
                className={clsx("flex h-8 w-8 items-center justify-center rounded-[10px] transition", (avatarImage || upstream.firstImageUrl) ? "bg-white/15 text-white/70" : "bg-white/8 text-white/40 hover:bg-white/12 hover:text-white/60")}
                title={upstream.firstImageUrl && !avatarImage ? "上游图片将用作形象" : "选择形象"}>
                <ImagePlus className="h-4 w-4" />
              </button>
            </ResourceHoverPanel>
            <ResourceHoverPanel resources={audioResources} onSelect={(resource) => patchRuntimeData(id, { voiceReference: resource.url })} label="音色库" emptyText="暂无音色资源">
              <button type="button" onClick={(e) => e.stopPropagation()}
                className={clsx("flex h-8 w-8 items-center justify-center rounded-[10px] transition", (voiceReference || upstream.firstAudioUrl) ? "bg-white/15 text-white/70" : "bg-white/8 text-white/40 hover:bg-white/12 hover:text-white/60")}
                title={upstream.firstAudioUrl && !voiceReference ? "上游音频将用作音色" : "选择音色"}>
                <Music className="h-4 w-4" />
              </button>
            </ResourceHoverPanel>
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
              className="flex h-8 items-center gap-1.5 rounded-[10px] bg-white/8 px-2.5 text-white/40 transition hover:bg-white/12 hover:text-white/60 disabled:opacity-40"
              title="AI润色">
              {isPolishing ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">AI润色</span>
            </button>
          </div>
          {isPolishing ? (
            <div className="flex-1 space-y-2.5 py-1 animate-pulse">
              <div className="h-2.5 w-full rounded-full bg-white/20" />
              <div className="h-2.5 w-[62%] rounded-full bg-white/15" />
              <div className="h-2.5 w-[38%] rounded-full bg-white/10" />
            </div>
          ) : (
            <>
              {!script && upstream.effectivePrompt && (
                <p className="mb-1 truncate text-[10px] text-white/30">
                  ↑ 上游文本：{upstream.effectivePrompt.slice(0, 60)}{upstream.effectivePrompt.length > 60 ? "…" : ""}
                </p>
              )}
              <textarea
                value={script}
                onChange={(event) => patchRuntimeData(id, { script: event.target.value })}
                placeholder={upstream.effectivePrompt ? "留空则使用上游文本..." : "描述任何你想要生成的内容，口播文案或形象描述..."}
                className="flex-1 w-full resize-none bg-transparent text-sm leading-relaxed text-white placeholder:text-white/30 focus:outline-none"
              />
            </>
          )}
          <div className="flex items-center gap-1.5">
            <select value={model} onChange={(e) => patchRuntimeData(id, { model: e.target.value })} onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 appearance-none truncate bg-transparent text-xs text-white/50 focus:outline-none">
              {models.digitalHumanModels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <span className="text-xs text-white/20">·</span>
            <select value={ratio} onChange={(e) => patchRuntimeData(id, { ratio: e.target.value })} onClick={(e) => e.stopPropagation()}
              className="appearance-none bg-transparent text-xs text-white/50 focus:outline-none">
              <option value="auto">自适应</option>
              {IMAGE_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button type="button" disabled={isRunning}
              onClick={(e) => { e.stopPropagation(); void runDigitalHumanNode(id); }}
              className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-black shadow transition hover:bg-white/90 disabled:opacity-40">
              {isRunning ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}
      <input ref={voiceUploadRef} type="file" accept="audio/*" className="hidden" onChange={handleVoiceUpload} />
      <input ref={avatarUploadRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
    </div>
    </CardMagnetContext.Provider>
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
  const upstream = data.upstreamInputs ?? EMPTY_UPSTREAM;
  const videoUploadRef = useRef<HTMLInputElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const magnet = useCardMagnet(innerRef);
  const [intrinsicRatio, setIntrinsicRatio] = useState(16 / 9);

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

  const previewHeight = Math.round(SB_NODE_WIDTH / intrinsicRatio);

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
    <CardMagnetContext.Provider value={magnet}>
    <div style={{ width: SB_NODE_WIDTH }} className="select-none">
      {/* Header */}
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <Clapperboard className="h-3.5 w-3.5 text-white/50" />
        <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">分镜板</span>
        {hasSegments && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">
            {sbSegments.length} 镜头
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="relative" ref={innerRef}>
        <MediaHandle side="left" />
        <MediaHandle side="right" />
        <div
          className={clsx(
            "overflow-hidden rounded-[20px] border bg-[#111113] transition",
            props.selected
              ? "border-white/30 shadow-[0_0_10px_rgba(255,255,255,0.12)]"
              : isConnecting
              ? "border-white/20 hover:border-white/70 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
              : "border-white/10 hover:border-white/20",
          )}
        >
          {/* Video preview — 16:9 default, follows intrinsic ratio after load */}
          <div style={{ height: previewHeight }} className="relative overflow-hidden bg-[#0c0c0e]">
            {effectiveVideoUrl ? (
              <video
                src={effectiveVideoUrl}
                controls
                className="h-full w-full object-contain"
                preload="metadata"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v.videoWidth && v.videoHeight) {
                    setIntrinsicRatio(v.videoWidth / v.videoHeight);
                  }
                }}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/20">
                <Clapperboard className="h-10 w-10" />
                <p className="text-xs">上传或引用上游视频</p>
              </div>
            )}
            {isRunning && <GeneratingOverlay label={`拆解中${sbStatus ? ` · ${sbStatus}` : "..."}`} />}
            {!ownVideoUrl && upstream.firstVideoUrl && (
              <div className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/50 backdrop-blur-sm">
                ↑ 上游视频
              </div>
            )}
          </div>

          {/* Progress bar */}
          {isRunning && (
            <div className="h-0.5 bg-white/5">
              <div
                className="h-full bg-white/40 transition-all duration-500"
                style={{ width: `${Math.max(5, sbProgress)}%` }}
              />
            </div>
          )}

          {/* Controls row */}
          <div className="flex items-center gap-2 border-t border-white/[0.06] px-4 py-3">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); videoUploadRef.current?.click(); }}
              className="flex-shrink-0 rounded-lg bg-white/10 px-2 py-1 text-[10px] text-white/60 transition hover:bg-white/20"
            >
              上传视频
            </button>
            {ownVideoUrl && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); patchRuntimeData(id, { videoUrl: "" }); setIntrinsicRatio(16 / 9); }}
                className="flex-shrink-0 rounded-lg bg-white/5 px-2 py-1 text-[10px] text-white/30 transition hover:bg-white/10"
              >
                清除
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              disabled={isRunning || !effectiveVideoUrl}
              onClick={(e) => { e.stopPropagation(); void runStoryboardNode(id); }}
              className="flex-shrink-0 rounded-lg bg-white/15 px-3 py-1 text-[10px] font-medium text-white transition hover:bg-white/25 disabled:opacity-40"
            >
              {isRunning ? "拆解中..." : "一键复刻"}
            </button>
          </div>

          {/* Error */}
          {lastRunError && !isRunning && (
            <div className="border-t border-white/[0.06] px-4 py-2 text-[11px] text-rose-300">{lastRunError}</div>
          )}

          {/* Segment rows */}
          {hasSegments && (
            <div className="max-h-[520px] divide-y divide-white/[0.04] overflow-y-auto border-t border-white/[0.06]">
              <div className="grid grid-cols-[32px_1fr_88px] gap-3 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-white/30">
                <span>#</span>
                <span>描述</span>
                <span>图片</span>
              </div>
              {sbSegments.map((seg) => (
                <div key={seg.id} className="grid grid-cols-[32px_1fr_88px] items-start gap-3 px-4 py-3">
                  <div className="pt-0.5 text-xs font-semibold text-white/50">{seg.order}</div>
                  <div className="space-y-1 text-[11px] leading-relaxed text-white/70">
                    {seg.visualDescription && <p className="text-white/80">{seg.visualDescription}</p>}
                    {seg.cameraNotes && (
                      <p className="text-white/40"><span className="mr-1 text-white/25">镜头</span>{seg.cameraNotes}</p>
                    )}
                    {seg.originalScript && (
                      <p className="rounded-lg bg-white/[0.04] px-2 py-1 text-white/50 italic">{seg.originalScript}</p>
                    )}
                    {seg.timeRange && <p className="text-white/30">{seg.timeRange}</p>}
                  </div>
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
        </div>
      </div>

      <input ref={videoUploadRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
    </div>
    </CardMagnetContext.Provider>
  );
}

const PHANTOM_NODE_ID = "__connector_phantom__";
const PHANTOM_EDGE_ID = "__connector_edge__";

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
  phantom: PhantomNode,
};

const NODE_PICKER_ITEMS = [
  { type: "text", icon: AlignLeft, label: "文本生成", desc: "脚本、广告词、品牌文案" },
  { type: "image", icon: ImageIcon, label: "图片生成", desc: "AI 文生图、风格创作" },
  { type: "video", icon: Video, label: "视频生成", desc: "AI 文生视频、Sora / Veo" },
  { type: "audio", icon: Music, label: "音频", desc: "AI 音乐与语音合成" },
  { type: "digitalhuman", icon: UserCircle2, label: "数字人", desc: "AI 数字人视频生成" },
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
          active ? "bg-white/10 text-white/60" :
          "text-white/50 hover:bg-white/10 hover:text-white",
        )}
      >
        <Icon className={highlight && !active ? "h-4.5 w-4.5" : "h-4 w-4"} />
      </button>
      {show && (
        <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#2a2a2c] px-3 py-1.5 text-xs font-medium text-white shadow-lg">
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
}: {
  screenX: number;
  screenY: number;
  sourceNodeId: string | null;
  sourceNodeType?: string | null;
  onPick: (type: string) => void;
  onDismiss: () => void;
  onUpload?: () => void;
}) {
  const [hoveredType, setHoveredType] = useState<string | null>(null);
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
          {NODE_PICKER_ITEMS.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => onPick(item.type)}
              onMouseEnter={() => setHoveredType(item.type)}
              onMouseLeave={() => setHoveredType(null)}
              className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition active:scale-[0.98] ${hoveredType === item.type ? "bg-white/[0.07]" : ""}`}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-white/10">
                <item.icon className="h-5 w-5 text-white/80" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-white">{item.label}</div>
                {item.desc && (
                  <div className={`overflow-hidden text-xs transition-all duration-150 ${hoveredType === item.type ? "text-white/50" : "text-white/0"}`}>
                    {item.desc}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
        {onUpload && (
          <>
            <div className="my-2 h-px bg-white/[0.06]" />
            <button
              type="button"
              onClick={() => { onUpload(); onDismiss(); }}
              className="flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition hover:bg-white/[0.07] active:scale-[0.98]"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-white/10">
                <Upload className="h-5 w-5 text-white/80" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-white">上传图片或视频</div>
                <div className="text-xs text-white/40">自动创建节点到画布</div>
              </div>
            </button>
          </>
        )}
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
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={8}
          strokeLinecap="round"
        />
      )}
      {/* Flash burst on light-up */}
      {flashing && (
        <path
          d={edgePath}
          fill="none"
          stroke="rgba(255,255,255,0.2)"
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
          stroke="rgba(255,255,255,0.5)"
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
          stroke: isHighlighted ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.22)",
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
  const { basePath } = useTenant();

  const [nodes, setNodes] = useState<Node<MinimalFlowNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [viewportKey, setViewportKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [creditsLabel, setCreditsLabel] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [avatarInitial, setAvatarInitial] = useState<string>("?");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isPolishing, setIsPolishing] = useState(false);
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [showBackground, setShowBackground] = useState(true);
  type ChatAttachment = { id: string; localUrl: string; type: "image" | "video"; name: string };
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [nodePicker, setNodePicker] = useState<{
    screenX: number;
    screenY: number;
    sourceNodeId: string | null;
    sourceNodeType: string | null;
  } | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
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
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);
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

  const nodeContextValue = useMemo(
    () => ({
      toggleExpanded,
      patchRuntimeData,
      focusNode,
      focusedNodeId,
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
      polishPrompt,
    }),
    [
      toggleExpanded,
      patchRuntimeData,
      focusNode,
      focusedNodeId,
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
      polishPrompt,
    ],
  );

  // Inject live upstream inputs into every node's data.
  // Recomputes whenever any node data changes OR any edge is added/removed,
  // giving each node card an always-fresh view of what its upstream provides.
  const nodesWithUpstream = useMemo<Node<MinimalFlowNodeData>[]>(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          upstreamInputs: resolveUpstreamInputs(node.id, nodes, edges),
        },
      })),
    [nodes, edges],
  );

  useEffect(() => {
    setFocusedNodeId(null);
  }, [currentProjectId]);

  useEffect(() => {
    if (!currentProject) {
      lastHydratedRef.current = null;
      return;
    }
    const last = lastHydratedRef.current;
    const hasData = !!currentProject.canvasData;
    // Skip re-hydrate if same project AND (already loaded with data, OR data still hasn't arrived).
    // This prevents auto-save from resetting canvas by updating currentProject reference.
    if (last?.projectId === currentProject.id && (last.hasData || !hasData)) return;
    lastHydratedRef.current = { projectId: currentProject.id, hasData };
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
    (event: MouseEvent | TouchEvent, connectionState: { isValid: boolean | null; fromHandle?: { nodeId?: string } | null; fromNode?: { id?: string } | null }) => {
      setIsConnecting(false);
      if (!connectionState.isValid) {
        const clientX = "clientX" in event ? event.clientX : (event as TouchEvent).changedTouches?.[0]?.clientX ?? 0;
        const clientY = "clientY" in event ? event.clientY : (event as TouchEvent).changedTouches?.[0]?.clientY ?? 0;
        const sourceNodeId = connectionState.fromHandle?.nodeId ?? connectionState.fromNode?.id ?? null;
        const sourceNode = sourceNodeId ? nodesRef.current.find((n) => n.id === sourceNodeId) : null;

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

  // Auto-resize chat textarea
  useEffect(() => {
    const el = chatTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [chatInput]);

  const handleChatSend = useCallback(
    (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;
      // Place new nodes below the lowest existing node
      const existingNodes = nodesRef.current;
      let baseY = 100;
      if (existingNodes.length > 0) {
        baseY = Math.max(...existingNodes.map((n) => n.position.y + 300));
      }
      // Center horizontally in viewport
      const vp = rfInstanceRef.current;
      let baseX = 100;
      if (vp && typeof window !== "undefined") {
        const center = vp.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        baseX = Math.max(center.x - 200, 50);
      }
      const textId = `text_${Math.random().toString(36).slice(2, 8)}`;
      const imageId = `image_${Math.random().toString(36).slice(2, 8)}`;
      setNodes((prev) => [
        ...prev,
        {
          id: textId,
          type: "text",
          position: { x: baseX, y: baseY },
          data: {
            runtime: { id: textId, type: "text", position: { x: baseX, y: baseY }, data: { content: trimmed } },
            summary: trimmed.slice(0, 60),
            status: "idle" as const,
            expanded: true,
          },
        },
        {
          id: imageId,
          type: "image",
          position: { x: baseX + 500, y: baseY },
          data: {
            runtime: {
              id: imageId, type: "image", position: { x: baseX + 500, y: baseY },
              data: {
                prompt: trimmed,
                ratio: "16:9",
                ...(chatAttachments.find((a) => a.type === "image")
                  ? { referenceImage: chatAttachments.find((a) => a.type === "image")!.localUrl }
                  : {}),
              },
            },
            summary: "",
            status: "idle" as const,
            expanded: false,
          },
        },
      ]);
      setEdges((prev) =>
        addEdge({ id: `e_${textId}_${imageId}`, source: textId, target: imageId, type: "smoothstep" }, prev),
      );
      setChatInput("");
      setChatAttachments([]);
    },
    [chatAttachments, setNodes, setEdges],
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

  const handleOpenAgentFromToolbar = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("canvas-agent:open", {
          detail: { projectId: currentProjectId, nodeId: null },
        }),
      );
    }
  }, [currentProjectId]);

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

  // Back button: flush-save then clear the selected project.
  // The URL-sync effect below will then call router.replace('?view=projects').
  const handleBackToList = useCallback(async () => {
    if (currentProjectId) {
      try {
        await saveProjectCanvas(currentProjectId, {
          nodes: flowNodesToRuntime(nodesRef.current),
          edges: flowEdgesToRuntime(edgesRef.current),
          viewport: viewportRef.current,
          resources,
        });
      } catch {
        // best-effort; navigate regardless
      }
    }
    selectProject(null);
  }, [currentProjectId, saveProjectCanvas, resources, selectProject]);

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
        // Optimistically add node at drop position while upload happens
        const placeholderNode: Node<MinimalFlowNodeData> = {
          id: newId,
          type: nodeType,
          position: flowPos,
          data: {
            runtime: { id: newId, type: nodeType, position: flowPos, data: { label: isImage ? "图片" : "视频", uploading: true } },
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
                ? { label: "图片", outputs: [{ url: resource.url }] }
                : { label: "视频", outputUrl: resource.url };
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
        const t = makeNode("text",       -320, 0, { label: "文本输入", content: "", placeholder: "输入数字人台词..." });
        const d = makeNode("digitalhuman", 280, 0, { label: "数字人" });
        newNodes = [t, d];
        newEdges = [edge(t, d)];
      } else if (tpl === "viral") {
        const v = makeNode("video",      -320, 0, { label: "参考视频" });
        const s = makeNode("storyboard",  280, 0, { label: "爆款复刻" });
        newNodes = [v, s];
        newEdges = [edge(v, s)];
      }

      setNodes(newNodes);
      setEdges(newEdges);
      // Fit into view after render
      setTimeout(() => {
        rfInstanceRef.current?.fitView({ padding: 0.35, duration: 500, maxZoom: 0.7 });
      }, 50);
    },
    [],
  );

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
        const placeholderNode: Node<MinimalFlowNodeData> = {
          id: newId, type: nodeType, position: center,
          data: {
            runtime: { id: newId, type: nodeType, position: center, data: { label: isImage ? "图片" : "视频", uploading: true } },
            summary: "上传中...", status: "running", expanded: false,
          },
        };
        setNodes((prev) => [...prev, placeholderNode]);
        try {
          const resource = await uploadResource(file, { type: isImage ? "image" : "video", name: file.name });
          setNodes((prev) => prev.map((n) => {
            if (n.id !== newId) return n;
            const d = isImage ? { label: "图片", outputs: [{ url: resource.url }] } : { label: "视频", outputUrl: resource.url };
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
    <>
    <style>{`
      @keyframes edge-flash {
        0%   { stroke-opacity: 0.35; stroke-width: 3; }
        30%  { stroke-opacity: 0.2;  stroke-width: 5; }
        100% { stroke-opacity: 0;    stroke-width: 2; }
      }
    `}</style>
    <div
      className="flex h-full flex-col bg-[#05060c] text-white"
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
          if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
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
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1e1e20]/80 backdrop-blur transition hover:bg-white/10"
                title="返回项目列表"
              >
                <ArrowLeft className="h-4 w-4 text-white/70" />
              </button>
              {currentProject?.name && (
                <span className="rounded-full bg-[#1e1e20]/80 px-3 py-1.5 text-sm font-medium text-white/80 backdrop-blur">
                  {currentProject.name}
                </span>
              )}
            </div>
            {/* Right: credits pill + avatar */}
            <div className="pointer-events-auto flex items-center gap-2">
              {creditsLabel != null && (
                <div className="flex items-center gap-1.5 rounded-full bg-[#1e1e20]/80 px-3 py-1.5 text-sm text-white/80 backdrop-blur">
                  <Zap className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  <span>{creditsLabel}</span>
                </div>
              )}
              {/* Avatar */}
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#2a2a2c]">
                {avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-white/70">{avatarInitial}</span>
                )}
              </div>
            </div>
          </div>
        )}
        <CanvasNodeContext.Provider value={nodeContextValue}>
          {/* Drag-over overlay */}
          {isDragOver && (
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-4 rounded-[28px] border-2 border-dashed border-white/40 bg-white/[0.04] backdrop-blur-sm" />
              <div className="relative flex flex-col items-center gap-2 text-white/60">
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
                <div className="flex items-center gap-2 rounded-full bg-[#1e1e20] px-4 py-2 text-sm font-medium text-white shadow-lg">
                  <MousePointer2 className="h-4 w-4 text-blue-400" />
                  <span>双击</span>
                </div>
                <span className="text-sm text-white/50">画布自由生成，或选择快捷模板</span>
              </div>
              {/* Quick-start buttons */}
              <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
                {([
                  { tpl: "text-to-image",        icon: ImageIcon,    label: "文生图" },
                  { tpl: "text-to-video",         icon: Video,        label: "文生视频" },
                  { tpl: "image-to-video",        icon: Play,         label: "图生视频" },
                  { tpl: "text-to-digitalhuman",  icon: UserCircle2,  label: "文字转数字人" },
                  { tpl: "viral",                 icon: Clapperboard, label: "爆款复刻" },
                ] as const).map(({ tpl, icon: Icon, label }) => (
                  <button
                    key={tpl}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className="flex items-center gap-2 rounded-[14px] border border-white/10 bg-[#1e1e20] px-4 py-2.5 text-sm text-white/70 shadow-lg transition hover:border-white/25 hover:bg-white/10 hover:text-white active:scale-[0.97]"
                  >
                    <Icon className="h-4 w-4 text-white/50" />
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
            className="bg-transparent text-white"
            panOnDrag={isSpaceDown ? [0] : [1, 2]}
            panOnScroll={false}
            selectionOnDrag={!isSpaceDown}
            selectionMode={SelectionMode.Partial}
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
          >
            <Background color="rgba(255,255,255,0.08)" variant={BackgroundVariant.Dots} style={{ display: showBackground ? undefined : "none" }} />
          </ReactFlow>
        </CanvasNodeContext.Provider>
        {/* Left floating toolbar */}
        <div
          className="pointer-events-none absolute left-4 top-1/2 z-20 -translate-y-1/2 flex items-center"
          onMouseLeave={() => setIsAddPanelOpen(false)}
        >
          {/* Toolbar pill — no border */}
          <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-[20px] bg-[#1e1e20] px-2 py-3 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
            {/* + toggle */}
            <ToolbarBtn
              icon={isAddPanelOpen ? X : Plus}
              label={isAddPanelOpen ? "关闭" : "添加节点"}
              active={isAddPanelOpen}
              onMouseEnter={() => setIsAddPanelOpen(true)}
              onClick={() => setIsAddPanelOpen((v) => !v)}
              highlight
            />
            <div className="my-1 h-px w-6 bg-white/10" />
            {/* Quick templates */}
            <ToolbarBtn icon={ImageIcon}    label="文生图"       onClick={() => { handleApplyTemplate("text-to-image");        setIsAddPanelOpen(false); }} />
            <ToolbarBtn icon={Video}        label="文生视频"     onClick={() => { handleApplyTemplate("text-to-video");        setIsAddPanelOpen(false); }} />
            <ToolbarBtn icon={Play}         label="图生视频"     onClick={() => { handleApplyTemplate("image-to-video");       setIsAddPanelOpen(false); }} />
            <ToolbarBtn icon={UserCircle2}  label="文字转数字人" onClick={() => { handleApplyTemplate("text-to-digitalhuman"); setIsAddPanelOpen(false); }} />
            <ToolbarBtn icon={Clapperboard} label="爆款复刻"     onClick={() => { handleApplyTemplate("viral");               setIsAddPanelOpen(false); }} />
            <div className="my-1 h-px w-6 bg-white/10" />
            {/* Upload — always at bottom */}
            <ToolbarBtn icon={Upload} label="上传图片/视频" onClick={() => toolbarUploadRef.current?.click()} />
          </div>

          {/* Inline add-node panel */}
          {isAddPanelOpen && (
            <div className="pointer-events-auto ml-2 w-[280px] overflow-hidden rounded-[20px] bg-[#1a1a1c] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
              <p className="mb-2 px-2 text-sm text-white/40">添加节点</p>
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
                  className="group flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition hover:bg-white/[0.07] active:scale-[0.98]"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-white/10">
                    <item.icon className="h-5 w-5 text-white/80" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className="overflow-hidden text-xs text-white/0 transition-all duration-150 group-hover:text-white/50">{item.desc}</p>
                  </div>
                </button>
              ))}
              <div className="my-2 h-px bg-white/[0.06]" />
              <p className="mb-2 px-2 text-sm text-white/40">上传素材</p>
              <button
                type="button"
                onClick={() => { toolbarUploadRef.current?.click(); setIsAddPanelOpen(false); }}
                className="flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition hover:bg-white/[0.07] active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-white/10">
                  <Upload className="h-5 w-5 text-white/80" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">上传图片或视频</p>
                  <p className="text-xs text-white/40">自动创建节点到画布</p>
                </div>
              </button>
            </div>
          )}
        </div>
        {/* Hidden upload input for toolbar */}
        <input ref={toolbarUploadRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleToolbarUpload} />
        {/* Bottom-left zoom control bar */}
        <div className="pointer-events-none absolute bottom-4 left-[76px] z-20">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-[#1e1e20] px-2 py-2 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
            <button
              type="button"
              onClick={() => rfInstanceRef.current?.fitView({ padding: 0.15, duration: 300 })}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
              title="适应屏幕"
            >
              <Locate className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowBackground((v) => !v)}
              className={clsx(
                "flex h-8 w-8 items-center justify-center rounded-full transition",
                showBackground ? "text-white/90 hover:bg-white/10" : "text-white/30 hover:bg-white/10 hover:text-white/60",
              )}
              title={showBackground ? "隐藏背景网格" : "显示背景网格"}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => rfInstanceRef.current?.fitView({ padding: 0.15, duration: 300 })}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
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
                className="h-1 w-24 cursor-pointer rounded-full accent-white"
                style={{ accentColor: "white" }}
              />
            </div>
          </div>
        </div>
        {/* Bottom AI chat panel */}
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
          <div
            className="pointer-events-auto w-full max-w-2xl"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
            onDragLeave={(e) => { e.stopPropagation(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(false);
              if (e.dataTransfer.files.length) handleChatAttach(e.dataTransfer.files);
            }}
          >
            {isDragOver ? (
              <div className="flex min-h-[120px] items-center justify-center gap-3 rounded-[20px] border-2 border-dashed border-blue-400/60 bg-blue-500/10 px-5 py-8 shadow-[0_8px_40px_rgba(0,0,0,0.7)]">
                <Paperclip className="h-5 w-5 text-blue-400/80" />
                <span className="text-sm text-blue-300/80">将文件拖放到此处</span>
              </div>
            ) : (
              <div className="rounded-[20px] bg-[#1a1a1c] px-5 pt-4 pb-3 shadow-[0_8px_40px_rgba(0,0,0,0.7)]">
                {/* Attachment thumbnails */}
                {chatAttachments.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {chatAttachments.map((att) => (
                      <div key={att.id} className="group/thumb relative">
                        {att.type === "image" ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={att.localUrl}
                            alt={att.name}
                            className="h-[72px] w-[72px] rounded-[10px] object-cover"
                          />
                        ) : (
                          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[10px] bg-white/10">
                            <Play className="h-8 w-8 text-white/40" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setChatAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-white/70 opacity-0 transition hover:bg-white/40 group-hover/thumb:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {isPolishing ? (
                  <div className="animate-pulse space-y-2.5 py-1" style={{ minHeight: 24 }}>
                    <div className="h-2.5 w-full rounded-full bg-white/20" />
                    <div className="h-2.5 w-[62%] rounded-full bg-white/15" />
                    <div className="h-2.5 w-[38%] rounded-full bg-white/10" />
                  </div>
                ) : (
                  <textarea
                    ref={chatTextareaRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSend(chatInput);
                      }
                    }}
                    placeholder="描述你想创作的内容…"
                    rows={1}
                    className="w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-white/40"
                    style={{ minHeight: 24, maxHeight: 240, overflowY: "auto", transition: "height 0.15s ease" }}
                  />
                )}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => chatFileInputRef.current?.click()}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
                      title="上传图片或视频"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={!chatInput.trim() || isPolishing}
                      onClick={handlePolish}
                      className="flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {isPolishing ? (
                        <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      AI 润色
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={!chatInput.trim() && chatAttachments.length === 0}
                    onClick={() => handleChatSend(chatInput)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ffc94a] text-black transition hover:bg-[#ffd86f] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            <input
              ref={chatFileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) handleChatAttach(e.target.files); e.target.value = ""; }}
            />
          </div>
        </div>
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
        />
      )}
    </>
  );
}
