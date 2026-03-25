import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";

// Max size we are willing to proxy: 500 MB
const MAX_BYTES = 500 * 1024 * 1024;

// Headers to forward when fetching from the origin CDN
const ORIGIN_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  Referer: "https://www.xiaohongshu.com/",
  Accept: "*/*",
};

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawUrl = request.nextUrl.searchParams.get("url");
  const filename = request.nextUrl.searchParams.get("filename") ?? "download";
  // When filename is "img", serve inline (for <img> tags); otherwise force download
  const inline = filename === "img";

  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  // Only allow http/https
  if (targetUrl.protocol !== "https:" && targetUrl.protocol !== "http:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  try {
    const upstream = await fetch(rawUrl, {
      headers: ORIGIN_HEADERS,
      // Follow redirects (default)
    });

    if (!upstream.ok) {
      console.error("[proxy/download] Upstream error", upstream.status, rawUrl.slice(0, 80));
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: 502 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    // Guard against unexpectedly large files
    if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    // Stream the body back to the client
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...(inline
          ? { "Cache-Control": "public, max-age=86400" }
          : {
              "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
              "Content-Length": String(body.byteLength),
              "Cache-Control": "no-store",
            }),
      },
    });
  } catch (error) {
    console.error("[proxy/download] Fetch failed", error);
    return NextResponse.json({ error: "Proxy request failed" }, { status: 502 });
  }
}
