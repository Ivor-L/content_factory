import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { POINTS_API_BASES } from '@/lib/points-server';

const INTERNAL_SECRET = process.env.CREDITS_INTERNAL_SECRET ?? '';

async function provisionApiKeyForUser(userId: string, email: string): Promise<string | null> {
  if (!INTERNAL_SECRET) return null;

  for (const base of POINTS_API_BASES) {
    try {
      const res = await fetch(`${base}/internal/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': INTERNAL_SECRET,
        },
        body: JSON.stringify({ email }),
        cache: 'no-store',
      });

      if (!res.ok) continue;

      const data = await res.json() as { data?: { apiKey?: string } };
      const apiKey = data?.data?.apiKey?.trim();
      if (!apiKey) continue;

      await prisma.profiles.update({
        where: { id: userId },
        data: {
          api_key: apiKey,
          updated_at: new Date(),
        },
      });

      return apiKey;
    } catch {
      continue;
    }
  }

  return null;
}

async function ensureApiKeyForUser(userId: string): Promise<string | null> {
  const profile = await prisma.profiles.findUnique({
    where: { id: userId },
    select: { api_key: true },
  });

  if (profile?.api_key?.trim()) {
    return profile.api_key.trim();
  }

  const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userRes?.user?.email?.trim().toLowerCase();
  if (!email) return null;

  return provisionApiKeyForUser(userId, email);
}

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let profile = await prisma.profiles.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        full_name: true,
        avatar_url: true,
        plan: true,
        role: true,
        api_key: true,
      },
    });

    if (!profile) {
      const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(userId);
      const fallbackName = String(
        userRes?.user?.user_metadata?.full_name ||
        userRes?.user?.email?.split('@')[0] ||
        '用户'
      ).trim();
      const now = new Date();
      await prisma.profiles.upsert({
        where: { id: userId },
        update: {
          full_name: fallbackName,
          updated_at: now,
        },
        create: {
          id: userId,
          full_name: fallbackName,
          updated_at: now,
          role: 'free',
          plan: 'free',
        },
      });

      profile = await prisma.profiles.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          full_name: true,
          avatar_url: true,
          plan: true,
          role: true,
          api_key: true,
        },
      });

      if (!profile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
    }

    const resolvedApiKey = profile.api_key?.trim() || await ensureApiKeyForUser(userId);

    return NextResponse.json({
      data: {
        id: profile.id,
        username: profile.username ?? profile.full_name ?? null,
        avatarUrl: profile.avatar_url ?? null,
        memberLevel: profile.plan || profile.role || null,
        apiKey: resolvedApiKey ?? null,
      },
    });
  } catch (error) {
    console.error('[user/profile] get profile failed', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : '';
  if (!avatarUrl) {
    return NextResponse.json({ error: 'avatarUrl is required' }, { status: 400 });
  }

  try {
    const updated = await prisma.profiles.update({
      where: { id: userId },
      data: {
        avatar_url: avatarUrl,
        updated_at: new Date(),
      },
      select: {
        id: true,
        username: true,
        full_name: true,
        avatar_url: true,
      },
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        username: updated.username ?? updated.full_name ?? null,
        avatarUrl: updated.avatar_url ?? null,
      },
    });
  } catch (error) {
    console.error('[user/profile] update avatar failed', error);
    return NextResponse.json({ error: 'Failed to update avatar' }, { status: 500 });
  }
}
