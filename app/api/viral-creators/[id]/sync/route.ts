import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

const RAW_SYNC_WEBHOOK_URL = process.env.VIRAL_CREATOR_SYNC_WEBHOOK_URL?.trim() || "";
const DEFAULT_SYNC_RELATIVE_PATH = "/api/webhook/creator-sync";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function resolveSyncWebhookUrl(request: NextRequest): string | null {
  const candidate = RAW_SYNC_WEBHOOK_URL || DEFAULT_SYNC_RELATIVE_PATH;
  if (!candidate) {
    return null;
  }
  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }
  try {
    const requestUrl = new URL(request.url);
    const origin = `${requestUrl.protocol}//${requestUrl.host}`;
    const path = candidate.startsWith("/") ? candidate : `/${candidate}`;
    return new URL(path, origin).toString();
  } catch (error) {
    console.warn("[creator-sync] Failed to resolve webhook url", {
      candidate,
      error,
    });
    return null;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { userId, apiKey } = await getRequestUserContext(request);
  if (!userId && !apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  let creatorId = typeof id === "string" ? id.trim() : "";
  if (!creatorId) {
    creatorId = "";
  }

  if (!creatorId) {
    try {
      const fallbackBody = await request.clone().json();
      if (fallbackBody && typeof fallbackBody === "object") {
        creatorId =
          typeof (fallbackBody as Record<string, unknown>).creatorId === "string"
            ? ((fallbackBody as Record<string, unknown>).creatorId as string).trim()
            : typeof (fallbackBody as Record<string, unknown>).id === "string"
              ? ((fallbackBody as Record<string, unknown>).id as string).trim()
              : "";
      }
    } catch {
      // ignore JSON parse failure for fallback
    }
  }

  if (!creatorId) {
    return NextResponse.json({ error: "Missing creator id" }, { status: 400 });
  }

  const creator = await prisma.viralCreator.findUnique({
    where: { id: creatorId },
  });

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const targetWebhookUrl = resolveSyncWebhookUrl(request);
  if (!targetWebhookUrl) {
    console.warn("[creator-sync] No valid webhook target resolved; returning default stub response", {
      creatorId: creator.id,
    });
    return NextResponse.json({
      success: true,
      message: "已记录同步请求（默认模式），请稍后刷新。",
      providerResponse: { mode: "local-stub", creatorId: creator.id },
    });
  }

  const resolvedApiKey = apiKey || process.env.DEFAULT_USER_API_KEY || undefined;
  const payload = {
    creatorId: creator.id,
    platform: creator.platform,
    creatorHandle: creator.creatorHandle,
    displayName: creator.displayName,
    profileUrl: creator.profileUrl,
    stats: creator.stats,
    requestedBy: userId ?? null,
    requestedVia: apiKey ? "api-key" : "session",
    requestedAt: new Date().toISOString(),
  };

  let responseBody: string | null = null;
  try {
    const response = await fetch(targetWebhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(resolvedApiKey ? { "x-user-api-key": resolvedApiKey } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    responseBody = await response.text();
    let parsed: unknown = null;
    if (responseBody) {
      try {
        parsed = JSON.parse(responseBody);
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: (parsed as any)?.error || "Failed to trigger creator sync",
          detail: parsed ?? responseBody ?? null,
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      success: true,
      message:
        (parsed as any)?.message ||
        (responseBody ? responseBody.slice(0, 200) : "Sync triggered"),
      providerResponse: parsed ?? responseBody ?? null,
    });
  } catch (error) {
    console.error("[creator-sync] webhook request failed", {
      error,
      creatorId,
    });
    return NextResponse.json(
      { error: "Failed to contact sync provider" },
      { status: 502 },
    );
  }
}
