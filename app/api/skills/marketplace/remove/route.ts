import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { removeUserSkill } from "@/lib/skills";

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.skill === "string" ? body.skill.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "skill is required" }, { status: 400 });
  }

  const ok = await removeUserSkill(name, userId);
  return NextResponse.json({ ok });
}
