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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, user_no, plan, role, plan_expires_at, is_admin, is_banned, api_key, updated_at, notes, referred_by")
    .eq("id", id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(id);

  // Referral count from user_referrals table
  const { count: referralCount } = await supabaseAdmin
    .from("user_referrals")
    .select("*", { count: "exact", head: true })
    .eq("referrer_id", id);

  // Referrer info from user_referrals
  let referrer: { id: string; user_no: number | null; email: string | null } | null = null;
  const { data: boundRow } = await supabaseAdmin
    .from("user_referrals")
    .select("referrer_id")
    .eq("invitee_id", id)
    .maybeSingle();

  if (boundRow?.referrer_id) {
    const { data: refProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, user_no")
      .eq("id", boundRow.referrer_id)
      .maybeSingle();
    if (refProfile) {
      const { data: { user: refUser } } = await supabaseAdmin.auth.admin.getUserById(refProfile.id);
      referrer = {
        id: refProfile.id,
        user_no: refProfile.user_no ?? null,
        email: refUser?.email ?? null,
      };
    }
  }

  // Recent operation logs
  const { data: logs } = await supabaseAdmin
    .from("admin_operation_logs")
    .select("id, admin_id, action, changes, created_at")
    .eq("target_user_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    data: {
      ...profile,
      email: user?.email ?? null,
      created_at: user?.created_at ?? null,
      referral_count: referralCount ?? 0,
      referrer,
      logs: logs ?? [],
    },
  });
}

async function writeLog(
  adminId: string,
  targetUserId: string,
  action: string,
  changes: Record<string, unknown>
) {
  try {
    await supabaseAdmin.from("admin_operation_logs").insert({
      admin_id: adminId,
      target_user_id: targetUserId,
      action,
      changes,
    });
  } catch {
    // non-blocking, ignore if table doesn't exist yet
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const allowed = ["plan", "role", "plan_expires_at", "is_admin", "is_banned", "notes", "referred_by"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // Resolve referred_by: if numeric string (user_no), look up UUID
  if (updates.referred_by && /^\d+$/.test(String(updates.referred_by))) {
    const { data: refProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_no", Number(updates.referred_by))
      .maybeSingle();
    if (!refProfile) {
      return NextResponse.json({ error: "推荐人不存在" }, { status: 400 });
    }
    updates.referred_by = refProfile.id;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Write operation log (non-blocking)
  const logChanges: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) logChanges[key] = body[key];
  }
  await writeLog(adminId, id, "update_profile", logChanges);

  return NextResponse.json({ data });
}
