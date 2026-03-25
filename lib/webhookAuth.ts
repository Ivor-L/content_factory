function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) return null;
  return match[1].trim();
}

export function isValidAdminWebhookRequest(request: Request): boolean {
  const expectedToken = (process.env.ADMIN_TOKEN || "").trim();
  if (!expectedToken) return false;

  const adminToken = request.headers.get("x-admin-token")?.trim();
  if (adminToken && adminToken === expectedToken) {
    return true;
  }

  const authorization =
    request.headers.get("authorization") ??
    request.headers.get("Authorization");
  const bearerToken = extractBearerToken(authorization);

  return !!bearerToken && bearerToken === expectedToken;
}

