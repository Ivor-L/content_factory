import type { User } from '@supabase/supabase-js';

export const REFERRAL_STORAGE_KEY = 'atomx:pending-referral-code';

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function persistReferralCode(code: string) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, code);
  } catch (error) {
    console.warn('Failed to persist referral code', error);
  }
}

export function readStoredReferralCode() {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredReferralCode() {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getReferralCodeFromUser(user: User | null | undefined) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  const candidates = [
    meta.referral_code,
    meta.referrer_code,
    meta.referrer,
    meta.ref,
    meta.inviter,
    meta.inviter_id,
    meta.invite_code
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

export function buildReferralLink(origin: string, basePath: string, userId: string) {
  const safeOrigin = origin.replace(/\/$/, '');
  const normalizedBase = basePath
    ? (basePath.startsWith('/') ? basePath : `/${basePath}`)
    : '';
  const cleanedBase = normalizedBase.replace(/\/+$/, '');
  const path = `${cleanedBase}/register`.replace(/^\/?/, '/');
  return `${safeOrigin}${path}?ref=${encodeURIComponent(userId)}`;
}
