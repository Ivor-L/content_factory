'use client';

import { ArrowUpRight } from 'lucide-react';

import { siteContent } from '../content';

interface TemplatesProps {
  lang: 'en' | 'zh';
}

export function Templates({ lang }: TemplatesProps) {
  const t = siteContent[lang].templates;

  return (
    <section
      id="templates"
      className="bg-gradient-to-b from-[#040410] via-[#0a0d18] to-[#080b15] py-24 text-white scroll-mt-32"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.title}</h2>
            <p className="mt-3 max-w-2xl text-lg text-white/70">{t.description}</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--tenant-primary)] px-6 py-3 text-sm font-semibold text-[var(--tenant-primary-foreground)] shadow-theme-glow transition hover:-translate-y-0.5 hover:bg-[var(--tenant-primary-strong)]"
          >
            <ArrowUpRight size={18} />
            {lang === 'en' ? 'Explore cases' : '查看案例'}
          </button>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {t.items.map((item) => (
            <div
              key={item.name}
              className="group relative overflow-hidden rounded-3xl border border-[var(--tenant-primary)]/20 bg-white/10 p-6 backdrop-blur transition hover:-translate-y-1 hover:border-[var(--tenant-primary)]/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                  {item.tag}
                </span>
                <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/70">
                  {lang === 'en' ? 'Template' : '模板'}
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-white">{item.name}</h3>
              <p className="mt-3 text-sm text-white/70">{item.description}</p>
              <div className="mt-6 flex items-center justify-between text-sm text-white/60">
                <span className="inline-flex items-center gap-2 transition group-hover:gap-3">
                  {lang === 'en' ? 'Open in Studio' : '在工作室打开'}
                  <ArrowUpRight size={16} />
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs">∞</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
