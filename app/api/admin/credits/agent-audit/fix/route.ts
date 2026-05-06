import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auditAgentCapabilityCreditConfigs } from "@/lib/agent-capabilities/credit-audit";
import { listAgentCapabilities } from "@/lib/agent-capabilities/registry";
import { getRequestUserContext } from "@/lib/authServer";
import { invalidateCreditCostCache } from "@/lib/creditCosts";
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

export async function POST(request: NextRequest) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const capabilities = listAgentCapabilities();
    const audit = await auditAgentCapabilityCreditConfigs(capabilities);
    const body = await request.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "fix_all";

    const created = [] as string[];
    const enabled = [] as string[];
    const capabilityByFeatureKey = new Map(
      capabilities.filter((cap) => cap.featureKey).map((cap) => [cap.featureKey!, cap]),
    );

    if (action === "fix_all" || action === "create_missing") {
      const missingByFeatureKey = new Map<string, (typeof audit.missingCreditConfig)[number]>();
      for (const item of audit.missingCreditConfig) {
        if (!item.featureKey || missingByFeatureKey.has(item.featureKey)) continue;
        missingByFeatureKey.set(item.featureKey, item);
      }

      for (const [featureKey, item] of missingByFeatureKey.entries()) {
        const cap = capabilityByFeatureKey.get(featureKey);
        const amount = Math.max(0, Math.floor(item.fallbackEstimatedCredits || cap?.estimatedCredits || 1));
        await prisma.creditConfig.upsert({
          where: { featureKey },
          create: {
            featureKey,
            featureName: cap?.title || item.title || featureKey,
            category: cap?.category || "agent",
            modelKey: cap?.creditModelKey || cap?.workflowId || null,
            amount,
            enabled: true,
            description: `Auto-created for NexTide Agent capability: ${item.id}`,
          },
          update: {
            featureName: cap?.title || item.title || featureKey,
            category: cap?.category || "agent",
            modelKey: cap?.creditModelKey || cap?.workflowId || null,
            amount,
            enabled: true,
            description: `Auto-created for NexTide Agent capability: ${item.id}`,
          },
        });
        created.push(featureKey);
      }
    }

    if (action === "fix_all" || action === "enable_disabled") {
      const disabledByFeatureKey = new Set<string>();
      for (const item of audit.disabledCreditConfig) {
        if (!item.featureKey || disabledByFeatureKey.has(item.featureKey)) continue;
        disabledByFeatureKey.add(item.featureKey);
      }

      for (const featureKey of disabledByFeatureKey) {
        const result = await prisma.creditConfig.updateMany({
          where: { featureKey },
          data: { enabled: true },
        });
        if (result.count > 0) {
          enabled.push(featureKey);
        }
      }
    }

    invalidateCreditCostCache();
    const nextAudit = await auditAgentCapabilityCreditConfigs(listAgentCapabilities());

    return NextResponse.json({
      data: {
        action,
        created,
        enabled,
        audit: nextAudit,
      },
    });
  } catch (error) {
    console.error("[admin/credits/agent-audit/fix] failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
