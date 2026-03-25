import { NextResponse } from "next/server";

type CreatorSyncPayload = {
  creatorId: string;
  platform?: string;
  creatorHandle?: string | null;
  displayName?: string | null;
  profileUrl?: string | null;
  stats?: Record<string, unknown> | null;
  requestedBy?: string | null;
  requestedVia?: string | null;
  requestedAt?: string | null;
};

export async function POST(request: Request) {
  let payload: CreatorSyncPayload | null = null;
  try {
    payload = (await request.json()) as CreatorSyncPayload;
  } catch {
    payload = null;
  }

  if (!payload || typeof payload.creatorId !== "string" || !payload.creatorId.trim()) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  console.info("[default-creator-sync-webhook] Received request", {
    creatorId: payload.creatorId,
    platform: payload.platform,
    handle: payload.creatorHandle,
    requestedBy: payload.requestedBy,
    requestedVia: payload.requestedVia,
  });

  return NextResponse.json({
    message: `已记录 ${payload.displayName || payload.creatorHandle || payload.creatorId} 的同步请求（默认处理）。`,
    queued: true,
    mode: "default-stub",
  });
}
