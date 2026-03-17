'use client';

/* eslint-disable @next/next/no-img-element -- Marketing header needs raw SVG logo for tenant overrides */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Globe, Menu, X } from 'lucide-react';

import { siteContent } from '../content';
import { useTenant, useTenantPath } from '@/hooks/useTenant';

interface SiteHeaderProps {
  lang: 'en' | 'zh';
  setLang: (lang: 'en' | 'zh') => void;
}

export function SiteHeader({ lang, setLang }: SiteHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = siteContent[lang].nav;
  const { tenant } = useTenant();
  const isNextideTenant = tenant.slug === 'nextide';
  const brandLogo = isNextideTenant ? '/logo/nextide_logo.svg' : tenant.logo || '/logo.svg';
  const brandName = tenant.name || 'PolyWhale Studio';
  const homePath = useTenantPath('/');
  const dashboardPath = useTenantPath('/dashboard');
  const openClawPath = useTenantPath('/openclaw');
  const shouldUseWhiteLogo = isNextideTenant && !isScrolled;
  const brandLogoStyle = shouldUseWhiteLogo ? { filter: 'brightness(0) invert(1)' } : undefined;
  const brandLogoClass = `${
    isNextideTenant ? 'h-[54px] md:h-[64px]' : 'h-[28px] md:h-[32px]'
  } object-contain transition duration-300`;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 48);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleAnchorClick = (href: string) => {
    if (typeof document === 'undefined') return;
    const target = document.querySelector<HTMLElement>(href);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', href);
    }
  };

  const navAnchors = [
    { href: '#hero', label: t.hero },
    { href: '#director', label: t.director },
    { href: '#workflow', label: t.workflow },
    { href: '#templates', label: t.templates },
    { href: '#pricing', label: t.pricing },
    { href: '#download', label: t.download }
  ];

  const navLinkClass = isScrolled
    ? 'text-sm font-medium text-gray-700 hover:text-[var(--tenant-primary-strong)] dark:text-gray-200 dark:hover:text-[var(--tenant-primary)] transition-colors'
    : 'text-sm font-medium text-white/80 hover:text-[var(--tenant-primary)] transition-colors';

  const languageClass = isScrolled
    ? 'text-gray-600 hover:text-[var(--tenant-primary-strong)] dark:text-gray-300 dark:hover:text-[var(--tenant-primary)]'
    : 'text-white/70 hover:text-[var(--tenant-primary)]';

  const primaryButtonClass = 'px-5 py-2 rounded-full bg-[var(--tenant-primary)] text-[var(--tenant-primary-foreground)] font-semibold shadow-theme-glow hover:-translate-y-0.5 transition-transform';

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-white/85 dark:bg-black/75 backdrop-blur-xl border-b border-[var(--tenant-primary-muted)]'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 sm:px-6 lg:px-8">
        <Link href={homePath} className="relative z-50 flex items-center gap-3">
          <img
            src={brandLogo}
            alt={`${brandName} logo`}
            className={brandLogoClass}
            style={brandLogoStyle}
          />
          {!isNextideTenant && (
            <span
              className={`hidden text-lg font-semibold tracking-tight md:inline ${
                isScrolled ? 'text-gray-900 dark:text-white' : 'text-white'
              }`}
            >
              {brandName}
            </span>
          )}
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navAnchors.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={navLinkClass}
              onClick={(event) => {
                event.preventDefault();
                handleAnchorClick(item.href);
              }}
            >
              {item.label}
            </a>
          ))}
          <Link href={openClawPath} className={navLinkClass}>
            {t.openclaw}
          </Link>
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <button
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
            className={`flex items-center gap-1 text-sm font-medium transition-colors ${languageClass}`}
          >
            <Globe size={16} />
            {lang === 'en' ? '中文' : 'EN'}
          </button>

          <Link href={dashboardPath} target="_blank" rel="noopener noreferrer" className={primaryButtonClass}>
            {t.dashboard}
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className={`relative z-50 md:hidden ${
            isScrolled ? 'text-gray-900 dark:text-white' : 'text-white'
          }`}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X size={26} /> : <Menu size={26} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-[var(--tenant-primary-soft)] via-white to-white px-6 text-center dark:from-gray-900 dark:via-black dark:to-black">
          {navAnchors.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-2xl font-semibold text-gray-900 transition-colors hover:text-primary dark:text-white"
              onClick={(event) => {
                event.preventDefault();
                setMobileOpen(false);
                handleAnchorClick(item.href);
              }}
            >
              {item.label}
            </a>
          ))}
          <Link
            href={openClawPath}
            className="text-2xl font-semibold text-gray-900 transition-colors hover:text-primary dark:text-white"
            onClick={() => setMobileOpen(false)}
          >
            {t.openclaw}
          </Link>
          <button
            onClick={() => {
              setLang(lang === 'en' ? 'zh' : 'en');
              setMobileOpen(false);
            }}
            className="text-lg font-medium text-gray-600 transition-colors hover:text-primary dark:text-gray-300 dark:hover:text-white"
          >
            {lang === 'en' ? '切换到中文' : 'Switch to English'}
          </button>
          <Link
            href={dashboardPath}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[var(--tenant-primary)] px-8 py-3 text-lg font-semibold text-[var(--tenant-primary-foreground)] transition-transform hover:-translate-y-0.5 shadow-theme-glow"
            onClick={() => setMobileOpen(false)}
          >
            {t.dashboard}
          </Link>
        </div>
      )}
    </header>
  );
}
