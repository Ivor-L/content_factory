import type { Edge, Node } from "@xyflow/react";

export type CanvasNodeKind =
  | "text"
  | "imageConfig"
  | "imageResult"
  | "videoConfig"
  | "videoResult"
  | "gridConfig";

export type NodeRunStatus = "idle" | "running" | "success" | "error";

type BaseNodeData = {
  kind: CanvasNodeKind;
  label: string;
  status: NodeRunStatus;
  message?: string;
  taskId?: string;
  updatedAt?: number;
};

export type TextNodeData = BaseNodeData & {
  kind: "text";
  text: string;
};

export type ImageConfigNodeData = BaseNodeData & {
  kind: "imageConfig";
  title: string;
  prompt: string;
  styleId: string;
  imageCount: number;
};

export type ImageResultNodeData = BaseNodeData & {
  kind: "imageResult";
  images: string[];
  sourceTaskId?: string;
};

export type VideoConfigNodeData = BaseNodeData & {
  kind: "videoConfig";
  productId: string;
  scriptId: string;
  targetCountry: string;
  targetLanguage: string;
  duration: string;
  quantity: string;
};

export type VideoResultNodeData = BaseNodeData & {
  kind: "videoResult";
  videoUrl: string;
  sourceTaskId?: string;
};

export type GridConfigNodeData = BaseNodeData & {
  kind: "gridConfig";
  title: string;
  contentType: "appearance" | "selling_points" | "story";
  scriptContent: string;
  imageUrl: string;
};

export type CanvasNodeData =
  | TextNodeData
  | ImageConfigNodeData
  | ImageResultNodeData
  | VideoConfigNodeData
  | VideoResultNodeData
  | GridConfigNodeData;

export type StyleOption = {
  id: string;
  name: string;
};

export type CanvasNodeRuntimeData = {
  styles?: StyleOption[];
  onPatch?: (nodeId: string, patch: Record<string, unknown>) => void;
  onRun?: (nodeId: string) => void;
  onDuplicate?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onUpload?: (nodeId: string, file: File, field: string) => Promise<void>;
};

export type CanvasRenderNodeData = CanvasNodeData & CanvasNodeRuntimeData;

export type AppCanvasNode = Node<CanvasNodeData>;
export type AppCanvasRenderNode = Node<CanvasRenderNodeData>;
export type AppCanvasEdge = Edge;

export type CanvasSnapshot = {
  version: 1;
  nodes: AppCanvasNode[];
  edges: AppCanvasEdge[];
};

export type CanvasProjectRecord = {
  id: string;
  name: string;
  thumbnail: string;
  createdAt: string;
  updatedAt: string;
  canvasData?: {
    nodes?: unknown[];
    edges?: unknown[];
    viewport?: { x: number; y: number; zoom: number };
    resources?: unknown[];
  };
};
