import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { POINTS_API_BASES } from '@/lib/points-server';

const WECHAT_CODE2SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';
const INTERNAL_SECRET = process.env.CREDITS_INTERNAL_SECRET ?? '';

interface Code2SessionResponse {
  openid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

function buildSyntheticEmail(openid: string): string {
  return `wechat_${openid}_${Date.now()}@miniapp.local`;
}

async function provisionApiKeyForUser(userId: string, email: string): Promise<string | null> {
  if (!INTERNAL_SECRET) {
    return null;
  }

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

async function buildMiniappLoginPayload(userId: string) {
  const profile = await prisma.profiles.findUnique({
    where: { id: userId },
    select: {
      id: true,
      api_key: true,
      username: true,
      full_name: true,
      avatar_url: true,
    },
  });

  if (!profile) return null;

  const resolvedApiKey = profile.api_key?.trim() || await ensureApiKeyForUser(userId);
  if (!resolvedApiKey) return null;

  return {
    apiKey: resolvedApiKey,
    userId: profile.id,
    username: profile.username ?? profile.full_name ?? null,
    avatarUrl: profile.avatar_url ?? null,
  };
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
    const payload = await buildMiniappLoginPayload(wechatIdentity.userId);
    if (payload) {
      return NextResponse.json({
        data: payload,
      });
    }
  }

  // 查找已绑定该 openid 的用户
  const profile = await prisma.profiles.findUnique({
    where: { wechat_openid: openid },
    select: { id: true, api_key: true, username: true, full_name: true, avatar_url: true },
  });

  if (profile) {
    const payload = await buildMiniappLoginPayload(profile.id);
    if (!payload) {
      return NextResponse.json(
        { error: 'Account has no API key and provisioning failed. Please contact support.' },
        { status: 403 },
      );
    }
    return NextResponse.json({ data: payload });
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

  const newUserId = created.data.user.id;
  const now = new Date();

  await prisma.profiles.upsert({
    where: { id: newUserId },
    update: {
      full_name: `微信用户${openid.slice(-4)}`,
      wechat_openid: openid,
      updated_at: now,
    },
    create: {
      id: newUserId,
      full_name: `微信用户${openid.slice(-4)}`,
      wechat_openid: openid,
      updated_at: now,
      role: 'free',
      plan: 'free',
    },
  });

  await prisma.userAuthIdentity.upsert({
    where: {
      provider_providerUid: {
        provider: 'wechat',
        providerUid: openid,
      },
    },
    update: {
      userId: newUserId,
      verifiedAt: now,
    },
    create: {
      userId: newUserId,
      provider: 'wechat',
      providerUid: openid,
      verifiedAt: now,
    },
  });

  await prisma.userAuthIdentity.upsert({
    where: {
      provider_providerUid: {
        provider: 'email',
        providerUid: autoRegisterEmail,
      },
    },
    update: {
      userId: newUserId,
      verifiedAt: now,
    },
    create: {
      userId: newUserId,
      provider: 'email',
      providerUid: autoRegisterEmail,
      verifiedAt: now,
      meta: {
        source: 'wechat-auto-register',
      },
    },
  });

  const payload = await buildMiniappLoginPayload(newUserId);
  if (!payload) {
    return NextResponse.json(
      { error: 'Auto registration succeeded but API key provisioning failed' },
      { status: 502 },
    );
  }

  return NextResponse.json({ data: payload });
}
