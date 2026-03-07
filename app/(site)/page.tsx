'use client';

import { useState, useEffect } from 'react';
import { SiteHeader } from './components/SiteHeader';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { Showcase } from './components/Showcase';
import { ModelTicker } from './components/ModelTicker';
import { Pricing } from './components/Pricing';
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
    <div className="min-h-screen bg-white dark:bg-black font-sans text-gray-900 dark:text-white selection:bg-blue-100 dark:selection:bg-blue-900">
      <SiteHeader lang={lang} setLang={setLang} />
      
      <main>
        <Hero lang={lang} />
        <Features lang={lang} />
        <Showcase lang={lang} />
        <ModelTicker lang={lang} />
        <Pricing lang={lang} />
      </main>

      <SiteFooter lang={lang} />
    </div>
  );
}
