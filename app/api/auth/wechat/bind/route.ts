import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';

export async function POST(request: NextRequest) {
  const ctx = await getRequestUserContext(request, { allowDefaultApiKey: false });
  let openid: string;
  let apiKey: string | null = null;
  try {
    const body = await request.json();
    openid = body?.openid;
    apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : null;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!openid || typeof openid !== 'string') {
    return NextResponse.json({ error: 'openid is required' }, { status: 400 });
  }
  // New path: require authenticated session user. Keep apiKey as fallback for backward compatibility.
  let profile: { id: string; wechat_openid: string | null; username: string | null; full_name: string | null; avatar_url: string | null; api_key: string | null } | null = null;
  if (ctx.userId) {
    profile = await prisma.profiles.findUnique({
      where: { id: ctx.userId },
      select: { id: true, wechat_openid: true, username: true, full_name: true, avatar_url: true, api_key: true },
    });
  } else if (apiKey) {
    profile = await prisma.profiles.findUnique({
      where: { api_key: apiKey },
      select: { id: true, wechat_openid: true, username: true, full_name: true, avatar_url: true, api_key: true },
    });
  } else {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  if (profile.wechat_openid && profile.wechat_openid !== openid) {
    return NextResponse.json({ error: 'This account is already bound to a different WeChat account' }, { status: 409 });
  }

  const existingIdentity = await prisma.userAuthIdentity.findFirst({
    where: {
      provider: 'wechat',
      providerUid: openid,
    },
    select: { userId: true },
  });

  if (existingIdentity && existingIdentity.userId !== profile.id) {
    return NextResponse.json({ error: 'This WeChat account is already bound to another user' }, { status: 409 });
  }

  // 绑定 openid 到该账号
  await prisma.profiles.update({
    where: { id: profile.id },
    data: { wechat_openid: openid },
  });

  await prisma.userAuthIdentity.upsert({
    where: {
      provider_providerUid: {
        provider: 'wechat',
        providerUid: openid,
      },
    },
    update: {
      userId: profile.id,
      verifiedAt: new Date(),
    },
    create: {
      userId: profile.id,
      provider: 'wechat',
      providerUid: openid,
      verifiedAt: new Date(),
    },
  });

  return NextResponse.json({
    data: {
      apiKey: profile.api_key,
      userId: profile.id,
      username: profile.username ?? profile.full_name ?? null,
      avatarUrl: profile.avatar_url ?? null,
    },
  });
}
