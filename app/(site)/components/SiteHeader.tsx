'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Menu, X, Globe } from 'lucide-react';
import { siteContent } from '../content';

interface SiteHeaderProps {
  lang: 'en' | 'zh';
  setLang: (lang: 'en' | 'zh') => void;
}

export function SiteHeader({ lang, setLang }: SiteHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const t = siteContent[lang].nav;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 py-0.5' : 'bg-transparent py-0.5'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center z-50">
          <img src="/logo.svg" alt="AtomX Logo" className="h-20" />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors">
            {t.features}
          </a>
          <a href="#showcase" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors">
            {t.showcase}
          </a>
          <a href="#pricing" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors">
            {t.pricing}
          </a>
        </nav>

        {/* Actions */}
        <div className="hidden md:flex items-center gap-4">
          <button 
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
            className="flex items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors"
          >
            <Globe size={16} />
            {lang === 'en' ? 'CN' : 'EN'}
          </button>
          
          <Link 
            href="/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 bg-black dark:bg-white text-white dark:text-black text-sm font-bold rounded-full hover:scale-105 transition-transform"
          >
            {t.dashboard}
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button 
          className="md:hidden z-50 text-gray-900 dark:text-white"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 bg-white dark:bg-black z-40 flex flex-col items-center justify-center space-y-8 animate-in fade-in slide-in-from-top-10 duration-200">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-2xl font-bold text-gray-900 dark:text-white">{t.features}</a>
            <a href="#showcase" onClick={() => setMobileMenuOpen(false)} className="text-2xl font-bold text-gray-900 dark:text-white">{t.showcase}</a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="text-2xl font-bold text-gray-900 dark:text-white">{t.pricing}</a>
            <div className="w-16 h-px bg-gray-200 dark:bg-gray-800 my-4" />
            <button onClick={() => { setLang(lang === 'en' ? 'zh' : 'en'); setMobileMenuOpen(false); }} className="text-lg font-medium text-gray-600 dark:text-gray-400">
              Switch to {lang === 'en' ? '中文' : 'English'}
            </button>
            <Link 
              href="/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 bg-black dark:bg-white text-white dark:text-black text-lg font-bold rounded-full"
            >
              {t.dashboard}
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
