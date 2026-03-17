'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  clearStoredReferralCode,
  getReferralCodeFromUser,
  readStoredReferralCode
} from '@/lib/referrals';

export function ReferralBindingWatcher() {
  const bindingPromiseRef = useRef<Promise<void> | null>(null);
  const lastBoundRef = useRef<string | null>(null);

  useEffect(() => {
    let isUnmounted = false;

    const attemptBind = async () => {
      if (bindingPromiseRef.current) return bindingPromiseRef.current;
      bindingPromiseRef.current = (async () => {
        try {
          const { data } = await supabase.auth.getSession();
          const session = data?.session;
          const user = session?.user ?? null;
          if (!session || !user) {
            return;
          }

          if (lastBoundRef.current === user.id) {
            return;
          }

          const storedCode = readStoredReferralCode();
          const metadataCode = getReferralCodeFromUser(user);
          const referralCode = storedCode || metadataCode;
          if (!referralCode) {
            return;
          }

          try {
            const res = await fetch('/api/referrals', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`
              },
              body: JSON.stringify({
                referralCode,
                metadata: {
                  stored: Boolean(storedCode),
                  metadataSource: metadataCode ? 'user_metadata' : null
                }
              })
            });
            const payload = await res.json().catch(() => ({}));
            if (res.ok && (payload.bound || payload.alreadyBound)) {
              lastBoundRef.current = user.id;
              clearStoredReferralCode();
            }
          } catch (error) {
            console.error('Referral binding request failed', error);
          }
        } finally {
          bindingPromiseRef.current = null;
        }
      })();

      await bindingPromiseRef.current;
    };

    void attemptBind();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isUnmounted) return;
      if (session?.user) {
        void attemptBind();
      }
    });

    return () => {
      isUnmounted = true;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  return null;
}
