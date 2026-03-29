import { NextRequest, NextResponse } from "next/server";
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

export async function GET(request: NextRequest) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tenants = (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.created_at,
  }));

  return NextResponse.json({ data: tenants });
}

export async function POST(request: NextRequest) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const name = body.name.trim();
  if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("tenants")
    .insert({ name })
    .select()
    .maybeSingle();

  if (error) {
    const msg = error.code === "23505" ? "租户名已存在" : error.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  return NextResponse.json({ data: { id: data.id, name: data.name, createdAt: data.created_at } }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await supabaseAdmin.from("tenants").delete().eq("id", body.id);
  return NextResponse.json({ data: { deleted: true } });
}
