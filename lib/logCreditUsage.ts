import prisma from "@/lib/prisma";

export interface LogUsageParams {
  featureKey: string;
  userId?: string | null;
  amount?: number;
  success: boolean;
  errorMessage?: string | null;
}

/**
 * Fire-and-forget usage log insert.
 * Call alongside every deductCredits (success=true) or in error handlers (success=false).
 */
export function logCreditUsage(params: LogUsageParams): void {
  prisma.creditUsageLog
    .create({
      data: {
        featureKey: params.featureKey,
        userId: params.userId ?? null,
        amount: params.amount ?? 0,
        success: params.success,
        errorMessage: params.errorMessage ?? null,
      },
    })
    .catch((e) => console.error("[logCreditUsage] failed:", e));
}
