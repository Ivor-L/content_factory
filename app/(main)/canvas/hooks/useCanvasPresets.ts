import { useState, useCallback } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabaseClient";
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
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/canvas/presets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch presets");
      const result = await res.json();
      setPresets(result.data || []);
      return result.data || [];
    } catch (error) {
      console.error("[canvas] list presets failed", error);
      toast.error("加载预设失败");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const savePreset = useCallback(
    async (name: string, nodeIds: string[], nodes: any[], resources: unknown) => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Not authenticated");

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
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name,
            nodes: presetNodes,
            resources,
          }),
        });

        if (!res.ok) throw new Error("Failed to save preset");
        const result = await res.json();
        setPresets((prev) => [...prev, result.data]);
        toast.success("预设已保存");
        return result.data;
      } catch (error) {
        console.error("[canvas] save preset failed", error);
        toast.error("保存预设失败");
      }
    },
    [],
  );

  const loadPreset = useCallback(async (presetId: string) => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(`/api/canvas/presets/${presetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load preset");
      const result = await res.json();
      return result.data;
    } catch (error) {
      console.error("[canvas] load preset failed", error);
      toast.error("加载预设失败");
    }
  }, []);

  const deletePreset = useCallback(async (presetId: string) => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(`/api/canvas/presets/${presetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
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
