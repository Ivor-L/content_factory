import {
  creativeStage00System,
  creativeStage01System,
  creativeStage02System,
  creativeStage03System,
  creativeStage04System,
} from "./creative/prompts/baseSystem";

export const creativeStageOrder = [
  "diagnosis",
  "mining",
  "topic",
  "framework",
  "draft",
] as const;

export type CreativeStageKey = (typeof creativeStageOrder)[number];

export const gatingStage: CreativeStageKey = "diagnosis";

export function isGatingStage(stage: CreativeStageKey) {
  return stage === gatingStage;
}

export type StageAutoMode = "json" | "markdown";

export interface CreativeStageConfig {
  key: CreativeStageKey;
  title: string;
  subtitle: string;
  description: string;
  optional?: boolean;
  autoMode: StageAutoMode;
  systemPrompt: string;
  schemaDescription: string;
}

export const creativeStages: Record<CreativeStageKey, CreativeStageConfig> = {
  diagnosis: {
    key: "diagnosis",
    title: "阶段 00 · 诊断",
    subtitle: "判断观点是否清晰",
    description:
      "评估 idea 与素材是否足以直接成文，指出信息缺口与行动顺序，明确是直接进框架还是需要补充素材。",
    autoMode: "json",
    systemPrompt: creativeStage00System,
    schemaDescription: `{
  "clarity": "clear 或 fuzzy",
  "summary": "引用用户关键词的一句话总结",
  "recommendedRoute": "framework 或 mining",
  "audienceNeed": "读者真正关心的矛盾或痛点",
  "keyQuestions": ["需要用户补充的问题"],
  "risks": ["如果不补充信息将导致的风险"],
  "nextActions": ["按优先级排序的下一步建议"],
  "notes": "额外提示或语气建议"
}`,
  },
  mining: {
    key: "mining",
    title: "阶段 01 · 思维挖掘",
    subtitle: "梳理素材与洞察",
    description:
      "在 idea 模糊或素材散乱时，把素材整理成洞察池，标注适配场景、证据与缺口，方便后续选题。",
    autoMode: "json",
    systemPrompt: creativeStage01System,
    schemaDescription: `{
  "insights": [
    {
      "label": "洞察名称",
      "detail": "简短描述",
      "audiencePain": "触发该洞察的痛点",
      "evidence": ["证据或素材来源"],
      "potentialAngles": ["可延展的内容角度"],
      "recommendedStage": "适合放在开头/正文/结尾"
    }
  ],
  "stories": [
    {
      "title": "故事/案例标题",
      "summary": "一句话说明",
      "usage": "适合放在文案的哪个部分",
      "tone": "讲述时的语气提示"
    }
  ],
  "dataPoints": [
    {
      "fact": "数据或事实",
      "source": "来源",
      "implication": "给读者的启发或行动提示"
    }
  ],
  "gaps": ["仍需补充的素材或调研项"],
  "voiceTips": ["根据口吻画像写作时要注意的语言特征"]
}`,
  },
  topic: {
    key: "topic",
    title: "阶段 02 · 选题确定",
    subtitle: "锁定核心命题与灵魂句",
    description:
      "从洞察中抽取最强命题，明确读者收益、反对意见的回应，并产出差异化标题与大纲要点。",
    autoMode: "json",
    systemPrompt: creativeStage02System,
    schemaDescription: `{
  "coreTopic": "一句话概括核心命题",
  "promise": "读者可获得的具体收益",
  "heroSentence": "灵魂句，20 字以内",
  "angles": [
    {
      "name": "角度名称",
      "hook": "吸引句",
      "audience": "适合的读者",
      "proofPoint": "支撑该角度的证据或素材"
    }
  ],
  "titles": ["标题备选 1", "标题备选 2"],
  "outlineBullets": ["要点 1", "要点 2", "要点 3"],
  "proofPoints": ["正文必须展开的论据"],
  "audienceObjections": ["读者可能的质疑与对应回应"]
}`,
  },
  framework: {
    key: "framework",
    title: "阶段 03 · 框架讨论",
    subtitle: "组织结构与逻辑节奏",
    description:
      "基于选题生成完整结构，标注每段要解决的读者问题、证据、情绪节奏与 CTA，写作时可直接复用。",
    autoMode: "json",
    systemPrompt: creativeStage03System,
    schemaDescription: `{
  "opening": {
    "hook": "开头抓人句",
    "tension": "放大的矛盾/问题",
    "promise": "立刻告诉读者的收益"
  },
  "sections": [
    {
      "order": 1,
      "functionCue": "内部功能提示，说明本段要实现的观众转变，禁止当成标题",
      "goal": "段落要解决的具体问题或要达成的行动",
      "keyPoints": ["要点 A", "要点 B"],
      "evidence": ["优先写用户素材 ID 或描述，其次才是历史案例"],
      "tone": "情绪/语气提示",
      "contentType": "讲故事/演绎冲突/抛出步骤等动作描述",
      "cta": "该段落收尾要落到的行动/思考",
      "storyCue": "必须优先指向用户真实案例，若无再写历史案例"
    }
  ],
  "transitions": ["段落间过渡句"],
  "headline": "最终标题建议",
  "closingCTA": "收束方式与行动号召",
  "styleReminders": ["语气、节奏或格式提示"]
}`,
  },
  draft: {
    key: "draft",
    title: "阶段 04 · 内容产出",
    subtitle: "生成完整文案",
    description:
      "按照框架写出口播式成稿，仅保留连续正文，无标题/结构标签，优先引用用户真实素材。",
    autoMode: "markdown",
    systemPrompt: creativeStage04System,
    schemaDescription: "无需 JSON，直接输出纯文本成稿（不得包含 Markdown 语法或 emoji）。",
  },
};

export function getStageConfig(stage: CreativeStageKey) {
  return creativeStages[stage];
}

export function getNextStage(stage: CreativeStageKey): CreativeStageKey | null {
  const idx = creativeStageOrder.indexOf(stage);
  if (idx === -1 || idx === creativeStageOrder.length - 1) return null;
  return creativeStageOrder[idx + 1];
}
