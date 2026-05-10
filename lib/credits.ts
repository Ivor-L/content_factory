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

export async function assertCreditsAvailable(apiKey: string, amount: number) {
  if (!apiKey) {
    throw new Error('Missing apiKey for credits balance check');
  }

  const normalizedAmount = Math.max(1, Math.ceil(Number(amount) || 0));
  let checked = false;

  for (const base of POINTS_API_BASES) {
    for (const payloadKey of ['api_key', 'apiKey'] as const) {
      try {
        const url = new URL('/api/balance/check', base);
        url.searchParams.set(payloadKey, apiKey);
        url.searchParams.set('required', String(normalizedAmount));
        url.searchParams.set('amount', String(normalizedAmount));
        const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
        const text = await res.text().catch(() => '');
        const data = text ? JSON.parse(text) as Record<string, unknown> : null;
        if (!res.ok || data?.ok === false) {
          const message = String(data?.message || data?.error || text || '');
          if (/insufficient|余额不足|积分不足/i.test(message)) {
            throw new Error('积分不足，请充值后重试');
          }
          continue;
        }

        checked = true;
        const sufficient = data?.sufficient ?? (data?.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>).sufficient : undefined);
        if (sufficient === false) throw new Error('积分不足，请充值后重试');
        return true;
      } catch (error) {
        if (error instanceof Error && /积分不足|insufficient/i.test(error.message)) throw error;
      }
    }

    try {
      const url = new URL('/balance', base);
      url.searchParams.set('apiKey', apiKey);
      const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
      const text = await res.text().catch(() => '');
      const data = text ? JSON.parse(text) as Record<string, unknown> : null;
      if (!res.ok || data?.ok === false) continue;
      checked = true;
      const nested = data?.data && typeof data.data === 'object' ? data.data as Record<string, unknown> : {};
      const balance = Number(nested.balance ?? data?.balance);
      if (Number.isFinite(balance) && balance < normalizedAmount) throw new Error('积分不足，请充值后重试');
      return true;
    } catch (error) {
      if (error instanceof Error && /积分不足|insufficient/i.test(error.message)) throw error;
    }
  }

  // Some legacy points services do not expose balance checks. In that case, do
  // not block trigger creation; the final success callback will perform the
  // actual deduction and record any deduction failure.
  return !checked;
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
