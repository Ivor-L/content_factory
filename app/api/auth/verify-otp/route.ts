import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FinalizeLoginError, finalizeLogin } from '@/lib/auth/finalizeLogin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not defined');
}

const supabaseServerClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const ACCESS_COOKIE_NAME = 'sb-access-token';
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours
const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

type VerifyOtpBody = {
  email?: string;
  otp?: string;
};

function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function buildFinalizeErrorResponse(error: FinalizeLoginError) {
  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
    },
    { status: error.status },
  );
}

export async function POST(request: NextRequest) {
  let body: VerifyOtpBody | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = normalizeEmail(typeof body?.email === 'string' ? body.email : '');
  const otp = typeof body?.otp === 'string' ? body.otp.trim() : '';

  if (!email || !otp) {
    return NextResponse.json({ error: 'Email and otp are required' }, { status: 400 });
  }

  const { data, error } = await supabaseServerClient.auth.verifyOtp({
    email,
    token: otp,
    type: 'email',
  });

  if (error || !data.session || !data.user?.id) {
    return NextResponse.json(
      { error: error?.message || 'Invalid verification code' },
      { status: error?.status || 400 },
    );
  }

  try {
    await finalizeLogin({
      userId: data.user.id,
      identities: [
        {
          provider: 'email',
          providerUid: email,
          verifiedAt: new Date(),
        },
      ],
    });
  } catch (finalizeError) {
    if (finalizeError instanceof FinalizeLoginError) {
      return buildFinalizeErrorResponse(finalizeError);
    }

    console.error('[auth/verify-otp] finalize failed', finalizeError);
    return NextResponse.json({ error: 'Login bootstrap failed' }, { status: 500 });
  }

  const session = data.session;

  const response = NextResponse.json({
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
    },
  });

  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: session.access_token,
    maxAge: MAX_AGE_SECONDS,
    ...COOKIE_BASE,
  });

  return response;
}
