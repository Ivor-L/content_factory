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

  for (const base of POINTS_API_BASES) {
    try {
      const url = new URL('/usage/events', base);
      url.searchParams.set('apiKey', apiKey);
      url.searchParams.set('page', '1');
      url.searchParams.set('size', '1');

      const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });

      const text = await readTextSafe(res);
      if (!res.ok || looksLikeHtml(res, text)) continue;

      const data = text ? JSON.parse(text) : null;
      if (!data?.ok) continue;

      const balance = typeof data?.data?.data?.[0]?.balanceAfter === 'number'
        ? data.data.data[0].balanceAfter
        : null;

      return NextResponse.json({ ok: true, balance });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: 'Failed to fetch credits' }, { status: 502 });
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
