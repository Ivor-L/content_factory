import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import {
  buildCanvasUpstreamHeaders,
  canvasMissingEndpointResponse,
  relayUpstreamResponse,
  resolveCanvasUpstreamApiKey,
  resolveCanvasUpstreamEndpoint,
} from "@/lib/canvasUpstream";

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

  const endpoint = resolveCanvasUpstreamEndpoint("chat");
  if (!endpoint) {
    return canvasMissingEndpointResponse("chat");
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const stream = Boolean((body as { stream?: unknown }).stream);

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: buildCanvasUpstreamHeaders({
        userId,
        apiKey: upstreamApiKey,
      }),
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (stream && upstream.ok && upstream.body) {
      const headers = new Headers();
      headers.set(
        "Content-Type",
        upstream.headers.get("content-type") || "text/event-stream; charset=utf-8",
      );
      headers.set("Cache-Control", "no-cache, no-transform");
      headers.set("Connection", "keep-alive");
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers,
      });
    }

    return relayUpstreamResponse(upstream);
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "CANVAS_CHAT_PROXY_FAILED",
          message: error instanceof Error ? error.message : "Canvas chat proxy failed",
        },
      },
      { status: 502 },
    );
  }
}
