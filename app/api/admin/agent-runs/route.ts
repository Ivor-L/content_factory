import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function requireAdmin(request: Request) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_admin ? userId : null;
}

function intParam(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export async function GET(request: NextRequest) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const page = intParam(url.searchParams.get("page"), 1, 100000);
  const limit = intParam(url.searchParams.get("limit"), 30, 100);
  const q = (url.searchParams.get("q") || "").trim();
  const status = (url.searchParams.get("status") || "").trim();
  const capabilityId = (url.searchParams.get("capabilityId") || "").trim();
  const holdStatus = (url.searchParams.get("holdStatus") || "").trim();

  const runWhere: Record<string, unknown> = {};
  if (status) runWhere.status = status;
  if (capabilityId) runWhere.capabilityId = capabilityId;
  if (q) {
    runWhere.OR = [
      { id: { contains: q, mode: "insensitive" } },
      { capabilityId: { contains: q, mode: "insensitive" } },
      { businessId: { contains: q, mode: "insensitive" } },
      { businessTaskId: { contains: q, mode: "insensitive" } },
    ];
  }

  const holdWhere = holdStatus ? { status: holdStatus } : {};

  const [total, runs, holdStats] = await Promise.all([
    prisma.agentCapabilityRun.count({ where: runWhere }),
    prisma.agentCapabilityRun.findMany({
      where: runWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.agentCapabilityCreditHold.groupBy({
      by: ["status"],
      where: holdWhere,
      _count: { id: true },
      _sum: { estimatedCredits: true },
    }).catch(() => []),
  ]);

  const runIds = runs.map((run) => run.id);
  const holds = runIds.length
    ? await prisma.agentCapabilityCreditHold.findMany({
        where: { runId: { in: runIds }, ...holdWhere },
      })
    : [];
  const holdMap = new Map(holds.map((hold) => [hold.runId, hold]));

  const userIds = Array.from(new Set(runs.map((run) => run.userId).filter((id): id is string => Boolean(id))));
  const profiles = userIds.length
    ? await prisma.profiles.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, full_name: true, user_no: true, plan: true, is_admin: true },
      })
    : [];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  const filteredRows = runs
    .map((run) => ({ run, hold: holdMap.get(run.id) || null, profile: run.userId ? profileMap.get(run.userId) || null : null }))
    .filter((row) => !holdStatus || row.hold);

  return NextResponse.json({
    data: filteredRows,
    pagination: {
      page,
      limit,
      total,
      returned: filteredRows.length,
      pages: Math.ceil(total / limit),
    },
    holdStats,
  });
}
