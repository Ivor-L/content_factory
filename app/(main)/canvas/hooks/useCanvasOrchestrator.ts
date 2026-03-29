"use client";

import { useCallback, useRef } from "react";
import type { Node } from "@xyflow/react";
import { toast } from "react-hot-toast";
import type { MinimalFlowNodeData, UpstreamInputs } from "../lib/canvasDataAdapters";
import type { useCanvasModels } from "./useCanvasModels";
import { IMAGE_MODEL_PARAMS, VIDEO_MODEL_PARAMS } from "./useCanvasModels";
import type { CanvasResourceRecord } from "./useCanvasResources";
import { supabase } from "@/lib/supabaseClient";
import { ensureCanvasCreditsAvailable, deductCanvasCredits, resolveCanvasCreditsApiKey } from "@/lib/canvasCredits";

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
const GRID_POLL_INTERVAL_MS = 5000;
const GRID_POLL_MAX_ATTEMPTS = 120;

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
  reverseImagePrompt: (nodeId: string) => Promise<string>;
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

const REVERSE_IMAGE_PROMPT = [
  "\u53CD\u63A8\u8FD9\u5F20\u56FE\u7684AI\u751F\u56FE\u63D0\u793A\u8BCD\u3002",
  "\u5305\u62EC\u98CE\u683C\u8C03\u6027\uFF0C\u753B\u9762\u89C6\u89D2\uFF0C\u753B\u9762\u6784\u56FE\uFF0C\u573A\u666F\u5185\u5BB9\uFF0C",
  "\u4EA7\u54C1\u6446\u653E\u89D2\u5EA6\uFF0C\u4EA7\u54C1\u653E\u5728\u4F4D\u7F6E\uFF0C\u4EC0\u4E48\u4E1C\u897F\u4E0A\uFF0C",
  "\u573A\u666F\u5143\u7D20\u7684\u5F62\u72B6\uFF0C\u4F4D\u7F6E\uFF0C\u6750\u8D28\u8D28\u611F\u3001\u6574\u4F53\u914D\u8272\u548C\u80CC\u666F\u63CF\u8FF0\u7B49\u7EC6\u8282\uFF0C",
  "\u8981\u6E05\u6670\u6DB5\u76D6\u753B\u9762\u6240\u6709\u5173\u952E\u4FE1\u606F\uFF0C\u5FFD\u7565\u6587\u6848\u6392\u7248\uFF0C\u589E\u52A0\u6444\u5F71\u6216\u6E32\u67D3\u4E13\u4E1A\u8BCD\u6C47\u3002",
  "\u9002\u914D\u4E2D\u6587AI\u7ED8\u56FE\u5DE5\u5177\u7684\u63D0\u793A\u8BCD\u903B\u8F91\u3002\u6700\u540E\u5408\u6210\u4E00\u6BB5\u8BDD\u8F93\u51FA\u3002",
  "\u4E0D\u8981\u751F\u56FE\uFF0C\u8981\u6E05\u6670\u6DB5\u76D6\u753B\u9762\u6240\u6709\u5173\u952E\u4FE1\u606F\uFF0C\u5FFD\u7565\u6587\u6848\u6392\u7248\uFF0C",
  "\u589E\u52A0\u6444\u5F71\u6216\u6E32\u67D3\u4E13\u4E1A\u8BCD\u6C47\uFF0C\u9002\u914D\u4E2D\u6587AI\u7ED8\u56FE\u5DE5\u5177\u7684\u63D0\u793A\u8BCD\u903B\u8F91\u3002",
  "\u300C\u8F93\u51FA\u8981\u6C42\u300D",
  "1. \u53EA\u8F93\u51FA\u6700\u7EC8\u7684\u4E00\u6BB5\u63D0\u793A\u8BCD\u3002",
  "2. \u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u8BF4\u660E\uFF0C\u4E0D\u8981\u5C0F\u6807\u9898\uFF0C\u4E0D\u8981\u5206\u70B9\u3002",
  "3. \u7981\u6B62\u8F93\u51FA\u300C\u4EE5\u4E0B\u662F\u2026\u300D\u3001\u300CAI\u7ED8\u56FE\u63D0\u793A\u8BCD\uFF1A\u300D\u3001\u300C\u63D0\u793A\u8BCD\u5982\u4E0B\uFF1A\u300D\u7B49\u524D\u7F00\u3002",
  "4. \u4E0D\u8981\u52A0\u5F15\u53F7\uFF0C\u4E0D\u8981\u52A0\u7ED3\u5C3E\u603B\u7ED3\uFF0C\u53EA\u4FDD\u7559\u63D0\u793A\u8BCD\u672C\u8EAB\u3002",
].join("");

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
      // Merge all upstream text contents + own supplement
      const allTexts = [...upstream.textContents];
      const ownSupplement = String(runtimeData.prompt || runtimeData.content || "").trim();
      if (ownSupplement) allTexts.push(ownSupplement);
      const prompt = allTexts.join("\n") || upstream.effectivePrompt || "";
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

        if (model === "nano-banana" || model === "nano-banana-2" || model === "gemini-3.1-pro-preview" || model === "nano-banana-pro") {
          // Gemini-backed models: prompt + ratio + optional image reference
          payload = { model, prompt, aspect_ratio: normalizeAspectRatio(ratio) };
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
      const firstFrame =
        runtimeData.firstFrameImage ||
        runtimeData.first_frame_image ||
        upstream.firstImageUrl ||
        undefined;
      const lastFrame = runtimeData.lastFrameImage || runtimeData.last_frame_image || undefined;
      const country = String(runtimeData.country || "").trim();
      const sellingPointsJson = String(runtimeData.sellingPointsJson || "").trim();
      const blueprint = runtimeData.blueprint;
      const productImageUrl = String(runtimeData.productImageUrl || "").trim();

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

        if (country) payload.country = country;
        if (sellingPointsJson) payload.sellingPointsJson = sellingPointsJson;
        if (blueprint) payload.blueprint = blueprint;
        if (productImageUrl) payload.productImageUrl = productImageUrl;

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
        const { uploadUrl, publicUrl } = await presignResponse.json();
        const putResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putResponse.ok) throw new Error("上传失败");
        const resource = addResource({
          type: options.type,
          variant: options.variant || undefined,
          name: options.name || file.name,
          url: publicUrl,
        });
        toast.success("资源上传成功");
        return resource;
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

  const pollGridTask = useCallback(
    async (taskId: string, nodeId: string): Promise<string> => {
      for (let attempt = 0; attempt < GRID_POLL_MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) await sleep(GRID_POLL_INTERVAL_MS);
        const data = await getJson(`/api/canvas/grid?taskId=${encodeURIComponent(taskId)}`);
        const record = data as { status?: string; progress?: number; storyboard_image_url?: string };
        const status = String(record.status || "").toUpperCase();
        patchRuntimeData(nodeId, { gridTaskId: taskId, gridProgress: record.progress ?? 0 });
        if (status === "COMPLETED" && record.storyboard_image_url) {
          return record.storyboard_image_url;
        }
        if (status === "FAILED") throw new Error("九宫格生成失败");
      }
      throw new Error("九宫格生成超时，请稍后重试");
    },
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
        const apiKey = resolveCanvasCreditsApiKey();
        if (apiKey) {
          await ensureCanvasCreditsAvailable(apiKey, "grid", {});
        }
        const response = await postJson("/api/canvas/grid", {
          contentType,
          scriptContent,
          imageUrl,
          ratio,
        });
        if (apiKey) {
          await deductCanvasCredits(apiKey, "grid", {});
        }
        const record = response as { data?: { taskId?: string } };
        const taskId = record?.data?.taskId;
        if (!taskId) throw new Error("未获取到任务 ID");

        patchRuntimeData(nodeId, { gridTaskId: taskId });
        const gridImageUrl = await pollGridTask(taskId, nodeId);
        patchRuntimeData(nodeId, { gridImageUrl, gridProgress: 100, lastCompletedAt: Date.now() });
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
    [getNode, getUpstreamInputs, patchRuntimeData, pollGridTask, setNodeStatus],
  );

  const GRID_SPLIT_POLL_INTERVAL_MS = 5000;
  const GRID_SPLIT_MAX_ATTEMPTS = 60;

  const splitGridNode = useCallback(
    async (nodeId: string): Promise<string[]> => {
      const node = getNode(nodeId);
      const runtimeData = (node?.data?.runtime?.data ?? {}) as Record<string, unknown>;
      const gridImageUrl = typeof runtimeData.gridImageUrl === "string" ? runtimeData.gridImageUrl : "";
      if (!gridImageUrl) {
        toast.error("请先生成九宫格图");
        return [];
      }
      patchRuntimeData(nodeId, { isSplitting: true, status: "running" });
      try {
        const apiKey = resolveCanvasCreditsApiKey();
        if (apiKey) {
          await ensureCanvasCreditsAvailable(apiKey, "grid-split", {});
        }
        const resp = await postJson("/api/canvas/grid/split", { imageUrl: gridImageUrl });
        if (apiKey) {
          await deductCanvasCredits(apiKey, "grid-split", {});
        }
        const taskId = typeof resp?.data?.taskId === "string" ? (resp.data.taskId as string) : String(resp?.data?.taskId ?? "");
        if (!taskId) throw new Error("未获取到任务 ID");

        for (let attempt = 0; attempt < GRID_SPLIT_MAX_ATTEMPTS; attempt++) {
          if (attempt > 0) await sleep(GRID_SPLIT_POLL_INTERVAL_MS);
          const poll = await getJson(`/api/canvas/grid/split?taskId=${encodeURIComponent(taskId)}`);
          const status = String((poll as Record<string, unknown>).status || "").toUpperCase();
          const imageUrls = ((poll as Record<string, unknown>).imageUrls ?? []) as string[];
          if (status === "SUCCESS" || status === "COMPLETED") {
            if (!imageUrls.length) throw new Error("未获取到拆分图片");
            patchRuntimeData(nodeId, { isSplitting: false, status: "idle" });
            return imageUrls;
          }
          if (status === "FAILED") throw new Error("拆分任务失败");
        }
        throw new Error("拆分超时，请稍后重试");
      } catch (err) {
        patchRuntimeData(nodeId, { isSplitting: false, status: "idle" });
        throw err;
      }
    },
    [getNode, patchRuntimeData],
  );

  const reverseImagePrompt = useCallback(
    async (nodeId: string): Promise<string> => {
      const node = getNode(nodeId);
      const runtimeData = (node?.data?.runtime?.data ?? {}) as Record<string, unknown>;
      const outputs = Array.isArray(runtimeData.outputs)
        ? (runtimeData.outputs as Array<{ url?: string }>)
        : [];
      const imageUrl = (outputs[0]?.url ?? "").trim();
      if (!imageUrl) throw new Error("请先生成或上传图片");

      try {
        const apiKey = resolveCanvasCreditsApiKey();
        if (apiKey) {
          await ensureCanvasCreditsAvailable(apiKey, "image-understanding", {});
        }
        const response = await postJson("/api/canvas/image-understanding", {
          imageUrl,
          prompt: REVERSE_IMAGE_PROMPT,
          model: "gemini-3.1-flash-lite-preview",
        });
        if (apiKey) {
          await deductCanvasCredits(apiKey, "image-understanding", {});
        }
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
