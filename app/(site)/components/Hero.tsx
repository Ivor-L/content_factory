'use client';

import { FormEvent, useMemo, useState } from 'react';
import { ArrowRight, Download, Github, Video } from 'lucide-react';

import { siteContent } from '../content';
import { TypewriterHighlight } from './TypewriterHighlight';
import { useTenant } from '@/hooks/useTenant';

interface HeroProps {
  lang: 'en' | 'zh';
}

export function Hero({ lang }: HeroProps) {
  const content = siteContent[lang];
  const hero = content.hero;
  const promo = content.promoBanner;
  const [idea, setIdea] = useState('');
  const { tenant } = useTenant();
  const brandName = tenant.name || 'NexTide';
  const typedTokens = useMemo(() => {
    if (lang === 'zh') {
      return ['拆解爆款', '撰写脚本', '生成图文', '制作视频'];
    }
    return ['deconstruct winning ads,', 'draft scripts,', 'generate copy & visuals,', 'produce videos'];
  }, [lang]);
  const typedPrefix = lang === 'zh' ? '让你的 AI 智能体' : 'Let your AI agent';
  const subtitleLines = hero.subtitle.split('\n');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!idea) return;
    // TODO: hook up to actual submission endpoint once backend is ready.
    setIdea('');
  };

  return (
    <section
      id="hero"
      className="relative overflow-hidden bg-[#050505] text-white scroll-mt-32"
    >
      <div className="max-w-6xl mx-auto grid grid-cols-1 gap-16 px-4 pb-24 pt-36 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-28 lg:pt-40">
        <div className="space-y-8">
          {promo && (
            <div className="inline-flex items-center gap-3 rounded-full border border-[var(--tenant-primary-muted)] bg-[var(--tenant-primary)]/10 px-4 py-2 text-sm backdrop-blur">
              <span className="rounded-full bg-[var(--tenant-primary)]/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--tenant-primary-foreground)]">
                {promo.title}
              </span>
              <span className="text-white/90">{promo.message}</span>
              <button
                type="button"
                className="rounded-full border border-[var(--tenant-primary)]/40 px-3 py-1 text-xs font-semibold text-white/80 transition hover:border-[var(--tenant-primary)] hover:text-white"
              >
                {promo.cta}
              </button>
            </div>
          )}

          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--tenant-primary)]/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--tenant-primary-foreground)]">
              ● {hero.eyebrow}
            </span>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-[3.5rem]">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="text-white">{brandName}</span>
                <span className="text-white">{typedPrefix}</span>
                <TypewriterHighlight tokens={typedTokens} />
              </span>
            </h1>
            <p className="text-lg text-white/80 sm:text-xl">
              {subtitleLines.map((line, index) => (
                <span key={line + index}>
                  {line}
                  {index !== subtitleLines.length - 1 ? <br /> : null}
                </span>
              ))}
            </p>
          </div>

          <p className="max-w-2xl text-base text-white/70 sm:text-lg">
            {hero.description}
          </p>

          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div className="flex-1 rounded-2xl border border-[var(--tenant-primary-muted)] bg-white/5 px-5 py-3 backdrop-blur transition focus-within:border-[var(--tenant-primary)] focus-within:bg-[var(--tenant-primary)]/10">
              <input
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder={hero.inputPlaceholder}
                className="w-full bg-transparent text-sm text-white/90 outline-none placeholder:text-white/40 sm:text-base"
              />
            </div>
            <button
              type="submit"
              className="btn-openclaw inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold sm:text-base"
            >
              {hero.primaryCta}
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--tenant-primary)]/40 bg-[var(--tenant-primary)]/10 px-5 py-2.5 text-sm font-medium text-white/90 transition hover:border-[var(--tenant-primary)] hover:bg-[var(--tenant-primary)]/20"
            >
              <Video size={18} />
              {hero.secondaryCta}
            </button>
            <button
              type="button"
              className="text-sm font-medium text-[var(--tenant-primary)] underline-offset-4 hover:underline"
            >
              {hero.waitlistCta}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--tenant-primary)]/40 px-4 py-2 text-xs font-semibold text-white/90 transition hover:border-[var(--tenant-primary)] hover:text-white sm:text-sm"
            >
              <Download size={16} />
              {hero.downloads.mac}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--tenant-primary)]/40 px-4 py-2 text-xs font-semibold text-white/90 transition hover:border-[var(--tenant-primary)] hover:text-white sm:text-sm"
            >
              <Download size={16} />
              {hero.downloads.windows}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--tenant-primary)]/40 px-4 py-2 text-xs font-semibold text-white/90 transition hover:border-[var(--tenant-primary)] hover:text-white sm:text-sm"
            >
              <Github size={16} />
              {hero.downloads.github}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-6 max-w-lg">
            {hero.metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-[var(--tenant-primary)]/25 bg-white/5 p-4 text-center backdrop-blur transition hover:border-[var(--tenant-primary)]/50"
              >
                <div className="text-xl font-semibold text-white sm:text-2xl">
                  {metric.value}
                </div>
                <div className="text-xs uppercase tracking-wide text-white/60 sm:text-sm">
                  {metric.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[32px] border border-[var(--tenant-primary)]/25 bg-white/5 p-6 backdrop-blur">
          <div className="absolute -top-20 -right-16 h-64 w-64 rounded-full bg-gradient-to-br from-[var(--tenant-primary)] to-[#0f172a] opacity-30 blur-3xl" />
          <div className="absolute -bottom-24 -left-12 h-56 w-56 rounded-full bg-gradient-to-tr from-[#e2e8f0] via-[var(--tenant-primary)] to-[#0f172a] opacity-30 blur-3xl" />

          <div className="relative space-y-6">
            <div className="rounded-3xl border border-white/10 bg-black/40 p-5 shadow-lg">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>Storyboard</span>
                <span>Seedance 2.0</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-xs font-semibold text-white">
                <span className="rounded-xl bg-white/10 px-3 py-2 text-center">Wide Shot</span>
                <span className="rounded-xl bg-white/10 px-3 py-2 text-center">Close Up</span>
                <span className="rounded-xl bg-white/10 px-3 py-2 text-center">Transition</span>
              </div>
              <p className="mt-5 text-sm text-white/70">
                {lang === 'en'
                  ? 'Agents plan every beat, maintain character identity, and prepare the timeline automatically.'
                  : '智能体自动规划镜头节奏，保持角色一致性，并同步生成剪辑时间线。'}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/60 p-5 shadow-inner">
              <h3 className="text-sm font-semibold text-white/80">
                Seedance 2.0 — {lang === 'en' ? 'Shot Preview' : '镜头预览'}
              </h3>
              <div className="mt-4 aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent">
                <div className="flex h-full flex-col justify-between p-4">
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span>{lang === 'en' ? 'Camera: 35mm' : '镜头：35mm'}</span>
                    <span>{lang === 'en' ? 'Lighting: Golden hour' : '光线：黄金时刻'}</span>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3 text-center text-sm font-medium text-white">
                    {lang === 'en'
                      ? 'Final frame composited with motion & VFX'
                      : '最终画面结合动作与特效呈现'}
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>{lang === 'en' ? 'Audio: Auto Score' : '音乐：自动配乐'}</span>
                    <span>{lang === 'en' ? 'Status: Rendering' : '状态：渲染中'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
