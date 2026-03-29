import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRequestUserContext } from "@/lib/authServer";
import { refundCredits } from "@/lib/credits";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const amount = Math.floor(Number(body?.amount));
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "amount 必须为正整数" }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("api_key")
    .eq("id", id)
    .maybeSingle();

  if (!profile?.api_key) {
    return NextResponse.json({ error: "该用户未绑定 API Key，无法充值" }, { status: 400 });
  }

  try {
    await refundCredits(profile.api_key, {
      amount,
      reason: body?.reason ?? "admin_manual_add",
      workflowId: "admin",
      workflowName: "管理员手动充值",
    });
    // Log the operation
    try {
      await supabaseAdmin.from("admin_operation_logs").insert({
        admin_id: adminId,
        target_user_id: id,
        action: "add_credits",
        changes: { amount, reason: body?.reason ?? "admin_manual_add" },
      });
    } catch { /* non-blocking */ }
    return NextResponse.json({ ok: true, amount });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
