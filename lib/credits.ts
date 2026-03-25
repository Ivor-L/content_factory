const DEFAULT_POINTS_API_BASE = 'https://api.atomx.top';

const POINTS_API_BASES = Array.from(
  new Set(
    [process.env.POINTS_API_BASE, DEFAULT_POINTS_API_BASE]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim().replace(/\/$/, ''))
  )
);

interface DeductOptions {
  amount?: number;
  workflowId?: string;
  workflowName?: string;
  reason?: string;
}

export async function deductCredits(
  apiKey: string,
  { amount = 1, workflowId = 'content-factory-web', workflowName = 'Content Factory Web', reason = 'storyboard_split' }: DeductOptions = {}
) {
  return requestCreditsMutation(
    apiKey,
    [{ path: '/api/credits/deduct', amount }],
    { workflowId, workflowName, reason },
    'deduct'
  );
}

export async function refundCredits(
  apiKey: string,
  { amount = 1, workflowId = 'content-factory-web', workflowName = 'Content Factory Web', reason = 'content_factory_refund' }: DeductOptions = {}
) {
  const normalizedAmount = Math.abs(Number(amount) || 0) || 1;
  return requestCreditsMutation(
    apiKey,
    [
      { path: '/api/credits/refund', amount: normalizedAmount },
      { path: '/api/credits/add', amount: normalizedAmount },
      // Fallback for legacy services that only support deduct and allow negative amount.
      { path: '/api/credits/deduct', amount: -normalizedAmount },
    ],
    { workflowId, workflowName, reason },
    'refund'
  );
}

async function requestCreditsMutation(
  apiKey: string,
  endpointCandidates: Array<{ path: string; amount: number }>,
  {
    workflowId,
    workflowName,
    reason,
  }: {
    workflowId: string;
    workflowName: string;
    reason: string;
  },
  action: 'deduct' | 'refund'
) {
  if (!apiKey) {
    throw new Error(`Missing apiKey for credits ${action}`);
  }

  let lastError: { status: number; details: string; base: string } | null = null;

  for (const base of POINTS_API_BASES) {
    for (const candidate of endpointCandidates) {
      try {
        const res = await fetch(`${base}${candidate.path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: apiKey,
            amount: candidate.amount,
            reason,
            workflow_id: workflowId,
            workflow_name: workflowName,
          }),
          cache: 'no-store',
        });

        if (res.ok) {
          return true;
        }

        const details = await res.text();
        lastError = { status: res.status, details: details.slice(0, 500), base };
      } catch (error) {
        lastError = {
          status: 500,
          details: error instanceof Error ? error.message : 'Unknown error',
          base,
        };
      }
    }
  }

  const message = lastError
    ? `Failed to ${action} credits (${lastError.status} @ ${lastError.base}): ${lastError.details}`
    : `Failed to ${action} credits`;
  throw new Error(message);
}
