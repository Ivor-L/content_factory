import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

/**
 * POST /api/admin/promote-styles
 *
 * Promotes all COMPLETED style presets owned by the calling user to system-level
 * (userId = null), making them visible to all users as shared presets.
 *
 * Optionally pass { ids: string[] } to promote only specific presets.
 * If no body / empty ids, ALL completed presets for the user are promoted.
 */
export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let ids: string[] | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body?.ids) && body.ids.length > 0) {
      ids = body.ids.filter((id: unknown) => typeof id === "string");
    }
  } catch {
    // no body is fine
  }

  const where = {
    userId,
    ...(ids ? { id: { in: ids } } : {}),
    metadata: {
      path: ["processingStatus"],
      equals: "COMPLETED",
    },
  };

  const presets = await prisma.stylePreset.findMany({ where, select: { id: true, name: true } });

  if (presets.length === 0) {
    return NextResponse.json({ error: "No completed style presets found for your account" }, { status: 404 });
  }

  await prisma.stylePreset.updateMany({
    where: { id: { in: presets.map((p) => p.id) } },
    data: { userId: null },
  });

  return NextResponse.json({
    ok: true,
    promoted: presets.map((p) => ({ id: p.id, name: p.name })),
    count: presets.length,
  });
}
