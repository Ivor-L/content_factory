import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auditAgentCapabilityCreditConfigs } from "@/lib/agent-capabilities/credit-audit";
import { listAgentCapabilities } from "@/lib/agent-capabilities/registry";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRequestUserContext } from "@/lib/authServer";

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

export async function GET(request: NextRequest) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const configs = await prisma.creditConfig.findMany({
    orderBy: [{ category: "asc" }, { featureKey: "asc" }],
  });

  // Usage stats — fail gracefully if table not yet in Prisma client
  let usageStats: Array<{ featureKey: string; success: boolean; _count: { id: number } }> = [];
  try {
    usageStats = await (prisma as any).creditUsageLog.groupBy({
      by: ["featureKey", "success"],
      _count: { id: true },
    });
  } catch {
    // table may not be visible to current Prisma client — skip stats
  }

  const statsMap = new Map<string, { successCount: number; failureCount: number }>();
  for (const stat of usageStats) {
    const entry = statsMap.get(stat.featureKey) ?? { successCount: 0, failureCount: 0 };
    if (stat.success) entry.successCount = stat._count.id;
    else entry.failureCount = stat._count.id;
    statsMap.set(stat.featureKey, entry);
  }

  const agentUsageMap = new Map<string, Array<{ id: string; title: string; skillName: string }>>();
  for (const capability of listAgentCapabilities()) {
    if (!capability.featureKey) continue;
    const entry = agentUsageMap.get(capability.featureKey) ?? [];
    entry.push({ id: capability.id, title: capability.title, skillName: capability.skillName });
    agentUsageMap.set(capability.featureKey, entry);
  }

  const data = configs.map((c) => ({
    ...c,
    successCount: statsMap.get(c.featureKey)?.successCount ?? 0,
    failureCount: statsMap.get(c.featureKey)?.failureCount ?? 0,
    agentCapabilities: agentUsageMap.get(c.featureKey) ?? [],
    usedByAgent: (agentUsageMap.get(c.featureKey)?.length ?? 0) > 0,
  }));

  return NextResponse.json({
    data,
    agentCreditAudit: await auditAgentCapabilityCreditConfigs(listAgentCapabilities()),
  });
}

export async function POST(request: NextRequest) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { featureKey, featureName, category, modelKey, amount, enabled, description, cost, sellingPrice } = body as Record<string, any>;

  if (!featureKey || !featureName || !category || typeof amount !== "number") {
    return NextResponse.json({ error: "Missing required fields: featureKey, featureName, category, amount" }, { status: 400 });
  }

  try {
    const config = await prisma.creditConfig.create({
      data: {
        featureKey: String(featureKey).trim(),
        featureName: String(featureName).trim(),
        category: String(category).trim(),
        modelKey: modelKey ? String(modelKey).trim() : null,
        amount: Math.max(0, Math.floor(Number(amount))),
        enabled: enabled !== false,
        description: description ? String(description).trim() : null,
        ...(typeof cost === "number" ? { cost: Math.max(0, cost) } : {}),
        ...(typeof sellingPrice === "number" ? { sellingPrice: Math.max(0, sellingPrice) } : {}),
      },
    });
    const { invalidateCreditCostCache } = await import("@/lib/creditCosts");
    invalidateCreditCostCache();
    return NextResponse.json({ data: config }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
