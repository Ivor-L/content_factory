"use client";

import { useCallback, useRef } from "react";
import type { Node } from "@xyflow/react";
import { toast } from "react-hot-toast";
import type { MinimalFlowNodeData, UpstreamInputs } from "../lib/canvasDataAdapters";
import type { useCanvasModels } from "./useCanvasModels";
import { IMAGE_MODEL_PARAMS, VIDEO_MODEL_PARAMS } from "./useCanvasModels";
import type { CanvasResourceRecord } from "./useCanvasResources";
import { supabase } from "@/lib/supabaseClient";
import { REVERSE_IMAGE_PROMPT, REVERSE_IMAGE_PROMPT_WITH_TEXT } from "@/lib/imageUnderstandingPrompts";

const IMAGE_RATIO_PIXEL_MAP: Record<string, string> = {
  "1:1": "1024x1024",
  "4:3": "1536x1152",
  "3:4": "1152x1536",
  "3:2": "1536x1024",
  "2:3": "1024x1536",
  "16:9": "1792x1024",
  "9:16": "1024x1792",
  "21:9": "2048x896",
  "9:21": "896x2048",
};

const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_POLL_MAX_ATTEMPTS = 90;
const CANVAS_IMAGE_POLL_INTERVAL_MS = 2000;
const CANVAS_IMAGE_POLL_MAX_ATTEMPTS = 120;
const AUDIO_POLL_INTERVAL_MS = 4000;
const AUDIO_POLL_MAX_ATTEMPTS = 120;
const REALTIME_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

type CanvasModels = ReturnType<typeof useCanvasModels>;

type UploadOptions = {
  type: CanvasResourceRecord["type"];
  variant?: string;
  name?: string;
};

type UseCanvasOrchestratorOptions = {
  getNode: (nodeId: string) => Node<MinimalFlowNodeData> | undefined;
  getUpstreamInputs: (nodeId: string) => UpstreamInputs;
  patchRuntimeData: (nodeId: string, patch: Record<string, unknown>) => void;
  setNodeStatus: (
    nodeId: string,
    status: MinimalFlowNodeData["status"],
    statusMessage?: string,
  ) => void;
  models: CanvasModels;
  addResource: (record: Partial<CanvasResourceRecord>) => CanvasResourceRecord;
};

type UseCanvasOrchestratorResult = {
  runImageNode: (nodeId: string) => Promise<void>;
  runVideoNode: (nodeId: string) => Promise<void>;
  runAudioNode: (nodeId: string) => Promise<void>;
  runDigitalHumanNode: (nodeId: string) => Promise<void>;
  runStoryboardNode: (nodeId: string) => Promise<void>;
  runTextNode: (nodeId: string) => Promise<void>;
  runGridNode: (nodeId: string) => Promise<void>;
  splitGridNode: (nodeId: string) => Promise<string[]>;
  reverseImagePrompt: (nodeId: string, mode?: "no-text" | "with-text") => Promise<string>;
  uploadResource: (file: File, options: UploadOptions) => Promise<CanvasResourceRecord>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeAspectRatio(value?: string) {
  if (!value) return "1:1";
  const normalized = value.replace(/\s+/g, "").replace(/×/g, "x");
  if (normalized.includes(":")) return normalized;
  if (normalized.includes("x")) {
    const [w, h] = normalized.split("x");
    if (w && h) {
      const width = Number(w);
      const height = Number(h);
      if (Number.isFinite(width) && Number.isFinite(height) && height !== 0) {
        const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
        const divisor = gcd(width, height);
        return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
      }
    }
  }
  return value;
}

function ratioToPixelSize(value?: string) {
  if (!value) return IMAGE_RATIO_PIXEL_MAP["1:1"];
  const normalized = value.replace(/\s+/g, "").replace(/×/g, "x");
  if (/^\d+x\d+$/i.test(normalized)) return normalized;
  const asRatio = normalizeAspectRatio(normalized);
  return IMAGE_RATIO_PIXEL_MAP[asRatio] || IMAGE_RATIO_PIXEL_MAP["1:1"];
}

function ensureNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return fallback;
}

function createOutputId(prefix: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function toDataUrl(content: string, mime = "image/png") {
  if (!content) return "";
  if (content.startsWith("data:")) return content;
  return `data:${mime};base64,${content}`;
}

const DATA_URL_REGEX = /^data:(.+);base64,(.*)$/i;
const CANVAS_PERF_TRACING = process.env.NODE_ENV !== "production";
const PERF_LOG_THROTTLE_MS = 2000;

function isDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

function dataUrlToFile(dataUrl: string, fallbackName: string): File | null {
  const match = dataUrl.match(DATA_URL_REGEX);
  if (!match) return null;
  const mime = match[1];
  const base64 = match[2];
  let binary: string;
  if (typeof atob !== "function") return null;
  binary = atob(base64);
  try {
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const extension =
      mime.split("/")[1]?.split("+")[0]?.replace(/[^a-z0-9]/gi, "") || "bin";
    const name = fallbackName.includes(".") ? fallbackName : `${fallbackName}.${extension}`;
    return new File([bytes], name, { type: mime });
  } catch {
    return null;
  }
}

function collectUrlCandidates(record: unknown): string[] {
  if (!record) return [];
  if (typeof record === "string") {
    if (/^https?:\/\//i.test(record) || record.startsWith("data:")) return [record];
    return [];
  }
  if (Array.isArray(record)) {
    return record.flatMap(collectUrlCandidates);
  }
  if (typeof record !== "object") return [];
  const payload = record as Record<string, any>;
  const urls: string[] = [];
  if (typeof payload.url === "string") urls.push(payload.url);
  if (typeof payload.image_url === "string") urls.push(payload.image_url);
  if (typeof payload.fileUrl === "string") urls.push(payload.fileUrl);
  if (payload.data && typeof payload.data === "object" && typeof (payload.data as any).url === "string") {
    urls.push((payload.data as any).url);
  }
  if (Array.isArray(payload.data)) {
    for (const item of payload.data) {
      urls.push(...collectUrlCandidates(item));
    }
  }
  if (Array.isArray(payload.images)) {
    for (const item of payload.images) {
      urls.push(...collectUrlCandidates(item));
    }
  }
  if (payload.b64_json || payload.b64Json) {
    const mime = payload.mime_type || payload.mimeType || "image/png";
    urls.push(toDataUrl(payload.b64_json || payload.b64Json, mime));
  }
  // Gemini inlineData format: { inlineData: { data: "base64...", mimeType: "image/png" } }
  if (payload.inlineData && typeof payload.inlineData === "object") {
    const inlineData = payload.inlineData as Record<string, any>;
    if (inlineData.data) {
      const mime = inlineData.mimeType || "image/png";
      urls.push(toDataUrl(inlineData.data, mime));
    }
  }
  if (payload.inline_url) urls.push(payload.inline_url);
  if (payload.result && typeof payload.result === "object") {
    urls.push(...collectUrlCandidates(payload.result));
  }
  if (payload.content && typeof payload.content === "object") {
    const content = payload.content as Record<string, any>;
    // Handle Gemini content.parts[] structure
    if (Array.isArray(content.parts)) {
      for (const part of content.parts) {
        urls.push(...collectUrlCandidates(part));
      }
    } else {
      urls.push(...collectUrlCandidates(content));
    }
  }
  // Gemini parts array directly on payload
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      urls.push(...collectUrlCandidates(part));
    }
  }
  return urls.filter(Boolean);
}

function dedupeUrls(urls: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    if (!seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }
  return result;
}

function extractImageUrls(payload: unknown) {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return dedupeUrls(payload.flatMap(collectUrlCandidates));
  }
  const record = payload as Record<string, any>;
  // Gemini response: { candidates: [{ content: { parts: [{ inlineData: {...} }] } }] }
  if (Array.isArray(record?.candidates)) {
    return dedupeUrls(record.candidates.flatMap(collectUrlCandidates));
  }
  if (Array.isArray(record?.data)) {
    return dedupeUrls(record.data.flatMap(collectUrlCandidates));
  }
  if (Array.isArray(record?.images)) {
    return dedupeUrls(record.images.flatMap(collectUrlCandidates));
  }
  if (Array.isArray(record?.output)) {
    return dedupeUrls(record.output.flatMap(collectUrlCandidates));
  }
  if (record?.result) {
    return dedupeUrls(collectUrlCandidates(record.result));
  }
  if (record?.url || record?.image_url) {
    return dedupeUrls([record.url, record.image_url].filter(Boolean) as string[]);
  }
  return [];
}

function extractTaskId(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, any>;
  return String(
    record.taskId ||
      record.task_id ||
      record.id ||
      record?.data?.taskId ||
      record?.data?.task_id ||
      record?.data?.id ||
      "",
  ).trim();
}

function extractErrorMessage(payload: unknown, fallback = "请求失败") {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, any>;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error.message === "string") return record.error.message;
  if (typeof record.msg === "string") return record.msg;
  if (typeof record.message === "string") return record.message;
  return fallback;
}

function extractVideoUrl(payload: unknown): string {
  const urls = extractImageUrls(payload);
  if (urls.length > 0) return urls[0];
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, any>;
  return (
    record.video_url ||
    record.url ||
    record?.data?.video_url ||
    record?.data?.url ||
    record?.result?.video_url ||
    record?.result?.url ||
    ""
  );
}

function extractVideoTaskId(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, any>;
  return (
    record.task_id ||
    record.taskId ||
    record.id ||
    record?.data?.task_id ||
    record?.data?.taskId ||
    ""
  );
}

function extractStatus(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, any>;
  const raw =
    record.status ||
    record.state ||
    record.task_status ||
    record.taskStatus ||
    record?.data?.status ||
    record?.data?.state ||
    "";
  return String(raw || "").toLowerCase();
}

function extractAudioUrl(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, any>;
  return record.audioUrl || record.fileUrl || record.url || record?.data?.audioUrl || record?.data?.url || "";
}

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
    cache: "no-store",
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    const message = extractErrorMessage(parsed, response.statusText || "请求失败");
    throw new Error(message);
  }
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, any>;
    const isFailure =
      record.error ||
      record.success === false ||
      record.ok === false ||
      (typeof record.code === "number" && record.code >= 400);
    if (isFailure) {
      const message = extractErrorMessage(parsed, "请求失败");
      throw new Error(message);
    }
  }
  return parsed;
}

function getImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      resolve(null);
      return;
    }

    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      resolve(null);
    }, 7000);

    image.onload = () => {
      window.clearTimeout(timeout);
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      resolve(null);
    };
    image.src = trimmedUrl;
  });
}

async function getJson(url: string) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    const message = extractErrorMessage(parsed, response.statusText || "请求失败");
    throw new Error(message);
  }
  return parsed;
}

function isTaskQueuedResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, any>;
  return Boolean(
    record.queued ||
    (typeof record.status === "string" && ["processing", "queued", "pending"].includes(record.status.toLowerCase())) ||
    (typeof record?.data?.status === "string" && ["processing", "queued", "pending"].includes(String(record.data.status).toLowerCase())),
  );
}

function isTaskFinished(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, any>;
  const status = String(record.status || record.state || record?.data?.status || "").toLowerCase();
  return ["completed", "succeeded", "success", "failed", "error"].includes(status);
}

function isTaskFailed(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, any>;
  const status = String(record.status || record.state || record?.data?.status || "").toLowerCase();
  return ["failed", "error"].includes(status);
}


export function useCanvasOrchestrator(options: UseCanvasOrchestratorOptions): UseCanvasOrchestratorResult {
  const { getNode, getUpstreamInputs, patchRuntimeData, setNodeStatus, models, addResource } = options;
  const runningNodeIds = useRef(new Set<string>());
  const dataUrlPerfLogRef = useRef(0);

  const uploadResource = useCallback(
    async (file: File, options: UploadOptions) => {
      if (!(file instanceof File)) {
        throw new Error("请选择要上传的文件");
      }

      // Try OSS presign direct upload first (bypasses Next.js body size limit)
      const presignResponse = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
        credentials: "include",
        cache: "no-store",
      });

      if (presignResponse.ok) {
        try {
          const { uploadUrl, publicUrl } = await presignResponse.json();
          const putResponse = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (putResponse.ok) {
            const resource = addResource({
              type: options.type,
              variant: options.variant || undefined,
              name: options.name || file.name,
              url: publicUrl,
            });
            toast.success("资源上传成功");
            return resource;
          }
        } catch {
          // Local/dev OSS CORS can block direct PUT; fall back to server upload below.
        }
      }

      // Fallback: upload via server API
      const endpointMap: Record<string, string> = {
        image: "/api/upload/image",
        video: "/api/upload/video",
        audio: "/api/upload/audio",
        text: "/api/upload/image",
      };
      const endpoint = endpointMap[options.type] || "/api/upload/image";
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        const message = extractErrorMessage(payload, "上传失败");
        throw new Error(message);
      }
      const resource = addResource({
        type: options.type,
        variant: options.variant || undefined,
        name: options.name || file.name,
        url: payload.url,
      });
      toast.success("资源上传成功");
      return resource;
    },
    [addResource],
  );

  const persistDataUrl = useCallback(
    async (
      url: string,
      fallbackName: string,
      options: UploadOptions,
      errorMessage = "图片上传失败",
    ): Promise<string> => {
      const shouldTrace = CANVAS_PERF_TRACING && typeof performance !== "undefined";
      const startedAt = shouldTrace ? performance.now() : 0;
      if (!isDataUrl(url)) return url;
      const file = dataUrlToFile(url, fallbackName);
      if (!file) {
        throw new Error(errorMessage);
      }
      const uploadOptions: UploadOptions = {
        ...options,
        name: options.name ?? file.name,
      };
      const resource = await uploadResource(file, uploadOptions);
      if (shouldTrace) {
        const duration = performance.now() - startedAt;
        if (duration > 15 && performance.now() - dataUrlPerfLogRef.current > PERF_LOG_THROTTLE_MS) {
          const sizeKb = Math.round((file.size / 1024) * 10) / 10;
          console.info(
            `[canvas][perf] persistDataUrl ${uploadOptions.type} ~${sizeKb}KB took ${duration.toFixed(1)}ms`,
          );
          dataUrlPerfLogRef.current = performance.now();
        }
      }
      return resource.url;
    },
    [uploadResource],
  );

  const persistNodeAsset = useCallback(
    async (
      nodeId: string,
      value: string | undefined | null,
      fallbackName: string,
      options: UploadOptions,
      errorMessage: string,
      patchKeys?: string[],
    ): Promise<string | undefined | null> => {
      if (typeof value !== "string" || value.length === 0) return value ?? undefined;
      if (!isDataUrl(value)) return value;
      const uploaded = await persistDataUrl(value, fallbackName, options, errorMessage);
      if (patchKeys && patchKeys.length > 0) {
        const patch: Record<string, string> = {};
        patchKeys.forEach((key) => {
          patch[key] = uploaded;
        });
        patchRuntimeData(nodeId, patch);
      }
      return uploaded;
    },
    [patchRuntimeData, persistDataUrl],
  );

  const runImageNode = useCallback(
    async (nodeId: string) => {
      if (!nodeId) return;
      const node = getNode(nodeId);
      if (!node) {
        toast.error("未找到对应节点");
        return;
      }
      if (runningNodeIds.current.has(nodeId)) {
        toast("该节点正在执行，请稍候");
        return;
      }
      runningNodeIds.current.add(nodeId);
      const runtimeData = (node.data.runtime?.data || {}) as Record<string, any>;
      const upstream = getUpstreamInputs(nodeId);
      // Merge all upstream text contents + own supplement
      const allTexts = [...upstream.textContents];
      const ownSupplement = String(runtimeData.prompt || runtimeData.content || "").trim();
      if (ownSupplement) allTexts.push(ownSupplement);
      const prompt = allTexts.join("\n") || upstream.effectivePrompt || "";
      const model =
        String(runtimeData.model || models.defaultModels.image?.id || models.imageModels[0]?.id || "").trim();
      const ratio = String(runtimeData.ratio || runtimeData.size || "16:9").trim();
      const quality = String(runtimeData.quality || "standard").trim();
      const modeFromRuntime = String(runtimeData.generationMode || "").trim().toLowerCase();
      const references = [
        runtimeData.image,
        runtimeData.referenceImage,
        runtimeData.referenceImageUrl,
        ...(upstream.imageUrls || [])
      ].filter((url): url is string => typeof url === "string" && url.trim().length > 0);
      const hasPrompt = Boolean(prompt.trim());
      // Backward compatible default:
      // - if user explicitly selected mode, respect it
      // - otherwise prefer text2img when prompt exists; fall back to img2img only when prompt is empty
      const generationMode: "text2img" | "img2img" =
        modeFromRuntime === "img2img" || modeFromRuntime === "text2img"
          ? (modeFromRuntime as "text2img" | "img2img")
          : (!hasPrompt && references.length > 0 ? "img2img" : "text2img");

      if (!prompt && !references.length) {
        toast.error("请先输入提示词或上传参考图");
        runningNodeIds.current.delete(nodeId);
        return;
      }
      if (generationMode === "text2img" && !hasPrompt) {
        toast.error("文生图模式请先输入提示词");
        runningNodeIds.current.delete(nodeId);
        return;
      }
      if (generationMode === "img2img" && references.length === 0) {
        toast.error("图生图模式请先上传参考图");
        runningNodeIds.current.delete(nodeId);
        return;
      }
      if (!model) {
        toast.error("请选择模型");
        runningNodeIds.current.delete(nodeId);
        return;
      }

      setNodeStatus(nodeId, "running");
      patchRuntimeData(nodeId, {
        lastRunError: null,
        lastRequest: { model, ratio, quality },
      });

      try {
        const params = IMAGE_MODEL_PARAMS[model];
        let payload: Record<string, unknown>;
        const shouldAttachReferences = generationMode === "img2img" && references.length > 0;

        if (model === "nano-banana-2" || model === "gemini-3.1-pro-preview" || model === "nano-banana-pro") {
          // Gemini-backed models: prompt + ratio + optional image references
          payload = { model, prompt, aspect_ratio: normalizeAspectRatio(ratio) };
          if (shouldAttachReferences) payload.images = references;
        } else if (model === "grok-3-image") {
          // grok image: size as pixel dimensions string, ratio options are pixel strings
          const pixelSize = (params?.ratios?.length ? ratio : "960x960");
          payload = { model, prompt, size: pixelSize };
          if (shouldAttachReferences) payload.images = references;
        } else if (model === "doubao-seedream-4-5-251128") {
          // Doubao SeedDream: size as ratio string, quality
          payload = {
            model,
            prompt,
            size: normalizeAspectRatio(ratio),
            quality,
          };
          if (shouldAttachReferences) payload.images = references;
        } else {
          // Generic fallback
          payload = {
            model,
            prompt,
            quality,
            size: ratioToPixelSize(ratio),
            aspect_ratio: normalizeAspectRatio(ratio),
            n: 1,
          };
          if (shouldAttachReferences) payload.images = references;
        }

        const response = await postJson("/api/canvas/images/generations", payload);
        console.log("[canvas/image] raw response:", JSON.stringify(response)?.slice(0, 500));
        const taskId = extractTaskId(response);
        if (taskId && isTaskQueuedResponse(response)) {
          patchRuntimeData(nodeId, {
            taskId,
            lastTaskStatus: "queued",
            lastRequest: payload,
          });
          let urls: string[] = [];
          for (let attempt = 0; attempt < CANVAS_IMAGE_POLL_MAX_ATTEMPTS; attempt += 1) {
            if (attempt > 0) {
              await sleep(CANVAS_IMAGE_POLL_INTERVAL_MS);
            }
            const taskData = await getJson(`/api/canvas/images/tasks/${encodeURIComponent(taskId)}`);
            const status = String((taskData as Record<string, any>)?.status || (taskData as Record<string, any>)?.state || "").toLowerCase();
            patchRuntimeData(nodeId, {
              taskId,
              lastTaskStatus: status || "processing",
              lastPolledAt: Date.now(),
            });
            urls = extractImageUrls(taskData);
            if (isTaskFailed(taskData)) {
              throw new Error(extractErrorMessage(taskData, "图片生成失败"));
            }
            if (urls.length > 0 || isTaskFinished(taskData)) {
              break;
            }
          }
          if (!urls.length) {
            throw new Error("图片生成超时，请稍后在任务列表查看结果");
          }
          const outputs = urls.map((url) => ({
            id: createOutputId("image"),
            url,
            createdAt: Date.now(),
          }));
          const generatedAt = Date.now();
          const persistedOutputs = await Promise.all(
            outputs.map(async (output, index) => {
              if (!isDataUrl(output.url)) {
                return output;
              }
              const file = dataUrlToFile(output.url, `canvas-image-${generatedAt}-${index + 1}`);
              if (!file) {
                return output;
              }
              const resource = await uploadResource(file, { type: "image", name: file.name });
              return { ...output, url: resource.url };
            }),
          );
          patchRuntimeData(nodeId, {
            outputs: persistedOutputs,
            lastCompletedAt: Date.now(),
            lastRequest: payload,
          });
          setNodeStatus(nodeId, "success");
          toast.success("图片生成完成");
          return;
        }
        const urls = extractImageUrls(response);
        if (!urls.length) {
          throw new Error("未获取到图片结果");
        }
        const outputs = urls.map((url) => ({
          id: createOutputId("image"),
          url,
          createdAt: Date.now(),
        }));
        const generatedAt = Date.now();
        const persistedOutputs = await Promise.all(
          outputs.map(async (output, index) => {
            if (!isDataUrl(output.url)) {
              return output;
            }
            const file = dataUrlToFile(output.url, `canvas-image-${generatedAt}-${index + 1}`);
            if (!file) {
              return output;
            }
            const resource = await uploadResource(file, { type: "image", name: file.name });
            return { ...output, url: resource.url };
          }),
        );
        patchRuntimeData(nodeId, {
          outputs: persistedOutputs,
          lastCompletedAt: Date.now(),
          lastRequest: payload,
        });
        setNodeStatus(nodeId, "success");
        toast.success("图片生成完成");
      } catch (error) {
        const message = error instanceof Error ? error.message : "图片生成失败";
        patchRuntimeData(nodeId, { lastRunError: message });
        setNodeStatus(nodeId, "error", message);
        toast.error(message);
      } finally {
        runningNodeIds.current.delete(nodeId);
      }
    },
    [getNode, getUpstreamInputs, models, patchRuntimeData, setNodeStatus, uploadResource],
  );

  const waitForVideoTask = useCallback(
    (taskId: string, nodeId: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const channel = supabase
          .channel(`canvas_video_task_${taskId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "canvas_video_tasks",
              filter: `task_id=eq.${taskId}`,
            },
            (payload) => {
              const row = payload.new as Record<string, any>;
              supabase.removeChannel(channel);
              if (row.status === "success" && row.video_url) {
                patchRuntimeData(nodeId, { lastTaskStatus: "completed" });
                resolve(row.video_url);
              } else {
                patchRuntimeData(nodeId, { lastTaskStatus: "error" });
                reject(new Error(row.error_message || "视频生成失败"));
              }
            },
          )
          .subscribe();

        // Timeout after 20 minutes
        setTimeout(() => {
          supabase.removeChannel(channel);
          reject(new Error("视频生成超时，请稍后重试"));
        }, 20 * 60 * 1000);
      });
    },
    [patchRuntimeData],
  );

  const runVideoNode = useCallback(
    async (nodeId: string) => {
      if (!nodeId) return;
      const node = getNode(nodeId);
      if (!node) {
        toast.error("未找到对应节点");
        return;
      }
      if (runningNodeIds.current.has(nodeId)) {
        toast("该节点正在执行，请稍候");
        return;
      }
      runningNodeIds.current.add(nodeId);
      const runtimeData = (node.data.runtime?.data || {}) as Record<string, any>;
      const upstream = getUpstreamInputs(nodeId);
      // Merge all upstream text contents + own supplement
      const allTexts = [...upstream.textContents];
      const ownSupplement = String(runtimeData.prompt || runtimeData.content || "").trim();
      if (ownSupplement) allTexts.push(ownSupplement);
      const prompt = allTexts.join("\n") || upstream.effectivePrompt || "";
      const model =
        String(runtimeData.model || models.defaultModels.video?.id || models.videoModels[0]?.id || "").trim();
      const ratio = normalizeAspectRatio(String(runtimeData.ratio || runtimeData.aspect_ratio || "16:9"));
      const orientation = String(runtimeData.orientation || "landscape").trim();
      const size = String(runtimeData.size || "small").trim();
      const resolution = String(runtimeData.resolution || "720p").trim();
      const durationRaw = runtimeData.duration || runtimeData.seconds || "8";
      const durationStr = String(durationRaw).replace(/s$/, "").trim();
      const durationInt = Math.max(4, parseInt(durationStr, 10) || 8);
      // Own first/last frame takes precedence; fall back to upstream image output
      let firstFrame =
        (typeof runtimeData.firstFrameImage === "string" && runtimeData.firstFrameImage.trim()) ||
        (typeof runtimeData.first_frame_image === "string" && runtimeData.first_frame_image.trim()) ||
        upstream.firstImageUrl ||
        undefined;
      let lastFrame = runtimeData.lastFrameImage || runtimeData.last_frame_image || undefined;
      const country = String(runtimeData.country || "").trim();
      const sellingPointsJson = String(runtimeData.sellingPointsJson || "").trim();
      const blueprint = runtimeData.blueprint;
      let productImageUrl = String(runtimeData.productImageUrl || "").trim();

      if (!prompt) {
        toast.error("请先输入提示词");
        runningNodeIds.current.delete(nodeId);
        return;
      }
      if (!model) {
        toast.error("请选择模型");
        runningNodeIds.current.delete(nodeId);
        return;
      }

      setNodeStatus(nodeId, "running");
      patchRuntimeData(nodeId, {
        lastRunError: null,
        taskId: null,
        outputUrl: null,
      });

      try {
        if (firstFrame) {
          firstFrame =
            (await persistNodeAsset(
              nodeId,
              firstFrame,
              `video-first-frame-${nodeId}`,
              { type: "image", name: `video-first-frame-${nodeId}.png` },
              "首帧图片上传失败",
              ["firstFrameImage", "first_frame_image"],
            )) ?? firstFrame;
        }
        if (lastFrame) {
          lastFrame =
            (await persistNodeAsset(
              nodeId,
              lastFrame,
              `video-last-frame-${nodeId}`,
              { type: "image", name: `video-last-frame-${nodeId}.png` },
              "尾帧图片上传失败",
              ["lastFrameImage", "last_frame_image"],
            )) ?? lastFrame;
        }
        if (productImageUrl) {
          productImageUrl =
            (await persistNodeAsset(
              nodeId,
              productImageUrl,
              `video-product-${nodeId}`,
              { type: "image", name: `video-product-${nodeId}.png` },
              "产品图上传失败",
              ["productImageUrl"],
            )) ?? productImageUrl;
        }

        let payload: Record<string, unknown>;
        const veoModels = new Set(["veo_3_1-fast", "veo_3_1", "veo3", "veo3-fast"]);

        if (model === "sora-2-all") {
          // Sora 2: orientation (landscape/portrait), size (small/large), duration as integer seconds
          payload = {
            model,
            prompt,
            orientation,
            size,
            duration: durationInt,
            watermark: false,
          };
          if (firstFrame) payload.images = [firstFrame];
        } else if (veoModels.has(model)) {
          // Veo 3.x: aspect_ratio, duration as int64, resolution, generate_audio
          payload = {
            model,
            prompt,
            aspect_ratio: ratio,
            duration: durationInt,
            resolution,
            generate_audio: true,
          };
          if (firstFrame) payload.image_url = firstFrame;
        } else if (model === "grok-video-3") {
          // Grok Video 3: aspect_ratio, size fixed "720P"
          payload = {
            model,
            prompt,
            aspect_ratio: ratio,
            size: "720P",
          };
          if (firstFrame) payload.images = [firstFrame];
        } else {
          // Generic fallback
          payload = { model, prompt, ratio, size: ratio, seconds: durationInt };
          if (firstFrame) payload.first_frame_image = firstFrame;
          if (lastFrame) payload.last_frame_image = lastFrame;
        }

        if (country) payload.country = country;
        if (sellingPointsJson) payload.sellingPointsJson = sellingPointsJson;
        if (blueprint) payload.blueprint = blueprint;
        if (productImageUrl) payload.productImageUrl = productImageUrl;
        // node_id lets the API use it as task_id so our Supabase subscription matches
        payload.node_id = nodeId;

        patchRuntimeData(nodeId, { taskId: nodeId, lastTaskStatus: "queued" });
        await postJson("/api/canvas/videos", payload);

        const url = await waitForVideoTask(nodeId, nodeId);
        const persistedVideoUrl = await persistDataUrl(
          url,
          `video-output-${nodeId}`,
          { type: "video", name: `canvas-video-${nodeId}.mp4` },
          "视频上传失败",
        );
        const outputRecord = {
          id: createOutputId("video"),
          url: persistedVideoUrl,
          createdAt: Date.now(),
        };
        patchRuntimeData(nodeId, {
          outputUrl: persistedVideoUrl,
          lastCompletedAt: Date.now(),
          lastTaskStatus: "completed",
          outputs: [outputRecord],
        });
        addResource({
          type: "video",
          variant: "output",
          name: `视频输出 ${new Date().toLocaleTimeString()}`,
          url: persistedVideoUrl,
          metadata: { nodeId },
        });
        setNodeStatus(nodeId, "success");
        toast.success("视频生成完成");
      } catch (error) {
        const message = error instanceof Error ? error.message : "视频生成失败";
        patchRuntimeData(nodeId, { lastRunError: message });
        setNodeStatus(nodeId, "error", message);
        toast.error(message);
      } finally {
        runningNodeIds.current.delete(nodeId);
      }
    },
    [
      addResource,
      getNode,
      getUpstreamInputs,
      models,
      patchRuntimeData,
      waitForVideoTask,
      setNodeStatus,
      persistNodeAsset,
      persistDataUrl,
    ],
  );

  const pollAudioTask = useCallback(
    async (taskId: string, nodeId: string) => {
      for (let attempt = 0; attempt < AUDIO_POLL_MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) {
          await sleep(AUDIO_POLL_INTERVAL_MS);
        }
        const data = await getJson(`/api/canvas/audio?taskId=${encodeURIComponent(taskId)}`);
        const status = extractStatus(data);
        const audioUrl = extractAudioUrl(data);
        patchRuntimeData(nodeId, {
          audioTaskId: taskId,
          audioTaskStatus: status || "running",
          lastPolledAt: Date.now(),
        });
        if (audioUrl) {
          return audioUrl;
        }
        if (["failed", "error", "canceled", "cancelled", "timeout"].includes(status)) {
          throw new Error(extractErrorMessage(data, "语音生成失败"));
        }
      }
      throw new Error("语音生成超时，请稍后重试");
    },
    [patchRuntimeData],
  );

  const pollSunoMusicTask = useCallback(
    async (taskId: string, nodeId: string) => {
      const SUNO_POLL_INTERVAL_MS = 4000;
      const SUNO_POLL_MAX_ATTEMPTS = 90;
      for (let attempt = 0; attempt < SUNO_POLL_MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) await sleep(SUNO_POLL_INTERVAL_MS);
        const data = await getJson(`/api/canvas/audio/suno?taskId=${encodeURIComponent(taskId)}`);
        const record = data as { status?: string; audioUrl?: string; error?: string };
        patchRuntimeData(nodeId, {
          audioTaskId: taskId,
          audioTaskStatus: record.status || "running",
          lastPolledAt: Date.now(),
        });
        if (record.audioUrl) return record.audioUrl;
        if (record.status === "error") throw new Error(record.error || "音乐生成失败");
      }
      throw new Error("音乐生成超时，请稍后重试");
    },
    [patchRuntimeData],
  );

  const runAudioNode = useCallback(
    async (nodeId: string) => {
      if (!nodeId) return;
      const node = getNode(nodeId);
      if (!node) {
        toast.error("未找到对应节点");
        return;
      }
      if (runningNodeIds.current.has(nodeId)) {
        toast("该节点正在执行，请稍候");
        return;
      }
      runningNodeIds.current.add(nodeId);
      const runtimeData = (node.data.runtime?.data || {}) as Record<string, any>;
      const upstream = getUpstreamInputs(nodeId);
      const model = String(runtimeData.model || models.defaultModels.audio?.id || models.audioModels[0]?.id || "").trim();

      // --- Suno music ---
      if (model === "suno_music") {
        const prompt = String(runtimeData.prompt || runtimeData.script || runtimeData.content || upstream.effectivePrompt || "").trim();
        if (!prompt) {
          toast.error("请先输入音乐描述");
          runningNodeIds.current.delete(nodeId);
          return;
        }
        setNodeStatus(nodeId, "running");
        patchRuntimeData(nodeId, { audioTaskId: null, audioTaskStatus: null, audioUrl: null, lastRunError: null });
        try {
          const sunoBody: Record<string, unknown> = {
            type: "music",
            gpt_description_prompt: prompt,
            prompt,
            mv: String(runtimeData.mv || "chirp-v4"),
            make_instrumental: Boolean(runtimeData.make_instrumental ?? false),
          };
          if (runtimeData.title) sunoBody.title = String(runtimeData.title);
          if (runtimeData.tags) sunoBody.tags = String(runtimeData.tags);
          const response = await postJson("/api/canvas/audio/suno", sunoBody);
          const { taskId } = response as { taskId?: string };
          if (!taskId) throw new Error("未获取到音乐任务 ID");
          patchRuntimeData(nodeId, { audioTaskId: taskId, audioTaskStatus: "queued" });
          const audioUrl = await pollSunoMusicTask(taskId, nodeId);
          const persistedAudioUrl = await persistDataUrl(
            audioUrl,
            `suno-music-${taskId}`,
            { type: "audio", name: `suno-music-${taskId}.mp3` },
            "音乐上传失败",
          );
          patchRuntimeData(nodeId, {
            audioUrl: persistedAudioUrl,
            audioTaskStatus: "completed",
            lastCompletedAt: Date.now(),
            outputs: [{ id: createOutputId("suno"), url: persistedAudioUrl, createdAt: Date.now() }],
          });
          addResource({
            type: "audio",
            variant: "output",
            name: `Suno 音乐 ${new Date().toLocaleTimeString()}`,
            url: persistedAudioUrl,
            metadata: { nodeId },
          });
          setNodeStatus(nodeId, "success");
          toast.success("音乐生成完成");
        } catch (error) {
          const message = error instanceof Error ? error.message : "音乐生成失败";
          patchRuntimeData(nodeId, { lastRunError: message });
          setNodeStatus(nodeId, "error", message);
          toast.error(message);
        } finally {
          runningNodeIds.current.delete(nodeId);
        }
        return;
      }

      // --- Suno lyrics (generate text) ---
      if (model === "suno_lyrics") {
        const prompt = String(runtimeData.prompt || runtimeData.script || runtimeData.content || upstream.effectivePrompt || "").trim();
        if (!prompt) {
          toast.error("请先输入歌词主题");
          runningNodeIds.current.delete(nodeId);
          return;
        }
        setNodeStatus(nodeId, "running");
        patchRuntimeData(nodeId, { lastRunError: null });
        try {
          const response = await postJson("/api/canvas/audio/suno", { type: "lyrics", prompt });
          const { lyrics } = response as { lyrics?: string };
          if (!lyrics) throw new Error("未获取到歌词");
          // Fill script field with generated lyrics
          patchRuntimeData(nodeId, { script: lyrics, lastCompletedAt: Date.now() });
          setNodeStatus(nodeId, "success");
          toast.success("歌词生成完成");
        } catch (error) {
          const message = error instanceof Error ? error.message : "歌词生成失败";
          patchRuntimeData(nodeId, { lastRunError: message });
          setNodeStatus(nodeId, "error", message);
          toast.error(message);
        } finally {
          runningNodeIds.current.delete(nodeId);
        }
        return;
      }

      // --- Standard TTS audio ---
      const script = String(runtimeData.script || runtimeData.content || upstream.effectivePrompt || "").trim();
      let voiceReference = String(runtimeData.voiceReference || runtimeData.voiceReferenceUrl || "").trim();
      let emotionReference = String(runtimeData.emotionReference || runtimeData.emotionReferenceUrl || "").trim();

      if (!script) {
        toast.error("请先输入口播文本");
        runningNodeIds.current.delete(nodeId);
        return;
      }
      if (!voiceReference) {
        toast.error("请提供音色参考音频");
        runningNodeIds.current.delete(nodeId);
        return;
      }

      setNodeStatus(nodeId, "running");
      voiceReference =
        (await persistNodeAsset(
          nodeId,
          voiceReference,
          `audio-voice-ref-${nodeId}`,
          { type: "audio", name: `audio-voice-ref-${nodeId}.wav` },
          "音色参考上传失败",
          ["voiceReference"],
        )) ?? voiceReference;
      if (emotionReference) {
        emotionReference =
          (await persistNodeAsset(
            nodeId,
            emotionReference,
            `audio-emotion-ref-${nodeId}`,
            { type: "audio", name: `audio-emotion-ref-${nodeId}.wav` },
            "情绪参考上传失败",
            ["emotionReference", "emotionReferenceUrl"],
          )) ?? emotionReference;
      }
      patchRuntimeData(nodeId, {
        audioTaskId: null,
        audioTaskStatus: null,
        audioUrl: null,
        lastRunError: null,
      });

      try {
        const response = await postJson("/api/canvas/audio", {
          script,
          voiceReferenceUrl: voiceReference,
          emotionReferenceUrl: emotionReference,
        });
        const taskId = extractVideoTaskId(response);
        if (!taskId) {
          throw new Error("未获取到任务 ID");
        }
        patchRuntimeData(nodeId, { audioTaskId: taskId, audioTaskStatus: "queued" });
        const audioUrl = await pollAudioTask(taskId, nodeId);
        const persistedAudioUrl = await persistDataUrl(
          audioUrl,
          `audio-output-${taskId}`,
          { type: "audio", name: `canvas-audio-${taskId}.mp3` },
          "语音上传失败",
        );
        patchRuntimeData(nodeId, {
          audioUrl: persistedAudioUrl,
          audioTaskStatus: "completed",
          lastCompletedAt: Date.now(),
          outputs: [
            {
              id: createOutputId("audio"),
              url: persistedAudioUrl,
              createdAt: Date.now(),
            },
          ],
        });
        addResource({
          type: "audio",
          variant: "output",
          name: `语音输出 ${new Date().toLocaleTimeString()}`,
          url: persistedAudioUrl,
          metadata: { nodeId },
        });
        setNodeStatus(nodeId, "success");
        toast.success("语音生成完成");
      } catch (error) {
        const message = error instanceof Error ? error.message : "语音生成失败";
        patchRuntimeData(nodeId, { lastRunError: message });
        setNodeStatus(nodeId, "error", message);
        toast.error(message);
      } finally {
        runningNodeIds.current.delete(nodeId);
      }
    },
    [
      addResource,
      getNode,
      getUpstreamInputs,
      models,
      patchRuntimeData,
      pollAudioTask,
      pollSunoMusicTask,
      setNodeStatus,
      persistNodeAsset,
      persistDataUrl,
    ],
  );

  const waitForDigitalHumanJob = useCallback(
    (videoId: string, nodeId: string): Promise<string> =>
      new Promise((resolve, reject) => {
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
          .channel(`canvas_dh_${videoId}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "digital_human_videos", filter: `id=eq.${videoId}` },
            (payload) => {
              const row = payload.new as Record<string, unknown>;
              const status = String(row.status || "").toUpperCase();
              patchRuntimeData(nodeId, { dhVideoId: videoId, dhStatus: status });
              if (row.result_url) {
                settle(() => resolve(String(row.result_url)));
              } else if (["FAILED", "ERROR", "CANCELED"].includes(status)) {
                settle(() => reject(new Error("数字人视频生成失败")));
              }
            },
          )
          .subscribe();

        // Race condition guard: check current status after subscribe
        void getJson(`/api/canvas/digital-human?videoId=${encodeURIComponent(videoId)}`)
          .then((data) => {
            const record = data as { status?: string; resultUrl?: string | null };
            const status = String(record.status || "").toUpperCase();
            patchRuntimeData(nodeId, { dhVideoId: videoId, dhStatus: status });
            if (record.resultUrl) settle(() => resolve(record.resultUrl!));
            else if (["FAILED", "ERROR", "CANCELED"].includes(status)) settle(() => reject(new Error("数字人视频生成失败")));
          })
          .catch(() => {});

        timeoutId = setTimeout(() => settle(() => reject(new Error("数字人视频生成超时，请稍后重试"))), REALTIME_TIMEOUT_MS);
      }),
    [patchRuntimeData],
  );

  const runDigitalHumanNode = useCallback(
    async (nodeId: string) => {
      if (!nodeId) return;
      const node = getNode(nodeId);
      if (!node) {
        toast.error("未找到对应节点");
        return;
      }
      if (runningNodeIds.current.has(nodeId)) {
        toast("该节点正在执行，请稍候");
        return;
      }
      runningNodeIds.current.add(nodeId);
      const runtimeData = (node.data.runtime?.data || {}) as Record<string, any>;
      const upstream = getUpstreamInputs(nodeId);
      const scriptContent = String(runtimeData.script || runtimeData.scriptContent || runtimeData.content || upstream.effectivePrompt || "").trim();
      // Upstream audio (from audio node) can supply the voice reference
      let audioUrl = String(runtimeData.voiceReference || runtimeData.audioUrl || runtimeData.voiceReferenceUrl || upstream.firstAudioUrl || "").trim();
      let emoAudioUrl = String(runtimeData.emoAudioUrl || "").trim() || null;
      // Upstream image (from image node) can supply the avatar
      let imageUrl = String(runtimeData.avatarImage || runtimeData.imageUrl || upstream.firstImageUrl || "").trim();

      if (!scriptContent) {
        toast.error("请先输入文案");
        runningNodeIds.current.delete(nodeId);
        return;
      }
      if (!audioUrl) {
        toast.error("请提供参考音色音频");
        runningNodeIds.current.delete(nodeId);
        return;
      }
      if (!imageUrl) {
        toast.error("请提供数字人形象图片");
        runningNodeIds.current.delete(nodeId);
        return;
      }

      setNodeStatus(nodeId, "running");
      audioUrl =
        (await persistNodeAsset(
          nodeId,
          audioUrl,
          `digital-human-audio-${nodeId}`,
          { type: "audio", name: `digital-human-audio-${nodeId}.wav` },
          "音色音频上传失败",
          ["audioUrl", "voiceReference"],
        )) ?? audioUrl;
      if (emoAudioUrl) {
        emoAudioUrl =
          (await persistNodeAsset(
            nodeId,
            emoAudioUrl,
            `digital-human-emo-audio-${nodeId}`,
            { type: "audio", name: `digital-human-emo-${nodeId}.wav` },
            "情绪音频上传失败",
            ["emoAudioUrl"],
          )) ?? emoAudioUrl;
      }
      imageUrl =
        (await persistNodeAsset(
          nodeId,
          imageUrl,
          `digital-human-avatar-${nodeId}`,
          { type: "image", name: `digital-human-avatar-${nodeId}.png` },
          "数字人形象图上传失败",
          ["avatarImage", "imageUrl"],
        )) ?? imageUrl;
      patchRuntimeData(nodeId, {
        dhVideoId: null,
        dhStatus: null,
        outputUrl: null,
        lastRunError: null,
      });

      try {
        const sourceDimensions = await getImageDimensions(imageUrl);
        const response = await postJson("/api/digital-human/videos", {
          type: "VOICE_CLONE",
          scriptContent,
          audioUrl,
          imageUrl,
          emoAudioUrl,
          sourceWidth: sourceDimensions?.width,
          sourceHeight: sourceDimensions?.height,
        });
        const record = response as { data?: { id?: string } };
        const videoId = record?.data?.id;
        if (!videoId) {
          throw new Error("未获取到数字人任务 ID");
        }
        patchRuntimeData(nodeId, { dhVideoId: videoId, dhStatus: "GENERATING" });
        const resultUrl = await waitForDigitalHumanJob(videoId, nodeId);
        const persistedResultUrl = await persistDataUrl(
          resultUrl,
          `digital-human-output-${videoId}`,
          { type: "video", name: `digital-human-${videoId}.mp4` },
          "数字人视频上传失败",
        );
        patchRuntimeData(nodeId, {
          outputUrl: persistedResultUrl,
          dhStatus: "COMPLETED",
          lastCompletedAt: Date.now(),
          outputs: [{ id: createOutputId("dh"), url: persistedResultUrl, createdAt: Date.now() }],
        });
        addResource({
          type: "video",
          variant: "output",
          name: `数字人视频 ${new Date().toLocaleTimeString()}`,
          url: persistedResultUrl,
          metadata: { nodeId },
        });
        setNodeStatus(nodeId, "success");
        toast.success("数字人视频生成完成");
      } catch (error) {
        const message = error instanceof Error ? error.message : "数字人视频生成失败";
        patchRuntimeData(nodeId, { lastRunError: message });
        setNodeStatus(nodeId, "error", message);
        toast.error(message);
      } finally {
        runningNodeIds.current.delete(nodeId);
      }
    },
    [
      addResource,
      getNode,
      getUpstreamInputs,
      patchRuntimeData,
      waitForDigitalHumanJob,
      setNodeStatus,
      persistNodeAsset,
      persistDataUrl,
    ],
  );

  const persistStoryboardSegments = useCallback(
    async (segments: unknown[], taskId: string): Promise<unknown[]> => {
      if (!Array.isArray(segments)) return [];
      return Promise.all(
        segments.map(async (segment, index) => {
          if (!segment || typeof segment !== "object") return segment;
          const updated = { ...(segment as Record<string, any>) };
          if (typeof updated.generatedImage === "string" && isDataUrl(updated.generatedImage)) {
            updated.generatedImage = await persistDataUrl(
              updated.generatedImage,
              `storyboard-image-${taskId}-${index + 1}`,
              { type: "image", name: `storyboard-image-${taskId}-${index + 1}.png` },
              "分镜图片上传失败",
            );
          }
          if (typeof updated.generatedVideo === "string" && isDataUrl(updated.generatedVideo)) {
            updated.generatedVideo = await persistDataUrl(
              updated.generatedVideo,
              `storyboard-video-${taskId}-${index + 1}`,
              { type: "video", name: `storyboard-video-${taskId}-${index + 1}.mp4` },
              "分镜视频上传失败",
            );
          }
          if (updated.generationParams && typeof updated.generationParams === "object") {
            const params = { ...(updated.generationParams as Record<string, any>) };
            let mutated = false;
            if (typeof params.reference_frame_url === "string" && isDataUrl(params.reference_frame_url)) {
              params.reference_frame_url = await persistDataUrl(
                params.reference_frame_url,
                `storyboard-ref-${taskId}-${index + 1}`,
                { type: "image", name: `storyboard-ref-${taskId}-${index + 1}.png` },
                "参考帧上传失败",
              );
              mutated = true;
            }
            if (Array.isArray(params.subject_refs)) {
              const refs = await Promise.all(
                params.subject_refs.map(async (ref: any, refIdx: number) => {
                  if (!ref || typeof ref !== "object" || typeof ref.url !== "string") return ref;
                  if (!isDataUrl(ref.url)) return ref;
                  const nextUrl = await persistDataUrl(
                    ref.url,
                    `storyboard-subject-${taskId}-${index + 1}-${refIdx + 1}`,
                    { type: "image", name: `storyboard-subject-${taskId}-${index + 1}-${refIdx + 1}.png` },
                    "参考图上传失败",
                  );
                  return { ...ref, url: nextUrl };
                }),
              );
              params.subject_refs = refs;
              mutated = true;
            }
            if (Array.isArray(params.image_history)) {
              const history = await Promise.all(
                params.image_history.map(async (entry: any, historyIdx: number) => {
                  if (typeof entry !== "string" || !isDataUrl(entry)) return entry;
                  return persistDataUrl(
                    entry,
                    `storyboard-history-${taskId}-${index + 1}-${historyIdx + 1}`,
                    { type: "image", name: `storyboard-history-${taskId}-${index + 1}-${historyIdx + 1}.png` },
                    "历史图片上传失败",
                  );
                }),
              );
              params.image_history = history;
              mutated = true;
            }
            if (mutated) {
              updated.generationParams = params;
            }
          }
          return updated;
        }),
      );
    },
    [persistDataUrl],
  );

  const waitForStoryboardTask = useCallback(
    (taskId: string, nodeId: string): Promise<unknown[]> =>
      new Promise((resolve, reject) => {
        let done = false;
        let timeoutId: ReturnType<typeof setTimeout>;
        const TERMINAL = ["BREAKDOWN_COMPLETED", "COMPLETED", "BREAKDOWN_FAILED", "FAILED"];

        const settle = (fn: () => void) => {
          if (done) return;
          done = true;
          clearTimeout(timeoutId);
          supabase.removeChannel(channel);
          fn();
        };

        const channel = supabase
          .channel(`canvas_sb_${taskId}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "storyboard_tasks", filter: `id=eq.${taskId}` },
            (payload) => {
              const row = payload.new as Record<string, unknown>;
              const s = String(row.status || "").toUpperCase();
              patchRuntimeData(nodeId, { sbStatus: s, sbProgress: Number(row.progress) || 0 });
              if (s === "BREAKDOWN_COMPLETED" || s === "COMPLETED") {
                void getJson(`/api/canvas/storyboard?taskId=${encodeURIComponent(taskId)}`)
                  .then((res) => settle(() => resolve((res as { segments?: unknown[] }).segments ?? [])))
                  .catch(() => settle(() => resolve([])));
              } else if (s === "BREAKDOWN_FAILED" || s === "FAILED") {
                settle(() => reject(new Error("分镜拆解失败")));
              }
            },
          )
          .subscribe();

        // Race condition guard
        void getJson(`/api/canvas/storyboard?taskId=${encodeURIComponent(taskId)}`)
          .then((data) => {
            const rec = data as { status?: string; progress?: number; segments?: unknown[] };
            const s = String(rec.status || "").toUpperCase();
            patchRuntimeData(nodeId, { sbTaskId: taskId, sbStatus: s, sbProgress: rec.progress ?? 0 });
            if (TERMINAL.includes(s)) {
              if (s === "BREAKDOWN_COMPLETED" || s === "COMPLETED") settle(() => resolve(rec.segments ?? []));
              else settle(() => reject(new Error("分镜拆解失败")));
            }
          })
          .catch(() => {});

        timeoutId = setTimeout(() => settle(() => reject(new Error("分镜拆解超时，请稍后重试"))), REALTIME_TIMEOUT_MS);
      }),
    [patchRuntimeData],
  );

  const runStoryboardNode = useCallback(
    async (nodeId: string) => {
      if (!nodeId) return;
      const node = getNode(nodeId);
      if (!node) {
        toast.error("未找到对应节点");
        return;
      }
      if (runningNodeIds.current.has(nodeId)) {
        toast("该节点正在执行，请稍候");
        return;
      }
      runningNodeIds.current.add(nodeId);
      const runtimeData = (node.data.runtime?.data || {}) as Record<string, any>;
      const upstream = getUpstreamInputs(nodeId);
      let videoUrl = String(runtimeData.videoUrl || runtimeData.outputUrl || runtimeData.url || upstream.firstVideoUrl || "").trim();

      if (!videoUrl) {
        toast.error("请先提供视频 URL");
        runningNodeIds.current.delete(nodeId);
        return;
      }

      setNodeStatus(nodeId, "running");
      patchRuntimeData(nodeId, {
        sbTaskId: null,
        sbStatus: null,
        sbSegments: [],
        lastRunError: null,
      });

      try {
        videoUrl =
          (await persistNodeAsset(
            nodeId,
            videoUrl,
            `storyboard-video-${nodeId}`,
            { type: "video", name: `storyboard-video-${nodeId}.mp4` },
            "视频上传失败",
            ["videoUrl"],
          )) ?? videoUrl;
        const response = await postJson("/api/canvas/storyboard", { videoUrl });
        const record = response as { data?: { taskId?: string } };
        const taskId = record?.data?.taskId;
        if (!taskId) {
          throw new Error("未获取到分镜任务 ID");
        }
        patchRuntimeData(nodeId, { sbTaskId: taskId, sbStatus: "BREAKDOWN_PENDING" });
        const segments = await waitForStoryboardTask(taskId, nodeId);
        const persistedSegments = await persistStoryboardSegments(segments, taskId);
        patchRuntimeData(nodeId, {
          sbSegments: persistedSegments,
          sbStatus: "BREAKDOWN_COMPLETED",
          lastCompletedAt: Date.now(),
        });
        setNodeStatus(nodeId, "success");
        toast.success(`分镜拆解完成，共 ${(persistedSegments as unknown[]).length} 个镜头`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "分镜拆解失败";
        patchRuntimeData(nodeId, { lastRunError: message });
        setNodeStatus(nodeId, "error", message);
        toast.error(message);
      } finally {
        runningNodeIds.current.delete(nodeId);
      }
    },
    [
      getNode,
      getUpstreamInputs,
      patchRuntimeData,
      waitForStoryboardTask,
      setNodeStatus,
      persistNodeAsset,
      persistStoryboardSegments,
    ],
  );

  const runTextNode = useCallback(
    async (nodeId: string) => {
      if (!nodeId) return;
      const node = getNode(nodeId);
      if (!node) {
        toast.error("未找到对应节点");
        return;
      }
      if (runningNodeIds.current.has(nodeId)) {
        toast("该节点正在执行，请稍候");
        return;
      }
      runningNodeIds.current.add(nodeId);
      const runtimeData = (node.data.runtime?.data || {}) as Record<string, any>;
      const upstream = getUpstreamInputs(nodeId);
      const mode = String(runtimeData.mode || "").trim();

      if (mode === "image-understanding") {
        const imageUrl = String(runtimeData.imageUrl || upstream.firstImageUrl || "").trim();
        const prompt = String(runtimeData.prompt || runtimeData.content || "").trim();
        const model = String(runtimeData.imgUnderstandingModel || "gemini-3.1-flash-lite-preview").trim();

        if (!imageUrl) {
          toast.error("未找到上游图片");
          runningNodeIds.current.delete(nodeId);
          return;
        }
        if (!prompt) {
          toast.error("请输入分析提示词");
          runningNodeIds.current.delete(nodeId);
          return;
        }

        setNodeStatus(nodeId, "running");
        patchRuntimeData(nodeId, { lastRunError: null });

        try {
          const response = await postJson("/api/canvas/image-understanding", {
            imageUrl,
            prompt,
            model,
          });
          const result = (response as { result?: string }).result || "";
          if (!result) throw new Error("未获取到分析结果");
          patchRuntimeData(nodeId, { content: result, lastCompletedAt: Date.now() });
          setNodeStatus(nodeId, "success");
          toast.success("图片理解完成");
        } catch (error) {
          const message = error instanceof Error ? error.message : "图片理解失败";
          patchRuntimeData(nodeId, { lastRunError: message });
          setNodeStatus(nodeId, "error", message);
          toast.error(message);
        } finally {
          runningNodeIds.current.delete(nodeId);
        }
        return;
      }

      // AI text transform: when instruction is set and there's upstream content
      const instruction = String(runtimeData.instruction || "").trim();
      if (instruction) {
        // Merge all upstream text contents
        const allTexts = [...upstream.textContents];
        const upstreamText = allTexts.join("\n") || "";
        const imageUrl = upstream.firstImageUrl || "";

        setNodeStatus(nodeId, "running");
        patchRuntimeData(nodeId, { lastRunError: null });

        try {
          const response = await postJson("/api/canvas/text-transform", {
            instruction,
            upstreamText: upstreamText || undefined,
            imageUrl: imageUrl || undefined,
            model: String(runtimeData.transformModel || "gemini-3.1-flash-lite-preview"),
          });
          const result = (response as { result?: string }).result || "";
          if (!result) throw new Error("未获取到处理结果");
          patchRuntimeData(nodeId, { content: result, lastCompletedAt: Date.now() });
          setNodeStatus(nodeId, "success");
        } catch (error) {
          const message = error instanceof Error ? error.message : "AI 处理失败";
          patchRuntimeData(nodeId, { lastRunError: message });
          setNodeStatus(nodeId, "error", message);
          toast.error(message);
        } finally {
          runningNodeIds.current.delete(nodeId);
        }
        return;
      }

      runningNodeIds.current.delete(nodeId);
    },
    [getNode, getUpstreamInputs, patchRuntimeData, setNodeStatus],
  );

  const waitForGridTask = useCallback(
    (taskId: string, nodeId: string): Promise<string> =>
      new Promise((resolve, reject) => {
        let done = false;
        let timeoutId: ReturnType<typeof setTimeout>;

        const settle = (fn: () => void) => {
          if (done) return;
          done = true;
          clearTimeout(timeoutId);
          supabase.removeChannel(channel);
          fn();
        };

        const checkRow = (status: string, imageUrl?: string, progress?: number) => {
          const s = status.toUpperCase();
          patchRuntimeData(nodeId, { gridTaskId: taskId, gridProgress: progress ?? 0 });
          if (s === "COMPLETED" && imageUrl) {
            settle(() => resolve(imageUrl));
          } else if (s === "FAILED") {
            settle(() => reject(new Error("九宫格生成失败")));
          }
        };

        const channel = supabase
          .channel(`canvas_grid_${taskId}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "storyboard_tasks", filter: `id=eq.${taskId}` },
            (payload) => {
              const row = payload.new as Record<string, unknown>;
              checkRow(
                String(row.status || ""),
                String(row.storyboard_image_url || row.cover_image || ""),
                Number(row.progress) || 0,
              );
            },
          )
          .subscribe();

        // Race condition guard
        void getJson(`/api/canvas/grid?taskId=${encodeURIComponent(taskId)}`)
          .then((data) => {
            const rec = data as { status?: string; progress?: number; storyboard_image_url?: string };
            checkRow(String(rec.status || ""), rec.storyboard_image_url, rec.progress);
          })
          .catch(() => {});

        timeoutId = setTimeout(() => settle(() => reject(new Error("九宫格生成超时，请稍后重试"))), REALTIME_TIMEOUT_MS);
      }),
    [patchRuntimeData],
  );

  const runGridNode = useCallback(
    async (nodeId: string) => {
      if (!nodeId) return;
      const node = getNode(nodeId);
      if (!node) {
        toast.error("未找到对应节点");
        return;
      }
      if (runningNodeIds.current.has(nodeId)) {
        toast("该节点正在执行，请稍候");
        return;
      }
      runningNodeIds.current.add(nodeId);
      const runtimeData = (node.data.runtime?.data || {}) as Record<string, unknown>;
      const upstream = getUpstreamInputs(nodeId);
      const contentType = String(runtimeData.contentType || "产品展示");
      // Merge all upstream text contents + own script
      const allTexts = [...upstream.textContents];
      const ownScript = String(runtimeData.scriptContent || "").trim();
      if (ownScript) allTexts.push(ownScript);
      const scriptContent = allTexts.join("\n");
      const imageUrl = String(runtimeData.imageUrl || upstream.firstImageUrl || "").trim();
      const ratio = String(runtimeData.ratio || "1:1").trim();

      if (!scriptContent) {
        toast.error("请输入脚本/剧情/卖点内容");
        runningNodeIds.current.delete(nodeId);
        return;
      }
      if (!imageUrl) {
        toast.error("请上传参考图片");
        runningNodeIds.current.delete(nodeId);
        return;
      }

      setNodeStatus(nodeId, "running");
      patchRuntimeData(nodeId, { gridTaskId: null, gridImageUrl: null, gridProgress: 0, lastRunError: null });

      try {
        const response = await postJson("/api/canvas/grid", {
          contentType,
          scriptContent,
          imageUrl,
          aspectRatio: normalizeAspectRatio(ratio),
        });
        const record = response as { data?: { taskId?: string } };
        const taskId = record?.data?.taskId;
        if (!taskId) throw new Error("未获取到任务 ID");

        patchRuntimeData(nodeId, { gridTaskId: taskId });
        const gridImageUrl = await waitForGridTask(taskId, nodeId);
        const persistedGridUrl = await persistDataUrl(
          gridImageUrl,
          `grid-${taskId}`,
          { type: "image", name: `grid-${taskId}.png` },
          "九宫格图片上传失败",
        );
        patchRuntimeData(nodeId, {
          gridImageUrl: persistedGridUrl,
          gridProgress: 100,
          lastCompletedAt: Date.now(),
        });
        setNodeStatus(nodeId, "success");
        toast.success("九宫格生成完成");
      } catch (error) {
        const message = error instanceof Error ? error.message : "九宫格生成失败";
        patchRuntimeData(nodeId, { lastRunError: message });
        setNodeStatus(nodeId, "error", message);
        toast.error(message);
      } finally {
        runningNodeIds.current.delete(nodeId);
      }
    },
    [getNode, getUpstreamInputs, patchRuntimeData, waitForGridTask, setNodeStatus, persistDataUrl],
  );

  const GRID_SPLIT_POLL_INTERVAL_MS = 5000;
  const GRID_SPLIT_MAX_ATTEMPTS = 60;

  const splitGridNode = useCallback(
    async (nodeId: string): Promise<string[]> => {
      const node = getNode(nodeId);
      const runtimeData = (node?.data?.runtime?.data ?? {}) as Record<string, unknown>;
      let gridImageUrl = typeof runtimeData.gridImageUrl === "string" ? runtimeData.gridImageUrl : "";
      if (!gridImageUrl) {
        toast.error("请先生成九宫格图");
        return [];
      }
      if (isDataUrl(gridImageUrl)) {
        gridImageUrl = await persistDataUrl(
          gridImageUrl,
          `grid-${nodeId}-source`,
          { type: "image", name: `grid-${nodeId}-source.png` },
          "九宫格图片上传失败",
        );
        patchRuntimeData(nodeId, { gridImageUrl });
      }
      patchRuntimeData(nodeId, { isSplitting: true, status: "running" });
      try {
        const resp = await postJson("/api/canvas/grid/split", { imageUrl: gridImageUrl, nodeId });
        const responseData = resp as { data?: { taskId?: string } } | null;
        const taskId = typeof responseData?.data?.taskId === "string"
          ? responseData.data.taskId
          : String(responseData?.data?.taskId ?? "");
        if (!taskId) throw new Error("未获取到任务 ID");

        return new Promise((resolve, reject) => {
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          let settled = false;
          let channel: ReturnType<typeof supabase.channel> | null = null;

          const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (channel) supabase.removeChannel(channel);
          };

          const handleFailure = (error: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            patchRuntimeData(nodeId, { isSplitting: false, status: "idle" });
            reject(error);
          };

          const handleSuccess = async (imageUrls: string[]) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (!imageUrls.length) {
              patchRuntimeData(nodeId, { isSplitting: false, status: "idle" });
              reject(new Error("未获取到拆分图片"));
              return;
            }
            try {
              const persisted = await Promise.all(
                imageUrls.map((url, idx) =>
                  persistDataUrl(
                    url,
                    `grid-split-${taskId}-${idx + 1}`,
                    { type: "image", name: `grid-split-${taskId}-${idx + 1}.png` },
                    "拆分图片上传失败",
                  ),
                ),
              );
              patchRuntimeData(nodeId, { isSplitting: false, status: "idle" });
              resolve(persisted);
            } catch (error) {
              const normalizedError = error instanceof Error ? error : new Error("拆分图片上传失败");
              patchRuntimeData(nodeId, { isSplitting: false, status: "idle" });
              reject(normalizedError);
            }
          };

          channel = supabase
            .channel(`grid-split-${taskId}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "canvas_grid_split_results",
                filter: `task_id=eq.${taskId}`,
              },
              (payload) => {
                const record = payload.new as Record<string, unknown>;
                const status = String(record.status || "").toUpperCase();
                const imageUrls = (record.image_urls ?? []) as string[];

                if (status === "SUCCESS" || status === "COMPLETED") {
                  void handleSuccess(imageUrls);
                } else if (status === "FAILED") {
                  handleFailure(new Error("拆分任务失败"));
                }
              },
            )
            .subscribe();

          timeoutId = setTimeout(() => {
            handleFailure(new Error("拆分超时，请稍后重试"));
          }, GRID_SPLIT_MAX_ATTEMPTS * GRID_SPLIT_POLL_INTERVAL_MS);
        });
      } catch (err) {
        patchRuntimeData(nodeId, { isSplitting: false, status: "idle" });
        throw err;
      }
    },
    [getNode, patchRuntimeData, persistDataUrl],
  );

  const reverseImagePrompt = useCallback(
    async (nodeId: string, mode: "no-text" | "with-text" = "no-text"): Promise<string> => {
      const node = getNode(nodeId);
      const runtimeData = (node?.data?.runtime?.data ?? {}) as Record<string, unknown>;
      const outputs = Array.isArray(runtimeData.outputs)
        ? (runtimeData.outputs as Array<{ url?: string }>)
        : [];
      const imageUrl = (outputs[0]?.url ?? "").trim();
      if (!imageUrl) throw new Error("请先生成或上传图片");

      try {
        const prompt = mode === "with-text" ? REVERSE_IMAGE_PROMPT_WITH_TEXT : REVERSE_IMAGE_PROMPT;
        const response = await postJson("/api/canvas/image-understanding", {
          imageUrl,
          prompt,
          model: "gemini-3.1-flash-lite-preview",
        });
        const result = (response as { result?: string }).result ?? "";
        if (!result) throw new Error("未获取到反推结果");
        return result;
      } catch (err) {
        throw err;
      }
    },
    [getNode],
  );

  return {
    runImageNode,
    runVideoNode,
    runAudioNode,
    runDigitalHumanNode,
    runStoryboardNode,
    runTextNode,
    runGridNode,
    splitGridNode,
    reverseImagePrompt,
    uploadResource,
  };
}
