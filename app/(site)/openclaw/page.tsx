'use client';

import { useEffect, useState } from 'react';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';
import type { OpenClawLocale } from './content';
import {
  OpenClawHero,
  PromptCard,
  CapabilityGrid,
  Timeline,
  ApiShowcase,
  OpenClawCta,
} from './components/Sections';

export default function OpenClawPage() {
  const [lang, setLang] = useState<OpenClawLocale>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const detected = navigator.language.startsWith('zh') ? 'zh' : 'en';
      setLang(detected);
    }
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white">
      <SiteHeader lang={lang} setLang={setLang} />
      <main>
        <OpenClawHero lang={lang} />
        <PromptCard lang={lang} />
        <CapabilityGrid lang={lang} />
        <Timeline lang={lang} />
        <ApiShowcase lang={lang} />
        <OpenClawCta lang={lang} />
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
