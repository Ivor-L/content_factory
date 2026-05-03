import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { FinalizeLoginError, finalizeLogin } from '@/lib/auth/finalizeLogin';

function normalizePhone(raw: string): string | null {
  const phone = raw.trim().replace(/\s+/g, '');
  if (!phone) return null;
  const normalized = phone.startsWith('+') ? phone : `+${phone}`;
  if (!/^\+[1-9]\d{6,16}$/.test(normalized)) return null;
  return normalized;
}

function hashOtp(phone: string, purpose: string, code: string): string {
  const secret = process.env.PHONE_OTP_SECRET || 'local-dev-secret';
  return crypto.createHmac('sha256', secret).update(`${phone}:${purpose}:${code}`).digest('hex');
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
  const syntheticEmailDomain = (process.env.SYNTHETIC_EMAIL_DOMAIN || 'miniapp.atomx.top')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  return `phone_${digits}_${Date.now()}@${syntheticEmailDomain}`;
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

  console.error('[auth/phone/verify] finalize failed', error);
  return NextResponse.json({ error: 'Login failed' }, { status: 500 });
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

  try {
    const phoneIdentity = await prisma.userAuthIdentity.findFirst({
      where: { provider: 'phone', providerUid: phone },
      select: { userId: true },
    });

    if (phoneIdentity?.userId) {
      const finalized = await finalizeLogin({
        userId: phoneIdentity.userId,
        identities: [
          {
            provider: 'phone',
            providerUid: phone,
            verifiedAt: new Date(),
          },
        ],
      });
      return NextResponse.json(toMiniappPayload(finalized, phone));
    }

    const email = lowerEmail(body.email);
    if (email) {
      const linked = await prisma.userAuthIdentity.findFirst({
        where: { provider: 'email', providerUid: email },
        select: { userId: true },
      });

      if (linked?.userId) {
        const finalized = await finalizeLogin({
          userId: linked.userId,
          identities: [
            {
              provider: 'email',
              providerUid: email,
              verifiedAt: new Date(),
            },
            {
              provider: 'phone',
              providerUid: phone,
              verifiedAt: new Date(),
            },
          ],
        });

        return NextResponse.json(toMiniappPayload(finalized, phone));
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

    const finalized = await finalizeLogin({
      userId: created.data.user.id,
      identities: [
        {
          provider: 'phone',
          providerUid: phone,
          verifiedAt: new Date(),
        },
        {
          provider: 'email',
          providerUid: autoRegisterEmail,
          verifiedAt: new Date(),
          meta: {
            source: 'phone-auto-register',
          },
        },
      ],
      profileUpdates: {
        full_name: `手机用户${phoneDigits(phone).slice(-4)}`,
      },
    });

    return NextResponse.json(toMiniappPayload(finalized, phone));
  } catch (error) {
    return handleFinalizeLoginError(error);
  }
}
