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

  // 2. 验证 key 是否有效（积分消耗记录接口）
  for (const base of POINTS_API_BASES) {
    try {
      const url = new URL('/usage/events', base);
      url.searchParams.set('apiKey', apiKey);
      url.searchParams.set('page', '1');
      url.searchParams.set('size', '1');

      const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });

      if (!res.ok) continue;

      const text = await readTextSafe(res);
      if (looksLikeHtml(res, text)) continue;

      const data = text ? JSON.parse(text) : null;
      if (!data?.ok) continue;

      const balance = typeof data?.data?.data?.[0]?.balanceAfter === 'number'
        ? data.data.data[0].balanceAfter
        : null;

      return NextResponse.json({ valid: true, balance });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ valid: false, reason: 'invalid_key' });
}
