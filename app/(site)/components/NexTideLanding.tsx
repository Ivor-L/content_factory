'use client';

import { useEffect, useRef } from 'react';
import { ArrowUpRight, Bot, Clapperboard, Film, Layers, Radar, Sparkles, Workflow } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import styles from './NexTideLanding.module.css';

interface NexTideLandingProps {
  lang: 'en' | 'zh';
}

const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_DASHBOARD_URL?.trim() || 'https://atomx.top/dashboard';

const copy = {
  en: {
    heroTag: 'NEXWAVE STACK',
    heroTitle: ['NexTide', 'Builds Revenue', 'Ready Campaigns'],
    heroDescription:
      'From insight mining and script generation to storyboard, digital humans, and final render, NexTide keeps your growth pipeline in one synchronized system.',
    ctaPrimary: 'Open Dashboard',
    ctaSecondary: 'Enter OpenClaw',
    metrics: [
      { value: '12m', label: 'Assets rendered / month' },
      { value: '47%', label: 'Average cycle reduction' },
      { value: '34', label: 'Automated workflow nodes' },
    ],
    panelTitle: 'Live Ops Matrix',
    panelRows: [
      ['Creative Tasks', 'Running'],
      ['Storyboard Render', 'Ready'],
      ['Digital Human', 'In Queue'],
      ['Webhook Sync', 'Stable'],
    ],
    capabilitiesTitle: 'System Capabilities',
    capabilitiesSubtitle:
      'Everything your current system can do, repackaged as a clear, enterprise-grade product story for NexTide.',
    capabilities: [
      {
        title: 'AI Content Pipeline',
        description:
          'Turn a business brief into structured diagnostics, topic exploration, writing strategy, and final publish-ready copy.',
        icon: Sparkles,
      },
      {
        title: 'Viral Replication Engine',
        description:
          'Deconstruct winning videos into shots, script logic, and timeline plans, then regenerate reusable campaign variants.',
        icon: Film,
      },
      {
        title: 'Storyboard Command Center',
        description:
          'Build shot-by-shot layouts, prompt image generation, and stitch timeline status into one visual production board.',
        icon: Clapperboard,
      },
      {
        title: 'Digital Human Studio',
        description:
          'Generate presenter scripts, call external render workflows, and track production confirmations in one process.',
        icon: Bot,
      },
      {
        title: 'Asset Intelligence Library',
        description:
          'Upload history docs, brand stories, and style references with automatic analysis and reusable creative memory.',
        icon: Layers,
      },
      {
        title: 'Automation Fabric',
        description:
          'Connect n8n/webhook callbacks, queue workers, and status pipelines for reliable multi-step delivery.',
        icon: Radar,
      },
    ],
    workflowTitle: 'How NexTide Operates',
    workflow: [
      {
        id: '01',
        title: 'Ingest',
        text: 'Import product docs, references, and objective constraints.',
      },
      {
        id: '02',
        title: 'Orchestrate',
        text: 'AI agents draft scripts, build prompts, and route model tasks.',
      },
      {
        id: '03',
        title: 'Visualize',
        text: 'Storyboard and image layers are generated with review checkpoints.',
      },
      {
        id: '04',
        title: 'Produce',
        text: 'Digital human + replication engines assemble campaign-ready videos.',
      },
      {
        id: '05',
        title: 'Optimize',
        text: 'Task summaries and feedback loops guide the next launch cycle.',
      },
    ],
    templateTitle: 'Launch Tracks',
    templateCards: [
      {
        title: 'Cross-Border Product Push',
        desc: 'Multilingual scripts + localized spokesperson + channel-specific shot pacing.',
      },
      {
        title: 'Viral Clone Sprint',
        desc: 'From competitor reference to reusable creative package in one production lane.',
      },
      {
        title: 'Digital Human Campaigns',
        desc: 'Generate, confirm, and publish recurring avatar-led content with governance controls.',
      },
    ],
    pricingTitle: 'NexTide Deployment Modes',
    pricing: [
      {
        plan: 'Team',
        price: '$149',
        unit: '/month',
        points: ['Core workspace', 'Script + storyboard', 'Standard webhook routes'],
      },
      {
        plan: 'Growth',
        price: '$599',
        unit: '/month',
        featured: true,
        points: ['Multi-tenant setup', 'Digital human workflows', 'Asset intelligence library'],
      },
      {
        plan: 'Enterprise',
        price: 'Custom',
        unit: '',
        points: ['Private deployment', 'Custom model routing', 'Security & SLA package'],
      },
    ],
    resourcesTitle: 'Integrate NexTide Into Your Stack',
    resourcesText:
      'Use the dashboard for operators and OpenClaw for partner channels. Keep your existing backend while presenting a stronger, clearer official site.',
    resources: ['Dashboard login domain: atomx.top', 'OpenClaw channel page preserved', 'Cloudflare-ready site-only deployment'],
    finalCta: 'Go To NexTide Console',
    miniNav: ['Overview', 'Capabilities', 'Workflow', 'Tracks', 'Plans', 'Integrations'],
  },
  zh: {
    heroTag: 'NEXWAVE 引擎栈',
    heroTitle: ['NexTide', '把创意流程变成', '可规模化产能'],
    heroDescription:
      '从洞察挖掘、脚本生成到分镜、数字人、最终成片，NexTide 将你的增长链路统一在一套可协同、可追踪、可复用的系统里。',
    ctaPrimary: '打开工作台',
    ctaSecondary: '进入 OpenClaw',
    metrics: [
      { value: '12m', label: '月度素材产出' },
      { value: '47%', label: '平均周期缩短' },
      { value: '34', label: '自动化流程节点' },
    ],
    panelTitle: '实时运行矩阵',
    panelRows: [
      ['内容创作任务', '运行中'],
      ['分镜渲染', '已就绪'],
      ['数字人任务', '排队中'],
      ['Webhook 回调', '稳定'],
    ],
    capabilitiesTitle: '系统能力地图',
    capabilitiesSubtitle: '基于你现有系统功能，重构为更清晰、更科技、更适合 NexTide 官网表达的一体化产品叙事。',
    capabilities: [
      {
        title: 'AI 内容创作流水线',
        description: '把业务需求自动转为诊断、选题、写作策略与终稿，形成标准化内容产线。',
        icon: Sparkles,
      },
      {
        title: '爆款复刻引擎',
        description: '拆解爆款视频的镜头逻辑与脚本结构，快速生成可复用的多版本素材。',
        icon: Film,
      },
      {
        title: '分镜指挥中枢',
        description: '统一管理镜头分解、文生图提示词、时间线状态与审核节点。',
        icon: Clapperboard,
      },
      {
        title: '数字人生产工作室',
        description: '从脚本到生成回调再到确认发布，打通数字人任务全流程。',
        icon: Bot,
      },
      {
        title: '素材智能库',
        description: '历史文案、案例资产、风格素材上传后自动解析并沉淀为可复用知识。',
        icon: Layers,
      },
      {
        title: '自动化编排底座',
        description: '接入 n8n / webhook / 队列 worker，保障多阶段任务稳定交付。',
        icon: Radar,
      },
    ],
    workflowTitle: 'NexTide 如何运行',
    workflow: [
      {
        id: '01',
        title: '输入',
        text: '导入产品资料、历史素材与增长目标。',
      },
      {
        id: '02',
        title: '编排',
        text: '多智能体自动生成脚本与提示词，并调度模型任务。',
      },
      {
        id: '03',
        title: '可视化',
        text: '分镜与图像结果实时回写，支持过程复盘与审核。',
      },
      {
        id: '04',
        title: '产出',
        text: '数字人与复刻引擎协同生成可投放视频内容。',
      },
      {
        id: '05',
        title: '优化',
        text: '通过任务摘要与反馈闭环迭代下一轮营销策略。',
      },
    ],
    templateTitle: '增长场景模版',
    templateCards: [
      {
        title: '跨境产品投放',
        desc: '多语言脚本 + 本地化人设 + 渠道级镜头节奏，一键成片。',
      },
      {
        title: '爆款复刻冲刺',
        desc: '从参考链接到可复用创意包，快速形成规模化复制能力。',
      },
      {
        title: '数字人持续运营',
        desc: '稳定生成主持人口播内容，支持流程确认与权限治理。',
      },
    ],
    pricingTitle: 'NexTide 部署模式',
    pricing: [
      {
        plan: '团队版',
        price: '¥999',
        unit: '/月',
        points: ['核心工作台', '脚本+分镜能力', '标准 webhook 编排'],
      },
      {
        plan: '增长版',
        price: '¥3999',
        unit: '/月',
        featured: true,
        points: ['多租户空间', '数字人任务链路', '素材智能库'],
      },
      {
        plan: '企业版',
        price: '定制',
        unit: '',
        points: ['私有化部署', '模型路由定制', '安全与 SLA 保障'],
      },
    ],
    resourcesTitle: '接入你的增长系统',
    resourcesText:
      '运营团队通过 Dashboard 管理生产，合作渠道继续使用 OpenClaw。既保留现有后端能力，也让官网表达更统一。',
    resources: ['登录域名：atomx.top', 'OpenClaw 页面保持保留', '支持 Cloudflare 官网独立部署'],
    finalCta: '进入 NexTide 控制台',
    miniNav: ['总览', '能力', '流程', '场景', '方案', '接入'],
  },
} as const;

function initParallax(root: HTMLElement) {
  const layers = Array.from(root.querySelectorAll<HTMLElement>('[data-parallax-speed]'));
  layers.forEach((layer) => {
    const speed = Number(layer.dataset.parallaxSpeed ?? 0.8);
    gsap.to(layer, {
      y: () => window.innerHeight * (speed - 1) * -0.35,
      ease: 'none',
      scrollTrigger: {
        trigger: root,
        start: 'top top',
        end: 'bottom bottom',
        scrub: speed,
      },
    });
  });
}

function initHeroEntrance(root: HTMLElement) {
  gsap.from(root.querySelectorAll('[data-hero-item]'), {
    y: 32,
    opacity: 0,
    filter: 'blur(6px)',
    duration: 0.9,
    ease: 'power3.out',
    stagger: 0.12,
    clearProps: 'filter',
  });
}

function initLineReveal(root: HTMLElement) {
  const headings = root.querySelectorAll('[data-line-reveal]');
  headings.forEach((heading) => {
    const lines = heading.querySelectorAll('.line-inner');
    gsap.from(lines, {
      y: '112%',
      duration: 0.85,
      ease: 'expo.out',
      stagger: 0.08,
      scrollTrigger: {
        trigger: heading,
        start: 'top 82%',
        toggleActions: 'play none none none',
      },
    });
  });
}

function initWorkflowStepThrough(root: HTMLElement) {
  const wrapper = root.querySelector<HTMLElement>('[data-workflow-wrapper]');
  const steps = Array.from(root.querySelectorAll<HTMLElement>('[data-workflow-step]'));
  if (!wrapper || steps.length === 0) return;

  ScrollTrigger.create({
    trigger: wrapper,
    start: 'top 32%',
    end: 'bottom 72%',
    onUpdate(self) {
      const idx = Math.min(Math.floor(self.progress * steps.length), steps.length - 1);
      steps.forEach((step, i) => step.classList.toggle(styles.activeStep, i === idx));
    },
  });
}

function initHeadingReveal(root: HTMLElement) {
  gsap.utils.toArray<HTMLElement>('[data-section-title]', root).forEach((item) => {
    gsap.from(item, {
      y: 26,
      opacity: 0,
      duration: 0.7,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: item,
        start: 'top 82%',
      },
    });
  });
}

function initMagneticPill(root: HTMLElement) {
  const pill = root.querySelector<HTMLElement>('[data-magnetic-pill]');
  if (!pill) return;
  const radius = 120;
  const strength = 0.28;

  const onMove = (event: MouseEvent) => {
    const rect = pill.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist < radius) {
      const pull = 1 - dist / radius;
      gsap.to(pill, {
        x: dx * pull * strength,
        y: dy * pull * strength,
        duration: 0.4,
        ease: 'power2.out',
      });
      return;
    }

    gsap.to(pill, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.5)' });
  };

  document.addEventListener('mousemove', onMove);
  ScrollTrigger.addEventListener('refreshInit', () => {
    gsap.set(pill, { x: 0, y: 0 });
  });

  return () => {
    document.removeEventListener('mousemove', onMove);
  };
}

export function NexTideLanding({ lang }: NexTideLandingProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const t = copy[lang];

  useEffect(() => {
    if (!rootRef.current) return;
    gsap.registerPlugin(ScrollTrigger);
    const root = rootRef.current;
    const detachMagnetic = initMagneticPill(root);

    const ctx = gsap.context(() => {
      initHeroEntrance(root);
      initParallax(root);
      initLineReveal(root);
      initHeadingReveal(root);
      initWorkflowStepThrough(root);
    }, root);

    return () => {
      detachMagnetic?.();
      ctx.revert();
    };
  }, [lang]);

  return (
    <div ref={rootRef} className={`${styles.landing} ${styles.textureParis} ${styles.textureNoiseOverlay}`}>
      <section id="hero" className={`${styles.hero} ${styles.clipDiagonalBr}`}>
        <div className={styles.heroGlowBack} data-parallax-speed="0.58" />
        <div className={styles.heroMist} data-parallax-speed="0.9" />
        <div className={styles.heroGlowFront} data-parallax-speed="1.2" />

        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <span className={styles.eyebrow} data-hero-item>
              {t.heroTag}
            </span>
            <h1 className={styles.heroTitle} data-hero-item data-line-reveal>
              {t.heroTitle.map((line) => (
                <span className={styles.lineWrap} key={line}>
                  <span className="line-inner">{line}</span>
                </span>
              ))}
            </h1>
            <p className={styles.heroDescription} data-hero-item>
              {t.heroDescription}
            </p>

            <div className={styles.heroActions} data-hero-item>
              <a href={DASHBOARD_URL} target="_blank" rel="noopener noreferrer" className={styles.ctaPrimary}>
                {t.ctaPrimary}
                <ArrowUpRight size={18} />
              </a>
              <a href="/openclaw" className={styles.ctaSecondary}>
                {t.ctaSecondary}
              </a>
            </div>

            <div className={styles.metricGrid} data-hero-item>
              {t.metrics.map((metric) => (
                <div className={styles.metricCard} key={metric.label}>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.heroPanel} data-hero-item>
            <div className={styles.panelHead}>
              <span>{t.panelTitle}</span>
              <Workflow size={16} />
            </div>
            <div className={styles.panelRows}>
              {t.panelRows.map(([label, state]) => (
                <div className={styles.panelRow} key={label}>
                  <span>{label}</span>
                  <em>{state}</em>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="director" className={`${styles.section} ${styles.clipParallelogram} ${styles.systemSection}`}>
        <div className={styles.sectionHead}>
          <h2 data-section-title>{t.capabilitiesTitle}</h2>
          <p>{t.capabilitiesSubtitle}</p>
        </div>
        <div className={styles.capabilityGrid}>
          {t.capabilities.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className={styles.capabilityCard}>
                <div className={styles.capabilityIcon}>
                  <Icon size={18} />
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="workflow" className={`${styles.section} ${styles.clipDiagonalBl} ${styles.workflowSection}`}>
        <div className={styles.sectionHead}>
          <h2 data-section-title>{t.workflowTitle}</h2>
        </div>
        <div className={styles.workflowGrid} data-workflow-wrapper>
          {t.workflow.map((step) => (
            <article key={step.id} className={styles.workflowCard} data-workflow-step>
              <span>{step.id}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="templates" className={`${styles.section} ${styles.clipParallelogram} ${styles.trackSection}`}>
        <div className={styles.sectionHead}>
          <h2 data-section-title>{t.templateTitle}</h2>
        </div>
        <div className={styles.trackGrid}>
          {t.templateCards.map((card) => (
            <article key={card.title} className={styles.trackCard}>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className={`${styles.section} ${styles.clipDiagonalBr} ${styles.pricingSection}`}>
        <div className={styles.sectionHead}>
          <h2 data-section-title>{t.pricingTitle}</h2>
        </div>
        <div className={styles.pricingGrid}>
          {t.pricing.map((plan) => (
            <article
              key={plan.plan}
              className={`${styles.pricingCard} ${'featured' in plan && plan.featured ? styles.featuredPlan : ''}`}
            >
              <h3>{plan.plan}</h3>
              <div className={styles.priceLine}>
                <strong>{plan.price}</strong>
                <span>{plan.unit}</span>
              </div>
              <ul>
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="download" className={`${styles.section} ${styles.resourceSection}`}>
        <div className={styles.sectionHead}>
          <h2 data-section-title>{t.resourcesTitle}</h2>
          <p>{t.resourcesText}</p>
        </div>
        <div className={styles.resourceGrid}>
          <ul>
            {t.resources.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <a href={DASHBOARD_URL} target="_blank" rel="noopener noreferrer" className={styles.resourceCta}>
            {t.finalCta}
            <ArrowUpRight size={16} />
          </a>
        </div>
      </section>

      <nav className={styles.miniNav} data-magnetic-pill>
        <a href="#hero">{t.miniNav[0]}</a>
        <a href="#director">{t.miniNav[1]}</a>
        <a href="#workflow">{t.miniNav[2]}</a>
        <a href="#templates">{t.miniNav[3]}</a>
        <a href="#pricing">{t.miniNav[4]}</a>
        <a href="#download">{t.miniNav[5]}</a>
      </nav>
    </div>
  );
}
