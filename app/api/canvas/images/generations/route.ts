import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getProfileApiKeyForUser, getRequestUserContext } from "@/lib/authServer";
import {
  CanvasCreditCharge,
  CanvasCreditsError,
  deductCanvasCredits,
  ensureCanvasCreditsAvailable,
  resolveCanvasCreditsApiKey,
} from "@/lib/canvasCredits";
import {
  buildCanvasUpstreamHeaders,
  canvasMissingEndpointResponse,
  resolveCanvasUpstreamApiKey,
  resolveCanvasUpstreamEndpoint,
} from "@/lib/canvasUpstream";

const FAILED_STATUS_TOKENS = new Set(["failed", "error", "cancelled", "canceled", "timeout"]);
const GEMINI_ENDPOINT_MAP: Record<string, string> = {
  "nano-banana": "/v1beta/models/gemini-3.1-flash-image-preview:generateContent",
  "nano-banana-pro": "/v1beta/models/gemini-3.1-pro-image-preview:generateContent",
  "gemini-3.1-pro-preview": "/v1beta/models/gemini-3.1-pro-image-preview:generateContent",
  "nano-banana-2": "/v1beta/models/gemini-3.1-flash-image-preview:generateContent",
  "gemini-3-pro-image-preview": "/v1beta/models/gemini-3.1-pro-image-preview:generateContent",
  "gemini-3.1-flash-image-preview": "/v1beta/models/gemini-3.1-flash-image-preview:generateContent",
};
const MODEL_ALIAS_MAP: Record<string, string> = {
  image2: "gpt-image-2-all",
};
const DEFAULT_GEMINI_ENDPOINT = "/v1beta/models/gemini-3.1-flash-image-preview:generateContent";
const FAL_NANO_BANANA_PATH = "/fal-ai/nano-banana";

function readEnv(name: string) {
  return String(process.env[name] || "").trim();
}

function hasStaticUpstreamAuth() {
  return Boolean(readEnv("CANVAS_UPSTREAM_BEARER_TOKEN"));
}

function resolveEffectiveUserId({
  request,
  userId,
  upstreamApiKey,
}: {
  request: NextRequest;
  userId: string | null;
  upstreamApiKey: string | null;
}) {
  if (userId) return userId;

  const headerUserId =
    request.headers.get("x-user-id")?.trim() ||
    request.headers.get("x-canvas-user-id")?.trim() ||
    "";
  if (headerUserId) return headerUserId;

  if (upstreamApiKey) {
    const digest = createHash("sha256")
      .update(upstreamApiKey)
      .digest("hex")
      .slice(0, 16);
    return `canvas-key-${digest}`;
  }

  return "";
}

function normalizeGeminiHost() {
  const fromEnv =
    readEnv("CANVAS_GEMINI_BASE_URL") ||
    readEnv("CANVAS_API_BASE_URL") ||
    readEnv("CLOUD_API_BASE_URL");
  if (!fromEnv) return "https://yunwu.ai";
  const normalized = fromEnv.replace(/\/+$/, "");
  return normalized.replace(/\/v1(?:beta)?$/i, "");
}

function resolveModelName(payload: Record<string, unknown>): string {
  const direct = payload.model;
  if (typeof direct === "string" && direct.trim()) {
    const trimmed = direct.trim();
    return MODEL_ALIAS_MAP[trimmed.toLowerCase()] || trimmed;
  }
  const nested = payload.data;
  if (nested && typeof nested === "object") {
    const model = (nested as Record<string, unknown>).model;
    if (typeof model === "string" && model.trim()) {
      const trimmed = model.trim();
      return MODEL_ALIAS_MAP[trimmed.toLowerCase()] || trimmed;
    }
  }
  return "";
}

function resolveGeminiEndpointPath(modelName: string) {
  const normalized = modelName.trim().toLowerCase();
  return GEMINI_ENDPOINT_MAP[normalized] || "";
}

function dataUrlToInlineData(dataUrl: string) {
  const matched = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
  if (!matched) return null;
  return {
    mime_type: matched[1] || "image/png",
    data: matched[2] || "",
  };
}

async function fetchImageToInlineData(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`参考图下载失败: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type") || "image/png";
  return {
    mime_type: mimeType,
    data: buffer.toString("base64"),
  };
}

async function toInlineData(input: unknown) {
  if (typeof input !== "string" || !input.trim()) return null;
  const source = input.trim();
  if (source.startsWith("data:")) return dataUrlToInlineData(source);
  if (/^https?:\/\//i.test(source)) return fetchImageToInlineData(source);
  return null;
}

async function buildGeminiRequest(payload: Record<string, unknown>, modelName: string) {
  console.log("[buildGeminiRequest] payload:", JSON.stringify(payload).slice(0, 500));
  console.log("[buildGeminiRequest] aspect_ratio:", payload.aspect_ratio);

  // 已是 Gemini 原生请求体，直接透传
  if (Array.isArray(payload.contents)) {
    return payload;
  }

  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const imageValue = payload.image ?? payload.images;
  const imageInputs = Array.isArray(imageValue)
    ? imageValue
    : (imageValue ? [imageValue] : []);

  const imageParts: Array<Record<string, unknown>> = [];
  for (const imageInput of imageInputs) {
    const inlineData = await toInlineData(imageInput);
    if (inlineData?.data) {
      imageParts.push({ inline_data: inlineData });
    }
  }

  const aspectRatio = typeof payload.aspect_ratio === "string" ? payload.aspect_ratio : undefined;
  const quality = typeof payload.quality === "string" ? payload.quality : undefined;

  const generationConfig: Record<string, unknown> = {
    response_modalities: ["IMAGE"],
    responseModalities: ["IMAGE"],
  };

  if (aspectRatio || quality) {
    generationConfig.imageConfig = {};
    if (aspectRatio) (generationConfig.imageConfig as Record<string, unknown>).aspectRatio = aspectRatio;
    if (quality) (generationConfig.imageConfig as Record<string, unknown>).quality = quality;
  }

  return {
    model: modelName || undefined,
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, ...imageParts],
      },
    ],
    generationConfig,
  };
}

function isFailedStatus(value: unknown) {
  const token = String(value || "").trim().toLowerCase();
  return token ? FAILED_STATUS_TOKENS.has(token) : false;
}

function isBusinessFailedPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  if (record.error) return true;
  if (record.success === false || record.ok === false) return true;
  if (
    isFailedStatus(record.status) ||
    isFailedStatus(record.state) ||
    isFailedStatus(record.task_status) ||
    isFailedStatus(record.taskStatus)
  ) {
    return true;
  }

  const code = record.code;
  if (typeof code === "number" && code >= 400) return true;
  if (typeof code === "string") {
    const normalized = code.trim().toLowerCase();
    if (/^(4|5)\d\d$/.test(normalized) || normalized === "failed" || normalized === "error") {
      return true;
    }
  }

  const nested = record.data;
  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;
    if (nestedRecord.error || nestedRecord.success === false || nestedRecord.ok === false) {
      return true;
    }
  }

  return false;
}

function buildRelayResponse(
  status: number,
  contentType: string,
  bodyText: string,
  parsedJson: unknown,
) {
  if (contentType.includes("application/json")) {
    if (parsedJson !== undefined) {
      return NextResponse.json(parsedJson, { status });
    }
    return new NextResponse(bodyText, {
      status,
      headers: { "Content-Type": contentType },
    });
  }

  return new NextResponse(bodyText, {
    status,
    headers: { "Content-Type": contentType },
  });
}

function summarizeRequestBody(body: Record<string, unknown>) {
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const imageValue = body.image ?? body.images;
  const imageCount = Array.isArray(imageValue) ? imageValue.length : imageValue ? 1 : 0;
  return {
    model: resolveModelName(body) || null,
    promptLength: prompt.length,
    imageCount,
    aspectRatio: typeof body.aspect_ratio === "string" ? body.aspect_ratio : null,
    size: typeof body.size === "string" ? body.size : null,
    quality: typeof body.quality === "string" ? body.quality : null,
  };
}

export async function POST(request: NextRequest) {
  const { userId, apiKey } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  const upstreamApiKey = resolveCanvasUpstreamApiKey(apiKey);
  const effectiveUserId = resolveEffectiveUserId({ request, userId, upstreamApiKey });

  // 防止匿名请求在启用静态上游凭证时成为开放代理
  if (!effectiveUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!upstreamApiKey && !hasStaticUpstreamAuth()) {
    return NextResponse.json(
      { error: { code: "CANVAS_API_KEY_REQUIRED", message: "画布服务尚未配置，请联系管理员处理。" } },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const requestBody = body as Record<string, unknown>;
  const modelName = resolveModelName(requestBody);
  const profileApiKey = await getProfileApiKeyForUser(effectiveUserId);
  const creditsApiKey = resolveCanvasCreditsApiKey(profileApiKey ?? apiKey ?? upstreamApiKey);
  if (!creditsApiKey) {
    return NextResponse.json(
      {
        error: {
          code: "CANVAS_CREDITS_NOT_CONFIGURED",
          message: "积分服务未配置，请联系管理员。",
        },
      },
      { status: 500 },
    );
  }
  const creditsRequestBody: Record<string, unknown> = {
    ...requestBody,
    model: modelName || requestBody.model,
  };
  const requestId = createHash("sha256")
    .update(`${Date.now()}-${Math.random()}-${effectiveUserId}`)
    .digest("hex")
    .slice(0, 12);

  let preparedCharge: CanvasCreditCharge | null = null;
  try {
    preparedCharge = await ensureCanvasCreditsAvailable(creditsApiKey, "image", creditsRequestBody);
  } catch (error) {
    if (error instanceof CanvasCreditsError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    throw error;
  }

  let endpoint = "";
  let upstreamBody: Record<string, unknown> = requestBody;

  try {
    const geminiEndpointPath = resolveGeminiEndpointPath(modelName);
    const isGeminiRequest = Boolean(geminiEndpointPath) || Array.isArray((requestBody as any).contents);

    if (isGeminiRequest) {
      const geminiHost = normalizeGeminiHost();
      const endpointPath = geminiEndpointPath || DEFAULT_GEMINI_ENDPOINT;
      endpoint = `${geminiHost}${endpointPath}`;
      upstreamBody = await buildGeminiRequest(requestBody, modelName);
    } else {
      endpoint = resolveCanvasUpstreamEndpoint("image") || "";
      if (!endpoint) return canvasMissingEndpointResponse("image");
    }

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: buildCanvasUpstreamHeaders({
        userId: effectiveUserId,
        apiKey: upstreamApiKey,
      }),
      body: JSON.stringify(upstreamBody),
      cache: "no-store",
    });
    const contentType = upstream.headers.get("content-type") || "application/json";
    const bodyText = await upstream.text();
    let parsedJson: unknown = undefined;
    if (contentType.includes("application/json")) {
      try {
        parsedJson = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        parsedJson = undefined;
      }
    }

    const hasBusinessFailure = isBusinessFailedPayload(parsedJson);
    if (!upstream.ok || hasBusinessFailure) {
      console.error("[canvas/image] upstream failure", {
        requestId,
        userId: effectiveUserId,
        endpoint,
        status: upstream.status,
        contentType,
        hasBusinessFailure,
        requestSummary: summarizeRequestBody(requestBody),
        responsePreview: bodyText.slice(0, 500),
      });
    }

    if (upstream.ok && !hasBusinessFailure) {
      try {
        await deductCanvasCredits(creditsApiKey, "image", creditsRequestBody, {
          charge: preparedCharge || undefined,
        });
      } catch (creditError) {
        console.error("[canvas/image] deduct credits failed after success", creditError);
      }
    }

    return buildRelayResponse(upstream.status, contentType, bodyText, parsedJson);
  } catch (error) {
    console.error("[canvas/image] proxy exception", {
      requestId,
      userId: effectiveUserId,
      endpoint: endpoint || null,
      requestSummary: summarizeRequestBody(requestBody),
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        error: {
          code: "CANVAS_IMAGE_PROXY_FAILED",
          message: error instanceof Error ? error.message : "Canvas image proxy failed",
        },
      },
      { status: 502 },
    );
  }
}
