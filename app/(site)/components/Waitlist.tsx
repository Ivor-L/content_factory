'use client';

import { ArrowRight } from 'lucide-react';

import { siteContent } from '../content';

interface WaitlistProps {
  lang: 'en' | 'zh';
}

export function Waitlist({ lang }: WaitlistProps) {
  const t = siteContent[lang].waitingList;

  return (
    <section className="bg-gradient-to-b from-white via-[#fff9e6] to-white py-20 dark:from-black dark:via-[#05070d] dark:to-black">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            {t.title}
          </h2>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">{t.description}</p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {t.options.map((option) => (
            <div
              key={option.title}
              className="flex h-full flex-col justify-between rounded-3xl border border-[var(--tenant-primary-muted)] bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-theme-glow dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{option.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{option.description}</p>
              </div>
              <button
                type="button"
                className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[var(--tenant-primary-strong)] transition hover:gap-3"
              >
                {option.cta}
                <ArrowRight size={16} />
              </button>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-gray-500 dark:text-gray-400">{t.footer}</p>
      </div>
    </section>
  );
}
