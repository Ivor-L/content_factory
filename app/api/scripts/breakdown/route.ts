import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { breakdownScript } from "@/lib/n8n";
import { getRequestUserContext, getApiKeyForUser } from "@/lib/authServer";

export async function POST(request: Request) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { scriptId, scriptPurpose } = body;

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

    const apiKey = await getApiKeyForUser(userId);

    await breakdownScript({
      title: script.title,
      videoUrl: script.videoUrl,
      scriptId: script.id,
      apiKey: apiKey ?? undefined,
      scriptPurpose: scriptPurpose ?? 'storyboard',
    });

    await prisma.script.update({
      where: { id: scriptId },
      data: { status: "queued" },
    });

    return NextResponse.json({ success: true, message: "Breakdown started" });
  } catch (error) {
    console.error("Error in breakdown API:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
