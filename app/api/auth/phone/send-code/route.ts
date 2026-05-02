import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';

const OTP_TTL_MINUTES = 10;
const DEV_OTP_CODE = process.env.DEV_PHONE_OTP_CODE?.trim() || '123456';

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

export async function POST(request: NextRequest) {
  let body: { phone?: string; purpose?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const phone = normalizePhone(String(body.phone || ''));
  const purpose = String(body.purpose || 'login').trim();

  if (!phone) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
  }

  if (!['login', 'bind'].includes(purpose)) {
    return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 });
  }

  const code = DEV_OTP_CODE;
  const codeHash = hashOtp(phone, purpose, code);

  await prisma.phoneOtpChallenge.create({
    data: {
      phone,
      purpose,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
    },
  });

  const isProd = process.env.NODE_ENV === 'production';
  // TODO: integrate SMS provider here in production.
  return NextResponse.json({
    ok: true,
    ttlSeconds: OTP_TTL_MINUTES * 60,
    ...(isProd ? {} : { devCode: code }),
  });
}
