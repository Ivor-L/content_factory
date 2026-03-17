import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

export const supabase = createClient(supabaseUrl, supabaseKey);
