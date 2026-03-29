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
    // non-blocking
  }
}

export async function PATCH(request: Request) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const action = body.action as {
    type: "setPlan" | "extendDays" | "ban" | "unban" | "addCredits" | "setTenant";
    value?: string | number;
  };

  if (!ids.length || !action?.type) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // ── addCredits: per-user via credits API ──────────────────────────────────
  if (action.type === "addCredits") {
    const amount = Math.floor(Number(action.value));
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    const results = await Promise.all(
      ids.map(async (id) => {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("api_key")
          .eq("id", id)
          .maybeSingle();
        if (!profile?.api_key) return { id, error: "未绑定 API Key" };
        try {
          await refundCredits(profile.api_key, {
            amount,
            reason: "admin_batch_add",
            workflowId: "admin",
            workflowName: "管理员批量充值",
          });
          await writeLog(adminId, id, "batch_addCredits", { amount });
          return { id, ok: true };
        } catch (e: unknown) {
          return { id, error: e instanceof Error ? e.message : String(e) };
        }
      })
    );
    return NextResponse.json({ ok: true, results });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (action.type === "setPlan") {
    const allowed = ["free", "pro", "studio", "enterprise"];
    if (!allowed.includes(String(action.value))) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    updates.plan = action.value;
  } else if (action.type === "extendDays") {
    const days = Number(action.value);
    if (!days || days < 1) return NextResponse.json({ error: "Invalid days" }, { status: 400 });
    // For each ID, compute new expiry individually
    const results = await Promise.all(
      ids.map(async (id) => {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("plan_expires_at")
          .eq("id", id)
          .maybeSingle();
        const base =
          profile?.plan_expires_at && new Date(profile.plan_expires_at) > new Date()
            ? new Date(profile.plan_expires_at)
            : new Date();
        base.setDate(base.getDate() + days);
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ plan_expires_at: base.toISOString(), updated_at: new Date().toISOString() })
          .eq("id", id);
        await writeLog(adminId, id, "batch_extend", { days });
        return { id, error: error?.message };
      })
    );
    return NextResponse.json({ ok: true, results });
  } else if (action.type === "ban") {
    updates.is_banned = true;
  } else if (action.type === "unban") {
    updates.is_banned = false;
  } else if (action.type === "setTenant") {
    updates.tenant_id = action.value ? String(action.value) : null;
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log each
  await Promise.all(
    ids.map((id) => writeLog(adminId, id, `batch_${action.type}`, { value: action.value }))
  );

  return NextResponse.json({ ok: true, count: ids.length });
}
