"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { syncServerSession } from "@/lib/clientSessionSync";

export function AuthSessionSync() {
  const lastTokenRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;

    const sync = async (token: string | null) => {
      if (!active) return;
      if (lastTokenRef.current === token) return;
      try {
        await syncServerSession(token);
        if (active) {
          lastTokenRef.current = token;
        }
      } catch (error) {
        console.warn("[auth] Failed to sync server session", error);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      void sync(session?.access_token ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void sync(session?.access_token ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
