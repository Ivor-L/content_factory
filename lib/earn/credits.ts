import { deductConfiguredCredits } from '@/lib/creditBilling';
import { getCreditCost } from '@/lib/creditCosts';
import { logCreditUsage } from '@/lib/logCreditUsage';

export async function chargeEarnFeature(input: {
  apiKey: string | null;
  userId: string;
  featureKey: string;
  workflowName: string;
  defaultAmount?: number;
}) {
  const amount = await getCreditCost(input.featureKey, input.defaultAmount ?? 0);

  if (amount <= 0) {
    logCreditUsage({
      featureKey: input.featureKey,
      userId: input.userId,
      amount: 0,
      success: true,
    });
    return { amount: 0, unitAmount: 0 };
  }

  if (!input.apiKey) {
    logCreditUsage({
      featureKey: input.featureKey,
      userId: input.userId,
      amount,
      success: false,
      errorMessage: 'Missing apiKey for configured credit charge',
    });
    const error = new Error('Missing apiKey for configured credit charge');
    (error as Error & { status?: number }).status = 402;
    throw error;
  }

  return deductConfiguredCredits({
    apiKey: input.apiKey,
    userId: input.userId,
    featureKey: input.featureKey,
    defaultAmount: input.defaultAmount ?? 0,
    workflowId: input.featureKey,
    workflowName: input.workflowName,
    reason: input.featureKey,
  });
}
