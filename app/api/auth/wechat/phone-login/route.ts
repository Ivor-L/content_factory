import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { POINTS_API_BASES } from '@/lib/points-server';
import { getRequestUserContext } from '@/lib/authServer';

const WECHAT_ACCESS_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const WECHAT_GET_PHONE_URL = 'https://api.weixin.qq.com/wxa/business/getuserphonenumber';
const INTERNAL_SECRET = process.env.CREDITS_INTERNAL_SECRET ?? '';

class WechatConfigError extends Error {}
class WechatUpstreamError extends Error {}

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

function normalizePhone(raw: string): string | null {
  const phone = raw.trim().replace(/\s+/g, '');
  if (!phone) return null;
  const normalized = phone.startsWith('+') ? phone : `+${phone}`;
  if (!/^\+[1-9]\d{6,16}$/.test(normalized)) return null;
  return normalized;
}

function phoneDigits(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

function buildSyntheticEmail(phone: string): string {
  const digits = phoneDigits(phone) || 'unknown';
  return `phone_${digits}_${Date.now()}@miniapp.local`;
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

async function buildMiniappLoginResponse(userId: string, phone: string) {
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

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const resolvedApiKey = profile.api_key?.trim() || await ensureApiKeyForUser(userId);
  if (!resolvedApiKey) {
    return NextResponse.json(
      { error: 'Account has no API key and provisioning failed. Please contact support.' },
      { status: 403 },
    );
  }

  return NextResponse.json({
    ok: true,
    isNewUser: false,
    phone,
    userId: profile.id,
    apiKey: resolvedApiKey,
    username: profile.username ?? profile.full_name ?? null,
    avatarUrl: profile.avatar_url ?? null,
  });
}

async function resolveWechatAccessToken() {
  const { appId, appSecret } = getWechatAppConfig();
  if (!appId || !appSecret) {
    throw new WechatConfigError('WeChat app not configured');
  }

  const url = `${WECHAT_ACCESS_TOKEN_URL}?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', cache: 'no-store' });
  } catch {
    throw new WechatUpstreamError('Failed to reach WeChat API');
  }
  const payload = await res.json() as { access_token?: string; errcode?: number; errmsg?: string };
  if (!res.ok || payload?.errcode || !payload?.access_token) {
    throw new WechatUpstreamError(payload?.errmsg || 'Failed to get WeChat access token');
  }
  return payload.access_token;
}

async function resolvePhoneByWechatCode(code: string) {
  const accessToken = await resolveWechatAccessToken();
  let res: Response;
  try {
    res = await fetch(`${WECHAT_GET_PHONE_URL}?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      cache: 'no-store',
    });
  } catch {
    throw new WechatUpstreamError('Failed to reach WeChat API');
  }
  const payload = await res.json() as {
    errcode?: number;
    errmsg?: string;
    phone_info?: {
      phoneNumber?: string;
      purePhoneNumber?: string;
      countryCode?: string;
    };
  };

  if (!res.ok || payload?.errcode || !payload?.phone_info) {
    throw new WechatUpstreamError(payload?.errmsg || 'Failed to resolve phone number');
  }

  const phoneNumber = String(payload.phone_info.phoneNumber || '').trim();
  if (phoneNumber) return phoneNumber;

  const pure = String(payload.phone_info.purePhoneNumber || '').trim();
  const cc = String(payload.phone_info.countryCode || '').trim();
  if (!pure || !cc) throw new Error('Phone number missing');
  return `+${cc}${pure}`;
}

export async function POST(request: NextRequest) {
  let body: { code?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const code = String(body.code || '').trim();
  if (!code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }

  let phone: string;
  try {
    phone = resolvePhoneByWechatCode ? await resolvePhoneByWechatCode(code) : '';
  } catch (error) {
    if (error instanceof WechatConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof WechatUpstreamError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read phone from WeChat' },
      { status: 400 },
    );
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return NextResponse.json({ error: 'Invalid phone number from WeChat' }, { status: 400 });
  }

  const phoneIdentity = await prisma.userAuthIdentity.findFirst({
    where: { provider: 'phone', providerUid: normalizedPhone },
    select: { userId: true },
  });

  if (phoneIdentity?.userId) {
    const loginResponse = await buildMiniappLoginResponse(phoneIdentity.userId, normalizedPhone);

    const ctx = await getRequestUserContext(request, { allowDefaultApiKey: false });
    if (ctx.userId) {
      // when user already has a valid session/api key, keep phone identity aligned
      await prisma.userAuthIdentity.upsert({
        where: {
          provider_providerUid: {
            provider: 'phone',
            providerUid: normalizedPhone,
          },
        },
        update: {
          userId: ctx.userId,
          verifiedAt: new Date(),
        },
        create: {
          userId: ctx.userId,
          provider: 'phone',
          providerUid: normalizedPhone,
          verifiedAt: new Date(),
        },
      }).catch(() => {});
    }

    return loginResponse;
  }

  const autoRegisterEmail = buildSyntheticEmail(normalizedPhone);
  const autoPassword = crypto.randomBytes(24).toString('hex');

  const created = await supabaseAdmin.auth.admin.createUser({
    email: autoRegisterEmail,
    password: autoPassword,
    email_confirm: true,
    user_metadata: {
      full_name: `手机用户${phoneDigits(normalizedPhone).slice(-4)}`,
    },
  });

  if (created.error || !created.data?.user?.id) {
    console.error('[auth/wechat/phone-login] auto register failed', created.error);
    return NextResponse.json({ error: 'Auto registration failed' }, { status: 502 });
  }

  const newUserId = created.data.user.id;
  const now = new Date();

  await prisma.profiles.upsert({
    where: { id: newUserId },
    update: {
      full_name: `手机用户${phoneDigits(normalizedPhone).slice(-4)}`,
      updated_at: now,
    },
    create: {
      id: newUserId,
      full_name: `手机用户${phoneDigits(normalizedPhone).slice(-4)}`,
      updated_at: now,
      role: 'free',
      plan: 'free',
    },
  });

  await prisma.userAuthIdentity.upsert({
    where: {
      provider_providerUid: {
        provider: 'phone',
        providerUid: normalizedPhone,
      },
    },
    update: {
      userId: newUserId,
      verifiedAt: now,
    },
    create: {
      userId: newUserId,
      provider: 'phone',
      providerUid: normalizedPhone,
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
        source: 'wechat-phone-auto-register',
      },
    },
  });

  const provisionedApiKey = await provisionApiKeyForUser(newUserId, autoRegisterEmail);
  if (!provisionedApiKey) {
    return NextResponse.json(
      { error: 'Auto registration succeeded but API key provisioning failed' },
      { status: 502 },
    );
  }

  return buildMiniappLoginResponse(newUserId, normalizedPhone);
}
