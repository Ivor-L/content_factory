import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { listBuiltinSkills } from "@/lib/skills";

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const skillId = request.nextUrl.searchParams.get("skillId")?.trim().toLowerCase() || "";
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

  return NextResponse.json({
    skill: {
      skillId: found.id,
      name: found.name,
      description: found.description,
      tags: found.tags,
      content: found.content,
    },
  });
}
