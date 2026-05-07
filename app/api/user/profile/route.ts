import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { FinalizeLoginError, finalizeLogin } from '@/lib/auth/finalizeLogin';

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request, { skipProfileKeys: true });
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const finalized = await finalizeLogin({ userId });

    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        full_name: true,
        avatar_url: true,
        plan: true,
        role: true,
      },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        id: profile.id,
        username: profile.username ?? profile.full_name ?? null,
        avatarUrl: profile.avatar_url ?? null,
        memberLevel: profile.plan || profile.role || null,
        apiKey: finalized.apiKey,
      },
    });
  } catch (error) {
    if (error instanceof FinalizeLoginError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      );
    }

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

  const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : undefined;
  const username = typeof body.username === 'string' ? body.username.trim() : undefined;
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : undefined;

  if (avatarUrl === undefined && username === undefined && fullName === undefined) {
    return NextResponse.json({ error: 'avatarUrl, username or fullName is required' }, { status: 400 });
  }

  try {
    const data: Record<string, unknown> = {
      updated_at: new Date(),
    };
    if (avatarUrl !== undefined) data.avatar_url = avatarUrl || null;
    if (username !== undefined) data.username = username || null;
    if (fullName !== undefined) data.full_name = fullName || null;

    const updated = await prisma.profiles.update({
      where: { id: userId },
      data,
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
