'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { persistReferralCode } from '@/lib/referrals';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const referralCode = searchParams.get('ref') || searchParams.get('referral') || searchParams.get('invite');
    if (referralCode) {
      persistReferralCode(referralCode);
    }
    router.replace('/login');
  }, [router]);

  return null;
}
