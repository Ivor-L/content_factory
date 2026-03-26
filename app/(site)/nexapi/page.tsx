'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Sparkles,
  Activity,
  Globe,
  Gauge,
  Workflow,
  Headphones,
  Cpu,
} from 'lucide-react';

import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';
import { useTenantPath } from '@/hooks/useTenant';

import styles from './NexApiPage.module.css';

const copy = {
  en: {
    hero: {
      eyebrow: 'Unified API Infra',
      title: 'Meet NexAPI',
      description:
        'One gateway for credits, model routing, and observability. Build on NexTide’s model stack with official pricing comparisons baked in.',
      primary: 'Open API Console',
      secondary: 'Explore Model Plaza',
    },
    highlights: [
      { title: 'Credits-first billing', description: '1 RMB = 100 credits with official price references.' },
      { title: 'Multi-route resiliency', description: 'Switch between main, CDN, or CN points with a header override.' },
      { title: 'Observability hooks', description: 'Usage logs, response time, and token splits for downstream BI.' },
    ],
    valueProps: [
      {
        title: 'One API for Any Model',
        description: 'Access GPT-4.1, Claude, Gemini, Yi, Qwen, and video/image models through a single surface.',
        action: 'Browse catalog',
      },
      {
        title: 'Higher Availability',
        description: 'Dual-region routing with health checks so requests fall back automatically.',
        action: 'See live status',
      },
      {
        title: 'Price & Performance',
        description: 'Official provider price displayed next to NexAPI credits for instant benchmarking.',
        action: 'Check rate card',
      },
      {
        title: 'Data Control',
        description: 'Custom headers, key-level IP binding, and tenant-level audit trails.',
        action: 'Review policy',
      },
    ],
    cards: [
      {
        title: 'API Console',
        description:
          'Create/rotate NexAPI keys, monitor credit consumption, download invoices, and trigger webhook alerts in one panel.',
        features: ['Multi-key rotation', 'Usage timeline', 'Alipay recharge'],
      },
      {
        title: 'Model Plaza',
        description:
          'Search every model exposed by NexTide, review latency per route, compare pricing, and copy ready-made payloads.',
        features: ['Cross-provider catalog', 'Realtime route status', 'Apifox-free quickstart'],
      },
    ],
    galleryTitle: 'Model Launchpad',
    galleryDescription: 'Pick from our most requested video, image, and reasoning routes with official vs NexAPI pricing.',
    modelGallery: [
      {
        title: 'Kling O3',
        subtitle: 'Image to Video [Pro]',
        description: 'Cinematic motion, webhook polling, CN-friendly route.',
        price: { official: '¥1.20', nexapi: '¥0.80' },
        accent: 'linear-gradient(135deg, #111a2c 0%, #2a3b63 60%, #1d2a46 100%)',
      },
      {
        title: 'Nano Banana 2',
        subtitle: 'Video Diffusion',
        description: 'Fast surreal visuals for consumer storytelling.',
        price: { official: '¥0.50', nexapi: '¥0.35' },
        accent: 'linear-gradient(135deg, #1f4736 0%, #3d7255 60%, #1b2f2a 100%)',
      },
      {
        title: 'Veo 3 Fast',
        subtitle: 'Realtime Preview',
        description: '8 frames per credit with instant status polling.',
        price: { official: '¥0.30', nexapi: '¥0.20' },
        accent: 'linear-gradient(135deg, #1a2851 0%, #294f99 65%, #1b2b55 100%)',
      },
      {
        title: 'GPT-4.1 Routes',
        subtitle: 'Reasoning / Function Calling',
        description: 'Multi-provider fallbacks with CN-safe routing.',
        price: { official: '¥20 / 1K', nexapi: '¥15 / 1K' },
        accent: 'linear-gradient(135deg, #3a1b3d 0%, #6d2a6f 65%, #2c1831 100%)',
      },
    ],
    reasonsTitle: 'Why teams choose NexAPI',
    reasonsDescription: 'Mirrors NexTide’s main site language: calm gradients, serif hero, and clear operator messaging.',
    reasons: [
      { title: 'Global routing', description: 'Main, CDN, and CN endpoints behind one header flag.', icon: 'globe' },
      { title: 'Transparent credits', description: '1 RMB = 100 credits with official vs NexAPI price side-by-side.', icon: 'gauge' },
      { title: 'Data & IP control', description: 'Per-key IP binding plus audit-ready logs.', icon: 'shield' },
      { title: 'Fine-grained webhooks', description: 'Usage + recharge events for each tenant workspace.', icon: 'workflow' },
      { title: 'Realtime support', description: 'Ops inbox + email login unified for NexTide products.', icon: 'headphones' },
      { title: 'Model observability', description: 'Latency, health, and upstream failovers surfaced every 60 s.', icon: 'cpu' },
    ],
    checklistTitle: 'Built for operators',
    checklist: [
      'Single login across NexTide products',
      'Per-key quota guardrails & labels',
      'Webhook-ready billing events',
      'Workspace / tenant level reporting',
    ],
  },
  zh: {
    hero: {
      eyebrow: '统一的模型接入层',
      title: 'NexAPI 中枢',
      description: '一个入口管理积分、线路和模型。展示官方价对比，帮你明确成本优势。',
      primary: '进入 API 控制台',
      secondary: '查看模型广场',
    },
    highlights: [
      { title: '积分结算', description: '1 元 = 100 积分，并展示官方价对比。' },
      { title: '多线路容灾', description: '通过 Header 即可切换主站 / CDN / 国内线路。' },
      { title: '可观测能力', description: '用量日志、响应时延、token 统计可直接接入 BI。' },
    ],
    valueProps: [
      {
        title: '一键连通主流模型',
        description: 'GPT-4.1、Claude、Gemini、Yi、Kling、Veo 等全部通过统一接口调用。',
        action: '查看目录',
      },
      {
        title: '更稳的线路',
        description: '双区域健康检查，故障自动切回备用线路。',
        action: '查看状态',
      },
      {
        title: '价格透明',
        description: '所有模型都提供官方价 vs NexAPI 价格，方便一眼比较。',
        action: '获取价卡',
      },
      {
        title: '数据治理',
        description: '自定义 Header、IP 绑定、租户级审计日志保障安全。',
        action: '阅读策略',
      },
    ],
    cards: [
      {
        title: 'API 控制台',
        description: '生成/吊销密钥、查看积分余额、下载账单、配置告警，开发者和运营都能直接使用。',
        features: ['多密钥管理', '用量时间轴', '支付宝充值通道'],
      },
      {
        title: '模型广场',
        description: '统一搜索全部可用模型，查看线路延迟、价格与示例参数，一键复制配置。',
        features: ['跨供应商目录', '线路实时状态', '无需 Apifox 也能调试'],
      },
    ],
    galleryTitle: '模型快速上架',
    galleryDescription: '热门视频/图像/推理模型卡片直接显示官方价与 NexAPI 价差。',
    modelGallery: [
      {
        title: 'Kling O3 Pro',
        subtitle: '图生视频',
        description: '电影感镜头 + Webhook 轮询，适配国内线路。',
        price: { official: '¥1.20', nexapi: '¥0.80' },
        accent: 'linear-gradient(135deg, #111a2c 0%, #2a3b63 60%, #1d2a46 100%)',
      },
      {
        title: 'Nano Banana 2',
        subtitle: '视频扩散',
        description: '适合消费级创意的超现实风格，速度快。',
        price: { official: '¥0.50', nexapi: '¥0.35' },
        accent: 'linear-gradient(135deg, #1f4736 0%, #3d7255 60%, #1b2f2a 100%)',
      },
      {
        title: 'Veo 3 Fast',
        subtitle: '实时预览',
        description: '1 积分输出 8 帧，随时查看进度。',
        price: { official: '¥0.30', nexapi: '¥0.20' },
        accent: 'linear-gradient(135deg, #1a2851 0%, #294f99 65%, #1b2b55 100%)',
      },
      {
        title: 'GPT-4.1 路线',
        subtitle: '推理 / 函数调用',
        description: '多上游冗余，Header 一键切换国内线路。',
        price: { official: '¥20 / 1K', nexapi: '¥15 / 1K' },
        accent: 'linear-gradient(135deg, #3a1b3d 0%, #6d2a6f 65%, #2c1831 100%)',
      },
    ],
    reasonsTitle: '为什么选择 NexAPI',
    reasonsDescription: '用和官网一致的设计语言呈现线路、价格、支持策略。',
    reasons: [
      { title: '全球多线路', description: '主站 / CDN / 国内通过一个 Header 切换。', icon: 'globe' },
      { title: '积分透明', description: '1 元 = 100 积分，同时展示官方价与 NexAPI 价差。', icon: 'gauge' },
      { title: '数据合规', description: '单 key IP 绑定与审计日志即开即用。', icon: 'shield' },
      { title: 'Webhook 细粒度', description: '扣费、充值、任务状态都能推送。', icon: 'workflow' },
      { title: '实时支持', description: '同一个邮箱登录即可提交 NexTide 工单。', icon: 'headphones' },
      { title: '可观测能力', description: '每 60s 更新延迟、健康与容灾状态。', icon: 'cpu' },
    ],
    checklistTitle: '为运营而生',
    checklist: ['账户统一登录', '单 key 限额与标签', '扣费事件可订阅', '团队/租户分级报表'],
  },
};

const iconMap = {
  globe: Globe,
  gauge: Gauge,
  shield: ShieldCheck,
  workflow: Workflow,
  headphones: Headphones,
  cpu: Cpu,
};

const UPSTREAM_PATH = '/v1/chat/completions';

export default function NexApiSitePage() {
  const [lang, setLang] = useState<'en' | 'zh'>('en');
  const [mounted, setMounted] = useState(false);
  const consolePath = useTenantPath('/nexapi/console');
  const modelsPath = useTenantPath('/nexapi/models');

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const userLang = navigator.language.startsWith('zh') ? 'zh' : 'en';
      setLang(userLang);
    }
  }, []);

  if (!mounted) return null;

  const t = copy[lang];

  return (
    <div className={styles.page}>
      <SiteHeader lang={lang} setLang={setLang} />
      <main className={styles.main}>
        <section className={styles.hero} id="hero">
          <div className={styles.heroInner}>
            <div>
              <span className={styles.heroEyebrow}>{t.hero.eyebrow}</span>
              <h1 className={styles.heroTitle}>{t.hero.title}</h1>
              <p className={styles.heroDescription}>{t.hero.description}</p>
              <div className={styles.heroActions}>
                <Link href={consolePath} className={styles.primaryButton}>
                  {t.hero.primary}
                  <ArrowRight size={16} style={{ marginLeft: 8 }} />
                </Link>
                <Link href={modelsPath} className={styles.secondaryButton}>
                  {t.hero.secondary}
                </Link>
              </div>
            </div>
            <div className={styles.heroHighlights}>
              {t.highlights.map((item) => (
                <div key={item.title} className={styles.heroHighlight}>
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.gridSection}>
          <div className={styles.gridTitle}>
            <span className={styles.gridEyebrow}>{lang === 'en' ? 'Value' : '价值'}</span>
            <h2>{lang === 'en' ? 'What NexAPI adds on top' : 'NexAPI 带来的增益'}</h2>
          </div>
          <div className={styles.valueGrid}>
            {t.valueProps.map((value) => (
              <div key={value.title} className={styles.valueCard}>
                <h3>{value.title}</h3>
                <p>{value.description}</p>
                <div className={styles.valueAction}>{value.action}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.gridSection} id="director">
          <div className={styles.featureSplit}>
            {t.cards.map((card) => (
              <div key={card.title} className={styles.featureCard}>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <ul className={styles.featureList}>
                  {card.features.map((feature) => (
                    <li key={feature}>
                      <span className={styles.tag}>
                        <Zap size={12} />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.gridSection} id="workflow">
          <div className={styles.gridTitle}>
            <span className={styles.gridEyebrow}>{t.galleryTitle}</span>
            <p>{t.galleryDescription}</p>
          </div>
          <div className={styles.galleryGrid}>
            {t.modelGallery.map((card) => (
              <div key={card.title} className={styles.galleryCard} style={{ background: card.accent }}>
                <p className={styles.gridEyebrow}>{card.subtitle}</p>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <div className={styles.priceCompare}>
                  <div className={styles.priceCompareRow}>
                    <span>Official</span>
                    <span>NexAPI</span>
                  </div>
                  <div className={styles.priceCompareValue}>
                    <span>{card.price.official}</span>
                    <span>{card.price.nexapi}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.gridSection} id="templates">
          <div className={styles.gridTitle}>
            <span className={styles.gridEyebrow}>{t.reasonsTitle}</span>
            <p>{t.reasonsDescription}</p>
          </div>
          <div className={styles.reasonGrid}>
            {t.reasons.map((reason) => {
              const Icon = iconMap[reason.icon as keyof typeof iconMap] ?? Sparkles;
              return (
                <div key={reason.title} className={styles.reasonCard}>
                  <Icon className="h-6 w-6 text-[#2d63f1]" />
                  <h3>{reason.title}</h3>
                  <p>{reason.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.gridSection} id="pricing">
          <div className={styles.statusSplit}>
            <div className={styles.statusCard}>
              <p className={styles.gridEyebrow}>{t.checklistTitle}</p>
              <h3>{lang === 'en' ? 'Designed for ops, loved by engineers' : '让运营放心、开发爱用的 API 平台'}</h3>
              <ul className={styles.featureList}>
                {t.checklist.map((item) => (
                  <li key={item}>
                    <span className={styles.tag}>
                      <ShieldCheck size={12} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.statusCard}>
              <div className="flex items-center gap-3">
                <Activity />
                <div>
                  <p className={styles.gridEyebrow}>
                    {lang === 'en' ? 'Realtime route status' : '线路实时状态'}
                  </p>
                  <h3>99.95% uptime</h3>
                </div>
              </div>
              <p style={{ marginTop: 16, color: '#4f5566', lineHeight: 1.7 }}>
                {lang === 'en'
                  ? 'Monitor latency and failover per route directly inside the console. Override routes via the `X-NexAPI-Route` header whenever you need to stick to CN-only traffic.'
                  : '控制台内可直接查看每条线路的延迟与容灾状态，必要时通过 `X-NexAPI-Route` 头部切换到国内线路，保障任务稳定。'}
              </p>
              <div className={styles.codePanel}>
                <div>POST {UPSTREAM_PATH}</div>
                <div style={{ marginTop: 8 }}>X-NexAPI-Route: aiapi.nextide.top</div>
                <div style={{ marginTop: 8 }}>
                  {lang === 'en' ? '# Force CDN/CN routes per request' : '# 针对单次请求强制指定线路'}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter lang={lang} />
    </div>
  );
}
