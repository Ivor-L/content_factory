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
  preloadFirstProjectData?: boolean;
};

const DEFAULT_TIMEOUT_MS =
  Number(process.env.NEXT_PUBLIC_CANVAS_FETCH_TIMEOUT_MS ?? "8000") || 8000;
const MAX_RETRIES = 2;

class CanvasProjectRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CanvasProjectRequestError";
  }
}

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
        throw new CanvasProjectRequestError(message, response.status);
      }
      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (
        error instanceof CanvasProjectRequestError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        break;
      }
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
  const { autoSelectFirstProject = true, preloadFirstProjectData = true } = options ?? {};
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const projectsRef = useRef(projects);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    currentProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);

  const upsertProject = useCallback((record: CanvasProjectRecord) => {
    setProjects((prev) => {
      const existing = prev.find((item) => item.id === record.id);
      const mergedCanvasData =
        record.canvasData !== undefined && record.canvasData !== null
          ? record.canvasData
          : existing?.canvasData;
      const mergedRecord: CanvasProjectRecord = {
        ...(existing ?? {}),
        ...record,
        ...(mergedCanvasData !== undefined ? { canvasData: mergedCanvasData } : {}),
      };
      const filtered = prev.filter((item) => item.id !== mergedRecord.id);
      const next = [mergedRecord, ...filtered];
      projectsRef.current = next;
      return next;
    });
  }, []);

  const loadProjects = useCallback(
    async (silent = false) => {
      // Cancel previous request if still pending
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      if (!silent) setLoading(true);
      setError(null);
      try {
        const authHeaders = await getAuthHeaders();
        const withFirst = preloadFirstProjectData ? "true" : "false";
        const response = await fetchWithTimeout(
          `/api/canvas/projects?limit=50&withFirst=${withFirst}`,
          {
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
            },
            signal: abortControllerRef.current.signal,
          },
          DEFAULT_TIMEOUT_MS,
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error?.message || response.statusText || "Request failed");
        }
        const rows = Array.isArray(payload.data) ? payload.data : [];
        setProjects(rows);
        projectsRef.current = rows;
        const previousSelection = currentProjectIdRef.current;
        if (!previousSelection && autoSelectFirstProject && rows.length > 0) {
          setCurrentProjectId(rows[0].id);
        } else if (
          previousSelection &&
          rows.every((item: { id: string }) => item.id !== previousSelection)
        ) {
          setCurrentProjectId(autoSelectFirstProject && rows.length > 0 ? rows[0].id : null);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Request was cancelled, don't set error
          return;
        }
        const message = err instanceof Error ? err.message : "加载项目失败";
        setError(message);
      } finally {
        initializedRef.current = true;
        if (!silent) setLoading(false);
      }
    },
    [autoSelectFirstProject, preloadFirstProjectData],
  );

  useEffect(() => {
    const silent = initializedRef.current;
    void loadProjects(silent);
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadProjects]);

  const fetchProjectById = useCallback(
    async (projectId: string, silent = true, options?: { force?: boolean }) => {
      if (!projectId) return null;
      const existing = projects.find((item) => item.id === projectId);
      if (!options?.force && existing && existing.canvasData) {
        setCurrentProjectId(projectId);
        return existing;
      }
      if (!silent) setLoading(true);
      setError(null);
      try {
        const payload = await requestJson(`/api/canvas/projects/${projectId}`);
        if (payload.data) {
          const record = payload.data as CanvasProjectRecord;
          upsertProject(record);
          setCurrentProjectId(record.id);
          return record;
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
    async (projectId: string, canvasData: unknown, thumbnail?: string | null) => {
      if (!projectId) throw new Error("缺少项目 ID");
      const runExclusive = () => {
        return saveQueueRef.current
          .catch(() => undefined)
          .then(async () => {
            setError(null);
            const project = projectsRef.current.find((item) => item.id === projectId) ?? null;
            const expectedUpdatedAt = project?.updatedAt ?? null;
            const body: Record<string, unknown> = {
              canvasData,
              expectedUpdatedAt,
            };
            if (thumbnail !== undefined) body.thumbnail = thumbnail;
            const authHeaders = await getAuthHeaders();
            const response = await fetchWithTimeout(
              `/api/canvas/projects/${projectId}?response=meta`,
              {
                method: "PATCH",
                body: JSON.stringify(body),
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                  ...authHeaders,
                },
              },
              DEFAULT_TIMEOUT_MS + 10000,
            );
            const payload = await response.json().catch(() => ({}));
            if (response.status === 409) {
              const latest = await fetchProjectById(projectId, true, { force: true }).catch(() => null);
              const retryExpectedUpdatedAt = latest?.updatedAt ?? null;
              const retryBody: Record<string, unknown> = {
                canvasData,
                expectedUpdatedAt: retryExpectedUpdatedAt,
              };
              if (thumbnail !== undefined) retryBody.thumbnail = thumbnail;
              const retryResponse = await fetchWithTimeout(
                `/api/canvas/projects/${projectId}?response=meta`,
                {
                  method: "PATCH",
                  body: JSON.stringify(retryBody),
                  credentials: "include",
                  headers: {
                    "Content-Type": "application/json",
                    ...authHeaders,
                  },
                },
                DEFAULT_TIMEOUT_MS + 10000,
              );
              const retryPayload = await retryResponse.json().catch(() => ({}));
              if (!retryResponse.ok) {
                const conflictError = new Error(
                  retryPayload?.error?.message || payload?.error?.message || "画布已在其他窗口更新",
                );
                conflictError.name = retryPayload?.error?.code || payload?.error?.code || "CanvasProjectConflictError";
                setError(conflictError.message);
                throw conflictError;
              }
              if (retryPayload.data) {
                upsertProject(retryPayload.data as CanvasProjectRecord);
              }
              return;
            }
            if (!response.ok) {
              const message =
                payload?.error?.message || response.statusText || "保存项目失败";
              throw new Error(message);
            }
            if (payload.data) {
              upsertProject(payload.data as CanvasProjectRecord);
            }
          });
      };

      const nextPromise = runExclusive()
        .catch((err) => {
          const message = err instanceof Error ? err.message : "保存项目失败";
          setError(message);
          throw err;
        })
        .finally(() => {});
      saveQueueRef.current = nextPromise;
      return nextPromise;
    },
    [upsertProject, fetchProjectById],
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
          const record = payload.data as CanvasProjectRecord;
          upsertProject(record);
          setCurrentProjectId(record.id);
          return record.id;
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

  const renameProject = useCallback(
    async (projectId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !projectId) return;
      const payload = await requestJson(`/api/canvas/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });
      if (payload.data) upsertProject(payload.data as CanvasProjectRecord);
    },
    [upsertProject],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      if (!projectId) return;
      await requestJson(`/api/canvas/projects/${projectId}`, { method: "DELETE" });
      setProjects((prev) => {
        const next = prev.filter((p) => p.id !== projectId);
        projectsRef.current = next;
        return next;
      });
      if (currentProjectIdRef.current === projectId) setCurrentProjectId(null);
    },
    [],
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
    renameProject,
    deleteProject,
  };
}
