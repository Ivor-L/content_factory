"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CanvasProjectRecord } from "../types";

export type { CanvasProjectRecord } from "../types";

type CanvasProjectResponse = {
  data?: CanvasProjectRecord | CanvasProjectRecord[];
  error?: { message?: string };
};

type UseCanvasProjectsOptions = {
  autoSelectFirstProject?: boolean;
};

const DEFAULT_TIMEOUT_MS =
  Number(process.env.NEXT_PUBLIC_CANVAS_FETCH_TIMEOUT_MS ?? "30000") || 30000;
const MAX_RETRIES = 2;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(
  input: RequestInfo,
  init?: RequestInit,
): Promise<CanvasProjectResponse> {
  const authHeaders = await getAuthHeaders();
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(
        input,
        {
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
            ...(init?.headers as Record<string, string> | undefined),
          },
          ...init,
        },
        DEFAULT_TIMEOUT_MS + attempt * 10000,
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          payload?.error?.message ||
          (typeof payload?.error === "string" ? payload.error : null) ||
          response.statusText ||
          "Request failed";
        throw new Error(message);
      }
      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === MAX_RETRIES - 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw (
    lastError ??
    new Error("请求失败，请检查网络连接。")
  );
}

export function useCanvasProjects(
  initialProjectId?: string | null,
  initialProjects?: CanvasProjectRecord[],
  options?: UseCanvasProjectsOptions,
) {
  const { autoSelectFirstProject = true } = options ?? {};
  const normalizedInitialProjects = Array.isArray(initialProjects) ? initialProjects : [];
  const hasInitialProjects = normalizedInitialProjects.length > 0;
  const initialSelection =
    initialProjectId ??
    (autoSelectFirstProject && hasInitialProjects ? normalizedInitialProjects[0].id : null);

  const [projects, setProjects] = useState<CanvasProjectRecord[]>(
    () => normalizedInitialProjects,
  );
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(
    initialSelection ?? null,
  );
  const [loading, setLoading] = useState(!hasInitialProjects);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(hasInitialProjects);
  const currentProjectIdRef = useRef<string | null>(initialSelection ?? null);

  useEffect(() => {
    currentProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);

  const upsertProject = useCallback((record: CanvasProjectRecord) => {
    setProjects((prev) => {
      const filtered = prev.filter((item) => item.id !== record.id);
      return [record, ...filtered];
    });
  }, []);

  const loadProjects = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const payload = await requestJson("/api/canvas/projects?limit=50");
        const rows = Array.isArray(payload.data) ? payload.data : [];
        setProjects(rows);
        const previousSelection = currentProjectIdRef.current;
        if (!previousSelection && autoSelectFirstProject && rows.length > 0) {
          // autoSelectFirstProject disabled — user should choose manually
        } else if (
          previousSelection &&
          rows.every((item) => item.id !== previousSelection)
        ) {
          setCurrentProjectId(autoSelectFirstProject && rows.length > 0 ? rows[0].id : null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "加载项目失败";
        setError(message);
      } finally {
        initializedRef.current = true;
        if (!silent) setLoading(false);
      }
    },
    [autoSelectFirstProject],
  );

  useEffect(() => {
    const silent = initializedRef.current;
    void loadProjects(silent);
  }, [loadProjects]);

  const fetchProjectById = useCallback(
    async (projectId: string, silent = true) => {
      if (!projectId) return null;
      const existing = projects.find((item) => item.id === projectId);
      if (existing && existing.canvasData) {
        setCurrentProjectId(projectId);
        return existing;
      }
      if (!silent) setLoading(true);
      setError(null);
      try {
        const payload = await requestJson(`/api/canvas/projects/${projectId}`);
        if (payload.data) {
          upsertProject(payload.data);
          setCurrentProjectId(payload.data.id);
          return payload.data;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "获取项目失败";
        setError(message);
      } finally {
        if (!silent) setLoading(false);
      }
      return null;
    },
    [projects, upsertProject],
  );

  const saveProjectCanvas = useCallback(
    async (projectId: string, canvasData: unknown) => {
      if (!projectId) throw new Error("缺少项目 ID");
      setError(null);
      try {
        const payload = await requestJson(`/api/canvas/projects/${projectId}`, {
          method: "PATCH",
          body: JSON.stringify({ canvasData }),
        });
        if (payload.data) {
          upsertProject(payload.data);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "保存项目失败";
        setError(message);
        throw err;
      }
    },
    [upsertProject],
  );

  const createProject = useCallback(
    async (name?: string) => {
      setError(null);
      setLoading(true);
      try {
        const payload = await requestJson("/api/canvas/projects", {
          method: "POST",
          body: JSON.stringify({ name }),
        });
        if (payload.data) {
          upsertProject(payload.data);
          setCurrentProjectId(payload.data.id);
          return payload.data.id;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "创建项目失败";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
      return null;
    },
    [upsertProject],
  );

  const currentProject = useMemo(() => {
    if (!currentProjectId) return null;
    return projects.find((item) => item.id === currentProjectId) ?? null;
  }, [projects, currentProjectId]);

  // When currentProjectId changes and canvasData is not loaded, silently fetch it.
  // Uses `projects` as a dependency so it also re-fires after loadProjects populates the list,
  // fixing the race condition where the effect first runs with an empty projects array.
  useEffect(() => {
    if (!currentProjectId) return;
    const hasData = projects.some((p) => p.id === currentProjectId && p.canvasData);
    if (hasData) return;
    let cancelled = false;
    requestJson(`/api/canvas/projects/${currentProjectId}`)
      .then((payload) => {
        if (!cancelled && payload.data) upsertProject(payload.data as CanvasProjectRecord);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentProjectId, projects, upsertProject]);

  const selectProject = useCallback((projectId: string | null) => {
    setCurrentProjectId(projectId);
  }, []);

  return {
    projects,
    currentProject,
    currentProjectId,
    loading,
    error,
    initialized: initializedRef.current,
    loadProjects,
    refreshProjects: loadProjects,
    selectProject,
    fetchProjectById,
    saveProjectCanvas,
    createProject,
  };
}
