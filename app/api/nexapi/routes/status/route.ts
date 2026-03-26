import { NextResponse } from 'next/server';
import { listRouteConfigs, checkRouteHealth } from '@/lib/nexapi/routes';
import { getRequestUserContext } from '@/lib/authServer';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getRequestUserContext(request);
  if (!ctx.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const configs = listRouteConfigs();
  const results = await Promise.all(configs.map((route) => checkRouteHealth(route)));

  return NextResponse.json({
    ok: true,
    routes: results,
  });
}
