import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { createApiKey, listApiKeys } from '@/lib/nexapi/apiKeys';

export async function GET(request: Request) {
  const ctx = await getRequestUserContext(request);
  if (!ctx.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keys = await listApiKeys(ctx.userId);
  return NextResponse.json({ ok: true, keys });
}

export async function POST(request: Request) {
  const ctx = await getRequestUserContext(request);
  if (!ctx.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const label = typeof body.label === 'string' ? body.label.slice(0, 64) : undefined;

  const record = await createApiKey(ctx.userId, label);
  return NextResponse.json({
    ok: true,
    key: {
      id: record.id,
      secret: record.secret,
      lastFour: record.lastFour,
      label: record.label,
      createdAt: record.createdAt,
    },
  });
}
