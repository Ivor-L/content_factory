'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Copy,
  Check,
  Sparkles,
  Shield,
  Workflow,
  Zap,
  Webhook,
  Terminal,
  ArrowRight,
} from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
import { TypewriterHighlight } from '@/app/(site)/components/TypewriterHighlight';
import { openclawContent, type OpenClawLocale } from '../content';

interface SectionProps {
  lang: OpenClawLocale;
}

const gradientBackground =
  'bg-[#050505] text-white relative overflow-hidden';
type AudienceTab = 'human' | 'agent';

const DEFAULT_BRAND_LOGO = '/logo.svg';

function useBrandTokens() {
  const { tenant } = useTenant();
  const brandName = tenant.name || 'NexTide';
  const brandLogo = tenant.logo || DEFAULT_BRAND_LOGO;
  const replaceBrand = useCallback((value: string) => value.replace(/{{brand}}/g, brandName), [brandName]);
  return { brandName, brandLogo, replaceBrand };
}

export function OpenClawHero({ lang }: SectionProps) {
  const t = openclawContent[lang].hero;
  const { brandName, replaceBrand } = useBrandTokens();
  const heroTitle = replaceBrand(t.title);
  const heroDescription = replaceBrand(t.description);
  const bulletCopy = t.bullets.map(replaceBrand);
  const typedTokens = useMemo(() => {
    const zhOptions = ['拆解爆款', '编写脚本', '生成图文', '制作视频'];
    const enOptions = ['audit winning ads', 'spin Creative Tasks', 'draft Storyboards', 'ship videos'];
    return lang === 'zh' ? zhOptions : enOptions;
  }, [lang]);
  const [activeAudience, setActiveAudience] = useState<AudienceTab>('agent');
  const heroSupporting = replaceBrand(
    t.audienceCopy?.[activeAudience] ?? t.supporting,
  );
  const stackTitle = lang === 'zh' ? `${brandName} + OpenClaw 能力栈` : `${brandName} + OpenClaw Stack`;
  const humanLabel = lang === 'zh' ? '我是人类' : "I'm Human";
  const agentLabelText = lang === 'zh' ? '我是智能体' : "I'm an Agent";
  const eyebrowLabel = 'For AI Agents';

  const typedPrefix = lang === 'zh' ? '让你的 AI 智能体' : 'Let your AI agent';

  return (
    <section
      id="hero"
      className={`${gradientBackground} pt-32 pb-24 scroll-mt-32`}
      data-hero-section="openclaw"
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="space-y-8">
          <div className="flex justify-center flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-white/20 text-xs font-semibold tracking-wide text-white/90 bg-white/5">
                <Sparkles className="w-4 h-4 text-yellow-300" />
                {eyebrowLabel}
              </span>
            <div className="flex items-center bg-white/10 rounded-full p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveAudience('human')}
                className={`px-3 py-1 rounded-full transition-colors ${
                  activeAudience === 'human' ? 'bg-white text-black' : 'text-white/70'
                }`}
              >
                {humanLabel}
              </button>
              <button
                type="button"
                onClick={() => setActiveAudience('agent')}
                className={`px-3 py-1 rounded-full transition-colors ${
                  activeAudience === 'agent' ? 'bg-white text-black' : 'text-white/70'
                }`}
              >
                {agentLabelText}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <h1 className="text-4xl sm:text-5xl font-semibold text-white leading-tight">
              {heroTitle}
            </h1>
            <p
              className="text-2xl font-medium text-white leading-snug flex flex-wrap justify-center items-baseline gap-2 min-h-[3.5rem]"
              aria-label={heroDescription}
            >
              <span>{typedPrefix}</span>
              <TypewriterHighlight tokens={typedTokens} />
            </p>
            <p className="text-lg text-white/70">
              {heroSupporting}
            </p>
          </div>

          <ul className="grid gap-4 max-w-5xl mx-auto px-2 mt-10 list-none md:grid-cols-3">
            {bulletCopy.map((bullet) => (
              <li
                key={bullet}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-6 h-full text-left"
              >
                <div className="flex items-start gap-3 text-white/80 text-sm md:text-base leading-relaxed">
                  <div className="mt-1 w-6 h-6 md:w-7 md:h-7 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 md:w-4 md:h-4 text-yellow-300" />
                  </div>
                  <span className="max-w-full">{bullet}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="mailto:openclaw@atomx.top"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-yellow-300 text-black font-semibold hover:bg-yellow-200 transition-colors"
            >
              {t.primaryCta}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/60">{stackTitle}</p>
              <p className="text-lg font-semibold text-white">
                {lang === 'zh' ? '典型场景 / 部署时间 / 单次产出' : 'Scenarios / Setup time / Deliverables'}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {t.dataPoints.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/80">
                  <p className="text-xs uppercase tracking-widest text-white/60">{item.label}</p>
                  <p className="text-base font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
export function PromptCard({ lang }: SectionProps) {
  const t = openclawContent[lang].prompt;
  const { replaceBrand } = useBrandTokens();
  const [copied, setCopied] = useState(false);
  const [skillUrl, setSkillUrl] = useState('https://atomx.top/openclaw-skill.md');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSkillUrl(`${window.location.origin}/openclaw-skill.md`);
    }
  }, []);

  const promptText = useMemo(() => {
    const base = replaceBrand(t.command);
    return base.replace('{{skillUrl}}', skillUrl);
  }, [replaceBrand, t.command, skillUrl]);
  const title = replaceBrand(t.title);
  const description = replaceBrand(t.description);
  const note = replaceBrand(t.note);
  const stepsTitle = replaceBrand(t.stepsTitle);
  const steps = t.steps.map(replaceBrand);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy prompt', error);
    }
  };

  return (
    <section id="director" className="py-16 bg-gray-50 dark:bg-[#050505] scroll-mt-32">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-black border border-gray-100 dark:border-gray-800 rounded-3xl p-8 md:p-10 shadow-2xl">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Workflow className="w-5 h-5 text-primary" />
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-500">{t.label}</p>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{title}</h2>
              </div>
            </div>
            <p className="text-gray-600 dark:text-gray-300 text-base">{description}</p>
            <div className="relative">
              <pre className="bg-gray-900 text-gray-50 rounded-2xl p-6 pr-28 md:pr-36 text-sm leading-relaxed whitespace-pre-wrap break-words">
{promptText}
              </pre>
              <button
                type="button"
                onClick={handleCopy}
                className="absolute top-4 right-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-medium border border-white/20"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? t.copiedLabel : t.copyLabel}
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{note}</p>
          </div>
          <div className="mt-10">
            <p className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest mb-4">{stepsTitle}</p>
            <div className="grid md:grid-cols-4 gap-4">
              {steps.map((step, index) => (
                <div key={step} className="p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/5 text-sm text-gray-600 dark:text-gray-300">
                  <div className="text-xs font-bold text-primary mb-2">{String(index + 1).padStart(2, '0')}</div>
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CapabilityGrid({ lang }: SectionProps) {
  const t = openclawContent[lang].capabilities;
  const { replaceBrand } = useBrandTokens();
  const icons = [Sparkles, Terminal, Zap, Webhook];
  const sectionTitle = replaceBrand(t.title);
  const sectionSubtitle = replaceBrand(t.subtitle);

  return (
    <section id="workflow" className="py-16 scroll-mt-32">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest">{sectionSubtitle}</p>
          <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 dark:text-white mt-4">{sectionTitle}</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {t.items.map((item, index) => {
            const Icon = icons[index % icons.length];
            const itemTitle = replaceBrand(item.title);
            const itemDescription = replaceBrand(item.description);
            const points = item.points.map(replaceBrand);
            return (
              <div key={item.title} className="rounded-3xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 p-8 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">{itemTitle}</p>
                    <p className="text-base text-gray-500 dark:text-gray-400">{itemDescription}</p>
                  </div>
                </div>
                <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                  {points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <Check className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Timeline({ lang }: SectionProps) {
  const t = openclawContent[lang].timeline;
  const { replaceBrand } = useBrandTokens();
  const sectionTitle = replaceBrand(t.title);

  return (
    <section id="templates" className="py-16 bg-gray-50 dark:bg-[#050505] scroll-mt-32">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest">{sectionTitle}</p>
        </div>
        <div className="space-y-6">
          {t.items.map((item) => {
            const title = replaceBrand(item.title);
            const description = replaceBrand(item.description);
            return (
              <div key={item.title} className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 p-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">{item.badge}</p>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-2">{title}</h3>
                  <p className="text-gray-600 dark:text-gray-300 mt-2">{description}</p>
                </div>
                <div className="text-primary">→</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ApiShowcase({ lang }: SectionProps) {
  const t = openclawContent[lang].api;
  const { replaceBrand } = useBrandTokens();
  const title = replaceBrand(t.title);
  const description = replaceBrand(t.description);
  const footer = replaceBrand(t.footer);

  return (
    <section id="pricing" className="py-16 scroll-mt-32">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest">API</p>
          <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mt-4">{title}</h2>
          <p className="text-gray-600 dark:text-gray-300 mt-3">{description}</p>
        </div>
        <div className="mt-10 grid md:grid-cols-2 gap-6">
          {t.snippets.map((snippet) => (
            <div key={snippet.title} className="rounded-3xl border border-gray-100 dark:border-gray-800 bg-gray-900 text-gray-50 p-6">
              <p className="text-sm text-gray-400 uppercase tracking-widest mb-2">{snippet.title}</p>
              <p className="text-base text-gray-300 mb-4">{replaceBrand(snippet.description)}</p>
              <pre className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap">{snippet.code}</pre>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">{footer}</p>
      </div>
    </section>
  );
}

export function OpenClawCta({ lang }: SectionProps) {
  const t = openclawContent[lang].cta;
  const { replaceBrand } = useBrandTokens();
  const title = replaceBrand(t.title);
  const description = replaceBrand(t.description);

  return (
    <section id="download" className="py-20 scroll-mt-32">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-br from-gray-900 via-black to-[var(--tenant-primary)]/30 p-10 text-white relative overflow-hidden">
          <div className="relative z-10 space-y-6">
            <p className="text-sm uppercase tracking-[0.3em] text-primary">OpenClaw</p>
            <h2 className="text-3xl md:text-4xl font-semibold">{title}</h2>
            <p className="text-lg text-white/80">{description}</p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="mailto:openclaw@atomx.top"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-gray-900 font-semibold"
              >
                {t.primaryCta}
              </Link>
            </div>
          </div>
          <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[var(--tenant-primary)]/30 to-transparent pointer-events-none" />
        </div>
      </div>
    </section>
  );
}
