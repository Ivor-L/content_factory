import { NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import { revokeApiKey } from '@/lib/nexapi/apiKeys';

type Params = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const ctx = await getRequestUserContext(request);
  if (!ctx.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!id) {
    return NextResponse.json({ error: 'Missing key id' }, { status: 400 });
  }

  await revokeApiKey(ctx.userId, id);

  return NextResponse.json({ ok: true });
}
