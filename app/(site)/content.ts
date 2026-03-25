export const siteContent = {
  en: {
    nav: {
      hero: "Overview",
      director: "AI Campaigns",
      workflow: "Workflow",
      templates: "Templates",
      pricing: "Pricing",
      download: "Resources",
      dashboard: "Launch Console",
      login: "Login",
      openclaw: "Agency Portal"
    },
    promoBanner: {
      title: "Spring Launch Credits",
      message: "Top up 50k credits before April 30 and get 20% bonus usage for campaign clones.",
      cta: "See details"
    },
    hero: {
      eyebrow: "Commerce AI Studio",
      title: "Launch campaign-ready videos in hours",
      subtitle: "Product storytelling, multi-language scripts,\nshoppable edits generated in one place.",
      description:
        "NexTide connects script intelligence, digital humans, and motion replication so growth teams can brief once and deliver region-ready assets the same day.",
      inputPlaceholder: "Describe your SKU, target market, and core offer...",
      primaryCta: "Request Private Beta",
      secondaryCta: "Watch product tour",
      waitlistCta: "Talk to our strategist",
      downloads: {
        mac: "Download capability deck (PDF)",
        windows: "Export sample campaign report",
        github: "API quickstart"
      },
      metrics: [
        { value: "520+", label: "Brands automated" },
        { value: "45%", label: "Faster launch cycles" },
        { value: "6.2x", label: "ROAS uplift in 30 days" }
      ]
    },
    waitingList: {
      title: "Join the private beta",
      description: "Pick the track that matches your team. New tenants are activated every Monday.",
      options: [
        {
          title: "DTC & Marketplace Sellers",
          description: "Automate product videos, how-to demos, and regional promos for a single brand.",
          cta: "Apply in 3 minutes"
        },
        {
          title: "Agencies & Studios",
          description: "Manage multi-brand pipelines with approval stages and per-client analytics.",
          cta: "Book onboarding"
        },
        {
          title: "Enterprise Commerce",
          description: "SOC2-ready deployment, private inferencing, and SKU-level compliance controls.",
          cta: "Schedule strategy review"
        }
      ],
      footer: "Need a quick product tour? Email hello@nextide.ai and we’ll reply within 12 hours."
    },
    director: {
      eyebrow: "Campaign Director Agent",
      titleBefore: "Brief once.",
      titleAfter: "Ship everywhere.",
      description:
        "Drop a selling brief and the agent assembles scripts, shot lists, on-brand digital humans, and voiceovers that stay consistent across every channel.",
      bullets: [
        {
          title: "Creative Intelligence",
          description: "Ingests product docs, reviews, and brand voice to build context-aware scripts."
        },
        {
          title: "Digital Human Library",
          description: "Matches the right spokesperson, adjusts outfits, and localizes delivery per market."
        },
        {
          title: "Automated Finishing",
          description: "Cuts motion, captions, and CTA overlays into ready-to-run vertical and landscape versions."
        }
      ],
      cta: "See the agent workflow"
    },
    seedance: {
      eyebrow: "Render Engine",
      title: "Photoreal ads with SKU-level accuracy",
      description:
        "Our render core keeps packaging, textures, and motion true to your catalog so you can swap colors and scenes without reshooting.",
      bullets: [
        "Model-light pipeline optimized for product reflective surfaces",
        "Identity lock keeps spokesperson, outfit, and styling aligned for multi-episode campaigns",
        "Camera choreography tuned for shoppable placements and social hooks"
      ],
      cta: "Generate a sample shot"
    },
    workflow: {
      title: "Campaign assembly line",
      description: "Every stage is reviewable, versioned, and tied back to performance goals.",
      steps: [
        {
          key: "script",
          title: "Brief & Script",
          description: "Upload SKU data and offers; receive multilingual hooks, scripts, and CTAs."
        },
        {
          key: "role",
          title: "Talent & Assets",
          description: "Select digital humans, styles, and product renders that stay locked per campaign."
        },
        {
          key: "storyboard",
          title: "Storyboard",
          description: "Preview camera moves, transitions, and captions tailored to each channel."
        },
        {
          key: "timeline",
          title: "Timeline",
          description: "Auto-generate vertical and 16:9 cuts, plus variant testing timelines in one click."
        },
        {
          key: "video",
          title: "Launch",
          description: "Publish to TikTok, Meta, and Amazon or export for your ad server with live tracking."
        }
      ]
    },
    templates: {
      title: "Start with battle-tested templates",
      description: "Kick off from proven blueprints and customize in minutes.",
      items: [
        {
          name: "TikTok UGC Remix",
          tag: "UGC",
          description: "Clone a viral format, swap in your SKU, and auto-generate hooks."
        },
        {
          name: "Amazon A+ Video",
          tag: "Retail",
          description: "Turn product detail pages into 45-second explainers with subtitles."
        },
        {
          name: "Product Drop Teaser",
          tag: "Launch",
          description: "Reveal new variants with dynamic packs, lifestyle shots, and countdowns."
        },
        {
          name: "Cross-Border Promo",
          tag: "Localization",
          description: "Generate campaigns in English, Spanish, and Arabic with one-click dubbing."
        },
        {
          name: "Support & Onboarding",
          tag: "Retention",
          description: "Produce animated how-tos and FAQ explainers straight from support docs."
        }
      ]
    },
    features: {
      title: "Why teams choose NexTide",
      subtitle: "An AI-native workspace that speaks commerce.",
      items: [
        {
          title: "Unified creative + data stack",
          description: "Connect catalog feeds, review data, and conversion metrics to inform every output."
        },
        {
          title: "Commerce-ready digital humans",
          description: "Pre-approved avatar library with localized voices, gestures, and compliance guardrails."
        },
        {
          title: "Performance intelligence",
          description: "Variant testing suggestions and live dashboards tie creative experiments to sales."
        }
      ]
    },
    pricing: {
      title: "Plans tailored to your launch velocity",
      subtitle: "Scale from a single brand to enterprise-grade operations with transparent credits.",
      plans: [
        {
          name: "Starter",
          price: "¥299",
          period: "/month",
          headline: "For solo sellers testing AI production",
          popular: false,
          features: [
            "8K monthly credits (≈12 video clones)",
            "2 seats + 1 workspace",
            "Digital human voice pack (3 voices)",
            "Email support within 24 hours"
          ]
        },
        {
          name: "Growth",
          price: "¥1,499",
          period: "/month",
          headline: "Ideal for growing DTC teams and agencies",
          features: [
            "96K monthly credits (≈140 video renders)",
            "8 seats + client workspaces",
            "Localized dubbing in 10 languages",
            "Performance dashboards & A/B testing"
          ],
          popular: true
        },
        {
          name: "Scale",
          price: "¥3,999",
          period: "/month",
          headline: "High-volume commerce operations",
          popular: false,
          features: [
            "260K monthly credits (≈380 renders)",
            "20 seats with role-based access",
            "Custom digital human training",
            "Dedicated success manager"
          ]
        },
        {
          name: "Enterprise",
          price: "Let's talk",
          period: "",
          headline: "Private deployments and compliance-heavy teams",
          popular: false,
          features: [
            "Unlimited seats & SSO",
            "Private model routing & on-prem render nodes",
            "Procurement-ready security pack",
            "99.9% uptime SLA"
          ]
        }
      ],
      cta: "Talk to sales",
      notes: [
        "Credits cover scripts, renders, dubbing, and scene variants. Unused credits roll over for 2 months.",
        "Annual billing saves 15%. Prices exclude VAT where applicable."
      ]
    },
    download: {
      title: "Resources & integrations",
      description:
        "Everything you need to bring NexTide into your stack—no PDF hunting required.",
      mac: "Capability deck (PDF)",
      windows: "Sample data pipeline export",
      github: "Integration & API docs",
      contact: "Need bespoke onboarding? enterprise@nextide.ai"
    },
    footer: {
      about:
        "NexTide builds AI-native creative infrastructure that helps commerce teams launch, iterate, and scale high-performing campaigns.",
      links: ["Terms", "Privacy", "Contact"],
      copyright: "© 2026 NexTide. All rights reserved."
    }
  },
  zh: {
    nav: {
      hero: "首页",
      director: "智能营销",
      workflow: "工作流",
      templates: "模板中心",
      pricing: "价格",
      download: "资源",
      dashboard: "进入工作台",
      login: "登录",
      openclaw: "代理渠道"
    },
    promoBanner: {
      title: "春季积分加赠",
      message: "4 月 30 日前充值 5 万积分，额外赠送 20% 视频复刻额度。",
      cta: "查看详情"
    },
    hero: {
      eyebrow: "跨境营销 AI 工作室",
      title: "几个小时内生成可投放的视频素材",
      subtitle: "产品故事、多语言脚本、可购物剪辑\n一次配置即可自动产出。",
      description:
        "NexTide 将脚本文案、数字人和动作复刻统一在一个工作区，让增长团队一次提报，数小时内完成多地区投放素材。",
      inputPlaceholder: "填写 SKU、目标市场与主打卖点...",
      primaryCta: "申请私测名额",
      secondaryCta: "观看产品演示",
      waitlistCta: "预约策略顾问",
      downloads: {
        mac: "下载能力白皮书",
        windows: "导出示例营销方案",
        github: "API 接入速览"
      },
      metrics: [
        { value: "520+", label: "服务品牌数" },
        { value: "45%", label: "上线效率提升" },
        { value: "6.2x", label: "30 天 ROAS 提升" }
      ]
    },
    waitingList: {
      title: "加入私测计划",
      description: "选择适合您的路线，我们每周一批量开通新租户。",
      options: [
        {
          title: "DTC / 平台卖家",
          description: "自动化产品视频、教程和多地区促销，适合单品牌卖家。",
          cta: "3 分钟完成申请"
        },
        {
          title: "营销机构 / 代运营",
          description: "多品牌多工作区管理，包含审批流与客户分析报表。",
          cta: "预约上线辅导"
        },
        {
          title: "企业级电商团队",
          description: "支持私有化部署、模型管控与合规审计，满足集团需求。",
          cta: "安排策略评估"
        }
      ],
      footer: "需要快速演示？写信至 hello@nextide.ai，我们 12 小时内回复。"
    },
    director: {
      eyebrow: "营销导演智能体",
      titleBefore: "一次提报",
      titleAfter: "多渠道上线",
      description:
        "输入卖点与素材，智能体自动生成脚本、镜头表、数字人以及配音，在不同渠道保持统一风格。",
      bullets: [
        {
          title: "创意智脑",
          description: "理解产品文档、用户评价与品牌语调，输出多语言脚本。"
        },
        {
          title: "数字人资产",
          description: "匹配合适的数字人，自动调整服装与表情，适配目标市场。"
        },
        {
          title: "智能剪辑",
          description: "生成竖屏/横屏版本，自动添加字幕、CTA 和变体测试素材。"
        }
      ],
      cta: "查看完整流程"
    },
    seedance: {
      eyebrow: "渲染引擎",
      title: "忠于真实产品的高质感画面",
      description:
        "保持包装、质感与动作一致，让颜色、场景、优惠活动都能快速更换。",
      bullets: [
        "针对高反射产品优化的轻量级流程",
        "数字人、服装与场景全流程锁定，适合系列化营销",
        "针对购物转化调优的分镜与运镜策略"
      ],
      cta: "生成示例镜头"
    },
    workflow: {
      title: "营销生产流水线",
      description: "每个环节都可审阅、可回滚，并对接效果数据。",
      steps: [
        {
          key: "script",
          title: "脚本提报",
          description: "上传 SKU、活动与优惠，自动生成多语言卖点与脚本。"
        },
        {
          key: "role",
          title: "角色与素材",
          description: "选择数字人、风格与产品渲染，锁定全渠道一致画面。"
        },
        {
          key: "storyboard",
          title: "分镜",
          description: "自动生成镜头与字幕，针对不同渠道调整节奏与 CTA。"
        },
        {
          key: "timeline",
          title: "时间线",
          description: "一键输出竖屏、横屏与测试版本，并生成投放节奏。"
        },
        {
          key: "video",
          title: "上线投放",
          description: "联通 TikTok、Meta、Amazon 或导出广告平台，实时回传数据。"
        }
      ]
    },
    templates: {
      title: "从验证过的模板起步",
      description: "套用成熟蓝图，几分钟就能定制上线素材。",
      items: [
        {
          name: "TikTok UGC Remix",
          tag: "UGC",
          description: "复刻爆款话术与结构，自动替换产品与优惠。"
        },
        {
          name: "Amazon A+ 视频",
          tag: "零售",
          description: "把详情页内容转为 45 秒讲解视频，自带字幕与卖点卡片。"
        },
        {
          name: "新品预热",
          tag: "上新",
          description: "动态展示新款颜色、场景与倒计时，适合新品发布。"
        },
        {
          name: "跨境促销",
          tag: "多语种",
          description: "一次生成中英西阿四语版本，自动配音与字幕。"
        },
        {
          name: "售后与教程",
          tag: "留存",
          description: "根据客服文档生成动画教程与 FAQ 解答视频。"
        }
      ]
    },
    features: {
      title: "为什么选择 NexTide",
      subtitle: "为电商而生的 AI 协同工作台。",
      items: [
        {
          title: "数据与创意一体化",
          description: "连接商品资料、评价与效果数据，让每条内容有据可依。"
        },
        {
          title: "电商数字人矩阵",
          description: "预设多语言数字人、语音与动作，覆盖主流市场合规要求。"
        },
        {
          title: "效果智能分析",
          description: "提供版本测试建议与投放报表，把创意实验与销售结果打通。"
        }
      ]
    },
    pricing: {
      title: "按业务节奏选择方案",
      subtitle: "从单品牌到集团企业，透明积分即可灵活扩容。",
      plans: [
        {
          name: "Starter",
          price: "¥299",
          period: "/月",
          headline: "适合尝试 AI 生产的卖家",
          popular: false,
          features: [
            "每月 8K 积分（约 12 条视频复刻）",
            "2 个席位 + 1 个工作区",
            "内置 3 个数字人语音包",
            "24 小时内邮件支持"
          ]
        },
        {
          name: "Growth",
          price: "¥1,499",
          period: "/月",
          headline: "适合 DTC 团队或机构规模化运营",
          features: [
            "每月 96K 积分（约 140 条视频渲染）",
            "8 个席位 + 客户工作区",
            "支持 10 种语言配音",
            "投放看板与 A/B 测试建议"
          ],
          popular: true
        },
        {
          name: "Scale",
          price: "¥3,999",
          period: "/月",
          headline: "高频内容与大团队协作",
          popular: false,
          features: [
            "每月 260K 积分（约 380 条渲染）",
            "20 个席位与角色权限管理",
            "定制数字人形象训练",
            "专属成功经理"
          ]
        },
        {
          name: "Enterprise",
          price: "联系我们",
          period: "",
          headline: "适合大型或高合规场景",
          popular: false,
          features: [
            "不限席位 + SSO 单点登录",
            "私有模型路由与本地渲染节点",
            "采购安全与合规文档包",
            "99.9% 服务可用 SLA"
          ]
        }
      ],
      cta: "联系销售顾问",
      notes: [
        "积分用于脚本、渲染、配音与变体生成；未使用积分顺延 2 个月。",
        "按年付可享 85 折。以上价格未含增值税。"
      ]
    },
    download: {
      title: "资源与集成",
      description:
        "所需资料全部在这，无需翻文件夹即可快速集成。",
      mac: "下载能力白皮书",
      windows: "获取示例数据管道",
      github: "查看集成与 API 文档",
      contact: "需要定制化部署？enterprise@nextide.ai"
    },
    footer: {
      about: "NexTide 专注于构建 AI 原生创意基础设施，帮助品牌快速上线、迭代与放大营销内容效果。",
      links: ["服务条款", "隐私政策", "联系我们"],
      copyright: "© 2026 NexTide. 保留所有权利。"
    }
  }
} as const;
