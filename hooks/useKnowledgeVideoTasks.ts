import { useEffect, useState, useCallback } from "react";
import type { KnowledgeVideoType } from "@/lib/knowledgeVideos";

export interface KnowledgeVideoTaskDTO {
  id: string;
  title?: string | null;
  videoType: KnowledgeVideoType;
  status: string;
  videoUrl?: string | null;
  error?: string | null;
  createdAt: string;
}

export function useKnowledgeVideoTasks() {
  const [tasks, setTasks] = useState<KnowledgeVideoTaskDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-videos");
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "加载失败");
      setTasks(Array.isArray(payload.data) ? payload.data : []);
    } catch (fetchError) {
      console.error(fetchError);
      setError(fetchError instanceof Error ? fetchError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  return { tasks, loading, error, refetch: fetchTasks };
}
