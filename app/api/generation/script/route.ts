import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateFromScript } from "@/lib/n8n";

export async function POST(req: NextRequest) {
  try {
    const { scriptContent, scriptId } = await req.json();

    if (!scriptContent) {
      return NextResponse.json({ error: "Script content is required" }, { status: 400 });
    }

    const n8nResult = await generateFromScript(scriptContent);

    const replication = await prisma.replication.create({
      data: {
        status: "completed",
        type: "SCRIPT",
        result: JSON.stringify(n8nResult),
        scriptId: scriptId || undefined,
      },
    });

    return NextResponse.json(replication);
  } catch (error) {
    console.error("Error generating from script:", error);
    return NextResponse.json({ error: "Failed to generate" }, { status: 500 });
  }
}
