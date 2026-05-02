import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const WECHAT_CODE2SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';

interface Code2SessionResponse {
  openid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

function getWechatAppConfig() {
  const appId = (
    process.env.WECHAT_APP_ID ||
    process.env.WECHAT_APPID ||
    process.env.WX_APP_ID ||
    ''
  ).trim();
  const appSecret = (
    process.env.WECHAT_APP_SECRET ||
    process.env.WECHAT_SECRET ||
    process.env.WX_APP_SECRET ||
    ''
  ).trim();
  return { appId, appSecret };
}

export async function POST(request: NextRequest) {
  const { appId, appSecret } = getWechatAppConfig();

  if (!appId || !appSecret) {
    return NextResponse.json({ error: 'WeChat app not configured' }, { status: 503 });
  }

  let code: string;
  try {
    const body = await request.json();
    code = body?.code;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }

  // 用 code 换取 openid
  const wxUrl = `${WECHAT_CODE2SESSION_URL}?appid=${appId}&secret=${appSecret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  let wxRes: Code2SessionResponse;
  try {
    const res = await fetch(wxUrl);
    wxRes = await res.json() as Code2SessionResponse;
  } catch {
    return NextResponse.json({ error: 'Failed to reach WeChat API' }, { status: 502 });
  }

  if (wxRes.errcode || !wxRes.openid) {
    const msg = wxRes.errmsg ?? 'WeChat auth failed';
    console.error('[wechat/login] code2session error:', wxRes.errcode, msg);
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const openid = wxRes.openid;

  // New path: identities table first
  const wechatIdentity = await prisma.userAuthIdentity.findFirst({
    where: {
      provider: 'wechat',
      providerUid: openid,
    },
    select: {
      userId: true,
    },
  });

  if (wechatIdentity?.userId) {
    const linkedProfile = await prisma.profiles.findUnique({
      where: { id: wechatIdentity.userId },
      select: { id: true, api_key: true, username: true, full_name: true, avatar_url: true },
    });
    if (linkedProfile?.api_key) {
      return NextResponse.json({
        data: {
          apiKey: linkedProfile.api_key,
          userId: linkedProfile.id,
          username: linkedProfile.username ?? linkedProfile.full_name ?? null,
          avatarUrl: linkedProfile.avatar_url ?? null,
        },
      });
    }
  }

  // 查找已绑定该 openid 的用户
  const profile = await prisma.profiles.findUnique({
    where: { wechat_openid: openid },
    select: { id: true, api_key: true, username: true, full_name: true, avatar_url: true },
  });

  if (!profile) {
    // openid 未绑定任何账号，返回 openid 让前端引导用户绑定已有账号或注册
    return NextResponse.json(
      { error: 'NOT_BOUND', openid },
      { status: 404 },
    );
  }

  if (!profile.api_key) {
    return NextResponse.json(
      { error: 'Account has no API key. Please configure one in the web console.' },
      { status: 403 },
    );
  }

  return NextResponse.json({
    data: {
      apiKey: profile.api_key,
      userId: profile.id,
      username: profile.username ?? profile.full_name ?? null,
      avatarUrl: profile.avatar_url ?? null,
    },
  });
}
