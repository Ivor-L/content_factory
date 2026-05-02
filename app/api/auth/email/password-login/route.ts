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

function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = normalizeEmail(String(body.email || ''));
  const password = String(body.password || '').trim();
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }

  const { data, error } = await supabaseServerClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session?.access_token || !data.user?.id) {
    return NextResponse.json(
      { error: error?.message || '邮箱或密码错误' },
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
      return NextResponse.json(
        {
          error: finalizeError.message,
          code: finalizeError.code,
        },
        { status: finalizeError.status },
      );
    }

    console.error('[auth/email/password-login] finalize failed', finalizeError);
    return NextResponse.json({ error: 'Login bootstrap failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    accessToken: data.session.access_token,
  });
}
