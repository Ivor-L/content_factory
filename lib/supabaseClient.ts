import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
