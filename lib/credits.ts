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
  if (!apiKey) {
    throw new Error('Missing apiKey for credits deduction');
  }

  let lastError: { status: number; details: string; base: string } | null = null;

  for (const base of POINTS_API_BASES) {
    try {
      const res = await fetch(`${base}/api/credits/deduct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          amount,
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

  const message = lastError
    ? `Failed to deduct credits (${lastError.status} @ ${lastError.base}): ${lastError.details}`
    : 'Failed to deduct credits';
  throw new Error(message);
}
