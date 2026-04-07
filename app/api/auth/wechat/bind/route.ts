import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  let openid: string;
  let apiKey: string;
  try {
    const body = await request.json();
    openid = body?.openid;
    apiKey = body?.apiKey;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!openid || typeof openid !== 'string') {
    return NextResponse.json({ error: 'openid is required' }, { status: 400 });
  }
  if (!apiKey || typeof apiKey !== 'string') {
    return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
  }

  // 验证 apiKey 有效，找到对应用户
  const profile = await prisma.profiles.findUnique({
    where: { api_key: apiKey },
    select: { id: true, wechat_openid: true, username: true, full_name: true, avatar_url: true },
  });

  if (!profile) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  if (profile.wechat_openid && profile.wechat_openid !== openid) {
    return NextResponse.json({ error: 'This account is already bound to a different WeChat account' }, { status: 409 });
  }

  // 绑定 openid 到该账号
  await prisma.profiles.update({
    where: { id: profile.id },
    data: { wechat_openid: openid },
  });

  return NextResponse.json({
    data: {
      apiKey,
      userId: profile.id,
      username: profile.username ?? profile.full_name ?? null,
      avatarUrl: profile.avatar_url ?? null,
    },
  });
}
