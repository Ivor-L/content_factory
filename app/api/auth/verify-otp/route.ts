import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not defined");
}

const supabaseServerClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const ACCESS_COOKIE_NAME = "sb-access-token";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours
const COOKIE_BASE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

type VerifyOtpBody = {
  email?: string;
  otp?: string;
};

export async function POST(request: NextRequest) {
  let body: VerifyOtpBody | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const otp = typeof body?.otp === "string" ? body.otp.trim() : "";

  if (!email || !otp) {
    return NextResponse.json({ error: "Email and otp are required" }, { status: 400 });
  }

  const { data, error } = await supabaseServerClient.auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });

  if (error || !data.session) {
    return NextResponse.json(
      { error: error?.message || "Invalid verification code" },
      { status: error?.status || 400 }
    );
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
