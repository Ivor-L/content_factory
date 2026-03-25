import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";

/**
 * GET /api/replication/[id]
 * 查询 Replication 状态（前端轮询用）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const replication = await prisma.replication.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      type: true,
      result: true,
      updatedAt: true,
    },
  });

  if (!replication) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let result: Record<string, unknown> = {};
  try {
    result = JSON.parse(replication.result || "{}");
  } catch {}

  return NextResponse.json({
    data: {
      id: replication.id,
      status: replication.status,
      type: replication.type,
      updatedAt: replication.updatedAt,
      result,
    },
  });
}
