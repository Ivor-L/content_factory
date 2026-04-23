import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { getActiveApiKeyRecord } from '@/lib/nexapi/apiKeys';

function looksLikeByokUpstreamKey(value: string | null | undefined) {
  if (!value) return false;
  const token = value.trim();
  return token.startsWith('sk-') && token.length >= 20;
}

async function validateByokKey(nexApiKey: string) {
  try {
    const res = await fetch('https://aiapi.atomx.top/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${nexApiKey}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return false;
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const ctx = await getRequestUserContext(request, { allowDefaultApiKey: false, useSystemApiKey: false });
  if (!ctx.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const nexApiKey = typeof body?.nexApiKey === 'string' ? body.nexApiKey.trim() : '';
  if (!nexApiKey) {
    return NextResponse.json({ valid: false, reason: 'empty' }, { status: 400 });
  }

  if (looksLikeByokUpstreamKey(nexApiKey)) {
    const valid = await validateByokKey(nexApiKey);
    if (!valid) {
      return NextResponse.json({ valid: false, reason: 'invalid_or_inactive' }, { status: 200 });
    }
    return NextResponse.json({ valid: true, keyType: 'byok' }, { status: 200 });
  }

  const active = await getActiveApiKeyRecord(nexApiKey);
  if (!active) {
    return NextResponse.json({ valid: false, reason: 'invalid_or_inactive' }, { status: 200 });
  }
  if (active.userId !== ctx.userId) {
    return NextResponse.json({ valid: false, reason: 'not_owned' }, { status: 200 });
  }

  return NextResponse.json({ valid: true, keyId: active.id }, { status: 200 });
}
