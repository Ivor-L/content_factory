'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { syncServerSession } from '@/lib/clientSessionSync';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Check for session and redirect
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || session) {
        localStorage.setItem('login_timestamp', Date.now().toString());
        syncServerSession(session?.access_token ?? null).catch((error) => {
          console.warn('[auth] Failed to sync session after callback', error);
        });
        router.push('/dashboard');
      }
    });

    // Also check immediately in case session is already restored
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        localStorage.setItem('login_timestamp', Date.now().toString());
        syncServerSession(session.access_token ?? null).catch((error) => {
          console.warn('[auth] Failed to sync session after getSession', error);
        });
        router.push('/dashboard');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black dark:border-white mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Verifying login...</h2>
        <p className="text-gray-500 mt-2">Please wait while we log you in.</p>
      </div>
    </div>
  );
}
