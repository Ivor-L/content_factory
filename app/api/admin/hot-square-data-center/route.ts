import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUserContext } from '@/lib/authServer';
import {
  DEFAULT_HOT_SQUARE_DATA_CENTER_CONFIG,
  HOT_SQUARE_DATA_CENTER_KEY,
  normalizeHotSquareDataCenterConfig,
} from '@/lib/hotSquareDataCenter';

async function requireAdmin(request: Request) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  return data?.is_admin ? userId : null;
}

export async function GET(request: NextRequest) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const key = request.nextUrl.searchParams.get('key') || HOT_SQUARE_DATA_CENTER_KEY;
  const found = await prisma.monetizationSquareConfig.findUnique({ where: { key } });

  if (!found) {
    return NextResponse.json({
      data: {
        key,
        name: '爆款数据中心',
        description: null,
        published: true,
        version: 1,
        config: DEFAULT_HOT_SQUARE_DATA_CENTER_CONFIG,
      },
    });
  }

  return NextResponse.json({
    data: {
      ...found,
      config: normalizeHotSquareDataCenterConfig(found.config),
    },
  });
}

export async function PUT(request: NextRequest) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null) as {
    key?: string;
    name?: string;
    description?: string | null;
    published?: boolean;
    config?: unknown;
  } | null;

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const key = String(body.key || HOT_SQUARE_DATA_CENTER_KEY).trim();
  const name = String(body.name || '爆款数据中心').trim();
  const config = normalizeHotSquareDataCenterConfig(body.config);
  const existing = await prisma.monetizationSquareConfig.findUnique({ where: { key } });

  const saved = await prisma.monetizationSquareConfig.upsert({
    where: { key },
    update: {
      name,
      description: body.description ?? null,
      published: body.published !== false,
      config: config as unknown as Prisma.InputJsonValue,
      version: (existing?.version || 1) + 1,
    },
    create: {
      key,
      name,
      description: body.description ?? null,
      published: body.published !== false,
      config: config as unknown as Prisma.InputJsonValue,
      version: 1,
    },
  });

  return NextResponse.json({
    data: {
      ...saved,
      config: normalizeHotSquareDataCenterConfig(saved.config),
    },
  });
}
