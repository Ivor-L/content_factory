'use client';

import { Zap } from 'lucide-react';

import { siteContent } from '../content';

interface SeedanceHighlightProps {
  lang: 'en' | 'zh';
}

export function SeedanceHighlight({ lang }: SeedanceHighlightProps) {
  const t = siteContent[lang].seedance;

  return (
    <section className="bg-gradient-to-b from-white via-white to-gray-50 py-24 dark:from-black dark:via-[#05070f] dark:to-[#080a14]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--tenant-primary)]/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--tenant-primary-foreground)] dark:bg-[var(--tenant-primary)]/20">
              {t.eyebrow}
            </span>
            <h2 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
              {t.title}
            </h2>
            <p className="text-lg leading-relaxed text-gray-600 dark:text-gray-300">{t.description}</p>
            <div className="space-y-3 pt-3">
              {t.bullets.map((bullet) => (
                <div key={bullet} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                  <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-2xl bg-[var(--tenant-primary)]/15 text-[var(--tenant-primary-strong)] dark:bg-[var(--tenant-primary)]/15 dark:text-[var(--tenant-primary-strong)]">
                    <Zap size={16} />
                  </span>
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-openclaw mt-8 inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold"
            >
              {t.cta}
            </button>
          </div>

          <div className="relative rounded-[36px] border border-[var(--tenant-primary-muted)] bg-white p-8 shadow-2xl dark:border-gray-800 dark:bg-black">
            <div className="absolute -top-16 right-6 h-28 w-28 rounded-full bg-primary/30 opacity-60 blur-3xl dark:bg-primary/30" />
            <div className="absolute -bottom-16 left-6 h-32 w-32 rounded-full bg-indigo-200 opacity-70 blur-3xl dark:bg-indigo-500/40" />

            <div className="relative space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Seedance 2.0 — {lang === 'en' ? 'Human Motion Suite' : '真人动捕方案'}
                </span>
                <span className="rounded-full border border-[var(--tenant-primary-muted)] px-3 py-1 text-xs font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-300">
                  {lang === 'en' ? 'Beta' : '内测'}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[var(--tenant-primary-muted)] bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {lang === 'en' ? 'Motion Fidelity' : '动作真实性'}
                  </p>
                  <p className="mt-1 font-semibold">
                    {lang === 'en' ? 'Studio-grade PBR rig' : '影棚级 PBR 骨骼'}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--tenant-primary-muted)] bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {lang === 'en' ? 'Face Capture' : '表情捕捉'}
                  </p>
                  <p className="mt-1 font-semibold">
                    {lang === 'en' ? 'Micro-expression aware AI' : '微表情感知 AI'}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--tenant-primary-muted)] bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {lang === 'en' ? 'Camera Language' : '镜头语言'}
                  </p>
                  <p className="mt-1 font-semibold">
                    {lang === 'en' ? '35 dynamic moves library' : '35 种动态运镜库'}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--tenant-primary-muted)] bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {lang === 'en' ? 'Lighting' : '光影效果'}
                  </p>
                  <p className="mt-1 font-semibold">
                    {lang === 'en' ? 'Cinema-ready grade LUTs' : '电影级 LUT 预设'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
