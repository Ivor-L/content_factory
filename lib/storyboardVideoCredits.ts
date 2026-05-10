import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { deductCredits, refundCredits } from "@/lib/credits";
import { logCreditUsage } from "@/lib/logCreditUsage";

export type StoryboardVideoBillingMode = "duration_seconds" | "segments";

export interface StoryboardVideoCreditCharge {
  requestId: string;
  featureKey: string;
  modelKey: string;
  unitAmount: number;
  units: number;
  amount: number;
  billingMode: StoryboardVideoBillingMode;
  chargeTiming?: "upfront" | "on_success";
  charged?: boolean;
  chargedAt: string;
  refunded?: boolean;
  refundedAt?: string;
  refundReason?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function mergeStoryboardVideoCreditCharge(
  params: unknown,
  charge: StoryboardVideoCreditCharge | null | undefined,
): Prisma.InputJsonValue {
  const current = asRecord(params);
  if (!charge) return current as Prisma.InputJsonValue;
  return {
    ...current,
    video_credit_charge: {
      ...asRecord(current.video_credit_charge),
      ...charge,
      charged: charge.chargeTiming === "on_success" ? charge.charged === true : true,
      refunded: false,
    },
  } as Prisma.InputJsonValue;
}

export function readStoryboardVideoCreditCharge(params: unknown): StoryboardVideoCreditCharge | null {
  const current = asRecord(params);
  const raw = asRecord(current.video_credit_charge);
  const amount = Math.ceil(Number(raw.amount) || 0);
  if (!amount || amount <= 0) return null;
  return {
    requestId: String(raw.requestId || ""),
    featureKey: String(raw.featureKey || "storyboard_video"),
    modelKey: String(raw.modelKey || ""),
    unitAmount: Number(raw.unitAmount) || amount,
    units: Math.max(1, Math.ceil(Number(raw.units) || 1)),
    amount,
    billingMode: raw.billingMode === "duration_seconds" ? "duration_seconds" : "segments",
    chargeTiming: raw.chargeTiming === "on_success" ? "on_success" : "upfront",
    charged: raw.charged === true,
    chargedAt: String(raw.chargedAt || ""),
    refunded: raw.refunded === true,
    refundedAt: typeof raw.refundedAt === "string" ? raw.refundedAt : undefined,
    refundReason: typeof raw.refundReason === "string" ? raw.refundReason : undefined,
  };
}

export async function deductStoryboardVideoCreditCharge({
  segmentId,
  apiKey,
  userId,
  reason,
}: {
  segmentId: string;
  apiKey: string;
  userId?: string | null;
  reason: string;
}): Promise<{ deducted: boolean; amount: number; reason?: string }> {
  const segment = await prisma.storyboardSegment.findUnique({
    where: { id: segmentId },
    select: { generationParams: true },
  });
  const params = asRecord(segment?.generationParams);
  const charge = readStoryboardVideoCreditCharge(params);
  if (!charge) return { deducted: false, amount: 0, reason: "no_charge" };
  if (charge.chargeTiming !== "on_success") return { deducted: false, amount: charge.amount, reason: "not_on_success_charge" };
  if (charge.charged) return { deducted: false, amount: charge.amount, reason: "already_charged" };
  if (charge.refunded) return { deducted: false, amount: charge.amount, reason: "already_refunded" };

  try {
    await deductCredits(apiKey, {
      amount: charge.amount,
      workflowId: "flow_storyboard_video",
      workflowName: "分镜视频生成",
      reason,
    });

    await prisma.storyboardSegment.update({
      where: { id: segmentId },
      data: {
        generationParams: {
          ...params,
          video_credit_charge: {
            ...asRecord(params.video_credit_charge),
            charged: true,
            chargedAt: new Date().toISOString(),
            chargeReason: reason,
          },
        } as Prisma.InputJsonValue,
      },
    });

    logCreditUsage({
      featureKey: charge.modelKey ? `${charge.featureKey}:${charge.modelKey}` : charge.featureKey,
      userId,
      amount: charge.amount,
      success: true,
    });
    return { deducted: true, amount: charge.amount };
  } catch (error) {
    logCreditUsage({
      featureKey: charge.modelKey ? `${charge.featureKey}:${charge.modelKey}` : charge.featureKey,
      userId,
      amount: charge.amount,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown deduct error",
    });
    throw error;
  }
}

export async function refundStoryboardVideoCreditCharge({
  segmentId,
  apiKey,
  userId,
  reason,
  errorMessage,
}: {
  segmentId: string;
  apiKey: string;
  userId?: string | null;
  reason: string;
  errorMessage?: string | null;
}): Promise<{ refunded: boolean; amount: number; reason?: string }> {
  const segment = await prisma.storyboardSegment.findUnique({
    where: { id: segmentId },
    select: { generationParams: true },
  });
  const params = asRecord(segment?.generationParams);
  const charge = readStoryboardVideoCreditCharge(params);
  if (!charge) return { refunded: false, amount: 0, reason: "no_charge" };
  if (charge.refunded) return { refunded: false, amount: charge.amount, reason: "already_refunded" };
  if (charge.chargeTiming === "on_success" && !charge.charged) {
    await prisma.storyboardSegment.update({
      where: { id: segmentId },
      data: {
        generationParams: {
          ...params,
          video_credit_charge: {
            ...asRecord(params.video_credit_charge),
            refunded: false,
            refundSkippedAt: new Date().toISOString(),
            refundReason: reason,
            refundSkippedReason: "not_charged",
            refundError: errorMessage || null,
          },
        } as Prisma.InputJsonValue,
      },
    });
    return { refunded: false, amount: charge.amount, reason: "not_charged" };
  }

  try {
    await refundCredits(apiKey, {
      amount: charge.amount,
      workflowId: "flow_storyboard_video",
      workflowName: "分镜视频生成退款",
      reason,
    });

    await prisma.storyboardSegment.update({
      where: { id: segmentId },
      data: {
        generationParams: {
          ...params,
          video_credit_charge: {
            ...asRecord(params.video_credit_charge),
            refunded: true,
            refundedAt: new Date().toISOString(),
            refundReason: reason,
            refundError: errorMessage || null,
          },
        } as Prisma.InputJsonValue,
      },
    });

    logCreditUsage({
      featureKey: `${charge.featureKey}_refund`,
      userId,
      amount: -charge.amount,
      success: true,
    });
    return { refunded: true, amount: charge.amount };
  } catch (error) {
    logCreditUsage({
      featureKey: `${charge.featureKey}_refund`,
      userId,
      amount: -charge.amount,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown refund error",
    });
    throw error;
  }
}
