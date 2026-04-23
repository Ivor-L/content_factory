import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { listBuiltinSkills, upsertUserSkill } from "@/lib/skills";

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

  const skillId = typeof body.skillId === "string" ? body.skillId.trim().toLowerCase() : "";
  if (!skillId) {
    return NextResponse.json({ error: "skillId is required" }, { status: 400 });
  }

  const builtinSkills = await listBuiltinSkills();
  const found = builtinSkills.find(
    (skill) => skill.id.toLowerCase() === skillId || skill.name.toLowerCase() === skillId,
  );
  if (!found) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const installed = await upsertUserSkill({
    userId,
    name: found.name,
    description: found.description,
    content: found.content,
    tags: found.tags,
  });

  return NextResponse.json({
    ok: true,
    skill: {
      id: installed.id,
      name: installed.name,
      description: installed.description,
      source: installed.source,
      tags: installed.tags,
    },
  });
}
