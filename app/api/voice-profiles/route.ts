import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await prisma.voiceProfile.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ data: profiles });
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.profile || typeof payload.profile !== "object") {
    return NextResponse.json({ error: "profile is required" }, { status: 400 });
  }

  const profile = await prisma.voiceProfile.create({
    data: {
      userId,
      channel: payload.channel ?? null,
      name: payload.name ?? null,
      description: payload.description ?? null,
      profile: payload.profile,
      metadata: payload.metadata ?? undefined,
    },
  });

  return NextResponse.json({ data: profile }, { status: 201 });
}
