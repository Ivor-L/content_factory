import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRequestUserContext } from "@/lib/authServer";

function shouldHideUsageFeature(featureKey: string) {
  return featureKey.startsWith("monetization_");
}

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

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenant") ?? "";

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  // ── Tenant user IDs (for filtering) ──────────────────────────────────────
  let tenantUserIds: string[] | null = null;
  if (tenantId) {
    const { data: tp } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("tenant_id", tenantId);
    tenantUserIds = (tp ?? []).map((p: { id: string }) => p.id);
  }

  const userWhere = tenantUserIds ? { userId: { in: tenantUserIds } } : {};

  // ── User stats ────────────────────────────────────────────────────────────
  let profilesQuery = supabaseAdmin
    .from("profiles")
    .select("id, plan", { count: "exact" });
  if (tenantId) profilesQuery = profilesQuery.eq("tenant_id", tenantId) as typeof profilesQuery;
  const { count: totalUsers, data: profilesData } = await profilesQuery;

  const planDist: Record<string, number> = {};
  for (const p of profilesData ?? []) {
    const plan = (p as { plan?: string }).plan ?? "free";
    planDist[plan] = (planDist[plan] ?? 0) + 1;
  }

  // Active users = had successful usage logs in past 3 days, excluding link-only entries
  let activeUsers = 0;
  try {
    const activeRes = await (prisma as any).creditUsageLog.groupBy({
      by: ["userId", "featureKey"],
      where: { createdAt: { gte: threeDaysAgo }, success: true, ...userWhere },
    });
    activeUsers = new Set(
      activeRes
        .filter((row: { featureKey: string }) => !shouldHideUsageFeature(row.featureKey))
        .map((row: { userId: string }) => row.userId),
    ).size;
  } catch { /* skip */ }

  // ── Credit configs (base list for full coverage) ─────────────────────────
  const configs = await prisma.creditConfig.findMany({
    select: { featureKey: true, featureName: true, sellingPrice: true, cost: true },
  });
  const configMap = new Map(configs.map((c) => [c.featureKey, c]));

  // ── Overall usage stats by featureKey ─────────────────────────────────────
  let usageStats: Array<{ featureKey: string; success: boolean; _count: { id: number }; _sum: { amount: number | null } }> = [];
  try {
    usageStats = await (prisma as any).creditUsageLog.groupBy({
      by: ["featureKey", "success"],
      _count: { id: true },
      _sum: { amount: true },
      where: Object.keys(userWhere).length ? userWhere : undefined,
    });
  } catch { /* skip */ }

  // ── This month usage ──────────────────────────────────────────────────────
  let monthCreditsConsumed = 0;
  let monthCalls = 0;
  let monthSuccess = 0;
  let monthFailed = 0;
  try {
    const monthAll = await (prisma as any).creditUsageLog.groupBy({
      by: ["featureKey", "success"],
      _count: { id: true },
      _sum: { amount: true },
      where: { createdAt: { gte: monthStart }, ...userWhere },
    });
    for (const s of monthAll.filter((row: { featureKey: string }) => !shouldHideUsageFeature(row.featureKey))) {
      const cnt = s._count.id ?? 0;
      const amt = s._sum.amount ?? 0;
      monthCalls += cnt;
      monthCreditsConsumed += amt;
      if (s.success) monthSuccess += cnt;
      else monthFailed += cnt;
    }
  } catch { /* skip */ }

  // ── This month by feature (for revenue/cost) ──────────────────────────────
  let monthByFeature: Array<{ featureKey: string; _count: { id: number } }> = [];
  try {
    monthByFeature = await (prisma as any).creditUsageLog.groupBy({
      by: ["featureKey"],
      _count: { id: true },
      where: { createdAt: { gte: monthStart }, success: true, ...userWhere },
    });
  } catch { /* skip */ }

  // ── This month recharge ───────────────────────────────────────────────────
  let monthCreditsRecharged = 0;
  let monthRevenueCny = 0;
  try {
    let q = supabaseAdmin
      .from("recharge_orders")
      .select("credits, amount_cny")
      .eq("status", "paid")
      .gte("created_at", monthStart.toISOString());
    if (tenantUserIds) q = q.in("user_id", tenantUserIds) as typeof q;
    const { data: rechargeRows } = await q;
    for (const r of rechargeRows ?? []) {
      monthCreditsRecharged += Number((r as any).credits ?? 0);
      monthRevenueCny += Number((r as any).amount_cny ?? 0);
    }
  } catch { /* skip */ }

  // ── Build feature stats with full config coverage ────────────────────────
  const featureMap: Record<string, { calls: number; success: number; failed: number; credits: number }> = {};
  for (const config of configs) {
    featureMap[config.featureKey] = { calls: 0, success: 0, failed: 0, credits: 0 };
  }
  for (const s of usageStats) {
    const k = s.featureKey;
    if (!featureMap[k]) featureMap[k] = { calls: 0, success: 0, failed: 0, credits: 0 };
    featureMap[k].calls += s._count.id;
    featureMap[k].credits += s._sum.amount ?? 0;
    if (s.success) featureMap[k].success += s._count.id;
    else featureMap[k].failed += s._count.id;
  }

  let totalRevenue = 0;
  let totalCost = 0;

  const features = Object.entries(featureMap)
    .filter(([featureKey]) => !shouldHideUsageFeature(featureKey))
    .map(([featureKey, stats]) => {
    const cfg = configMap.get(featureKey);
    const revenue = cfg?.sellingPrice != null ? stats.success * cfg.sellingPrice : null;
    const cost = cfg?.cost != null ? stats.success * cfg.cost : null;
    if (revenue != null) totalRevenue += revenue;
    if (cost != null) totalCost += cost;
    return {
      featureKey,
      featureName: cfg?.featureName ?? featureKey,
      ...stats,
      revenue,
      cost,
    };
  }).sort((a, b) => b.calls - a.calls || a.featureKey.localeCompare(b.featureKey));

  // Month revenue/cost from usage
  let monthRevenueFromUsage = 0;
  let monthCostFromUsage = 0;
  for (const s of monthByFeature.filter((row) => !shouldHideUsageFeature(row.featureKey))) {
    const cfg = configMap.get(s.featureKey);
    if (cfg?.sellingPrice != null) monthRevenueFromUsage += s._count.id * cfg.sellingPrice;
    if (cfg?.cost != null) monthCostFromUsage += s._count.id * cfg.cost;
  }

  const totalCalls = features.reduce((s, f) => s + f.calls, 0);
  const totalSuccess = features.reduce((s, f) => s + f.success, 0);
  const totalFailed = features.reduce((s, f) => s + f.failed, 0);

  return NextResponse.json({
    data: {
      users: {
        total: totalUsers ?? 0,
        active: activeUsers,
        planDistribution: Object.entries(planDist)
          .map(([plan, count]) => ({ plan, count }))
          .sort((a, b) => b.count - a.count),
      },
      thisMonth: {
        creditsConsumed: monthCreditsConsumed,
        calls: monthCalls,
        success: monthSuccess,
        failed: monthFailed,
        creditsRecharged: monthCreditsRecharged,
        revenueCny: monthRevenueCny,
        revenue: monthRevenueFromUsage,
        cost: monthCostFromUsage,
        profit: monthRevenueFromUsage - monthCostFromUsage,
      },
      overall: {
        calls: totalCalls,
        success: totalSuccess,
        failed: totalFailed,
        revenue: totalRevenue,
        cost: totalCost,
        profit: totalRevenue - totalCost,
      },
      features,
    },
  });
}
