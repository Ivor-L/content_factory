"use client";

import { useCallback, useState } from "react";

export type CanvasResourceRecord = {
  id: string;
  type: "text" | "image" | "video" | "audio";
  variant?: string;
  name: string;
  url: string;
  cover?: string;
  duration?: number | null;
  metadata?: Record<string, unknown>;
};

const generateId = () => `res_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;

const MAX_RESOURCES = 500;

export function useCanvasResources(initialResources: CanvasResourceRecord[] = []) {
  const [resources, setResources] = useState<CanvasResourceRecord[]>(initialResources);

  const syncFromCanvasData = useCallback((records: unknown) => {
    if (!Array.isArray(records)) {
      setResources([]);
      return;
    }
    setResources(
      records.map((item) => {
        const record = item as CanvasResourceRecord;
        return {
          id: record?.id || generateId(),
          type: record?.type || "audio",
          variant: record?.variant || "general",
          name: record?.name || "未命名资源",
          url: record?.url || "",
          cover: record?.cover || "",
          duration: typeof record?.duration === "number" ? record.duration : null,
          metadata: record?.metadata || {},
        };
      }),
    );
  }, []);

  const addResource = useCallback((record: Partial<CanvasResourceRecord>) => {
    const normalized: CanvasResourceRecord = {
      id: record.id || generateId(),
      type: record.type || "audio",
      variant: record.variant || "general",
      name: (record.name || "未命名资源").trim(),
      url: record.url || "",
      cover: record.cover || "",
      duration: typeof record.duration === "number" ? record.duration : null,
      metadata: record.metadata || {},
    };
    setResources((prev) => {
      const deduped = prev.filter((item) => item.id !== normalized.id);
      return [normalized, ...deduped].slice(0, MAX_RESOURCES);
    });
    return normalized;
  }, []);

  const updateResource = useCallback((resourceId: string, patch: Partial<CanvasResourceRecord>) => {
    setResources((prev) =>
      prev.map((item) =>
        item.id === resourceId
          ? {
              ...item,
              ...patch,
              id: item.id,
            }
          : item,
      ),
    );
  }, []);

  const removeResource = useCallback((resourceId: string) => {
    setResources((prev) => prev.filter((item) => item.id !== resourceId));
  }, []);

  return {
    resources,
    setResources,
    syncFromCanvasData,
    addResource,
    updateResource,
    removeResource,
  };
}
