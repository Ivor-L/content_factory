import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { ensureCoreDocsForFolder } from "@/lib/assistants/core-docs";

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 200)
    : 50;

  const conversations = await prisma.assistantConversation.findMany({
    where: { userId },
    include: {
      folder: {
        select: { id: true, name: true },
      },
      _count: {
        select: { messages: true },
      },
    },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ data: conversations });
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const assistantMode = "xhs";
  const model = typeof payload.model === "string" ? payload.model.trim() : null;
  const folderId = typeof payload.folderId === "string" ? payload.folderId.trim() : null;
  const skills = Array.isArray(payload.skills)
    ? payload.skills.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  if (folderId) {
    const folder = await prisma.knowledgeFolder.findFirst({
      where: { id: folderId, userId },
      select: { id: true },
    });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
  }

  const conversation = await prisma.assistantConversation.create({
    data: {
      userId,
      title: title || null,
      assistantMode,
      folderId,
      model,
      skills,
      lastMessageAt: new Date(),
    },
  });

  if (folderId) {
    try {
      await ensureCoreDocsForFolder({
        userId,
        folderId,
      });
    } catch (error) {
      console.warn("[assistants/conversations] failed to ensure core docs", {
        folderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ data: conversation }, { status: 201 });
}
