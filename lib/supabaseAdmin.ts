import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing Supabase environment variable: ${name}`);
  }
  return value;
}

const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = requireEnv(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const baseClientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
} as const;

const chosenKey = supabaseServiceKey || supabaseAnonKey;

if (!supabaseServiceKey) {
  console.warn(
    '[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY is not set. Falling back to anon key; storage policies must allow the intended operations.'
  );
}

export const supabaseAdmin = createClient(supabaseUrl, chosenKey, baseClientOptions);

export function getSupabaseServiceClient(accessToken?: string | null): SupabaseClient {
  if (supabaseServiceKey || !accessToken) {
    return supabaseAdmin;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    ...baseClientOptions,
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
