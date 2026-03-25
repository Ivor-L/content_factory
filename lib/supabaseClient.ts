import { AuthApiError, AuthError, createClient } from "@supabase/supabase-js";
import type { LockFunc } from "@supabase/auth-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not defined");
}

const isBrowser = typeof window !== "undefined";
const noopLock: LockFunc = async (_name, _timeout, task) => task();

function getProjectRefFromUrl(url: string): string | null {
  try {
    const match = url.match(/^https?:\/\/([^./]+)\.supabase\.co/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

const projectRef = getProjectRefFromUrl(supabaseUrl);
const DEFAULT_STORAGE_KEY = projectRef ? `sb-${projectRef}-auth-token` : "supabase.auth.token";
const LEGACY_STORAGE_KEYS = [
  "cfw.supabase.auth.token",
  "supabase.auth.token",
  projectRef ? `sb-${projectRef}-auth-token` : null,
].filter((key): key is string => Boolean(key));
const AUTH_STORAGE_KEY = DEFAULT_STORAGE_KEY;

function migrateLegacySessionStorage() {
  if (!isBrowser) return;
  try {
    const existing = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (existing) return;

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      if (legacyKey === AUTH_STORAGE_KEY) continue;
      if (!legacyKey) continue;
      const legacyValue = window.localStorage.getItem(legacyKey);
      if (legacyValue) {
        window.localStorage.setItem(AUTH_STORAGE_KEY, legacyValue);
        break;
      }
    }
  } catch (error) {
    console.warn("[auth] Failed to migrate legacy Supabase session", error);
  }
}

if (isBrowser) {
  migrateLegacySessionStorage();
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: AUTH_STORAGE_KEY,
    storage: isBrowser ? window.localStorage : undefined,
    ...(isBrowser ? { lock: noopLock } : {}),
  },
});

type GetSessionFn = typeof supabase.auth.getSession;
type AuthSessionResponse = Awaited<ReturnType<GetSessionFn>>;
const originalGetSession = supabase.auth.getSession.bind(supabase.auth);

function isInvalidRefreshTokenError(error: unknown): error is AuthApiError {
  if (!(error instanceof AuthApiError)) return false;
  const message = (error.message || "").toLowerCase();
  return message.includes("invalid refresh token");
}

async function clearBrokenSession() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (signOutError) {
    console.warn("[auth] Failed to clear local Supabase session", signOutError);
  }

  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem("login_timestamp");
    } catch (storageError) {
      console.warn("[auth] Failed to clear login timestamp", storageError);
    }
  }
}

supabase.auth.getSession = (async (...args: Parameters<GetSessionFn>) => {
  try {
    return await originalGetSession(...args);
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      console.warn("[auth] Invalid refresh token detected. Clearing session.");
      await clearBrokenSession();
      return { data: { session: null }, error } satisfies AuthSessionResponse;
    }

    console.error("[auth] Unexpected getSession error", error);
    const fallbackError =
      error instanceof AuthError
        ? error
        : new AuthError("Failed to retrieve Supabase session");
    return {
      data: { session: null },
      error: fallbackError,
    } satisfies AuthSessionResponse;
  }
}) as GetSessionFn;
