import { NextRequest, NextResponse } from "next/server";
import { cleanupStaleCreativeTasks } from "@/lib/creativeTaskCleanup";

type CleanupRequestBody = {
  dryRun?: boolean;
  retentionHours?: number;
  limit?: number;
};

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

async function parseCleanupOptions(request: NextRequest, forceDryRun: boolean) {
  const defaultDryRun = forceDryRun || request.method !== "POST";
  let payload: CleanupRequestBody = {};

  if (request.method === "POST") {
    try {
      payload = (await request.json()) ?? {};
    } catch (error) {
      throw new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
  }

  const url = new URL(request.url);
  const hoursParam = url.searchParams.get("hours") ?? url.searchParams.get("retentionHours");
  const limitParam = url.searchParams.get("limit");
  const dryRunParam = url.searchParams.get("dryRun");

  const retentionHours =
    parseNumber(payload.retentionHours) ??
    parseNumber(hoursParam ?? undefined);
  const limit =
    parseNumber(payload.limit) ??
    parseNumber(limitParam ?? undefined);
  const dryRun =
    typeof payload.dryRun === "boolean"
      ? payload.dryRun
      : dryRunParam === null
      ? defaultDryRun
      : dryRunParam === "true";

  return { retentionHours, limit, dryRun };
}

async function handleCleanup(request: NextRequest, forceDryRun: boolean) {
  const adminToken = request.headers.get("x-admin-token");
  const expectedToken = process.env.ADMIN_TOKEN;

  if (!expectedToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let options;
  try {
    options = await parseCleanupOptions(request, forceDryRun);
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  const result = await cleanupStaleCreativeTasks(options);
  return NextResponse.json({ data: result });
}

export async function GET(request: NextRequest) {
  return handleCleanup(request, true);
}

export async function POST(request: NextRequest) {
  return handleCleanup(request, false);
}
