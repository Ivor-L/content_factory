import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

const DEFAULT_POINTS_API_BASE = 'https://api.atomx.top';

export const POINTS_API_BASES = Array.from(
  new Set(
    [process.env.POINTS_API_BASE, DEFAULT_POINTS_API_BASE]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim().replace(/\/$/, ''))
  )
);

const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const baseAuthOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
} as const;

const supabase = createClient(supabaseUrl, supabaseAnonKey, baseAuthOptions);

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, baseAuthOptions)
  : null;

function createAuthedSupabase(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    ...baseAuthOptions,
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}

export async function getStoredUserApiKey(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);

  if (userError || !user) {
    console.error('Auth Error:', userError);
    return null;
  }

  const profileClient = supabaseAdmin ?? createAuthedSupabase(token);
  const { data: profile, error: profileError } = await profileClient
    .from('profiles')
    .select('api_key')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile?.api_key) {
    console.error('Profile Error:', profileError);
    return process.env.MOCK_USER_API_KEY || null;
  }

  return profile.api_key;
}

export async function readTextSafe(res: Response) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

export function looksLikeHtml(res: Response, bodyText: string) {
  const ct = res.headers.get('content-type') || '';
  return ct.includes('text/html') || bodyText.trimStart().startsWith('<!DOCTYPE html');
}
