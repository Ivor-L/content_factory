import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Support both admin-token (for n8n) and user session auth
  const adminToken = request.headers.get("x-admin-token");
  const expectedToken = process.env.ADMIN_TOKEN;
  const hasAdminAuth = expectedToken && adminToken === expectedToken;

  if (!hasAdminAuth) {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { id } = await params;

  try {
    const script = await prisma.script.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        breakdown: true,
        blueprint: true,
        progress: true,
        error: true,
      },
    });

    if (!script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }

    let breakdown: unknown = null;
    if (script.breakdown) {
      try { breakdown = JSON.parse(script.breakdown); } catch { breakdown = script.breakdown; }
    }

    let blueprint: unknown = null;
    if (script.blueprint) {
      try { blueprint = JSON.parse(script.blueprint); } catch { blueprint = script.blueprint; }
    }

    return NextResponse.json({
      data: {
        id: script.id,
        title: script.title,
        status: script.status || "pending",
        progress: script.progress || 0,
        error: script.error,
        breakdown,
        blueprint,
      },
    });
  } catch (error) {
    console.error("Error fetching script status:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
