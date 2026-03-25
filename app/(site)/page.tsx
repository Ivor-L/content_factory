'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { NexTideLanding } from './components/NexTideLanding';

export default function SiteHome() {
  const [lang, setLang] = useState<'en' | 'zh'>('en');
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
    // Try to detect user language
    if (typeof window !== 'undefined') {
      const userLang = navigator.language.startsWith('zh') ? 'zh' : 'en';
      setLang(userLang);
    }
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-black font-sans text-gray-900 dark:text-white selection:bg-[var(--tenant-primary-soft)] dark:selection:bg-[var(--tenant-primary)]/30">
      <SiteHeader lang={lang} setLang={setLang} />
      
      <main className="relative">
        <NexTideLanding lang={lang} />
      </main>

      <SiteFooter lang={lang} />
    </div>
  );
}
