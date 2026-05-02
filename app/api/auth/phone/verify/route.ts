import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { POINTS_API_BASES } from '@/lib/points-server';

function normalizePhone(raw: string): string | null {
  const phone = raw.trim().replace(/\s+/g, '');
  if (!phone) return null;
  const normalized = phone.startsWith('+') ? phone : `+${phone}`;
  if (!/^\+[1-9]\d{6,16}$/.test(normalized)) return null;
  return normalized;
}

function hashOtp(phone: string, purpose: string, code: string): string {
  const secret = process.env.PHONE_OTP_SECRET || 'local-dev-secret';
  return crypto
    .createHmac('sha256', secret)
    .update(`${phone}:${purpose}:${code}`)
    .digest('hex');
}

function lowerEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

function phoneDigits(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

function buildSyntheticEmail(phone: string): string {
  const digits = phoneDigits(phone) || 'unknown';
  return `phone_${digits}_${Date.now()}@miniapp.local`;
}

const INTERNAL_SECRET = process.env.CREDITS_INTERNAL_SECRET ?? '';

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
  let profile = await prisma.profiles.findUnique({
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

  const resolvedApiKey = profile?.api_key?.trim() || await ensureApiKeyForUser(userId);
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

export async function POST(request: NextRequest) {
  let body: { phone?: string; code?: string; purpose?: string; email?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const phone = normalizePhone(String(body.phone || ''));
  const code = String(body.code || '').trim();
  const purpose = String(body.purpose || 'login').trim();

  if (!phone || !code) {
    return NextResponse.json({ error: 'phone and code are required' }, { status: 400 });
  }
  if (!['login', 'bind'].includes(purpose)) {
    return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 });
  }

  const challenge = await prisma.phoneOtpChallenge.findFirst({
    where: {
      phone,
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!challenge) {
    return NextResponse.json({ error: 'OTP expired or not found' }, { status: 400 });
  }

  const expected = hashOtp(phone, purpose, code);
  if (expected !== challenge.codeHash) {
    await prisma.phoneOtpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return NextResponse.json({ error: 'Invalid OTP code' }, { status: 400 });
  }

  await prisma.phoneOtpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  if (purpose === 'bind') {
    const ctx = await getRequestUserContext(request, { allowDefaultApiKey: false });
    if (!ctx.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const exists = await prisma.userAuthIdentity.findFirst({
      where: { provider: 'phone', providerUid: phone },
      select: { userId: true },
    });

    if (exists && exists.userId !== ctx.userId) {
      return NextResponse.json({ error: 'Phone already bound by another account' }, { status: 409 });
    }

    await prisma.userAuthIdentity.upsert({
      where: {
        provider_providerUid: {
          provider: 'phone',
          providerUid: phone,
        },
      },
      update: {
        userId: ctx.userId,
        verifiedAt: new Date(),
      },
      create: {
        userId: ctx.userId,
        provider: 'phone',
        providerUid: phone,
        verifiedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, userId: ctx.userId, phone });
  }

  const phoneIdentity = await prisma.userAuthIdentity.findFirst({
    where: { provider: 'phone', providerUid: phone },
    select: { userId: true },
  });

  if (phoneIdentity?.userId) {
    return buildMiniappLoginResponse(phoneIdentity.userId, phone);
  }

  const email = lowerEmail(body.email);
  if (email) {
    const linked = await prisma.userAuthIdentity.findFirst({
      where: { provider: 'email', providerUid: email },
      select: { userId: true },
    });

    if (linked?.userId) {
      await prisma.userAuthIdentity.create({
        data: {
          userId: linked.userId,
          provider: 'phone',
          providerUid: phone,
          verifiedAt: new Date(),
        },
      });

      return buildMiniappLoginResponse(linked.userId, phone);
    }
  }

  const autoRegisterEmail = buildSyntheticEmail(phone);
  const autoPassword = crypto.randomBytes(24).toString('hex');

  const created = await supabaseAdmin.auth.admin.createUser({
    email: autoRegisterEmail,
    password: autoPassword,
    email_confirm: true,
    user_metadata: {
      full_name: `手机用户${phoneDigits(phone).slice(-4)}`,
    },
  });

  if (created.error || !created.data?.user?.id) {
    console.error('[auth/phone/verify] auto register failed', created.error);
    return NextResponse.json({ error: 'Auto registration failed' }, { status: 502 });
  }

  const newUserId = created.data.user.id;
  const now = new Date();

  await prisma.profiles.upsert({
    where: { id: newUserId },
    update: {
      full_name: `手机用户${phoneDigits(phone).slice(-4)}`,
      updated_at: now,
    },
    create: {
      id: newUserId,
      full_name: `手机用户${phoneDigits(phone).slice(-4)}`,
      updated_at: now,
      role: 'free',
      plan: 'free',
    },
  });

  await prisma.userAuthIdentity.upsert({
    where: {
      provider_providerUid: {
        provider: 'phone',
        providerUid: phone,
      },
    },
    update: {
      userId: newUserId,
      verifiedAt: now,
    },
    create: {
      userId: newUserId,
      provider: 'phone',
      providerUid: phone,
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
        source: 'phone-auto-register',
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

  return buildMiniappLoginResponse(newUserId, phone);
}
