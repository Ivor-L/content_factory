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
  { params }: { params: { id: string } }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, user_no, plan, role, plan_expires_at, is_admin, api_key, updated_at, notes, referred_by")
    .eq("id", params.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(params.id);

  // Referral count
  const { count: referralCount } = await supabaseAdmin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("referred_by", params.id);

  // Referrer info
  let referrer: { id: string; user_no: number | null; email: string | null } | null = null;
  if (profile.referred_by) {
    const { data: refProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, user_no")
      .eq("id", profile.referred_by)
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

  return NextResponse.json({
    data: {
      ...profile,
      email: user?.email ?? null,
      created_at: user?.created_at ?? null,
      referral_count: referralCount ?? 0,
      referrer,
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const allowed = ["plan", "role", "plan_expires_at", "is_admin", "notes", "referred_by"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // Resolve referred_by: if a numeric string (user_no), look up the UUID
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
    .eq("id", params.id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
