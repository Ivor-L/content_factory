import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";

// Max size we are willing to proxy: 500 MB
const MAX_BYTES = 500 * 1024 * 1024;

// Headers to forward when fetching from the origin CDN
const BASE_ORIGIN_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  Accept: "*/*",
};

const REFERER_OVERRIDES: Array<{ test: (hostname: string) => boolean; referer: string }> = [
  {
    test: (hostname) => /tiktok/i.test(hostname) || /tiktokcdn/i.test(hostname),
    referer: "https://www.tiktok.com/",
  },
  {
    test: (hostname) => /instagram/i.test(hostname) || /fbcdn\.net$/i.test(hostname) || /cdninstagram/i.test(hostname),
    referer: "https://www.instagram.com/",
  },
  {
    test: (hostname) => /facebook/i.test(hostname),
    referer: "https://www.facebook.com/",
  },
];

const DEFAULT_REFERER = "https://www.xiaohongshu.com/";
const MEDIA_PROXY_BRIDGE_URL = (() => {
  const url = process.env.MEDIA_PROXY_BRIDGE_URL?.trim();
  if (!url) return null;
  try {
    return new URL(url).toString();
  } catch {
    console.warn("[proxy/download] Ignoring invalid MEDIA_PROXY_BRIDGE_URL:", url);
    return null;
  }
})();
const MEDIA_PROXY_BRIDGE_HOST = MEDIA_PROXY_BRIDGE_URL ? new URL(MEDIA_PROXY_BRIDGE_URL).hostname : null;

function buildOriginHeaders(targetUrl: URL): Record<string, string> {
  const headers: Record<string, string> = { ...BASE_ORIGIN_HEADERS };
  const hostname = targetUrl.hostname.toLowerCase();
  const override = REFERER_OVERRIDES.find((entry) => entry.test(hostname));
  const referer = override?.referer ?? DEFAULT_REFERER;
  headers.Referer = referer;
  headers.Origin = referer.replace(/\/$/, "");
  return headers;
}

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawUrl = request.nextUrl.searchParams.get("url");
  const filename = request.nextUrl.searchParams.get("filename") ?? "download";
  // When filename is "img" or "media", serve inline (for <img>/<video> tags); otherwise force download
  const inlineMode = filename === "img" ? "image" : filename === "media" ? "media" : null;
  const inline = inlineMode !== null;

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
    const upstream = await fetchWithFallback(rawUrl, targetUrl, buildOriginHeaders(targetUrl));

    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    // Guard against unexpectedly large files
    if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }
    if (!upstream.body) {
      return NextResponse.json({ error: "Empty upstream response" }, { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) {
      headers.set("Accept-Ranges", acceptRanges);
    }
    if (inline) {
      const etag = upstream.headers.get("etag");
      const lastModified = upstream.headers.get("last-modified");
      if (etag) headers.set("ETag", etag);
      if (lastModified) headers.set("Last-Modified", lastModified);
      headers.set(
        "Cache-Control",
        inlineMode === "media" ? "public, max-age=3600" : "public, max-age=86400",
      );
    } else {
      headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      headers.set("Cache-Control", "no-store");
    }

    // Stream upstream directly instead of buffering whole file in memory.
    return new NextResponse(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[proxy/download] Fetch failed", error);
    return NextResponse.json({ error: "Proxy request failed" }, { status: 502 });
  }
}

async function fetchWithFallback(
  rawUrl: string,
  target: URL,
  headers: Record<string, string>,
): Promise<Response> {
  let directError: unknown;
  try {
    const direct = await fetch(rawUrl, { headers });
    if (direct.ok) {
      return direct;
    }
    console.error("[proxy/download] Upstream error", direct.status, rawUrl.slice(0, 80));
    direct.body?.cancel();
    directError = new Error(`Upstream returned ${direct.status}`);
  } catch (error) {
    directError = error;
  }

  const shouldFallback =
    MEDIA_PROXY_BRIDGE_URL &&
    MEDIA_PROXY_BRIDGE_HOST &&
    target.hostname !== MEDIA_PROXY_BRIDGE_HOST;

  if (!shouldFallback || !MEDIA_PROXY_BRIDGE_URL) {
    if (directError instanceof Error) throw directError;
    throw new Error("Upstream fetch failed");
  }

  const bridgeUrl = new URL(MEDIA_PROXY_BRIDGE_URL);
  bridgeUrl.searchParams.set("url", rawUrl);

  try {
    const fallback = await fetch(bridgeUrl.toString(), {
      headers: { Accept: "*/*" },
    });
    if (fallback.ok) {
      return fallback;
    }
    fallback.body?.cancel();
    throw new Error(`Fallback returned ${fallback.status}`);
  } catch (error) {
    if (directError instanceof Error) {
      throw new AggregateError([directError, error as Error], "Both upstream and fallback fetches failed");
    }
    throw error;
  }
}
