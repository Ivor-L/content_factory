import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";

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

async function getLastActiveMap(userIds: string[]): Promise<Record<string, string | null>> {
  if (!userIds.length) return {};
  try {
    const rows = await (prisma as any).creditUsageLog.groupBy({
      by: ["userId"],
      _max: { createdAt: true },
      where: { userId: { in: userIds }, success: true },
    });
    const map: Record<string, string | null> = {};
    for (const row of rows) {
      if (row.userId) map[row.userId] = row._max.createdAt?.toISOString() ?? null;
    }
    return map;
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const filterPlan = searchParams.get("plan")?.trim() ?? "";
  const filterStatus = searchParams.get("status")?.trim() ?? ""; // active | expired | banned
  const filterTenant = searchParams.get("tenant")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = 20;

  // ── Filter mode (plan/status/tenant): query profiles directly ───────────────
  if (filterPlan || filterStatus || filterTenant) {
    let query = supabaseAdmin
      .from("profiles")
      .select("id, user_no, plan, plan_expires_at, is_admin, is_banned, api_key, updated_at, tenant_id, notes")
      .order("user_no", { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (filterPlan) {
      query = query.eq("plan", filterPlan);
    }
    if (filterTenant) {
      query = query.eq("tenant_id", filterTenant);
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
    const emailMap: Record<string, { email: string | null; created_at: string | null }> = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(id);
          emailMap[id] = { email: user?.email ?? null, created_at: user?.created_at ?? null };
        } catch {
          emailMap[id] = { email: null, created_at: null };
        }
      })
    );

    const lastActiveMap = await getLastActiveMap(ids);

    const data = (profiles ?? [])
      .filter((p) => !q || (emailMap[p.id]?.email ?? "").toLowerCase().includes(q.toLowerCase()))
      .map((p) => ({
        ...p,
        email: emailMap[p.id]?.email ?? null,
        created_at: emailMap[p.id]?.created_at ?? null,
        last_active_at: lastActiveMap[p.id] ?? null,
      }));

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
    .select("id, user_no, plan, plan_expires_at, is_admin, is_banned, api_key, updated_at, tenant_id, notes")
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

  const authUserMap = Object.fromEntries(
    (authUsers?.users ?? []).map((u) => [u.id, { email: u.email ?? null, created_at: u.created_at ?? null }])
  );

  const listIds = (profiles ?? []).map((p) => p.id);
  const lastActiveMap = await getLastActiveMap(listIds);

  const data = (profiles ?? []).map((p) => ({
    ...p,
    email: authUserMap[p.id]?.email ?? null,
    created_at: authUserMap[p.id]?.created_at ?? null,
    last_active_at: lastActiveMap[p.id] ?? null,
  }));

  return NextResponse.json({ data, total: authUsers?.total ?? data.length });
}

export async function POST(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.email) {
    return NextResponse.json({ error: "email 为必填项" }, { status: 400 });
  }

  const password = body.password || '123456';

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: String(body.email).trim().toLowerCase(),
    password,
    email_confirm: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Update profile with additional fields
  const profileUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.plan) profileUpdate.plan = String(body.plan);
  if (body.plan_expires_at) profileUpdate.plan_expires_at = String(body.plan_expires_at);
  if (body.tenant_id) profileUpdate.tenant_id = String(body.tenant_id);
  if (body.notes) profileUpdate.notes = String(body.notes);

  if (Object.keys(profileUpdate).length > 1) {
    await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", data.user.id);
  }

  return NextResponse.json({ data: { id: data.user.id, email: data.user.email } }, { status: 201 });
}
