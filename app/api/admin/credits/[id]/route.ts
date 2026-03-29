import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRequestUserContext } from "@/lib/authServer";
import { invalidateCreditCostCache } from "@/lib/creditCosts";

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};

  if (typeof body.amount === "number") {
    updateData.amount = Math.max(0, Math.floor(body.amount));
  }
  if (typeof body.enabled === "boolean") {
    updateData.enabled = body.enabled;
  }
  if (typeof body.description === "string") {
    updateData.description = body.description.trim();
  }
  if (typeof body.featureName === "string") {
    updateData.featureName = body.featureName.trim();
  }
  if (typeof body.cost === "number" || body.cost === null) {
    updateData.cost = body.cost === null ? null : Math.max(0, body.cost);
  }
  if (typeof body.sellingPrice === "number" || body.sellingPrice === null) {
    updateData.sellingPrice = body.sellingPrice === null ? null : Math.max(0, body.sellingPrice);
    // 售价转积分：1元 = 100积分（仅当 amount 未单独指定时自动计算）
    if (typeof body.amount !== "number" && typeof body.sellingPrice === "number") {
      updateData.amount = Math.round(body.sellingPrice * 100);
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.creditConfig.update({
      where: { id },
      data: updateData,
    });
    invalidateCreditCostCache();
    return NextResponse.json({ data: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  await prisma.creditConfig.delete({ where: { id } });
  invalidateCreditCostCache();

  return NextResponse.json({ data: { deleted: true } });
}
