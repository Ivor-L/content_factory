'use client';

import { siteContent } from '../content';

interface WorkflowProps {
  lang: 'en' | 'zh';
}

const STEP_BADGES: Record<string, string> = {
  script: '01',
  role: '02',
  storyboard: '03',
  timeline: '04',
  video: '05'
};

export function Workflow({ lang }: WorkflowProps) {
  const t = siteContent[lang].workflow;

  return (
    <section
      id="workflow"
      className="relative overflow-hidden bg-gradient-to-b from-white via-[#f4f5f7] to-white py-24 dark:from-black dark:via-[#0b0d13] dark:to-black scroll-mt-32"
    >
      <div className="absolute inset-0 -z-10 opacity-60">
        <div className="absolute top-1/4 left-12 h-52 w-52 rounded-full bg-[var(--tenant-primary)]/20 blur-3xl dark:bg-[var(--tenant-primary)]/15" />
        <div className="absolute bottom-10 right-12 h-48 w-48 rounded-full bg-[var(--tenant-primary)]/15 blur-3xl dark:bg-[var(--tenant-primary)]/10" />
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            {t.title}
          </h2>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">{t.description}</p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-5">
          {t.steps.map((step) => (
            <div
              key={step.key}
              className="relative flex h-full flex-col justify-between rounded-3xl border border-[var(--tenant-primary-muted)] bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-theme-glow dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--tenant-primary)]/30 to-[var(--tenant-primary-strong)]/60 text-base font-semibold text-[var(--tenant-primary-strong)]">
                {STEP_BADGES[step.key] ?? '•'}
              </div>
              <div className="mt-6 space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{step.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{step.description}</p>
              </div>
              <div className="mt-8 h-1 rounded-full bg-gradient-to-r from-[var(--tenant-primary)] via-[#475569] to-[#94a3b8]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
