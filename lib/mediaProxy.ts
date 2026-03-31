/**
 * Determines whether a media URL should be routed through the server proxy.
 *
 * Self-hosted assets (Supabase storage) can be loaded directly by the browser.
 * External CDN URLs (xiaohongshu, etc.) require the proxy to bypass CORS /
 * hotlink-protection restrictions.
 */

const EXTRA_SELF_HOSTS = (() => {
  const hosts: string[] = [];
  const ossPublicUrl = process.env.ALIYUN_OSS_PUBLIC_URL;
  if (ossPublicUrl) {
    try {
      const parsed = new URL(ossPublicUrl.startsWith("http") ? ossPublicUrl : `https://${ossPublicUrl}`);
      if (parsed.hostname) hosts.push(parsed.hostname);
    } catch {
      // ignore malformed OSS host
    }
  }
  return hosts;
})();

const SELF_HOSTED_HOSTS = [
  // Our own Supabase storage
  "supabase-api.atomx.top",
  // localhost / dev
  "localhost",
  "127.0.0.1",
  ...EXTRA_SELF_HOSTS,
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

/**
 * Returns a proxy URL suitable for inline <video> playback.
 * Uses the same download endpoint but keeps the response inline.
 */
export function toProxyMediaUrl(url: string): string {
  if (!needsProxy(url)) return url;
  return `/api/proxy/download?url=${encodeURIComponent(url)}&filename=media`;
}
