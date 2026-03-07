import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = await params;

  try {
    const script = await prisma.script.findUnique({
      where: { id },
      select: { status: true, breakdown: true, progress: true, error: true },
    });

    if (!script) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }

    return NextResponse.json({
      status: script.status || "pending",
      progress: script.progress || 0,
      error: script.error,
      breakdown: script.breakdown ? JSON.parse(script.breakdown) : null,
    });
  } catch (error) {
    console.error("Error fetching script status:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
