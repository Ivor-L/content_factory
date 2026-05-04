import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      }).catch(async () => {
        return fetch(url, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
          cache: "no-store",
          signal: controller.signal,
        });
      });

      if (!res.ok) {
        return NextResponse.json({ error: `uploaded file is not ready: ${res.status}` }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "confirm failed";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
