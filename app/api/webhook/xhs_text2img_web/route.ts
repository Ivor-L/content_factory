import { NextRequest, NextResponse } from "next/server";
import { getXhsText2ImgWebhookUrl } from "@/lib/webhookTargets";

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const upstreamResponse = await fetch(getXhsText2ImgWebhookUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: request.signal,
    });

    const responseText = await upstreamResponse.text().catch(() => "");
    const headers = new Headers();
    const contentType = upstreamResponse.headers.get("content-type");
    if (contentType) {
      headers.set("content-type", contentType);
    }

    return new NextResponse(responseText, {
      status: upstreamResponse.status,
      headers,
    });
  } catch (error) {
    console.error("Failed to forward xhs text2img webhook", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to trigger automation webhook",
        message,
      },
      { status: 502 }
    );
  }
}
