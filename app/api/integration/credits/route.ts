import { NextResponse } from 'next/server';
import {
  POINTS_API_BASES,
  readTextSafe,
  looksLikeHtml,
  getStoredUserApiKey
} from '@/lib/points-server';

export async function GET(request: Request) {
  const storedApiKey = await getStoredUserApiKey(request);
  const headerApiKey = request.headers.get('x-user-api-key');
  const apiKey = storedApiKey || headerApiKey;

  if (!apiKey) {
    return NextResponse.json({ error: 'Unauthorized or no API key linked' }, { status: 401 });
  }

  try {
    const tryBalanceCheck = async (base: string, payloadKey: 'api_key' | 'apiKey') => {
      const getUrl = new URL('/api/balance/check', base);
      getUrl.searchParams.set(payloadKey, apiKey);
      getUrl.searchParams.set('amount', '0');

      const getRes = await fetch(getUrl.toString(), { method: 'GET', cache: 'no-store' });
      if (getRes.status !== 405) return { res: getRes, method: 'GET' as const };

      const postRes = await fetch(new URL('/api/balance/check', base).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [payloadKey]: apiKey, amount: 0 }),
        cache: 'no-store'
      });
      return { res: postRes, method: 'POST' as const };
    };

    let lastError: { status: number; details: string; base: string } | null = null;

    for (const base of POINTS_API_BASES) {
      let source: 'balance_check' | 'usage_events' = 'balance_check';
      let data: any = null;

      let resInfo = await tryBalanceCheck(base, 'api_key');
      if (!resInfo.res.ok) resInfo = await tryBalanceCheck(base, 'apiKey');

      if (resInfo.res.ok) {
        const text = await readTextSafe(resInfo.res);
        if (looksLikeHtml(resInfo.res, text)) {
          lastError = { status: resInfo.res.status, details: text.slice(0, 500), base };
          continue;
        }
        data = text ? JSON.parse(text) : null;
      } else {
        const usageRes = await fetch(`${base}/usage/events?apiKey=${encodeURIComponent(apiKey)}&page=1&size=1`, {
          method: 'GET',
          cache: 'no-store'
        });

        const usageText = await readTextSafe(usageRes);
        if (!usageRes.ok) {
          lastError = { status: usageRes.status, details: usageText.slice(0, 500), base };
          continue;
        }

        if (looksLikeHtml(usageRes, usageText)) {
          lastError = { status: usageRes.status, details: usageText.slice(0, 500), base };
          continue;
        }

        data = usageText ? JSON.parse(usageText) : null;
        source = 'usage_events';
      }

      const balanceCandidates = [
      data?.balance,
      data?.data?.balance,
      data?.data?.credits,
      data?.credits,
      data?.remaining,
      data?.data?.remaining,
      data?.balance_after,
      data?.data?.balance_after,
      data?.balanceAfter,
      data?.data?.balanceAfter,
      data?.data?.data?.[0]?.balanceAfter,
      data?.data?.data?.[0]?.balance_after
    ];

      const balanceRaw = balanceCandidates.find((v) => typeof v === 'number' || typeof v === 'string');
      const balance = typeof balanceRaw === 'number'
        ? balanceRaw
        : typeof balanceRaw === 'string'
          ? Number.isFinite(Number(balanceRaw))
            ? Number(balanceRaw)
            : null
          : null;

      return NextResponse.json({ ok: true, balance, source, raw: data, base });
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch credits',
        status: lastError?.status ?? 502,
        details: lastError?.details ?? '',
        base: lastError?.base ?? null
      },
      { status: lastError?.status ?? 502 }
    );
  } catch (error) {
    console.error('Proxy Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const apiKey = await getStoredUserApiKey(request);

    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized or no API key linked' }, { status: 401 });
    }

    const body = await request.json();
    const { amount, reason, workflow_id } = body;

    let lastError: { status: number; details: string; base: string } | null = null;

    for (const base of POINTS_API_BASES) {
      const res = await fetch(`${base}/api/credits/deduct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: apiKey,
          amount: amount || 1,
          reason: reason || 'content_factory_deduct',
          workflow_id: workflow_id || 'content-factory-web',
          workflow_name: 'Content Factory Web'
        }),
        cache: 'no-store'
      });

      const text = await readTextSafe(res);
      if (looksLikeHtml(res, text)) {
        lastError = { status: res.status, details: text.slice(0, 500), base };
        continue;
      }

      const data = text ? JSON.parse(text) : null;
      if (!res.ok || !data?.ok) {
        lastError = { status: res.status, details: JSON.stringify(data ?? {}).slice(0, 500), base };
        continue;
      }

      return NextResponse.json({ ...data, base });
    }

    return NextResponse.json(
      {
        error: 'Deduction failed',
        status: lastError?.status ?? 502,
        details: lastError?.details ?? '',
        base: lastError?.base ?? null
      },
      { status: lastError?.status ?? 502 }
    );

  } catch (error) {
    console.error('Proxy Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
