import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRequestUserContext } from "@/lib/authServer";
import { POINTS_API_BASES, readTextSafe, looksLikeHtml } from "@/lib/points-server";

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

async function fetchBalance(apiKey: string): Promise<number | null> {
  for (const base of POINTS_API_BASES) {
    try {
      const url = new URL("/balance", base);
      url.searchParams.set("apiKey", apiKey);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const text = await readTextSafe(res);
      if (!res.ok || looksLikeHtml(res, text)) continue;
      const data = text ? JSON.parse(text) : null;
      if (typeof data?.data?.balance === "number") return data.data.balance;
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchUsageStats(
  apiKey: string
): Promise<{ totalConsumed: number | null; monthConsumed: number | null; events: unknown[] | null }> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  for (const base of POINTS_API_BASES) {
    try {
      const url = new URL("/usage/stats", base);
      url.searchParams.set("apiKey", apiKey);
      url.searchParams.set("since", monthStart);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const text = await readTextSafe(res);
      if (!res.ok || looksLikeHtml(res, text)) continue;
      const data = text ? JSON.parse(text) : null;
      if (data?.ok && data?.data) {
        return {
          totalConsumed: typeof data.data.total === "number" ? data.data.total : null,
          monthConsumed: typeof data.data.month === "number" ? data.data.month : null,
          events: Array.isArray(data.data.events) ? data.data.events : null,
        };
      }
    } catch {
      continue;
    }
  }
  return { totalConsumed: null, monthConsumed: null, events: null };
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminId = await requireAdmin(request);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("api_key")
    .eq("id", params.id)
    .maybeSingle();

  if (!profile?.api_key) {
    return NextResponse.json({ balance: null, totalConsumed: null, monthConsumed: null, events: null });
  }

  const [balance, usage] = await Promise.all([
    fetchBalance(profile.api_key),
    fetchUsageStats(profile.api_key),
  ]);

  return NextResponse.json({
    balance,
    totalConsumed: usage.totalConsumed,
    monthConsumed: usage.monthConsumed,
    events: usage.events,
  });
}
