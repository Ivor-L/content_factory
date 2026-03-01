import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { breakdownScript } from "@/lib/n8n";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scriptId } = body;

    if (!scriptId) {
      return NextResponse.json(
        { error: "scriptId is required" },
        { status: 400 }
      );
    }

    const script = await prisma.script.findUnique({
      where: { id: scriptId },
    });

    if (!script) {
      return NextResponse.json(
        { error: "Script not found" },
        { status: 404 }
      );
    }

    const breakdownResult = await breakdownScript({
      title: script.title,
      videoUrl: script.videoUrl,
    });

    const updatedScript = await prisma.script.update({
      where: { id: scriptId },
      data: {
        breakdown: JSON.stringify(breakdownResult),
      },
    });

    return NextResponse.json(updatedScript);
  } catch (error) {
    console.error("Error in breakdown API:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
