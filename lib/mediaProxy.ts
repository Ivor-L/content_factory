/**
 * Determines whether a media URL should be routed through the server proxy.
 *
 * Self-hosted assets (Supabase storage) can be loaded directly by the browser.
 * External CDN URLs (xiaohongshu, etc.) require the proxy to bypass CORS /
 * hotlink-protection restrictions.
 */

function parseEnvHost(urlLike: string | undefined): string | null {
  if (!urlLike) return null;
  try {
    const parsed = new URL(urlLike.startsWith("http") ? urlLike : `https://${urlLike}`);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

const EXTRA_SELF_HOSTS = (() => {
  const hosts = new Set<string>();
  const envCandidates = [
    process.env.NEXT_PUBLIC_ALIYUN_OSS_PUBLIC_URL,
    process.env.ALIYUN_OSS_PUBLIC_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ];

  for (const candidate of envCandidates) {
    const host = parseEnvHost(candidate);
    if (host) hosts.add(host);
  }

  // Known first-party media hosts used in this project.
  hosts.add("oss.atomx.top");
  hosts.add("oss.flowonn.com");

  return Array.from(hosts);
})();

const SELF_HOSTED_HOSTS = [
  // Our own Supabase storage
  "supabase-api.atomx.top",
  // localhost / dev
  "localhost",
  "127.0.0.1",
  ...EXTRA_SELF_HOSTS,
];

const DIRECT_ALLOW_HOST_PATTERNS = [
  /instagram/i,
  /fbcdn/i,
  /facebook/i,
];

export function needsProxy(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    // If it's our own storage, load directly
    if (SELF_HOSTED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
      return false;
    }
    if (hostname.endsWith(".aliyuncs.com")) {
      return false;
    }
    if (DIRECT_ALLOW_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
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

export function toForcedProxyUrl(url: string, filename: string): string {
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
