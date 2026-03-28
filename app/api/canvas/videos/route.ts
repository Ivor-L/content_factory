import { NextRequest, NextResponse } from "next/server";
import { getApiKeyForUser, getRequestUserContext } from "@/lib/authServer";
import {
  buildCanvasUpstreamHeaders,
  canvasMissingEndpointResponse,
  resolveCanvasUpstreamApiKey,
  resolveCanvasUpstreamEndpoint,
} from "@/lib/canvasUpstream";
import {
  CanvasCreditsError,
  ensureCanvasCreditsAvailable,
  deductCanvasCredits,
  resolveCanvasCreditsApiKey,
} from "@/lib/canvasCredits";

const VEO_MODELS = new Set(["veo_3_1-fast", "veo_3_1", "veo3", "veo3-fast"]);
const SORA_MODELS = new Set(["sora-2-all", "sora-2"]);
const GROK_MODELS = new Set(["grok-video-3"]);
const ASYNC_POLL_MODELS = new Set([...VEO_MODELS, ...SORA_MODELS, ...GROK_MODELS]);

function extractTaskId(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const record = response as Record<string, any>;
  return record.task_id || record.taskId || record.id || null;
}

export async function POST(request: NextRequest) {
  const { userId, apiKey } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: true,
  });
  const upstreamApiKey = resolveCanvasUpstreamApiKey(apiKey);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!upstreamApiKey) {
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
  const model = String(requestBody.model || "").trim().toLowerCase();

  const creditsApiKey = (await getApiKeyForUser(userId)) || resolveCanvasCreditsApiKey(null);
  if (!creditsApiKey) {
    return NextResponse.json(
      { error: { code: "CANVAS_CREDITS_NOT_CONFIGURED", message: "积分服务未配置，请联系管理员。" } },
      { status: 500 },
    );
  }

  let preparedCharge;
  try {
    preparedCharge = await ensureCanvasCreditsAvailable(creditsApiKey, "video", requestBody);
  } catch (error) {
    if (error instanceof CanvasCreditsError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    throw error;
  }

  try {
    const endpoint = resolveCanvasUpstreamEndpoint("video") || "";
    if (!endpoint) return canvasMissingEndpointResponse("video");

    const upstreamBody: Record<string, unknown> = VEO_MODELS.has(model)
      ? {
          model,
          prompt: requestBody.prompt,
          aspect_ratio: requestBody.aspect_ratio || requestBody.ratio || "16:9",
          duration: requestBody.duration || 8,
          enhance_prompt: true,
          auto_fix: true,
          resolution: requestBody.resolution || "720p",
          generate_audio: requestBody.generate_audio ?? true,
          ...(requestBody.image_url ? { image_url: requestBody.image_url } : {}),
          ...(requestBody.first_frame_image ? { image_url: requestBody.first_frame_image } : {}),
        }
      : requestBody;

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: buildCanvasUpstreamHeaders({ userId, apiKey: upstreamApiKey }),
      body: JSON.stringify(upstreamBody),
      cache: "no-store",
    });

    const contentType = upstream.headers.get("content-type") || "application/json";
    const bodyText = await upstream.text();
    let parsedJson: unknown;
    try { parsedJson = bodyText ? JSON.parse(bodyText) : {}; } catch { parsedJson = undefined; }

    if (upstream.ok) {
      if (ASYNC_POLL_MODELS.has(model)) {
        // Async models: deduct credits in webhook after video is actually delivered
        const taskId = extractTaskId(parsedJson);
        if (taskId) {
          const callbackBase = (process.env.CANVAS_VIDEO_POLL_CALLBACK_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/+$/, "") || request.nextUrl.origin;
          const webhookUrl = `${callbackBase}/api/canvas/videos/webhook`;
          try {
            await fetch("https://api.atomx.top/tools/veo/poll/async", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                task_id: taskId,
                api_key: upstreamApiKey,
                webhook_url: webhookUrl,
                context: {
                  creditsApiKey,
                  charge: preparedCharge,
                },
              }),
            });
          } catch (pollError) {
            console.error("[canvas/video] register async polling failed", pollError);
          }
        }
      } else {
        // Sync models: deduct credits immediately
        try {
          await deductCanvasCredits(creditsApiKey, "video", requestBody, { charge: preparedCharge });
        } catch (creditError) {
          console.error("[canvas/video] deduct credits failed after success", creditError);
        }
      }
    }

    if (contentType.includes("application/json") && parsedJson !== undefined) {
      return NextResponse.json(parsedJson, { status: upstream.status });
    }
    return new NextResponse(bodyText, { status: upstream.status, headers: { "Content-Type": contentType } });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "CANVAS_VIDEO_PROXY_FAILED",
          message: error instanceof Error ? error.message : "Canvas video proxy failed",
        },
      },
      { status: 502 },
    );
  }
}
