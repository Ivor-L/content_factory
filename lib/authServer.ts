import { createClient } from '@supabase/supabase-js';

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

export interface RequestUserContext {
  userId: string | null;
  token: string | null;
  apiKey: string | null;
}

export async function getRequestUserContext(request: Request): Promise<RequestUserContext> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return { userId: null, token: null, apiKey: null };
  }

  const token = authHeader.replace(/^Bearer\\s+/i, '').trim();
  if (!token) {
    return { userId: null, token: null, apiKey: null };
  }

  try {
    const { data, error } = await supabaseAnonClient.auth.getUser(token);
    if (error || !data?.user) {
      return { userId: null, token: null, apiKey: null };
    }

    let apiKey: string | null = null;
    const profileClient = supabaseAdminClient ?? createAuthedClient(token);
    try {
      const { data: profile } = await profileClient
        .from('profiles')
        .select('api_key')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile?.api_key) {
        apiKey = profile.api_key;
      }
    } catch (profileError) {
      console.error('Failed to read profile api_key', profileError);
    }

    if (!apiKey && process.env.DEFAULT_USER_API_KEY) {
      apiKey = process.env.DEFAULT_USER_API_KEY;
    }

    return { userId: data.user.id, token, apiKey };
  } catch (error) {
    console.error('Failed to resolve Supabase user', error);
    return { userId: null, token: null, apiKey: null };
  }
}
