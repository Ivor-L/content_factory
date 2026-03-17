import type { CreativeStageKey } from '../utils/api';

export const creativeStageOrder: CreativeStageKey[] = ['diagnosis', 'mining', 'topic', 'framework', 'draft'];

export const creativeStages: Record<CreativeStageKey, { title: string; description: string }> = {
  diagnosis: {
    title: '诊断',
    description: '判断观点是否清晰，给出下一步建议。',
  },
  mining: {
    title: '思维挖掘',
    description: '梳理素材与洞察，沉淀可用信息。',
  },
  topic: {
    title: '选题确定',
    description: '聚焦核心命题与灵魂句，明确内容主张。',
  },
  framework: {
    title: '框架讨论',
    description: '组织段落结构，排列关键论点。',
  },
  draft: {
    title: '内容产出',
    description: '输出完整文稿或脚本，准备发布。',
  },
};
