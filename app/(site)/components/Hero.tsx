'use client';

import Link from 'next/link';
import { ArrowRight, Play, CheckCircle2 } from 'lucide-react';
import { siteContent } from '../content';

interface HeroProps {
  lang: 'en' | 'zh';
}

export function Hero({ lang }: HeroProps) {
  const t = siteContent[lang].hero;

  return (
    <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-blue-50/50 to-transparent dark:from-blue-900/10 dark:to-transparent -z-10 pointer-events-none" />
      <div className="absolute top-20 right-0 w-96 h-96 bg-purple-100/50 dark:bg-purple-900/10 rounded-full blur-3xl -z-10 opacity-60" />
      <div className="absolute top-40 left-0 w-72 h-72 bg-blue-100/50 dark:bg-blue-900/10 rounded-full blur-3xl -z-10 opacity-60" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          AtomX AI 2.0 is Live
        </div>

        {/* Main Title */}
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-gray-900 dark:text-white mb-8 max-w-4xl mx-auto leading-[1.1] animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100">
          {t.title}
        </h1>

        {/* Subtitle */}
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-10 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200">
          {t.subtitle}
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300">
          <Link 
            href="/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-8 py-4 bg-black dark:bg-white text-white dark:text-black rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-xl shadow-black/10 dark:shadow-white/5 flex items-center justify-center gap-2"
          >
            {t.cta}
            <ArrowRight size={20} />
          </Link>
          <button className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-full font-bold text-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
            <Play size={20} className="fill-current" />
            {t.secondaryCta}
          </button>
        </div>

        {/* Trusted By */}
        <div className="mt-16 pt-8 border-t border-gray-100 dark:border-gray-800 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-6 uppercase tracking-wider">
            {t.trustedBy}
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            {/* Mock Logos - Replace with real SVGs */}
            <div className="h-8 w-24 bg-gray-300 dark:bg-gray-700 rounded" />
            <div className="h-8 w-24 bg-gray-300 dark:bg-gray-700 rounded" />
            <div className="h-8 w-24 bg-gray-300 dark:bg-gray-700 rounded" />
            <div className="h-8 w-24 bg-gray-300 dark:bg-gray-700 rounded" />
            <div className="h-8 w-24 bg-gray-300 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>
    </section>
  );
}
