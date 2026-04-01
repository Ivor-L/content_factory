import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import { createScript } from "@/app/(main)/scripts/actions";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scripts = await prisma.script.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        videoUrl: true,
        blueprint: true,
        breakdown: true,
        status: true,
        progress: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: scripts });
  } catch (error) {
    console.error("Error fetching scripts:", error);
    return NextResponse.json(
      { error: "Failed to fetch scripts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, videoUrl, description, scriptPurpose } = body;

    if (!title || !videoUrl) {
      return NextResponse.json(
        { error: "Title and video URL are required" },
        { status: 400 }
      );
    }

    // Create FormData to pass to the server action
    const formData = new FormData();
    formData.append("title", title);
    formData.append("videoUrl", videoUrl);
    formData.append("userId", userId);
    if (description) {
      formData.append("description", description);
    }
    if (scriptPurpose) {
      formData.append("scriptPurpose", scriptPurpose);
    }

    // Call the server action
    const script = await createScript(formData);

    return NextResponse.json({
      success: true,
      data: {
        scriptId: script.id,
        title: script.title,
      },
    });
  } catch (error) {
    console.error("Error creating script:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create script" },
      { status: 500 }
    );
  }
}
