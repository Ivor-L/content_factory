import { getRequestUserContext } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function requireUser(request: Request) {
  const context = await getRequestUserContext(request);
  if (!context.userId) return null;
  return context;
}

export async function requireAdmin(request: Request) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) return null;

  const { data } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();

  return data?.is_admin ? userId : null;
}
