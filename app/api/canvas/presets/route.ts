import { NextRequest, NextResponse } from "next/server";
import { getApiKeyForUser } from "@/lib/authServer";
import { supabase } from "@/lib/supabaseClient";
import { z } from "zod";

const PresetSchema = z.object({
  name: z.string().min(1),
  nodes: z.array(z.object({
    id: z.string(),
    type: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
    data: z.record(z.string(), z.unknown()),
  })),
  resources: z.record(z.string(), z.string()),
});

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("canvas_presets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error("[api] get presets failed", error);
    return NextResponse.json({ error: "Failed to fetch presets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = PresetSchema.parse(body);

    const { data, error } = await supabase
      .from("canvas_presets")
      .insert({
        user_id: user.id,
        name: validated.name,
        nodes: validated.nodes,
        resources: validated.resources,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[api] save preset failed", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid preset data" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save preset" }, { status: 500 });
  }
}
