'use client';

import { Download as DownloadIcon, Github, Mail } from 'lucide-react';

import { siteContent } from '../content';

interface DownloadProps {
  lang: 'en' | 'zh';
}

export function Download({ lang }: DownloadProps) {
  const t = siteContent[lang].download;

  return (
    <section
      id="download"
      className="relative overflow-hidden bg-gradient-to-tr from-[#0b0d18] via-[#10142a] to-[#050910] py-24 text-white scroll-mt-32"
    >
      <div className="absolute inset-0 -z-10 opacity-40">
        <div className="absolute left-12 top-8 h-52 w-52 rounded-full bg-[var(--tenant-primary)]/35 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-56 w-56 rounded-full bg-[var(--tenant-primary-strong)]/30 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.title}</h2>
            <p className="mt-4 max-w-2xl text-lg text-white/70">{t.description}</p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <button
                type="button"
                className="btn-openclaw inline-flex items-center gap-3 px-6 py-3 text-sm font-semibold"
              >
                <DownloadIcon size={18} />
                {t.mac}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-3 rounded-2xl border border-[var(--tenant-primary)]/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20"
              >
                <DownloadIcon size={18} />
                {t.windows}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-3 rounded-2xl border border-[var(--tenant-primary)]/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20"
              >
                <Github size={18} />
                {t.github}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--tenant-primary)]/25 bg-white/5 p-8 backdrop-blur">
            <h3 className="text-lg font-semibold text-white/80">
              {lang === 'en' ? 'Need a private deployment?' : '需要私有化部署？'}
            </h3>
            <p className="mt-3 text-sm text-white/60">{t.contact}</p>

            <div className="mt-6 space-y-4 text-sm text-white/70">
              <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
                <Mail size={16} className="text-white/60" />
                <span>enterprise@polywhale.ai</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-xs uppercase tracking-[0.3em] text-white/40">
                {lang === 'en'
                  ? 'Enterprise SSO • Dedicated render nodes • Custom model routing'
                  : '企业级 SSO • 专属渲染节点 • 自定义模型路由'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
