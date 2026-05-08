import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { refundCredits } from "@/lib/credits";
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
    chargedAt: String(raw.chargedAt || ""),
    refunded: raw.refunded === true,
    refundedAt: typeof raw.refundedAt === "string" ? raw.refundedAt : undefined,
    refundReason: typeof raw.refundReason === "string" ? raw.refundReason : undefined,
  };
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
