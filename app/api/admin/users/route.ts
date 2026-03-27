import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRequestUserContext } from "@/lib/authServer";

async function requireAdmin(request: Request) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_admin ? userId : null;
}

export async function GET(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const referredBy = searchParams.get("referredBy")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = 20;

  // ── Referral list mode: return users referred by a specific user ──────────
  if (referredBy) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, user_no, plan, plan_expires_at, is_admin, api_key")
      .eq("referred_by", referredBy)
      .order("user_no", { ascending: true });

    const ids = (profiles ?? []).map((p) => p.id);
    const emailMap: Record<string, string | undefined> = {};
    if (ids.length > 0) {
      // batch lookup emails
      await Promise.all(
        ids.map(async (id) => {
          const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(id);
          if (user) emailMap[id] = user.email;
        })
      );
    }
    const data = (profiles ?? []).map((p) => ({ ...p, email: emailMap[p.id] ?? null }));
    return NextResponse.json({ data, total: data.length });
  }

  // ── Normal list mode ────────────────────────────────────────────────────
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({
    page,
    perPage: pageSize,
  });

  const userIds = authUsers?.users.map((u) => u.id) ?? [];

  let query = supabaseAdmin
    .from("profiles")
    .select("id, user_no, plan, role, plan_expires_at, is_admin, api_key, updated_at")
    .order("user_no", { ascending: true });

  if (q) {
    const matched = authUsers?.users.filter((u) =>
      u.email?.toLowerCase().includes(q.toLowerCase())
    ).map((u) => u.id) ?? [];
    if (matched.length > 0) {
      query = query.in("id", matched);
    } else {
      return NextResponse.json({ data: [], total: 0 });
    }
  } else {
    query = query.in("id", userIds);
  }

  const { data: profiles, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const emailMap = Object.fromEntries(
    (authUsers?.users ?? []).map((u) => [u.id, u.email])
  );

  const data = (profiles ?? []).map((p) => ({
    ...p,
    email: emailMap[p.id] ?? null,
  }));

  return NextResponse.json({ data, total: authUsers?.total ?? data.length });
}
