import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    console.error("[client-log]", {
      receivedAt: new Date().toISOString(),
      ...body,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[client-log] Failed to process payload", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
