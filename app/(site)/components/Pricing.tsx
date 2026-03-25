'use client';

import { Check } from 'lucide-react';

import { siteContent } from '../content';

interface PricingProps {
  lang: 'en' | 'zh';
}

export function Pricing({ lang }: PricingProps) {
  const t = siteContent[lang].pricing;

  return (
    <section id="pricing" className="bg-gradient-to-b from-[#f8fafc] via-[#f4f5f7] to-white py-24 dark:from-[#05060b] dark:via-[#0b0f18] dark:to-[#05060b] scroll-mt-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            {t.title}
          </h2>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">{t.subtitle}</p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {t.plans.map((plan) => (
            <div
              key={plan.name}
              className={`flex h-full flex-col rounded-3xl border bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-theme-glow dark:border-gray-800 dark:bg-gray-950/70 ${
                plan.popular ? 'border-[var(--tenant-primary)] shadow-theme-glow' : 'border-[var(--tenant-primary-muted)]'
              }`}
            >
              {plan.popular ? (
                <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-[var(--tenant-primary)]/15 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--tenant-primary-strong)]">
                  {lang === 'en' ? 'Most popular' : '人气方案'}
                </span>
              ) : null}

              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1 text-gray-900 dark:text-white">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period ? <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{plan.period}</span> : null}
                </div>
                {plan.headline ? (
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{plan.headline}</p>
                ) : null}
              </div>

              <ul className="mt-6 flex-1 space-y-3 text-sm text-gray-600 dark:text-gray-300">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-primary dark:bg-primary/15 dark:text-primary-foreground">
                      <Check size={16} />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className="btn-openclaw mt-8 inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold"
              >
                {t.cta}
              </button>
            </div>
          ))}
        </div>

        {t.notes?.length ? (
          <div className="mt-10 space-y-2 text-sm text-gray-500 dark:text-gray-400">
            {t.notes.map((note) => (
              <p key={note}>* {note}</p>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
