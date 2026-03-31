"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LayoutGrid, Plus, RefreshCw, Sparkles, Video } from "lucide-react";
import { toast } from "react-hot-toast";
import { CanvasNode } from "./CanvasNode";
import {
  extractVideoUrl,
  fetchCanvasStyles,
  getCreativeTask,
  getVideoReplicationTask,
  startTextToImageTask,
  startVideoReplicationTask,
} from "../lib/api";
import { supabase } from "@/lib/supabaseClient";
import type {
  AppCanvasEdge,
  AppCanvasNode,
  AppCanvasRenderNode,
  CanvasNodeData,
  CanvasSnapshot,
  ImageConfigNodeData,
  ImageResultNodeData,
  StyleOption,
  TextNodeData,
  VideoConfigNodeData,
  VideoResultNodeData,
} from "../types";

const STORAGE_KEY = "canvas.studio.snapshot.v1";
const TASK_TIMEOUT_MS = 6 * 60 * 1000; // 6 minutes

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}


function createDefaultNodes(): AppCanvasNode[] {
  return [
    {
      id: createId("text"),
      type: "canvasNode",
      position: { x: 40, y: 160 },
      data: {
        kind: "text",
        label: "文本输入",
        status: "idle",
        text: "输入你的创意、提示词或脚本要点。",
      } satisfies TextNodeData,
    },
    {
      id: createId("img-cfg"),
      type: "canvasNode",
      position: { x: 430, y: 80 },
      data: {
        kind: "imageConfig",
        label: "图文生图节点",
        status: "idle",
        title: "画布生图任务",
        prompt: "",
        styleId: "",
        imageCount: 3,
      } satisfies ImageConfigNodeData,
    },
    {
      id: createId("video-cfg"),
      type: "canvasNode",
      position: { x: 430, y: 350 },
      data: {
        kind: "videoConfig",
        label: "视频生成节点",
        status: "idle",
        productId: "",
        scriptId: "",
        targetCountry: "us",
        targetLanguage: "en",
        duration: "15",
        quantity: "1",
      } satisfies VideoConfigNodeData,
    },
  ];
}

function createDefaultEdges(nodes: AppCanvasNode[]): AppCanvasEdge[] {
  const textNodeId = nodes.find((node) => node.data.kind === "text")?.id;
  const imageConfigId = nodes.find((node) => node.data.kind === "imageConfig")?.id;
  const videoConfigId = nodes.find((node) => node.data.kind === "videoConfig")?.id;
  if (!textNodeId || !imageConfigId || !videoConfigId) return [];
  return [
    {
      id: createId("edge"),
      source: textNodeId,
      target: imageConfigId,
      type: "smoothstep",
      animated: true,
    },
    {
      id: createId("edge"),
      source: textNodeId,
      target: videoConfigId,
      type: "smoothstep",
      animated: true,
    },
  ];
}

function safeLoadSnapshot(): CanvasSnapshot | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CanvasSnapshot;
    if (parsed?.version !== 1) return null;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSnapshot(nodes: AppCanvasNode[], edges: AppCanvasEdge[]) {
  if (typeof window === "undefined") return;
  const payload: CanvasSnapshot = { version: 1, nodes, edges };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function statusMessage(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "COMPLETED" || normalized === "READY") return "执行完成";
  if (normalized === "FAILED" || normalized === "ERROR") return "执行失败";
  return `状态：${normalized}`;
}

export function CanvasStudio() {
  const initialSnapshot = safeLoadSnapshot();
  const initialNodes = initialSnapshot?.nodes ?? createDefaultNodes();
  const initialEdges = initialSnapshot?.edges ?? createDefaultEdges(initialNodes);

  const [nodes, setNodes] = useState<AppCanvasNode[]>(initialNodes);
  const [edges, setEdges] = useState<AppCanvasEdge[]>(initialEdges);
  const [styles, setStyles] = useState<StyleOption[]>([]);
  const [stylesLoading, setStylesLoading] = useState(true);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    saveSnapshot(nodes, edges);
  }, [edges, nodes]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setStylesLoading(true);
      try {
        const data = await fetchCanvasStyles();
        if (!cancelled) setStyles(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : "加载风格失败";
        toast.error(message);
      } finally {
        if (!cancelled) setStylesLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchNode = useCallback((nodeId: string, patch: Record<string, unknown>) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                ...patch,
                updatedAt: Date.now(),
              } as CanvasNodeData,
            }
          : node,
      ),
    );
  }, []);

  const duplicateNode = useCallback((nodeId: string) => {
    const source = nodesRef.current.find((node) => node.id === nodeId);
    if (!source) return;
    const next: AppCanvasNode = {
      ...source,
      id: createId(source.data.kind),
      position: { x: source.position.x + 50, y: source.position.y + 50 },
      data: {
        ...source.data,
        status: "idle",
        message: undefined,
        taskId: undefined,
        updatedAt: Date.now(),
      },
    };
    setNodes((prev) => [...prev, next]);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((node) => node.id !== nodeId));
    setEdges((prev) => prev.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
  }, []);

  const getNodeTextInput = useCallback((nodeId: string): string => {
    const allNodes = nodesRef.current;
    const allEdges = edgesRef.current;
    const upstreamIds = allEdges.filter((edge) => edge.target === nodeId).map((edge) => edge.source);
    const chunks: string[] = [];

    for (const sourceId of upstreamIds) {
      const sourceNode = allNodes.find((node) => node.id === sourceId);
      if (!sourceNode) continue;
      if (sourceNode.data.kind === "text") {
        const text = sourceNode.data.text?.trim();
        if (text) chunks.push(text);
      }
      if (sourceNode.data.kind === "imageResult" && sourceNode.data.images.length > 0) {
        chunks.push(`参考图: ${sourceNode.data.images[0]}`);
      }
      if (sourceNode.data.kind === "videoResult" && sourceNode.data.videoUrl) {
        chunks.push(`参考视频: ${sourceNode.data.videoUrl}`);
      }
    }

    return chunks.join("\n\n").trim();
  }, []);

  const createImageResultNode = useCallback((sourceNodeId: string, images: string[], sourceTaskId: string) => {
    const source = nodesRef.current.find((node) => node.id === sourceNodeId);
    if (!source) return;
    const resultNode: AppCanvasNode = {
      id: createId("img-result"),
      type: "canvasNode",
      position: { x: source.position.x + 430, y: source.position.y + 20 },
      data: {
        kind: "imageResult",
        label: "图片结果",
        status: "success",
        images,
        sourceTaskId,
      } satisfies ImageResultNodeData,
    };
    const resultEdge: AppCanvasEdge = {
      id: createId("edge"),
      source: sourceNodeId,
      target: resultNode.id,
      type: "smoothstep",
      animated: true,
    };
    setNodes((prev) => [...prev, resultNode]);
    setEdges((prev) => [...prev, resultEdge]);
  }, []);

  const createVideoResultNode = useCallback((sourceNodeId: string, videoUrl: string, sourceTaskId: string) => {
    const source = nodesRef.current.find((node) => node.id === sourceNodeId);
    if (!source) return;
    const resultNode: AppCanvasNode = {
      id: createId("video-result"),
      type: "canvasNode",
      position: { x: source.position.x + 430, y: source.position.y + 20 },
      data: {
        kind: "videoResult",
        label: "视频结果",
        status: "success",
        videoUrl,
        sourceTaskId,
      } satisfies VideoResultNodeData,
    };
    const resultEdge: AppCanvasEdge = {
      id: createId("edge"),
      source: sourceNodeId,
      target: resultNode.id,
      type: "smoothstep",
      animated: true,
    };
    setNodes((prev) => [...prev, resultNode]);
    setEdges((prev) => [...prev, resultEdge]);
  }, []);

  const executeImageNode = useCallback(async (nodeId: string) => {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node || node.data.kind !== "imageConfig") return;
    if (node.data.status === "running") return;

    const manualPrompt = node.data.prompt?.trim() ?? "";
    const upstreamPrompt = getNodeTextInput(nodeId);
    const finalText = manualPrompt || upstreamPrompt;
    if (!finalText) {
      patchNode(nodeId, {
        status: "error",
        message: "缺少输入文本，请填写提示词或连接文本节点。",
      });
      return;
    }
    if (!node.data.styleId) {
      patchNode(nodeId, {
        status: "error",
        message: "请选择一个风格后再执行。",
      });
      return;
    }

    try {
      patchNode(nodeId, { status: "running", message: "正在提交图文生图任务..." });
      const start = await startTextToImageTask({
        title: node.data.title?.trim() || finalText.slice(0, 28) || "画布生图任务",
        text: finalText,
        styleId: node.data.styleId,
        imageCount: Math.min(Math.max(Number(node.data.imageCount) || 3, 1), 5),
      });
      patchNode(nodeId, {
        status: "running",
        taskId: start.taskId,
        message: `任务已创建：${start.taskId}，等待回调...`,
      });

      await new Promise<void>((resolve, reject) => {
        let done = false;
        let timeoutId: ReturnType<typeof setTimeout>;

        const settle = (fn: () => void) => {
          if (done) return;
          done = true;
          clearTimeout(timeoutId);
          supabase.removeChannel(channel);
          fn();
        };

        const onCompleted = (task: NonNullable<Awaited<ReturnType<typeof getCreativeTask>>>) => {
          if (Array.isArray(task.generatedImages) && task.generatedImages.length > 0) {
            patchNode(nodeId, { status: "success", message: `已产出 ${task.generatedImages.length} 张图片` });
            createImageResultNode(nodeId, task.generatedImages, start.taskId);
            toast.success("图文节点执行完成");
            settle(resolve);
          } else {
            settle(() => reject(new Error("任务完成，但未生成图片")));
          }
        };

        const channel = supabase
          .channel(`cs_image_${start.taskId}`)
          .on("postgres_changes",
            { event: "UPDATE", schema: "public", table: "creative_tasks", filter: `id=eq.${start.taskId}` },
            (payload) => {
              const row = payload.new as Record<string, unknown>;
              const status = String(row.status || "");
              const nextMessage = String(row.error_message || statusMessage(status));
              patchNode(nodeId, { status: status === "FAILED" ? "error" : "running", message: nextMessage });
              if (status === "FAILED") {
                settle(() => reject(new Error(String(row.error_message || "图文任务执行失败"))));
              } else if (status === "COMPLETED") {
                void getCreativeTask(start.taskId)
                  .then((t) => { if (t) onCompleted(t); else settle(() => reject(new Error("图文任务执行失败"))); })
                  .catch(() => settle(() => reject(new Error("图文任务执行失败"))));
              }
            })
          .subscribe();

        // Race condition guard
        void getCreativeTask(start.taskId)
          .then((task) => {
            if (!task) return;
            if (task.status === "FAILED") settle(() => reject(new Error(task.errorMessage || "图文任务执行失败")));
            else if (task.status === "COMPLETED") onCompleted(task);
          })
          .catch(() => {});

        timeoutId = setTimeout(() => settle(() => reject(new Error("任务轮询超时，请稍后在项目中心查看结果。"))), TASK_TIMEOUT_MS);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "图文节点执行失败";
      patchNode(nodeId, { status: "error", message });
      toast.error(message);
    }
  }, [createImageResultNode, getNodeTextInput, patchNode]);

  const executeVideoNode = useCallback(async (nodeId: string) => {
    const node = nodesRef.current.find((item) => item.id === nodeId);
    if (!node || node.data.kind !== "videoConfig") return;
    if (node.data.status === "running") return;

    if (!node.data.productId.trim() || !node.data.scriptId.trim()) {
      patchNode(nodeId, {
        status: "error",
        message: "请先填写 productId 与 scriptId。",
      });
      return;
    }

    try {
      patchNode(nodeId, { status: "running", message: "正在触发视频任务..." });
      const start = await startVideoReplicationTask({
        productId: node.data.productId.trim(),
        scriptId: node.data.scriptId.trim(),
        targetCountry: node.data.targetCountry.trim() || "us",
        targetLanguage: node.data.targetLanguage.trim() || "en",
        duration: node.data.duration.trim() || "15",
        quantity: node.data.quantity.trim() || "1",
      });

      patchNode(nodeId, {
        status: "running",
        taskId: start.taskId,
        message: `任务已创建：${start.taskId}，等待生成...`,
      });

      await new Promise<void>((resolve, reject) => {
        let done = false;
        let timeoutId: ReturnType<typeof setTimeout>;

        const settle = (fn: () => void) => {
          if (done) return;
          done = true;
          clearTimeout(timeoutId);
          supabase.removeChannel(channel);
          fn();
        };

        const channel = supabase
          .channel(`cs_video_${start.taskId}`)
          .on("postgres_changes",
            { event: "UPDATE", schema: "public", table: "replications", filter: `id=eq.${start.taskId}` },
            (payload) => {
              const row = payload.new as Record<string, unknown>;
              const normalized = String(row.status || "").toLowerCase();
              patchNode(nodeId, { status: normalized === "failed" ? "error" : "running", message: `状态：${row.status}` });
              if (normalized === "failed") {
                settle(() => reject(new Error("视频任务失败，请检查 productId/scriptId 或 API 配置。")));
              } else if (normalized === "completed") {
                const videoUrl = extractVideoUrl(row.result as Record<string, unknown> | undefined);
                if (!videoUrl) {
                  settle(() => reject(new Error("任务完成，但未解析到视频 URL。")));
                } else {
                  patchNode(nodeId, { status: "success", message: "视频已生成" });
                  createVideoResultNode(nodeId, videoUrl, start.taskId);
                  toast.success("视频节点执行完成");
                  settle(resolve);
                }
              }
            })
          .subscribe();

        // Race condition guard
        void getVideoReplicationTask(start.taskId)
          .then((task) => {
            if (!task) return;
            const normalized = (task.status || "").toLowerCase();
            if (normalized === "failed") settle(() => reject(new Error("视频任务失败，请检查 productId/scriptId 或 API 配置。")));
            else if (normalized === "completed") {
              const videoUrl = extractVideoUrl(task.result);
              if (!videoUrl) settle(() => reject(new Error("任务完成，但未解析到视频 URL。")));
              else {
                patchNode(nodeId, { status: "success", message: "视频已生成" });
                createVideoResultNode(nodeId, videoUrl, start.taskId);
                toast.success("视频节点执行完成");
                settle(resolve);
              }
            }
          })
          .catch(() => {});

        timeoutId = setTimeout(() => settle(() => reject(new Error("视频任务轮询超时，请稍后在项目中心查看结果。"))), TASK_TIMEOUT_MS);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "视频节点执行失败";
      patchNode(nodeId, { status: "error", message });
      toast.error(message);
    }
  }, [createVideoResultNode, patchNode]);

  const runNode = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((item) => item.id === nodeId);
      if (!node) return;
      if (node.data.kind === "imageConfig") {
        void executeImageNode(nodeId);
      }
      if (node.data.kind === "videoConfig") {
        void executeVideoNode(nodeId);
      }
    },
    [executeImageNode, executeVideoNode],
  );

  const addNodeByKind = useCallback((kind: "text" | "imageConfig" | "videoConfig") => {
    const offset = nodesRef.current.length * 16;
    const baseX = 80 + offset;
    const baseY = 80 + offset;
    let data: CanvasNodeData;
    if (kind === "text") {
      data = {
        kind,
        label: "文本输入",
        status: "idle",
        text: "",
      };
    } else if (kind === "imageConfig") {
      data = {
        kind,
        label: "图文生图节点",
        status: "idle",
        title: "画布生图任务",
        prompt: "",
        styleId: "",
        imageCount: 3,
      };
    } else {
      data = {
        kind,
        label: "视频生成节点",
        status: "idle",
        productId: "",
        scriptId: "",
        targetCountry: "us",
        targetLanguage: "en",
        duration: "15",
        quantity: "1",
      };
    }

    const next: AppCanvasNode = {
      id: createId(kind),
      type: "canvasNode",
      position: { x: baseX, y: baseY },
      data,
    };
    setNodes((prev) => [...prev, next]);
  }, []);

  const resetBoard = useCallback(() => {
    const nextNodes = createDefaultNodes();
    const nextEdges = createDefaultEdges(nextNodes);
    setNodes(nextNodes);
    setEdges(nextEdges);
    toast.success("画布已重置");
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<AppCanvasNode>[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<AppCanvasEdge>[]) => {
    setEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((prev) =>
      addEdge(
        {
          ...connection,
          id: createId("edge"),
          type: "smoothstep",
          animated: true,
        },
        prev,
      ),
    );
  }, []);

  const nodeTypes = useMemo(() => ({ canvasNode: CanvasNode }), []);

  const renderNodes = useMemo<AppCanvasRenderNode[]>(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          styles,
          onPatch: patchNode,
          onRun: runNode,
          onDuplicate: duplicateNode,
          onDelete: deleteNode,
        },
      })),
    [deleteNode, duplicateNode, nodes, patchNode, runNode, styles],
  );

  return (
    <div className="flex h-full min-h-screen flex-col bg-[radial-gradient(circle_at_top_right,var(--tenant-primary-soft),transparent_55%),radial-gradient(circle_at_bottom_left,var(--tenant-primary-muted),transparent_45%)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--tenant-primary-muted)] bg-white/85 px-4 py-3 backdrop-blur dark:bg-gray-950/85">
        <button
          type="button"
          onClick={() => addNodeByKind("text")}
          className="inline-flex items-center gap-1 rounded-xl border border-[var(--tenant-primary-muted)] px-3 py-2 text-sm text-gray-700 transition hover:border-[var(--tenant-primary)] dark:text-gray-200"
        >
          <Plus className="h-4 w-4" />
          文本节点
        </button>
        <button
          type="button"
          onClick={() => addNodeByKind("imageConfig")}
          className="inline-flex items-center gap-1 rounded-xl border border-[var(--tenant-primary-muted)] px-3 py-2 text-sm text-gray-700 transition hover:border-[var(--tenant-primary)] dark:text-gray-200"
        >
          <Sparkles className="h-4 w-4" />
          生图节点
        </button>
        <button
          type="button"
          onClick={() => addNodeByKind("videoConfig")}
          className="inline-flex items-center gap-1 rounded-xl border border-[var(--tenant-primary-muted)] px-3 py-2 text-sm text-gray-700 transition hover:border-[var(--tenant-primary)] dark:text-gray-200"
        >
          <Video className="h-4 w-4" />
          视频节点
        </button>
        <button
          type="button"
          onClick={resetBoard}
          className="inline-flex items-center gap-1 rounded-xl border border-[var(--tenant-primary-muted)] px-3 py-2 text-sm text-gray-700 transition hover:border-[var(--tenant-primary)] dark:text-gray-200"
        >
          <RefreshCw className="h-4 w-4" />
          重置画布
        </button>

        <div className="ml-auto inline-flex items-center gap-2 rounded-xl border border-[var(--tenant-primary-muted)] bg-[var(--tenant-primary-soft)] px-3 py-2 text-xs text-gray-700 dark:text-gray-200">
          <LayoutGrid className="h-4 w-4" />
          {stylesLoading ? "风格加载中..." : `可用风格 ${styles.length} 个`}
        </div>
      </div>

      <div className="flex-1">
        <ReactFlow
          nodes={renderNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          defaultEdgeOptions={{ type: "smoothstep", animated: true }}
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap pannable zoomable />
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.1} />
        </ReactFlow>
      </div>
    </div>
  );
}
