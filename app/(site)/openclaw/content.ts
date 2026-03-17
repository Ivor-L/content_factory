export type OpenClawLocale = 'en' | 'zh';

export const openclawContent: Record<OpenClawLocale, {
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    supporting: string;
    audienceCopy: {
      human: string;
      agent: string;
    };
    bullets: string[];
    primaryCta: string;
    secondaryCta: string;
    dataPoints: { label: string; value: string; }[];
  };
  prompt: {
    title: string;
    description: string;
    label: string;
    command: string;
    note: string;
    stepsTitle: string;
    steps: string[];
    copyLabel: string;
    copiedLabel: string;
  };
  capabilities: {
    title: string;
    subtitle: string;
    items: { title: string; description: string; points: string[]; }[];
  };
  timeline: {
    title: string;
    items: { title: string; description: string; badge: string; }[];
  };
  api: {
    title: string;
    description: string;
    snippets: {
      title: string;
      description: string;
      code: string;
    }[];
    footer: string;
  };
  cta: {
    title: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
  };
}> = {
  en: {
    hero: {
      eyebrow: 'For AI Agents',
      title: '{{brand}} + OpenClaw',
      description:
        'Let your AI agent break down winning ads, write scripts, design assets, and ship videos — all through one simple API.',
      supporting:
        'Pair your Lobster brand with {{brand}} and you instantly have an AI content marketing team.',
      audienceCopy: {
        human:
          'Pair your Lobster brand with {{brand}} and your marketers get Creative Tasks, Storyboards, and Replication runs handed to them ready for review.',
        agent:
          'Send your agent into {{brand}} and it learns Creative Tasks, Storyboards, Digital Human shoots, and Replication workflows automatically.',
      },
      bullets: [
        'Agents absorb Product DNA, Creative Task templates, Storyboard timelines, and persona presets stored inside {{brand}}.',
        'They spin up Creative Tasks, Knowledge Videos, and Storyboards on demand, dropping ideas, hooks, and prompts straight into your workspace.',
        'Winning concepts trigger Replication runs, Digital Human takes, and asset uploads so humans only approve and launch.'
      ],
      primaryCta: 'Request OpenClaw Access',
      secondaryCta: 'Chat with a Producer',
      dataPoints: [
        { label: 'Focus modules', value: 'Creative Tasks · Storyboard · Replication' },
        { label: 'Agent setup time', value: '< 10 minutes' },
        { label: 'Outputs per sprint', value: 'Scripts · Carousels · Portrait videos' }
      ]
    },
    prompt: {
      title: 'Send your AI agent to {{brand}}',
      description: 'One instruction unlocks the entire content marketing workflow.',
      label: 'Prompt',
      command:
        'Learn {{skillUrl}} and follow the {{brand}} playbook to dissect viral ads, write channel-ready scripts, create images, and render videos. Always return finished assets, a summary of decisions, and next steps for the human producer.',
      note: 'Swap the Skill URL if you maintain a tenant-specific handbook.',
      stepsTitle: 'How the run works',
      steps: [
        'Paste the prompt into GPT/Claude/other agents.',
        'The agent reads the Skill and understands every rule, asset, and handoff expectation.',
        'It uses your `x-user-api-key` to create briefs, scripts, posts, and videos inside {{brand}}.',
        'You review the outputs in your dashboard while the agent reports progress back to ops.'
      ],
      copyLabel: 'Copy prompt',
      copiedLabel: 'Copied'
    },
    capabilities: {
      title: 'What your agent delivers inside {{brand}}',
      subtitle: 'Value-focused stages that stay on brand and on brief.',
      items: [
        {
          title: 'Learn',
          description: 'Sync every context file before executing inside your tenant.',
          points: [
            'Reads Product DNA, Creative Task templates, and knowledge-video briefs stored in {{brand}}.',
            'Understands Storyboard milestones, KPI targets, and compliance guardrails per channel.',
            'Surfaces must-use claims, personas, and asset libraries before writing.'
          ]
        },
        {
          title: 'Ideate',
          description: 'Turn insights into multi-channel creative plans.',
          points: [
            'Breaks down hits to expose hooks, pacing, and CTA logic inside Creative Tasks.',
            'Drafts scripts, Storyboards, and talking points tailored to each persona.',
            'Suggests experiments with measurement plans directly in the task comment thread.'
          ]
        },
        {
          title: 'Create',
          description: 'Generate finished assets without touching creative software.',
          points: [
            'Writes ready-to-paste copy, captions, subtitles, and carousels inside {{brand}}.',
            'Calls Replication runs and Digital Human shoots to turn scripts into videos.',
            'Packages cover images, thumbnails, and poster prompts aligned with your presets.'
          ]
        },
        {
          title: 'Collaborate',
          description: 'Keep humans in the loop for approvals and launches.',
          points: [
            'Posts status, decisions, and files back into {{brand}} for one-click reviews.',
            'Responds to inline feedback, spins new versions, and compares outputs side by side.',
            'Hands off checklists, channel exports, and next-step recommendations for publishing.'
          ]
        }
      ]
    },
    timeline: {
      title: 'From access to autopilot',
      items: [
        {
          title: '01 · Access & onboarding',
          description: 'We enable OpenClaw for {{brand}}, provision API keys, and plug in your asset + brand kits.',
          badge: 'Access'
        },
        {
          title: '02 · Teach the agent',
          description: 'The agent reads `/openclaw-skill.md`, learns Creative Task rules, and maps Storyboard + Replication guardrails.',
          badge: 'Learn'
        },
        {
          title: '03 · Run campaigns',
          description: 'Agents run Creative Tasks, Storyboards, Knowledge videos, and Replication shots while you monitor progress inside {{brand}}.',
          badge: 'Create'
        },
        {
          title: '04 · Approve & publish',
          description: 'Review deliverables, request tweaks, and post across channels with one-click exports.',
          badge: 'Launch'
        }
      ]
    },
    api: {
      title: 'Agent playbook',
      description: 'Two examples to show how agents collaborate with {{brand}}.',
      snippets: [
        {
          title: 'Brief + script in one call',
          description: 'Spin up a multi-stage creative task so the agent can diagnose, ideate, and ship copy.',
          code: `await fetch('/api/creative-tasks', {
  method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-api-key': ATOMX_API_KEY,
        },
  body: JSON.stringify({
    ideaText: 'Spring Lobster drop needs a 45s TikTok hook',
    channel: 'tiktok',
    targetOutput: 'video-script',
    contentAgency: { persona: 'growth-hacker', tone: 'bold' }
  })
});`
        },
        {
          title: 'Generate assets when ready',
          description: 'Trigger video creation once the agent approves a winning script.',
          code: `curl -X POST https://your-domain.com/api/replication/generate \
  -H 'Content-Type: application/json' \
  -H 'x-user-api-key: $ATOMX_KEY' \
  -d '{
    "productId": "prod_lobster",
    "scriptId": "script_tiktok",
    "targetCountry": "us",
    "targetLanguage": "en",
    "duration": "30",
    "quantity": "1"
  }'`
        }
      ],
      footer: 'Need a different workflow? We can expose any internal automation under the same prompt + API guardrails.'
    },
    cta: {
      title: 'Ready to give your agent a content team badge?',
      description: 'We will customize the Skill, connect your assets, and stay on standby while your AI coworker ships campaign-ready content.',
      primaryCta: 'Request OpenClaw Access',
      secondaryCta: 'Book A Walkthrough'
    }
  },
  zh: {
    hero: {
      eyebrow: '面向智能体',
      title: '{{brand}} + OpenClaw',
      description:
        '让你的 AI 智能体拆解爆款、编写脚本、生成图文、制作视频——全部通过简单的 API 完成。',
      supporting:
        '派遣智能体驻扎 {{brand}}，它会完整掌握品牌技能手册、创意任务、分镜、复刻和数字人工作流。',
      audienceCopy: {
        human: '你的小龙虾加上 {{brand}}，就是一个 AI 内容营销团队：创意任务、分镜与复刻产线一次打通。',
        agent: '派遣智能体驻扎 {{brand}}，它会按技能手册执行创意任务、分镜、复刻与数字人流程。',
      },
      bullets: [
        '智能体将学习你的历史写作风格、学习一线营销专家经验，分镜节奏与人群画像，保证所有产出具备爆款潜质。',
        '随叫随到地产生创意任务、知识视频脚本和分镜，把文案、提示词、镜头脚本直接写进 {{brand}}。',
        '自动拆解爆款、复刻爆款、数字人拍摄与分镜合成，人类只需审核发布。'
      ],
      primaryCta: '申请 OpenClaw 权限',
      secondaryCta: '联系制作人',
      dataPoints: [
        { label: '支撑模块', value: 'Creative Task · Storyboard · Replication' },
        { label: '部署时间', value: '10 分钟内' },
        { label: '典型交付', value: '脚本 · 图文 · 竖屏视频' }
      ]
    },
    prompt: {
      title: '派遣你的 AI 智能体到 {{brand}}',
      description: '只需一条指令，智能体就能学会内容营销所需的全部技能。',
      label: '提示词',
      command:
        '学习 {{skillUrl}} 并遵循 {{brand}} 的操作规范：拆解爆款、生成多渠道脚本、制作图文与短视频，并把成果+复盘要点带回工作台。',
      note: '如果你有租户专属 Skill，可替换上方链接。',
      stepsTitle: '运行步骤',
      steps: [
        '把提示词粘贴到 GPT / Claude / 通义千问等任意智能体。',
        '智能体读取 Skill 文档，掌握品牌语境、流程与交付标准。',
        '它携带 `x-user-api-key` 在 {{brand}} 内创建任务、撰写脚本、生成素材。',
        '你在后台实时查看产出，智能体会同步进度与待办。'
      ],
      copyLabel: '复制提示词',
      copiedLabel: '已复制'
    },
    capabilities: {
      title: '智能体在 {{brand}} 能提供的价值',
      subtitle: '从洞察到素材交付的完整链路。',
      items: [
        {
          title: '学习',
          description: '执行前先把业务语境拉满。',
          points: [
            '读取 Product DNA、Creative Task 模板与知识视频大纲。',
            '理解 Storyboard 里程碑、渠道 KPI 与审核要点。',
            '提前整理必须引用的卖点、persona 与资产库。'
          ]
        },
        {
          title: '策划',
          description: '把洞察变成多渠道动作。',
          points: [
            '拆解历史爆款并写入 Creative Task，复盘钩子/镜头/CTA。',
            '生成脚本、Storyboard、口播提纲，贴合不同 persona。',
            '直接在任务讨论里给出实验假设与追踪指标。'
          ]
        },
        {
          title: '创作',
          description: '无需打开剪辑软件也能交付。',
          points: [
            '在 {{brand}} 内输出文案、字幕、九宫格与长图。',
            '调用 Replication 与数字人拍摄，把脚本变成竖屏/横屏视频。',
            '提供封面、缩略图、海报提示词，保持风格一致。'
          ]
        },
        {
          title: '协作',
          description: '把人类纳入流程，确保可控。',
          points: [
            '在 {{brand}} 内实时回写状态、决策与文件，人类一处查看。',
            '根据反馈快速生成版本，并支持对照比较。',
            '附上上线清单、渠道导出与下一步建议。'
          ]
        }
      ]
    },
    timeline: {
      title: '接入路径',
      items: [
        {
          title: '01 · 开通权限',
          description: '为 {{brand}} 启用 OpenClaw，配置 API Key 与品牌资产库。',
          badge: 'ACCESS'
        },
        {
          title: '02 · 教会智能体',
          description: '让它阅读 `/openclaw-skill.md`，同时绑定 Creative Task、Storyboard、Replication 的守则。',
          badge: 'LEARN'
        },
        {
          title: '03 · 执行任务',
          description: '智能体执行 Creative Task、知识视频、Storyboard 与 Replication，全程都在 {{brand}} 可视化。',
          badge: 'CREATE'
        },
        {
          title: '04 · 审核发布',
          description: '审核成果、提出修改、导出到 TikTok/小红书/抖音等渠道。',
          badge: 'LAUNCH'
        }
      ]
    },
    api: {
      title: '智能体作战手册',
      description: '以下示例展示智能体如何与 {{brand}} 配合。',
      snippets: [
        {
          title: '一键生成策划 + 脚本',
          description: '创建 Creative Task，让智能体先诊断再产出脚本。',
          code: `await fetch('/api/creative-tasks', {
  method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-api-key': ATOMX_API_KEY,
        },
  body: JSON.stringify({
    ideaText: '小龙虾新品需要 45 秒 TikTok 爆款脚本',
    channel: 'tiktok',
    targetOutput: 'video-script',
    contentAgency: { persona: 'brand-guardian', tone: 'friendly' }
  })
});`
        },
        {
          title: '准备好就生成素材',
          description: '脚本确认后，触发视频 / 图文的生成任务。',
          code: `curl -X POST https://your-domain.com/api/replication/generate \
  -H 'Content-Type: application/json' \
  -H 'x-user-api-key: $ATOMX_KEY' \
  -d '{
    "productId": "prod_lobster",
    "scriptId": "script_tiktok",
    "targetCountry": "cn",
    "targetLanguage": "zh",
    "duration": "30",
    "quantity": "1"
  }'`
        }
      ],
      footer: '若需其他流程，我们可把对应自动化统一封装在同一套权限与提示词之下。'
    },
    cta: {
      title: '准备好让智能体当上你的创意总监了吗？',
      description: '我们会定制 Skill、对接资产库，并陪同你的 AI 同事完成首批交付。',
      primaryCta: '申请 OpenClaw 权限',
      secondaryCta: '预约演示'
    }
  }
};
