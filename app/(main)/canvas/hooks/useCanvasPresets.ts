import { useState, useCallback } from "react";
import toast from "react-hot-toast";
import type { MinimalFlowNodeData } from "../lib/canvasDataAdapters";

export interface CanvasPreset {
  id: string;
  name: string;
  userId: string;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  resources: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export function useCanvasPresets() {
  const [presets, setPresets] = useState<CanvasPreset[]>([]);
  const [loading, setLoading] = useState(false);

  const listPresets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/canvas/presets");
      if (!res.ok) throw new Error("Failed to fetch presets");
      const data = await res.json();
      setPresets(data.data || []);
      return data.data || [];
    } catch (error) {
      console.error("[canvas] list presets failed", error);
      toast.error("加载预设失败");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const savePreset = useCallback(
    async (name: string, nodeIds: string[], nodes: any[], resources: Record<string, unknown>) => {
      try {
        const presetNodes = nodeIds
          .map((id) => nodes.find((n) => n.id === id))
          .filter(Boolean)
          .map((node) => ({
            id: node.id,
            type: node.type,
            position: node.position,
            data: node.data.runtime.data,
          }));

        const res = await fetch("/api/canvas/presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            nodes: presetNodes,
            resources,
          }),
        });

        if (!res.ok) throw new Error("Failed to save preset");
        const data = await res.json();
        setPresets((prev) => [...prev, data.data]);
        toast.success("预设已保存");
        return data.data;
      } catch (error) {
        console.error("[canvas] save preset failed", error);
        toast.error("保存预设失败");
      }
    },
    [],
  );

  const loadPreset = useCallback(async (presetId: string) => {
    try {
      const res = await fetch(`/api/canvas/presets/${presetId}`);
      if (!res.ok) throw new Error("Failed to load preset");
      const data = await res.json();
      return data.data;
    } catch (error) {
      console.error("[canvas] load preset failed", error);
      toast.error("加载预设失败");
    }
  }, []);

  const deletePreset = useCallback(async (presetId: string) => {
    try {
      const res = await fetch(`/api/canvas/presets/${presetId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete preset");
      setPresets((prev) => prev.filter((p) => p.id !== presetId));
      toast.success("预设已删除");
    } catch (error) {
      console.error("[canvas] delete preset failed", error);
      toast.error("删除预设失败");
    }
  }, []);

  return {
    presets,
    loading,
    listPresets,
    savePreset,
    loadPreset,
    deletePreset,
  };
}
