"use client";

import type { Edge, Node } from "@xyflow/react";

export type RuntimeCanvasNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type RuntimeCanvasEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  markerEnd?: unknown;
  animated?: boolean;
  style?: Record<string, unknown>;
};

export type RuntimeCanvasData = {
  nodes: RuntimeCanvasNode[];
  edges: RuntimeCanvasEdge[];
  viewport: { x: number; y: number; zoom: number };
  resources: Array<Record<string, unknown>>;
};

export const DEFAULT_VIEWPORT = { x: 100, y: 50, zoom: 0.4 };

function randomNodeId(prefix: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyCanvasData(): RuntimeCanvasData {
  return {
    nodes: [],
    edges: [],
    viewport: { ...DEFAULT_VIEWPORT },
    resources: [],
  };
}

function ensurePosition(position: unknown): { x: number; y: number } {
  if (
    position &&
    typeof position === "object" &&
    typeof (position as { x?: unknown }).x === "number" &&
    typeof (position as { y?: unknown }).y === "number"
  ) {
    return { x: (position as { x: number }).x, y: (position as { y: number }).y };
  }
  return { x: 0, y: 0 };
}

export function normalizeRuntimeCanvasData(
  raw: unknown,
  fallbackPrompt?: string,
): RuntimeCanvasData {
  if (!raw || typeof raw !== "object") {
    return createEmptyCanvasData();
  }
  const source = raw as Partial<RuntimeCanvasData>;
  const nodes = Array.isArray(source.nodes)
    ? source.nodes
        .map((node) => {
          if (!node || typeof node !== "object") return null;
          const { id, type, position, data } = node as RuntimeCanvasNode;
          if (!id || !type) return null;
          return {
            id,
            type,
            position: ensurePosition(position),
            data: data || {},
          };
        })
        .filter(Boolean) as RuntimeCanvasNode[]
    : [];
  const edges = Array.isArray(source.edges)
    ? (source.edges.filter(
        (edge) => edge && typeof edge === "object" && (edge as RuntimeCanvasEdge).source && (edge as RuntimeCanvasEdge).target,
      ) as RuntimeCanvasEdge[])
    : [];
  const viewport =
    source.viewport && typeof source.viewport === "object"
      ? {
          x: typeof source.viewport.x === "number" ? source.viewport.x : DEFAULT_VIEWPORT.x,
          y: typeof source.viewport.y === "number" ? source.viewport.y : DEFAULT_VIEWPORT.y,
          zoom:
            typeof source.viewport.zoom === "number" ? source.viewport.zoom : DEFAULT_VIEWPORT.zoom,
        }
      : { ...DEFAULT_VIEWPORT };
  const resources = Array.isArray(source.resources) ? source.resources : [];
  return { nodes, edges, viewport, resources };
}

export function summarizeNodeData(node: RuntimeCanvasNode): string {
  const label = typeof node.data?.label === "string" ? node.data.label : "";
  switch (node.type) {
    case "text": {
      const content = typeof node.data?.content === "string" ? node.data.content : "";
      if (!content) return label || "文本节点";
      return content.slice(0, 80) + (content.length > 80 ? "..." : "");
    }
    case "image": {
      const model = typeof node.data?.model === "string" ? node.data.model : "默认模型";
      const ratio = typeof node.data?.ratio === "string" ? node.data.ratio : "1:1";
      return `${label || "图片节点"} • ${model} · ${ratio}`;
    }
    case "video": {
      const model = typeof node.data?.model === "string" ? node.data.model : "视频模型";
      const duration =
        typeof node.data?.duration === "number" || typeof node.data?.duration === "string"
          ? String(node.data.duration)
          : "10s";
      return `${label || "视频节点"} • ${model} · ${duration}`;
    }
    case "audio": {
      const voice = typeof node.data?.voiceName === "string" ? node.data.voiceName : "音色";
      return `${label || "音频节点"} • ${voice}`;
    }
    case "grid": {
      const contentType = typeof node.data?.contentType === "string" ? node.data.contentType : "产品展示";
      const ratio = typeof node.data?.ratio === "string" ? node.data.ratio : "1:1";
      return `${label || "九宫格"} • ${contentType} · ${ratio}`;
    }
    default:
      return label || node.type;
  }
}

export type MinimalFlowNodeData = {
  runtime: RuntimeCanvasNode;
  summary: string;
  status: "idle" | "running" | "success" | "error";
  expanded: boolean;
  upstreamInputs?: UpstreamInputs;
};

// ─── Upstream data flow ───────────────────────────────────────────────────────

/**
 * Structured upstream data resolved by traversing incoming edges.
 * All fields degrade gracefully to empty arrays / empty strings so callers
 * can use them without null-checking.
 */
export type UpstreamInputs = {
  /** Text content from connected text nodes */
  textContents: string[];
  /** Output image URLs from connected image nodes */
  imageUrls: string[];
  /** Output video URLs from connected video / digital-human nodes */
  videoUrls: string[];
  /** Output audio URLs from connected audio nodes */
  audioUrls: string[];
  // Convenience aliases — first non-empty value in each list
  effectivePrompt: string;
  firstImageUrl: string;
  firstVideoUrl: string;
  firstAudioUrl: string;
};

export const EMPTY_UPSTREAM: UpstreamInputs = {
  textContents: [],
  imageUrls: [],
  videoUrls: [],
  audioUrls: [],
  effectivePrompt: "",
  firstImageUrl: "",
  firstVideoUrl: "",
  firstAudioUrl: "",
};

type NodeSnapshot = {
  id: string;
  type?: string | null;
  data: { runtime?: { type?: string; data?: Record<string, unknown> } };
};
type EdgeSnapshot = { source: string; target: string };

/**
 * Pure function — resolves all upstream inputs for `nodeId` by walking every
 * incoming edge and extracting typed output data from the source node.
 * Safe to call inside useMemo; creates no side-effects.
 */
export function resolveUpstreamInputs(
  nodeId: string,
  nodes: NodeSnapshot[],
  edges: EdgeSnapshot[],
): UpstreamInputs {
  const textContents: string[] = [];
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const audioUrls: string[] = [];

  const incomingSourceIds = edges
    .filter((e) => e.target === nodeId)
    .map((e) => e.source);

  for (const sourceId of incomingSourceIds) {
    const sourceNode = nodes.find((n) => n.id === sourceId);
    if (!sourceNode) continue;
    const d = (sourceNode.data.runtime?.data || {}) as Record<string, unknown>;
    const type = sourceNode.type || sourceNode.data.runtime?.type || "";

    switch (type) {
      case "text": {
        const text = String(d.content ?? "").trim();
        if (text) textContents.push(text);
        break;
      }
      case "image": {
        // Collect every generated image URL
        const outputs = Array.isArray(d.outputs) ? d.outputs : [];
        for (const out of outputs) {
          const url =
            typeof out === "string"
              ? out
              : typeof (out as Record<string, unknown>).url === "string"
              ? (out as Record<string, unknown>).url as string
              : "";
          if (url) imageUrls.push(url);
        }
        break;
      }
      case "video":
      case "digitalhuman": {
        const url = String(d.outputUrl ?? "").trim();
        if (url) videoUrls.push(url);
        break;
      }
      case "audio": {
        const url = String(d.audioUrl ?? "").trim();
        if (url) audioUrls.push(url);
        break;
      }
      default:
        break;
    }
  }

  return {
    textContents,
    imageUrls,
    videoUrls,
    audioUrls,
    effectivePrompt: textContents[0] ?? "",
    firstImageUrl: imageUrls[0] ?? "",
    firstVideoUrl: videoUrls[0] ?? "",
    firstAudioUrl: audioUrls[0] ?? "",
  };
}

export function runtimeToFlowNodes(
  runtimeNodes: RuntimeCanvasNode[],
): Node<MinimalFlowNodeData>[] {
  const supported = new Set(["text", "image", "video", "audio", "grid", "imagetextgroup", "digitalhuman", "storyboard", "timelinevideo"]);
  return runtimeNodes.map((node) => ({
    id: node.id,
    type: supported.has(node.type) ? node.type : "text",
    position: node.position,
    data: {
      runtime: node,
      summary: summarizeNodeData(node),
      status: "idle",
      expanded: false,
    },
  }));
}

export function flowNodesToRuntime(nodes: Node<MinimalFlowNodeData>[]): RuntimeCanvasNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type || node.data?.runtime?.type || "text",
    position: node.position || { x: 0, y: 0 },
    data: node.data?.runtime?.data || {},
  }));
}

export function flowEdgesToRuntime(edges: Edge[]): RuntimeCanvasEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    markerEnd: edge.markerEnd,
    animated: edge.animated,
    style: edge.style,
  }));
}

export function runtimeEdgesToFlowEdges(runtimeEdges: RuntimeCanvasEdge[]): Edge[] {
  return runtimeEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    markerEnd: edge.markerEnd,
    animated: edge.animated,
    style: edge.style,
    type: "smoothstep",
  }));
}
