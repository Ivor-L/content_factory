import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { listAllSkills, listBuiltinSkills } from "@/lib/skills";

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
  const [installed, builtinSkills] = await Promise.all([
    listAllSkills(userId),
    listBuiltinSkills(),
  ]);
  const installedSet = new Set(installed.map((item) => item.name.toLowerCase()));

  const rows = builtinSkills
    .filter((item) => {
      if (!query) return true;
      const token = `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase();
      return token.includes(query);
    })
    .map((item) => ({
      skillId: item.id,
      name: item.name,
      description: item.description,
      tags: item.tags,
      source: "builtin-default",
      installs: 0,
      installed: installedSet.has(item.name.toLowerCase()),
    }));

  return NextResponse.json({ skills: rows });
}
