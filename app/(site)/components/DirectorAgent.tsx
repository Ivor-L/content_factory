'use client';

import { Sparkles } from 'lucide-react';

import { siteContent } from '../content';

interface DirectorAgentProps {
  lang: 'en' | 'zh';
}

export function DirectorAgent({ lang }: DirectorAgentProps) {
  const t = siteContent[lang].director;

  return (
    <section
      id="director"
      className="relative overflow-hidden bg-gradient-to-br from-[#0a101f] via-[#111933] to-[#120c08] py-24 text-white scroll-mt-32"
    >
      <div className="absolute inset-0 -z-10 opacity-40">
        <div className="absolute -left-12 top-0 h-56 w-56 rounded-full bg-[var(--tenant-primary)]/35 blur-3xl" />
        <div className="absolute right-0 top-10 h-64 w-64 rounded-full bg-[var(--tenant-primary-strong)]/30 blur-3xl" />
        <div className="absolute bottom-[-120px] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[var(--tenant-primary)]/25 blur-[120px]" />
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-16 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--tenant-primary)]/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--tenant-primary-foreground)]">
            {t.eyebrow}
          </span>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            <span className="text-white/60">{t.titleBefore}</span>{' '}
            <span className="bg-gradient-to-r from-[#7afcff] via-[#9d7bff] to-[#ff8dd4] bg-clip-text text-transparent">
              {t.titleAfter}
            </span>
          </h2>
          <p className="text-lg text-white/70">{t.description}</p>

          <div className="space-y-4">
            {t.bullets.map((bullet) => (
              <div
                key={bullet.title}
                className="rounded-3xl border border-[var(--tenant-primary)]/25 bg-white/5 p-6 backdrop-blur transition hover:border-[var(--tenant-primary)]/40"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--tenant-primary)] to-[var(--tenant-primary-strong)]">
                    <Sparkles size={20} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-white">{bullet.title}</h3>
                    <p className="text-sm text-white/70">{bullet.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn-openclaw inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold"
          >
            {t.cta}
          </button>
        </div>

        <div className="relative flex flex-col gap-6">
          <div className="rounded-[32px] border border-[var(--tenant-primary)]/25 bg-white/5 p-6 text-left shadow-2xl backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">
              {lang === 'en' ? 'Director Agent Stack' : '导演智能体流程'}
            </p>
            <div className="mt-6 grid gap-3 text-sm text-white/80">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-white/50">
                  {lang === 'en' ? 'Step 01' : '步骤 01'}
                </p>
                <p className="mt-1 font-semibold">{lang === 'en' ? 'Concept & Beat Sheet' : '创意拆解与节奏表'}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-white/50">
                  {lang === 'en' ? 'Step 02' : '步骤 02'}
                </p>
                <p className="mt-1 font-semibold">{lang === 'en' ? 'Character & Casting Engine' : '角色与选角引擎'}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-white/50">
                  {lang === 'en' ? 'Step 03' : '步骤 03'}
                </p>
                <p className="mt-1 font-semibold">
                  {lang === 'en' ? 'Storyboard + Camera Moves' : '分镜与运镜设计'}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-white/50">
                  {lang === 'en' ? 'Step 04' : '步骤 04'}
                </p>
                <p className="mt-1 font-semibold">
                  {lang === 'en' ? 'Timeline Assembly & QC' : '时间线拼接与质检'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-[var(--tenant-primary)]/25 bg-black/40 p-6 backdrop-blur">
            <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/50">
              {lang === 'en' ? 'Multi-Agent Status' : '多智能体状态'}
            </h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span>{lang === 'en' ? 'Script Agent' : '剧本智能体'}</span>
                <span className="text-[#7afcff]">{lang === 'en' ? 'Approved' : '已完成'}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span>{lang === 'en' ? 'Storyboard Agent' : '分镜智能体'}</span>
                <span className="text-[#ff8dd4]">{lang === 'en' ? 'Rendering' : '渲染中'}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                <span>{lang === 'en' ? 'Edit Agent' : '剪辑智能体'}</span>
                <span className="text-[#9d7bff]">{lang === 'en' ? 'Syncing' : '同步中'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
