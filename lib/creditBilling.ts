import { deductCredits } from "@/lib/credits";
import { getCreditCostForModel } from "@/lib/creditCosts";
import { logCreditUsage } from "@/lib/logCreditUsage";

export interface DeductConfiguredCreditsParams {
  apiKey: string;
  featureKey: string;
  userId?: string | null;
  defaultAmount?: number;
  modelKey?: string | null;
  units?: number;
  workflowId?: string;
  workflowName?: string;
  reason?: string;
}

export async function deductConfiguredCredits({
  apiKey,
  featureKey,
  userId,
  defaultAmount = 1,
  modelKey,
  units = 1,
  workflowId,
  workflowName,
  reason,
}: DeductConfiguredCreditsParams): Promise<{ unitAmount: number; amount: number }> {
  const unitAmount = await getCreditCostForModel(featureKey, modelKey, defaultAmount);
  const normalizedUnits = Math.max(1, Math.ceil(Number(units) || 1));
  const amount = unitAmount * normalizedUnits;

  try {
    await deductCredits(apiKey, {
      amount,
      workflowId: workflowId || featureKey,
      workflowName: workflowName || featureKey,
      reason: reason || featureKey,
    });
    logCreditUsage({ featureKey, userId, amount, success: true });
    return { unitAmount, amount };
  } catch (error) {
    logCreditUsage({
      featureKey,
      userId,
      amount,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}
