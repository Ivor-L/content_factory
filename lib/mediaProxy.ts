/**
 * Determines whether a media URL should be routed through the server proxy.
 *
 * Self-hosted assets (Supabase storage) can be loaded directly by the browser.
 * External CDN URLs (xiaohongshu, etc.) require the proxy to bypass CORS /
 * hotlink-protection restrictions.
 */

const SELF_HOSTED_HOSTS = [
  // Our own Supabase storage
  "supabase-api.atomx.top",
  // localhost / dev
  "localhost",
  "127.0.0.1",
];

export function needsProxy(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    // If it's our own storage, load directly
    if (SELF_HOSTED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
      return false;
    }
    // Everything else (xhscdn.com, tiktokcdn.com, etc.) goes through proxy
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns a proxy URL for downloading/streaming (forces download).
 * Pass the raw CDN URL; if it's self-hosted, returns it unchanged.
 */
export function toProxyUrl(url: string, filename: string): string {
  if (!needsProxy(url)) return url;
  return `/api/proxy/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
}

/**
 * Returns a proxy URL for inline display (<img> / <video> tags).
 * Pass the raw CDN URL; if it's self-hosted, returns it unchanged.
 */
export function toProxyImgUrl(url: string): string {
  if (!needsProxy(url)) return url;
  return `/api/proxy/download?url=${encodeURIComponent(url)}&filename=img`;
}
