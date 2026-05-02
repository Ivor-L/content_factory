import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { FinalizeLoginError, finalizeLogin } from '@/lib/auth/finalizeLogin';

const WECHAT_ACCESS_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const WECHAT_GET_PHONE_URL = 'https://api.weixin.qq.com/wxa/business/getuserphonenumber';

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

function toMiniappPayload(result: {
  userId: string;
  apiKey: string;
  username: string | null;
  avatarUrl: string | null;
}, phone: string) {
  return {
    ok: true,
    isNewUser: false,
    phone,
    userId: result.userId,
    apiKey: result.apiKey,
    username: result.username,
    avatarUrl: result.avatarUrl,
  };
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

  console.error('[auth/wechat/phone-login] finalize failed', error);
  return NextResponse.json({ error: 'Login failed' }, { status: 500 });
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
  const payload = (await res.json()) as { access_token?: string; errcode?: number; errmsg?: string };
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
  const payload = (await res.json()) as {
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
    phone = await resolvePhoneByWechatCode(code);
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

  try {
    const phoneIdentity = await prisma.userAuthIdentity.findFirst({
      where: { provider: 'phone', providerUid: normalizedPhone },
      select: { userId: true },
    });

    if (phoneIdentity?.userId) {
      const finalized = await finalizeLogin({
        userId: phoneIdentity.userId,
        identities: [
          {
            provider: 'phone',
            providerUid: normalizedPhone,
            verifiedAt: new Date(),
          },
        ],
      });

      return NextResponse.json(toMiniappPayload(finalized, normalizedPhone));
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

    const finalized = await finalizeLogin({
      userId: created.data.user.id,
      identities: [
        {
          provider: 'phone',
          providerUid: normalizedPhone,
          verifiedAt: new Date(),
        },
        {
          provider: 'email',
          providerUid: autoRegisterEmail,
          verifiedAt: new Date(),
          meta: {
            source: 'wechat-phone-auto-register',
          },
        },
      ],
      profileUpdates: {
        full_name: `手机用户${phoneDigits(normalizedPhone).slice(-4)}`,
      },
    });

    return NextResponse.json(toMiniappPayload(finalized, normalizedPhone));
  } catch (error) {
    return handleFinalizeLoginError(error);
  }
}
