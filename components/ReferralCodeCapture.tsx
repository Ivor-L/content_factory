'use client';

import { useEffect } from 'react';
import { persistReferralCode } from '@/lib/referrals';

const REFERRAL_QUERY_KEYS = ['ref', 'referral', 'referralCode', 'invite', 'inviteCode'];

export function ReferralCodeCapture() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const searchParams = new URLSearchParams(window.location.search);
    for (const key of REFERRAL_QUERY_KEYS) {
      const value = searchParams.get(key)?.trim();
      if (value) {
        persistReferralCode(value);
        break;
      }
    }
  }, []);

  return null;
}
