import prisma from '@/lib/prisma';

interface ResolveUserApiKeyOptions {
  userId: string | null | undefined;
  explicitApiKey?: string | null;
  allowDefaultFallback?: boolean;
}

/**
 * Resolve the API key that should be used for outbound generation jobs.
 * Prefers an explicitly provided key (e.g., from headers), then the user's stored key,
 * and finally falls back to DEFAULT_USER_API_KEY when allowed.
 */
export async function resolveUserApiKey(
  options: ResolveUserApiKeyOptions
): Promise<string | null> {
  const {
    userId,
    explicitApiKey,
    allowDefaultFallback = true,
  } = options;

  const normalizedExplicitKey = explicitApiKey?.trim();
  if (normalizedExplicitKey) {
    return normalizedExplicitKey;
  }

  if (userId) {
    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      select: { api_key: true },
    });
    const storedKey = profile?.api_key?.trim();
    if (storedKey) {
      return storedKey;
    }
  }

  if (allowDefaultFallback) {
    const fallback = process.env.DEFAULT_USER_API_KEY?.trim();
    if (fallback) {
      return fallback;
    }
  }

  return null;
}
