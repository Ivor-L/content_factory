import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { FinalizeLoginError, finalizeLogin } from '@/lib/auth/finalizeLogin';
import type { Prisma } from '@prisma/client';

const WECHAT_CODE2SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';

interface Code2SessionResponse {
  openid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

function buildSyntheticEmail(openid: string): string {
  return `wechat_${openid}_${Date.now()}@miniapp.local`;
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

async function finalizeMiniappWechatLogin(params: {
  userId: string;
  openid: string;
  email?: string;
  profileName?: string;
  emailSource?: string;
}) {
  const now = new Date();

  const identities: Array<{
    provider: 'email' | 'wechat';
    providerUid: string;
    verifiedAt: Date;
    meta?: Prisma.InputJsonValue;
  }> = [
    {
      provider: 'wechat',
      providerUid: params.openid,
      verifiedAt: now,
    },
  ];

  if (params.email) {
    identities.push({
      provider: 'email',
      providerUid: params.email,
      verifiedAt: now,
      meta: params.emailSource ? { source: params.emailSource } : undefined,
    });
  }

  const finalized = await finalizeLogin({
    userId: params.userId,
    identities,
    profileUpdates: {
      wechat_openid: params.openid,
      ...(params.profileName ? { full_name: params.profileName } : {}),
    },
  });

  return NextResponse.json({
    data: finalized,
  });
}

function handleFinalizeLoginError(error: unknown) {
  if (error instanceof FinalizeLoginError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status },
    );
  }

  console.error('[auth/wechat/login] finalize failed', error);
  return NextResponse.json({ error: 'Login failed' }, { status: 500 });
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

  const wxUrl = `${WECHAT_CODE2SESSION_URL}?appid=${appId}&secret=${appSecret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  let wxRes: Code2SessionResponse;
  try {
    const res = await fetch(wxUrl);
    wxRes = (await res.json()) as Code2SessionResponse;
  } catch {
    return NextResponse.json({ error: 'Failed to reach WeChat API' }, { status: 502 });
  }

  if (wxRes.errcode || !wxRes.openid) {
    const msg = wxRes.errmsg ?? 'WeChat auth failed';
    console.error('[wechat/login] code2session error:', wxRes.errcode, msg);
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const openid = wxRes.openid;

  try {
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
      return await finalizeMiniappWechatLogin({
        userId: wechatIdentity.userId,
        openid,
      });
    }

    const profile = await prisma.profiles.findUnique({
      where: { wechat_openid: openid },
      select: { id: true },
    });

    if (profile?.id) {
      return await finalizeMiniappWechatLogin({
        userId: profile.id,
        openid,
      });
    }

    const autoRegisterEmail = buildSyntheticEmail(openid);
    const autoPassword = crypto.randomBytes(24).toString('hex');

    const created = await supabaseAdmin.auth.admin.createUser({
      email: autoRegisterEmail,
      password: autoPassword,
      email_confirm: true,
      user_metadata: {
        full_name: `微信用户${openid.slice(-4)}`,
      },
    });

    if (created.error || !created.data?.user?.id) {
      console.error('[wechat/login] auto register failed', created.error);
      return NextResponse.json({ error: 'Auto registration failed' }, { status: 502 });
    }

    return await finalizeMiniappWechatLogin({
      userId: created.data.user.id,
      openid,
      email: autoRegisterEmail,
      profileName: `微信用户${openid.slice(-4)}`,
      emailSource: 'wechat-auto-register',
    });
  } catch (error) {
    return handleFinalizeLoginError(error);
  }
}
