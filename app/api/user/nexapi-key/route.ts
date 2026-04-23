import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getActiveApiKeyRecord } from '@/lib/nexapi/apiKeys';

const NEXAPI_KEY_MIN_LENGTH = 10;

function looksLikeByokUpstreamKey(value: string | null | undefined) {
  if (!value) return false;
  const token = value.trim();
  return token.startsWith('sk-') && token.length >= 20;
}

function isMissingNexApiColumnError(message: string | undefined) {
  if (!message) return false;
  return (
    message.includes("Could not find the 'nexapi_key' column") ||
    message.includes('nexapi_key')
  );
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
    return res.ok;
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
  const nexApiKeyRaw = typeof body?.nexApiKey === 'string' ? body.nexApiKey : '';
  const nexApiKey = nexApiKeyRaw.trim();

  if (!nexApiKey) {
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: ctx.userId,
        nexapi_key: null,
        updated_at: updatedAt,
      });

    if (error) {
      if (isMissingNexApiColumnError(error.message)) {
        return NextResponse.json({ saved: true, updatedAt, value: null, storageMode: 'local_only' });
      }
      return NextResponse.json({ error: `SAVE_FAILED:${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ saved: true, updatedAt, value: null });
  }

  if (nexApiKey.length < NEXAPI_KEY_MIN_LENGTH) {
    return NextResponse.json({ error: 'INVALID_FORMAT' }, { status: 400 });
  }

  // Third-party BYOK keys (`sk-`) are accepted without platform-side validity checks.
  if (!looksLikeByokUpstreamKey(nexApiKey)) {
    const active = await getActiveApiKeyRecord(nexApiKey);
    if (!active) {
      return NextResponse.json({ error: 'INVALID_OR_INACTIVE' }, { status: 400 });
    }
    if (active.userId !== ctx.userId) {
      return NextResponse.json({ error: 'NOT_OWNED' }, { status: 400 });
    }
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: ctx.userId,
      nexapi_key: nexApiKey,
      updated_at: updatedAt,
    });

  if (error) {
    if (isMissingNexApiColumnError(error.message)) {
      return NextResponse.json({
        saved: true,
        updatedAt,
        value: nexApiKey,
        storageMode: 'local_only',
      });
    }
    return NextResponse.json({ error: `SAVE_FAILED:${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    saved: true,
    updatedAt,
    value: nexApiKey,
  });
}
