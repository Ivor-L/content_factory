import { supabase } from "@/lib/supabaseClient";
import type { CanvasProjectRecord, StyleOption } from "../types";

type CreativeTaskResponse = {
  data?: {
    id: string;
    status: string;
    message?: string;
    errorMessage?: string;
    generatedImages?: string[];
  };
};

type ReplicationResponse = {
  data?: {
    id: string;
    status: string;
    result?: Record<string, unknown>;
  };
};

function ensureOk<T>(response: Response, payload: unknown): T {
  if (!response.ok) {
    const parsed = payload as Record<string, unknown> | null;
    const error =
      (parsed && typeof parsed.error === "string" && parsed.error) ||
      (parsed && typeof parsed.message === "string" && parsed.message) ||
      `Request failed: ${response.status}`;
    throw new Error(error);
  }
  return payload as T;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const merged: RequestInit = {
    ...init,
    headers: {
      ...authHeaders,
      ...(init?.headers as Record<string, string> | undefined),
    },
  };
  const response = await fetch(url, merged);
  const payload = await response.json().catch(() => ({}));
  return ensureOk<T>(response, payload);
}

export async function fetchCanvasStyles(): Promise<StyleOption[]> {
  const payload = await fetchJson<{ data?: Array<{ id: string; name: string }> }>(
    "/api/assets/styles?type=xhs-visual&limit=200",
    { cache: "no-store" },
  );
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.map((item) => ({ id: item.id, name: item.name }));
}

export async function startTextToImageTask(params: {
  title: string;
  text: string;
  styleId: string;
  imageCount: number;
}) {
  const payload = await fetchJson<{ data?: { taskId: string }; taskId?: string }>(
    "/api/xhs-text2img/plan",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
  );
  const taskId = payload.data?.taskId || payload.taskId;
  if (!taskId) {
    throw new Error("Text2Image API returned no taskId");
  }
  return { taskId };
}

export async function getCreativeTask(taskId: string) {
  const payload = await fetchJson<CreativeTaskResponse>(`/api/creative-tasks/${taskId}`, {
    cache: "no-store",
  });
  return payload.data ?? null;
}

export async function startVideoReplicationTask(params: {
  productId: string;
  scriptId: string;
  targetCountry?: string;
  targetLanguage?: string;
  duration?: string;
  quantity?: string;
}) {
  const payload = await fetchJson<{ id?: string; status?: string }>(
    "/api/replication/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
  );

  if (!payload.id) {
    throw new Error("Video generation API returned no task id");
  }

  return { taskId: payload.id, status: payload.status ?? "pending" };
}

export async function getVideoReplicationTask(taskId: string) {
  const payload = await fetchJson<ReplicationResponse>(`/api/replication/${taskId}`, {
    cache: "no-store",
  });
  return payload.data ?? null;
}

type CanvasProjectListPayload = {
  data?: CanvasProjectRecord[];
  error?: { message?: string };
};

type CanvasProjectPayload = {
  data?: CanvasProjectRecord;
  error?: { message?: string };
};

export async function fetchCanvasProjectsFromServer(): Promise<CanvasProjectRecord[]> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch("/api/canvas/projects", {
    cache: "no-store",
    headers: authHeaders,
  });
  const payload = (await response.json().catch(() => ({}))) as CanvasProjectListPayload;
  if (!response.ok) {
    throw new Error(payload.error?.message || "Failed to load canvas projects");
  }
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function createCanvasProjectOnServer(
  name?: string,
): Promise<CanvasProjectRecord> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch("/api/canvas/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ name }),
  });
  const payload = (await response.json().catch(() => ({}))) as CanvasProjectPayload;
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message || "Failed to create canvas project");
  }
  return payload.data;
}

type CanvasProjectUpdateInput = {
  name?: string;
  thumbnail?: string | null;
};

export async function updateCanvasProjectOnServer(
  projectId: string,
  input: CanvasProjectUpdateInput,
): Promise<CanvasProjectRecord> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`/api/canvas/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => ({}))) as CanvasProjectPayload;
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message || "Failed to update canvas project");
  }
  return payload.data;
}

export async function deleteCanvasProjectOnServer(projectId: string): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(`/api/canvas/projects/${projectId}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(payload.error?.message || "Failed to delete canvas project");
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function walkForUrl(
  value: unknown,
  preferredKeys = [
    "videoUrl",
    "video_url",
    "result_url",
    "output_url",
    "finalVideoUrl",
    "url",
  ],
): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^https?:\/\//i.test(normalized)) return normalized;
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = walkForUrl(item, preferredKeys);
      if (found) return found;
    }
    return null;
  }

  if (!isObject(value)) return null;

  for (const key of preferredKeys) {
    const candidate = value[key];
    const found = walkForUrl(candidate, preferredKeys);
    if (found) return found;
  }

  for (const nestedValue of Object.values(value)) {
    const found = walkForUrl(nestedValue, preferredKeys);
    if (found) return found;
  }

  return null;
}

export function extractVideoUrl(result: Record<string, unknown> | undefined): string | null {
  if (!result) return null;
  return walkForUrl(result);
}
