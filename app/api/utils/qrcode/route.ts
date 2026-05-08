import { NextRequest, NextResponse } from "next/server";

const QR_API_BASE = "https://api.qrserver.com/v1/create-qr-code/";

function sanitizeSize(value: string | null) {
  const size = Number(value);
  if (!Number.isFinite(size)) return 320;
  return Math.max(120, Math.min(720, Math.round(size)));
}

export async function GET(request: NextRequest) {
  const text = request.nextUrl.searchParams.get("text")?.trim() || "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const size = sanitizeSize(request.nextUrl.searchParams.get("size"));
  const upstream = new URL(QR_API_BASE);
  upstream.searchParams.set("size", `${size}x${size}`);
  upstream.searchParams.set("margin", "18");
  upstream.searchParams.set("format", "png");
  upstream.searchParams.set("data", text);

  const response = await fetch(upstream, { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json({ error: "二维码生成失败" }, { status: 502 });
  }

  const body = await response.arrayBuffer();
  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
