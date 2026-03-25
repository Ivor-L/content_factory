import { createClient } from '@supabase/supabase-js';
import jwt, { JwtPayload } from 'jsonwebtoken';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)');
}

const baseClientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
} as const;

const supabaseAnonClient = createClient(supabaseUrl, supabaseAnonKey, baseClientOptions);

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdminClient = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, baseClientOptions)
  : null;

function createAuthedClient(token: string) {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    ...baseClientOptions,
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return acc;
      const key = part.slice(0, separatorIndex).trim();
      const rawValue = part.slice(separatorIndex + 1).trim();
      try {
        acc[key] = decodeURIComponent(rawValue);
      } catch {
        acc[key] = rawValue;
      }
      return acc;
    }, {});
}

function extractBearerToken(request: Request): string | null {
  const header =
    request.headers.get('authorization') ??
    request.headers.get('Authorization');
  if (header) {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  const cookies = parseCookies(request.headers.get('cookie'));
  const cookieCandidates = [
    'canvas-auth-token',
    'sb-access-token',
    'sb:access-token',
    'sb_access_token',
    'sb:access_token',
    'sb-token',
    'sb:token',
    'supabase-access-token',
    'supabase:access_token',
    'access_token',
  ];

  for (const key of cookieCandidates) {
    if (cookies[key]) {
      return cookies[key];
    }
  }

  return null;
}

export interface RequestUserContext {
  userId: string | null;
  token: string | null;
  apiKey: string | null;
}

export async function getRequestUserContext(
  request: Request,
  options: { allowDefaultApiKey?: boolean; useSystemApiKey?: boolean } = {}
): Promise<RequestUserContext> {
  const { allowDefaultApiKey = true, useSystemApiKey = false } = options;
  const headerApiKey = request.headers.get('x-user-api-key')?.trim() ?? null;
  const token = extractBearerToken(request);
  if (!token) {
    if (headerApiKey) {
      const userIdFromKey = await findUserIdByApiKey(headerApiKey);
      if (userIdFromKey) {
        return { userId: userIdFromKey, token: null, apiKey: headerApiKey };
      }
    }
    return { userId: null, token: null, apiKey: null };
  }

  let resolvedUserId: string | null = null;
  try {
    const { data, error } = await supabaseAnonClient.auth.getUser(token);
    if (!error && data?.user?.id) {
      resolvedUserId = data.user.id;
    }
  } catch (error) {
    console.error('Failed to resolve Supabase user', error);
  }

  if (!resolvedUserId) {
    resolvedUserId = decodeSupabaseUserId(token);
  }

  if (!resolvedUserId) {
    if (headerApiKey) {
      const userIdFromKey = await findUserIdByApiKey(headerApiKey);
      if (userIdFromKey) {
        return { userId: userIdFromKey, token: null, apiKey: headerApiKey };
      }
    }
    return { userId: null, token: null, apiKey: null };
  }

  let apiKey: string | null = null;
  if (!useSystemApiKey) {
    const profileClient = supabaseAdminClient ?? createAuthedClient(token);
    try {
      const { data: profile } = await profileClient
        .from('profiles')
        .select('api_key')
        .eq('id', resolvedUserId)
        .maybeSingle();

      // Prefer the user's stored api_key when authenticated to avoid stale local keys.
      if (profile?.api_key) {
        apiKey = profile.api_key;
      }
    } catch (profileError) {
      console.error('Failed to read profile api_key', profileError);
    }
  }

  if (!apiKey && allowDefaultApiKey && process.env.DEFAULT_USER_API_KEY) {
    apiKey = process.env.DEFAULT_USER_API_KEY;
  }

  return { userId: resolvedUserId, token, apiKey };
}

async function findUserIdByApiKey(apiKey: string | null): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const client = supabaseAdminClient ?? supabaseAnonClient;
    const { data, error } = await client
      .from('profiles')
      .select('id')
      .eq('api_key', apiKey)
      .maybeSingle();

    if (error) {
      // Supabase 在多行或无行时会报 JSON object 错误，此时 fallback 查询第一行即可
      if (/JSON object requested/.test(error.message)) {
        const { data: matches, error: listError } = await client
          .from('profiles')
          .select('id')
          .eq('api_key', apiKey)
          .limit(1);
        if (listError) {
          console.error('Failed to resolve user via api_key fallback', { message: listError.message });
          return null;
        }
        return matches?.[0]?.id ?? null;
      }

      console.error('Failed to resolve user via api_key', { message: error.message });
      return null;
    }

    return data?.id ?? null;
  } catch (error) {
    console.error('Failed to resolve user via api_key lookup', error);
    return null;
  }
}

export async function getApiKeyForUser(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const client = supabaseAdminClient ?? supabaseAnonClient;
    const { data, error } = await client
      .from('profiles')
      .select('api_key')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Failed to read profile api_key', error);
      return null;
    }
    if (data?.api_key) return data.api_key;
  } catch (error) {
    console.error('Failed to fetch api key for user', error);
  }
  return process.env.DEFAULT_USER_API_KEY || null;
}

function decodeSupabaseUserId(token: string): string | null {
  try {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (secret) {
      const payload = jwt.verify(token, secret) as JwtPayload;
      return typeof payload?.sub === 'string' ? payload.sub : null;
    }

    const segments = token.split('.');
    if (segments.length < 2) return null;
    const normalizedPayload = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalizedPayload.length % 4;
    const paddedPayload =
      padding === 0
        ? normalizedPayload
        : normalizedPayload + '='.repeat(4 - padding);
    const payloadJson = Buffer.from(paddedPayload, 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson);
    return typeof payload?.sub === 'string' ? payload.sub : payload?.user_id ?? null;
  } catch (error) {
    console.error('Failed to decode Supabase token', error);
    return null;
  }
}
