import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function POST(request: NextRequest) {
  let body: { email?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = normalizeEmail(String(body.email || ''));
  if (!email) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  // Prefer existing-account login first.
  // If Supabase rejects with "Signups not allowed for otp" for a non-existing account,
  // retry with shouldCreateUser=true so miniapp email OTP can also complete first-time login.
  let { error } = await supabaseServerClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
    },
  });

  const shouldRetryCreateUser =
    (error?.code === 'otp_disabled' || /signups not allowed for otp/i.test(error?.message || ''));

  if (error && shouldRetryCreateUser) {
    const retry = await supabaseServerClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });
    error = retry.error;
  }

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Failed to send email code' },
      { status: error.status || 400 },
    );
  }

  return NextResponse.json({ ok: true, ttlSeconds: 600 });
}
