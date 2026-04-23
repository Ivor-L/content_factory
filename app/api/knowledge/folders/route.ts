import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import {
  getKnowledgeSchemaMissingMessage,
  isKnowledgeSchemaMissingError,
} from "@/lib/knowledgeSchema";

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 300)
    : 100;

  try {
    const folders = await prisma.knowledgeFolder.findMany({
      where: { userId },
      include: {
        _count: {
          select: {
            files: true,
            chunks: true,
            conversations: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ data: folders });
  } catch (error) {
    console.error("[knowledge][folders] list failed", error);
    const message = isKnowledgeSchemaMissingError(error)
      ? getKnowledgeSchemaMissingMessage()
      : error instanceof Error
        ? error.message
        : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const description =
    typeof payload.description === "string" ? payload.description.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const folder = await prisma.knowledgeFolder.create({
      data: {
        userId,
        name,
        description: description || null,
      },
    });

    return NextResponse.json({ data: folder }, { status: 201 });
  } catch (error) {
    console.error("[knowledge][folders] create failed", error);
    const message = isKnowledgeSchemaMissingError(error)
      ? getKnowledgeSchemaMissingMessage()
      : error instanceof Error
        ? error.message
        : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
