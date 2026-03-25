import { NextRequest, NextResponse } from "next/server";

const ACCESS_COOKIE_NAME = "sb-access-token";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours aligns with default Supabase access token lifetime
const COOKIE_BASE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function POST(request: NextRequest) {
  let payload: { accessToken?: string } | null = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload?.accessToken || typeof payload.accessToken !== "string") {
    return NextResponse.json({ error: "accessToken is required" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: payload.accessToken,
    maxAge: MAX_AGE_SECONDS,
    ...COOKIE_BASE,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: "",
    maxAge: 0,
    ...COOKIE_BASE,
  });
  return response;
}
