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

const SITE_ONLY_MODE = process.env.NEXT_PUBLIC_SITE_ONLY === 'true';
const SITE_ONLY_DASHBOARD_URL =
  process.env.NEXT_PUBLIC_DASHBOARD_URL?.trim() || 'https://atomx.top/login';

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
  const dashboardHref = SITE_ONLY_MODE ? SITE_ONLY_DASHBOARD_URL : dashboardPath;
  const openClawPath = useTenantPath('/openclaw');
  const nexapiPath = useTenantPath('/nexapi');
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

  const primaryButtonClass =
    'inline-flex items-center justify-center rounded-full border border-[#101522]/80 bg-[#101522] px-5 py-2 text-sm font-semibold text-[#f8f7f3] shadow-[0_10px_24px_-18px_rgba(16,21,34,0.8)] transition-transform hover:-translate-y-0.5';

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
          <Link href={nexapiPath} className={navLinkClass}>
            {t.nexapi}
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

          <Link href={dashboardHref} target="_blank" rel="noopener noreferrer" className={primaryButtonClass}>
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
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-[rgba(244,243,239,0.96)] px-6 text-center backdrop-blur-xl dark:bg-[rgba(5,7,12,0.92)]">
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
          <Link
            href={nexapiPath}
            className="text-2xl font-semibold text-gray-900 transition-colors hover:text-primary dark:text-white"
            onClick={() => setMobileOpen(false)}
          >
            {t.nexapi}
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
            href={dashboardHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-[#101522]/80 bg-[#101522] px-8 py-3 text-lg font-semibold text-[#f8f7f3] transition-transform hover:-translate-y-0.5"
            onClick={() => setMobileOpen(false)}
          >
            {t.dashboard}
          </Link>
        </div>
      )}
    </header>
  );
}
