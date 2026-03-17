'use client';

import { siteContent } from '../content';

interface FeaturesProps {
  lang: 'en' | 'zh';
}

export function Features({ lang }: FeaturesProps) {
  const t = siteContent[lang].features;

  return (
    <section className="bg-gradient-to-b from-white via-[#fff9e6] to-white py-24 dark:from-black dark:via-[#0a0c14] dark:to-black">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            {t.title}
          </h2>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">{t.subtitle}</p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {t.items.map((item) => (
            <div
              key={item.title}
              className="relative overflow-hidden rounded-3xl border border-[var(--tenant-primary-muted)] bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-theme-glow dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-[var(--tenant-primary)]/15 to-[var(--tenant-primary-strong)]/25 blur-3xl dark:from-[var(--tenant-primary)]/20 dark:to-[var(--tenant-primary-strong)]/40" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{item.title}</h3>
              <p className="mt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
