"use client";

import { useCallback, useRef } from "react";
import type { Node } from "@xyflow/react";
import { toast } from "react-hot-toast";
import type { MinimalFlowNodeData, UpstreamInputs } from "../lib/canvasDataAdapters";
import type { useCanvasModels } from "./useCanvasModels";
import { IMAGE_MODEL_PARAMS, VIDEO_MODEL_PARAMS } from "./useCanvasModels";
import type { CanvasResourceRecord } from "./useCanvasResources";
import { supabase } from "@/lib/supabaseClient";

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
const AUDIO_POLL_INTERVAL_MS = 4000;
const AUDIO_POLL_MAX_ATTEMPTS = 120;
const DH_POLL_INTERVAL_MS = 6000;
const DH_POLL_MAX_ATTEMPTS = 100;
const SB_POLL_INTERVAL_MS = 5000;
const SB_POLL_MAX_ATTEMPTS = 120;

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

export function useCanvasOrchestrator(options: UseCanvasOrchestratorOptions): UseCanvasOrchestratorResult {
  const { getNode, getUpstreamInputs, patchRuntimeData, setNodeStatus, models, addResource } = options;
  const runningNodeIds = useRef(new Set<string>());

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
      // Own value takes precedence; upstream fills when empty
      const prompt = String(runtimeData.prompt || runtimeData.content || upstream.effectivePrompt || "").trim();
      const model =
        String(runtimeData.model || models.defaultModels.image?.id || models.imageModels[0]?.id || "").trim();
      const ratio = String(runtimeData.ratio || runtimeData.size || "16:9").trim();
      const quality = String(runtimeData.quality || "standard").trim();
      const reference =
        runtimeData.image ||
        runtimeData.referenceImage ||
        runtimeData.referenceImageUrl ||
        upstream.firstImageUrl ||
        undefined;

      if (!prompt && !reference) {
        toast.error("请先输入提示词或上传参考图");
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

        if (model === "nano-banana" || model === "gemini-3.1-pro-preview" || model === "nano-banana-pro") {
          // Gemini-backed models: just prompt + optional image reference
          payload = { model, prompt };
          if (reference) payload.image = reference;
        } else if (model === "grok-3-image") {
          // grok image: size as pixel dimensions string, ratio options are pixel strings
          const pixelSize = (params?.ratios?.length ? ratio : "960x960");
          payload = { model, prompt, size: pixelSize };
          if (reference) payload.image = reference;
        } else if (model === "doubao-seedream-4-5-251128") {
          // Doubao SeedDream: size as ratio string, quality
          payload = {
            model,
            prompt,
            size: normalizeAspectRatio(ratio),
            quality,
          };
          if (reference) payload.image = reference;
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
          if (reference) payload.image = reference;
        }

        const response = await postJson("/api/canvas/images/generations", payload);
        console.log("[canvas/image] raw response:", JSON.stringify(response)?.slice(0, 500));
        const urls = extractImageUrls(response);
        if (!urls.length) {
          throw new Error("未获取到图片结果");
        }
        const outputs = urls.map((url) => ({
          id: createOutputId("image"),
          url,
          createdAt: Date.now(),
        }));
        patchRuntimeData(nodeId, {
          outputs,
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
    [getNode, getUpstreamInputs, models, patchRuntimeData, setNodeStatus],
  );

  const waitForVideoTask = useCallback(
    (taskId: string, nodeId: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const channel = supabase
          .channel(`canvas_video_task_${taskId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
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
      const prompt = String(runtimeData.prompt || runtimeData.content || upstream.effectivePrompt || "").trim();
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
      const firstFrame =
        runtimeData.firstFrameImage ||
        runtimeData.first_frame_image ||
        upstream.firstImageUrl ||
        undefined;
      const lastFrame = runtimeData.lastFrameImage || runtimeData.last_frame_image || undefined;

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

        const response = await postJson("/api/canvas/videos", payload);
        const immediateUrl = extractVideoUrl(response);
        if (immediateUrl) {
          const outputRecord = {
            id: createOutputId("video"),
            url: immediateUrl,
            createdAt: Date.now(),
          };
          patchRuntimeData(nodeId, {
            outputUrl: immediateUrl,
            outputs: [outputRecord],
            lastCompletedAt: Date.now(),
            lastTaskStatus: "completed",
          });
          addResource({
            type: "video",
            variant: "output",
            name: `视频输出 ${new Date().toLocaleTimeString()}`,
            url: immediateUrl,
            metadata: { nodeId },
          });
          setNodeStatus(nodeId, "success");
          toast.success("视频生成完成");
        } else {
          const taskId = extractVideoTaskId(response);
          if (!taskId) {
            throw new Error("未获取到任务 ID");
          }
          patchRuntimeData(nodeId, { taskId, lastTaskStatus: "queued" });
          const url = await waitForVideoTask(taskId, nodeId);
          const outputRecord = {
            id: createOutputId("video"),
            url,
            createdAt: Date.now(),
          };
          patchRuntimeData(nodeId, {
            outputUrl: url,
            lastCompletedAt: Date.now(),
            lastTaskStatus: "completed",
            outputs: [outputRecord],
          });
          addResource({
            type: "video",
            variant: "output",
            name: `视频输出 ${new Date().toLocaleTimeString()}`,
            url,
            metadata: { nodeId },
          });
          setNodeStatus(nodeId, "success");
          toast.success("视频生成完成");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "视频生成失败";
        patchRuntimeData(nodeId, { lastRunError: message });
        setNodeStatus(nodeId, "error", message);
        toast.error(message);
      } finally {
        runningNodeIds.current.delete(nodeId);
      }
    },
    [addResource, getNode, getUpstreamInputs, models, patchRuntimeData, waitForVideoTask, setNodeStatus],
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
          patchRuntimeData(nodeId, {
            audioUrl,
            audioTaskStatus: "completed",
            lastCompletedAt: Date.now(),
            outputs: [{ id: createOutputId("suno"), url: audioUrl, createdAt: Date.now() }],
          });
          addResource({ type: "audio", variant: "output", name: `Suno 音乐 ${new Date().toLocaleTimeString()}`, url: audioUrl, metadata: { nodeId } });
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
      const voiceReference = String(runtimeData.voiceReference || runtimeData.voiceReferenceUrl || "").trim();
      const emotionReference = String(runtimeData.emotionReference || runtimeData.emotionReferenceUrl || "").trim();

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
        patchRuntimeData(nodeId, {
          audioUrl,
          audioTaskStatus: "completed",
          lastCompletedAt: Date.now(),
          outputs: [
            {
              id: createOutputId("audio"),
              url: audioUrl,
              createdAt: Date.now(),
            },
          ],
        });
        addResource({
          type: "audio",
          variant: "output",
          name: `语音输出 ${new Date().toLocaleTimeString()}`,
          url: audioUrl,
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
    [addResource, getNode, getUpstreamInputs, models, patchRuntimeData, pollAudioTask, pollSunoMusicTask, setNodeStatus],
  );

  const pollDigitalHumanJob = useCallback(
    async (videoId: string, nodeId: string) => {
      for (let attempt = 0; attempt < DH_POLL_MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) {
          await sleep(DH_POLL_INTERVAL_MS);
        }
        const data = await getJson(`/api/canvas/digital-human?videoId=${encodeURIComponent(videoId)}`);
        const record = data as { status?: string; resultUrl?: string | null };
        const status = String(record.status || "").toUpperCase();
        patchRuntimeData(nodeId, {
          dhVideoId: videoId,
          dhStatus: status,
          lastPolledAt: Date.now(),
        });
        if (record.resultUrl) {
          return record.resultUrl;
        }
        if (["FAILED", "ERROR", "CANCELED"].includes(status)) {
          throw new Error("数字人视频生成失败");
        }
      }
      throw new Error("数字人视频生成超时，请稍后重试");
    },
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
      const audioUrl = String(runtimeData.voiceReference || runtimeData.audioUrl || runtimeData.voiceReferenceUrl || upstream.firstAudioUrl || "").trim();
      // Upstream image (from image node) can supply the avatar
      const imageUrl = String(runtimeData.avatarImage || runtimeData.imageUrl || upstream.firstImageUrl || "").trim();

      if (!scriptContent) {
        toast.error("请先输入文案");
        runningNodeIds.current.delete(nodeId);
        return;
      }
      if (!audioUrl) {
        toast.error("请提供音色参考音频");
        runningNodeIds.current.delete(nodeId);
        return;
      }
      if (!imageUrl) {
        toast.error("请提供数字人形象图片");
        runningNodeIds.current.delete(nodeId);
        return;
      }

      setNodeStatus(nodeId, "running");
      patchRuntimeData(nodeId, {
        dhVideoId: null,
        dhStatus: null,
        outputUrl: null,
        lastRunError: null,
      });

      try {
        const response = await postJson("/api/canvas/digital-human", {
          scriptContent,
          audioUrl,
          imageUrl,
        });
        const record = response as { data?: { id?: string } };
        const videoId = record?.data?.id;
        if (!videoId) {
          throw new Error("未获取到数字人任务 ID");
        }
        patchRuntimeData(nodeId, { dhVideoId: videoId, dhStatus: "GENERATING" });
        const resultUrl = await pollDigitalHumanJob(videoId, nodeId);
        patchRuntimeData(nodeId, {
          outputUrl: resultUrl,
          dhStatus: "COMPLETED",
          lastCompletedAt: Date.now(),
          outputs: [{ id: createOutputId("dh"), url: resultUrl, createdAt: Date.now() }],
        });
        addResource({
          type: "video",
          variant: "output",
          name: `数字人视频 ${new Date().toLocaleTimeString()}`,
          url: resultUrl,
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
    [addResource, getNode, getUpstreamInputs, patchRuntimeData, pollDigitalHumanJob, setNodeStatus],
  );

  const pollStoryboardTask = useCallback(
    async (taskId: string, nodeId: string) => {
      const TERMINAL_STATUSES = ["BREAKDOWN_COMPLETED", "COMPLETED", "BREAKDOWN_FAILED", "FAILED"];
      for (let attempt = 0; attempt < SB_POLL_MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) {
          await sleep(SB_POLL_INTERVAL_MS);
        }
        const data = await getJson(`/api/canvas/storyboard?taskId=${encodeURIComponent(taskId)}`);
        const record = data as { status?: string; progress?: number; segments?: unknown[] };
        const status = String(record.status || "").toUpperCase();
        patchRuntimeData(nodeId, {
          sbTaskId: taskId,
          sbStatus: status,
          sbProgress: record.progress ?? 0,
          lastPolledAt: Date.now(),
        });
        if (status === "BREAKDOWN_COMPLETED" || status === "COMPLETED") {
          return record.segments ?? [];
        }
        if (["BREAKDOWN_FAILED", "FAILED"].includes(status)) {
          throw new Error("分镜拆解失败");
        }
        if (!TERMINAL_STATUSES.includes(status)) {
          patchRuntimeData(nodeId, { sbSegments: record.segments ?? [] });
        }
      }
      throw new Error("分镜拆解超时，请稍后重试");
    },
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
      const videoUrl = String(runtimeData.videoUrl || runtimeData.outputUrl || runtimeData.url || upstream.firstVideoUrl || "").trim();

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
        const response = await postJson("/api/canvas/storyboard", { videoUrl });
        const record = response as { data?: { taskId?: string } };
        const taskId = record?.data?.taskId;
        if (!taskId) {
          throw new Error("未获取到分镜任务 ID");
        }
        patchRuntimeData(nodeId, { sbTaskId: taskId, sbStatus: "BREAKDOWN_PENDING" });
        const segments = await pollStoryboardTask(taskId, nodeId);
        patchRuntimeData(nodeId, {
          sbSegments: segments,
          sbStatus: "BREAKDOWN_COMPLETED",
          lastCompletedAt: Date.now(),
        });
        setNodeStatus(nodeId, "success");
        toast.success(`分镜拆解完成，共 ${(segments as unknown[]).length} 个镜头`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "分镜拆解失败";
        patchRuntimeData(nodeId, { lastRunError: message });
        setNodeStatus(nodeId, "error", message);
        toast.error(message);
      } finally {
        runningNodeIds.current.delete(nodeId);
      }
    },
    [getNode, getUpstreamInputs, patchRuntimeData, pollStoryboardTask, setNodeStatus],
  );

  const uploadResource = useCallback(
    async (file: File, options: UploadOptions) => {
      if (!(file instanceof File)) {
        throw new Error("请选择要上传的文件");
      }
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

  return {
    runImageNode,
    runVideoNode,
    runAudioNode,
    runDigitalHumanNode,
    runStoryboardNode,
    uploadResource,
  };
}
