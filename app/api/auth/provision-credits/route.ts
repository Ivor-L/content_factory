import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRequestUserContext } from "@/lib/authServer";
import { POINTS_API_BASES } from "@/lib/points-server";

const INTERNAL_SECRET = process.env.CREDITS_INTERNAL_SECRET ?? "";

export async function POST(request: Request) {
  const { userId, token } = await getRequestUserContext(request);
  if (!userId || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 查当前用户是否已绑定 api_key
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("api_key, email:id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.api_key) {
    return NextResponse.json({ ok: true, alreadyBound: true });
  }

  // 获取用户 email
  const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = user?.email;
  if (!email) {
    return NextResponse.json({ error: "No email found" }, { status: 400 });
  }

  if (!INTERNAL_SECRET) {
    return NextResponse.json({ error: "CREDITS_INTERNAL_SECRET not configured" }, { status: 500 });
  }

  // 调积分系统自动创建用户 + API Key
  for (const base of POINTS_API_BASES) {
    try {
      const res = await fetch(`${base}/internal/provision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": INTERNAL_SECRET,
        },
        body: JSON.stringify({ email }),
        cache: "no-store",
      });

      if (!res.ok) continue;

      const data = await res.json();
      const apiKey = data?.data?.apiKey;
      if (!apiKey) continue;

      // 保存到 profiles
      await supabaseAdmin
        .from("profiles")
        .upsert({ id: userId, api_key: apiKey, updated_at: new Date().toISOString() });

      return NextResponse.json({ ok: true, bound: true });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: "Failed to provision credits account" }, { status: 502 });
}
