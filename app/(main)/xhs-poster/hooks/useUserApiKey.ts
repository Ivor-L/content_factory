'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useUserApiKey() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }
      const userId = data?.session?.user?.id;
      if (!userId) {
        throw new Error('用户未登录');
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('api_key')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      const key = profile?.api_key ?? null;
      setApiKey(key);
      if (typeof window !== 'undefined') {
        if (key) {
          localStorage.setItem('user_api_key', key);
        } else {
          localStorage.removeItem('user_api_key');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '无法加载 API Key';
      setApiKey(null);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { apiKey, loading, error, refresh };
}
