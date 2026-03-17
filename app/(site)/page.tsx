'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from './components/SiteHeader';
import { Hero } from './components/Hero';
import { Waitlist } from './components/Waitlist';
import { DirectorAgent } from './components/DirectorAgent';
import { SeedanceHighlight } from './components/SeedanceHighlight';
import { Workflow } from './components/Workflow';
import { Templates } from './components/Templates';
import { Features } from './components/Features';
import { Pricing } from './components/Pricing';
import { Download } from './components/Download';
import { SiteFooter } from './components/SiteFooter';

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
        <Hero lang={lang} />
        <Waitlist lang={lang} />
        <DirectorAgent lang={lang} />
        <SeedanceHighlight lang={lang} />
        <Workflow lang={lang} />
        <Templates lang={lang} />
        <Features lang={lang} />
        <Pricing lang={lang} />
        <Download lang={lang} />
      </main>

      <SiteFooter lang={lang} />
    </div>
  );
}
