import { NextRequest, NextResponse } from "next/server";
import { getApiKeyForUser, getRequestUserContext } from "@/lib/authServer";
import {
  buildCanvasUpstreamHeaders,
  canvasMissingEndpointResponse,
  relayUpstreamResponse,
  resolveCanvasUpstreamApiKey,
  resolveCanvasUpstreamEndpoint,
} from "@/lib/canvasUpstream";
import {
  CanvasCreditsError,
  ensureCanvasCreditsAvailable,
  resolveCanvasCreditsApiKey,
} from "@/lib/canvasCredits";

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

  const endpoint = resolveCanvasUpstreamEndpoint("video");
  if (!endpoint) {
    return canvasMissingEndpointResponse("video");
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const requestBody = body as Record<string, unknown>;

  const creditsApiKey = (await getApiKeyForUser(userId)) || resolveCanvasCreditsApiKey(null);
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

  try {
    await ensureCanvasCreditsAvailable(creditsApiKey, "video", requestBody);
  } catch (error) {
    if (error instanceof CanvasCreditsError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    throw error;
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: buildCanvasUpstreamHeaders({
        userId,
        apiKey: upstreamApiKey,
      }),
      body: JSON.stringify(requestBody),
      cache: "no-store",
    });
    return relayUpstreamResponse(upstream);
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
