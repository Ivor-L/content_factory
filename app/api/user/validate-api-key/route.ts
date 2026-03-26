import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { POINTS_API_BASES, readTextSafe, looksLikeHtml } from '@/lib/points-server';
import { getRequestUserContext } from '@/lib/authServer';

export async function POST(request: Request) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';

  if (!apiKey) {
    return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
  }

  // 1. 检查是否已被其他账号绑定
  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('api_key', apiKey)
    .maybeSingle();

  if (existing && existing.id !== userId) {
    return NextResponse.json({ valid: false, reason: 'already_bound' });
  }

  // 2. 验证 key 是否有效（余额接口）
  for (const base of POINTS_API_BASES) {
    try {
      const url = new URL('/api/balance/check', base);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('amount', '0');

      let res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });

      if (res.status === 405) {
        res = await fetch(new URL('/api/balance/check', base).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: apiKey, amount: 0 }),
          cache: 'no-store',
        });
      }

      if (!res.ok) continue;

      const text = await readTextSafe(res);
      if (looksLikeHtml(res, text)) continue;

      const data = text ? JSON.parse(text) : null;
      const balanceRaw = [
        data?.balance, data?.data?.balance, data?.data?.credits,
        data?.credits, data?.remaining, data?.data?.remaining,
      ].find((v) => typeof v === 'number' || typeof v === 'string');

      const balance = typeof balanceRaw === 'number'
        ? balanceRaw
        : typeof balanceRaw === 'string' && Number.isFinite(Number(balanceRaw))
          ? Number(balanceRaw)
          : null;

      return NextResponse.json({ valid: true, balance });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ valid: false, reason: 'invalid_key' });
}
