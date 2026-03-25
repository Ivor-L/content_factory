'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * CanvasAuthBridge
 *
 * Bridges the main app's Supabase session (localStorage) to the canvas-runtime
 * Vue SPA by writing the access token into a short-lived same-site cookie.
 * The Vue SPA's axios uses `withCredentials: true`, so the browser forwards the
 * cookie to `/api/canvas/*` requests automatically.
 */
export function CanvasAuthBridge({ targetUrl }: { targetUrl: string }) {
  useEffect(() => {
    let cancelled = false;

    const bridge = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!cancelled && token) {
          document.cookie = [
            `canvas-auth-token=${encodeURIComponent(token)}`,
            'path=/',
            'max-age=3600',
            'SameSite=Strict',
            ...(window.location.protocol === 'https:' ? ['Secure'] : []),
          ].join('; ');
        }
      } catch {
        // Non-critical — proceed without injecting the token
      }
    };

    bridge();
    return () => {
      cancelled = true;
    };
  }, [targetUrl]);

  return (
    <iframe
      src={targetUrl}
      title="Canvas Runtime"
      style={{
        width: '100%',
        height: '100%',
        minHeight: '100vh',
        border: 'none',
        background: '#05060c',
      }}
      allow="clipboard-write; microphone; camera"
      suppressHydrationWarning
    />
  );
}
