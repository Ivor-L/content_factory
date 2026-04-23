import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import { findSkillByName, listAllSkills, removeUserSkill, upsertUserSkill } from "@/lib/skills";

function toBriefDescription(input?: string) {
  const text = (input || "").replace(/\s+/g, " ").trim();
  if (!text) return "暂无描述";
  return text.length > 120 ? `${text.slice(0, 120).trim()}…` : text;
}

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const name = request.nextUrl.searchParams.get("name")?.trim() || "";
  if (name) {
    const skill = await findSkillByName(name, userId);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json({
      skill: {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        source: skill.source,
        tags: skill.tags,
        content: skill.content,
      },
    });
  }

  const skills = await listAllSkills(userId);
  return NextResponse.json({
    skills: skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: toBriefDescription(skill.description),
      source: skill.source,
      tags: skill.tags,
    })),
  });
}

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

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];

  if (!name || !content) {
    return NextResponse.json({ error: "name and content are required" }, { status: 400 });
  }

  try {
    const skill = await upsertUserSkill({ userId, name, description, content, tags });
    return NextResponse.json({
      skill: {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        source: skill.source,
        tags: skill.tags,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save skill" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim() || "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const removed = await removeUserSkill(name, userId);
  return NextResponse.json({ ok: removed });
}
