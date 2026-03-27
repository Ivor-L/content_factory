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

  const { data: rows } = await supabaseAdmin
    .from("user_referrals")
    .select("id, invitee_id, created_at, source")
    .eq("referrer_id", params.id)
    .order("created_at", { ascending: false });

  if (!rows || rows.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const ids = rows.map((r) => r.invitee_id);

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, user_no, plan")
    .in("id", ids);

  // Batch email lookup
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

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));

  const data = rows.map((r) => ({
    id: r.id,
    invitee_id: r.invitee_id,
    created_at: r.created_at,
    source: r.source,
    email: emailMap[r.invitee_id] ?? null,
    user_no: profileMap[r.invitee_id]?.user_no ?? null,
    plan: profileMap[r.invitee_id]?.plan ?? "free",
  }));

  return NextResponse.json({ data });
}
