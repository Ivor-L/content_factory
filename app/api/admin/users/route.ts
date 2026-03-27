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
  const filterPlan = searchParams.get("plan")?.trim() ?? "";
  const filterStatus = searchParams.get("status")?.trim() ?? ""; // active | expired | banned
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = 20;

  // ── Filter mode (plan/status): query profiles directly ───────────────────
  if (filterPlan || filterStatus) {
    let query = supabaseAdmin
      .from("profiles")
      .select("id, user_no, plan, plan_expires_at, is_admin, is_banned, api_key, updated_at")
      .order("user_no", { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (filterPlan) {
      query = query.eq("plan", filterPlan);
    }
    if (filterStatus === "banned") {
      query = query.eq("is_banned", true);
    } else if (filterStatus === "expired") {
      query = query.lt("plan_expires_at", new Date().toISOString()).neq("plan", "free");
    } else if (filterStatus === "active") {
      query = query.eq("is_banned", false);
    }

    const { data: profiles, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ids = (profiles ?? []).map((p) => p.id);
    const emailMap: Record<string, string | null> = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(id);
          emailMap[id] = user?.email ?? null;
        } catch {
          emailMap[id] = null;
        }
      })
    );

    const data = (profiles ?? [])
      .filter((p) => !q || (emailMap[p.id] ?? "").toLowerCase().includes(q.toLowerCase()))
      .map((p) => ({ ...p, email: emailMap[p.id] ?? null }));

    return NextResponse.json({ data, total: data.length });
  }

  // ── Normal list mode (email search + pagination) ─────────────────────────
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({
    page,
    perPage: pageSize,
  });

  const userIds = authUsers?.users.map((u) => u.id) ?? [];

  let query = supabaseAdmin
    .from("profiles")
    .select("id, user_no, plan, plan_expires_at, is_admin, is_banned, api_key, updated_at")
    .order("user_no", { ascending: true });

  if (q) {
    const matched = authUsers?.users
      .filter((u) => u.email?.toLowerCase().includes(q.toLowerCase()))
      .map((u) => u.id) ?? [];
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
    (authUsers?.users ?? []).map((u) => [u.id, u.email ?? null])
  );

  const data = (profiles ?? []).map((p) => ({
    ...p,
    email: emailMap[p.id] ?? null,
  }));

  return NextResponse.json({ data, total: authUsers?.total ?? data.length });
}
