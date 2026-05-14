import { estimateAgentCapabilityCredits } from '../quota-preflight';
import type { AgentCapabilityDefinition, AgentCapabilityCategory, AgentCapabilityCostLevel } from '../types';

const CATEGORY_BY_PREFIX: Array<[string, AgentCapabilityCategory]> = [
  ['xhs.', 'xhs'],
  ['digital-human.', 'video'],
  ['motion.', 'video'],
  ['viral.', 'video'],
  ['social.', 'social'],
  ['product.', 'product'],
  ['content.', 'writing'],
  ['earn.', 'earn'],
  ['plugin.', 'plugin'],
];

const COST_BY_ID: Record<string, AgentCapabilityCostLevel> = {
  'xhs.card.layout': 'low',
  'xhs.note.collect': 'medium',
  'xhs.infographic.style.extract': 'medium',
  'xhs.infographic.generate': 'medium',
  'digital-human.video.generate': 'high',
  'motion.replication.image_to_video': 'high',
  'viral.midform.video.generate': 'high',
  'viral.breakdown.video_prompts': 'medium',
  'social.tiktok.collect': 'medium',
  'social.instagram.collect': 'medium',
  'social.facebook.collect': 'medium',
  'social.comments.collect': 'medium',
  'product.selling_point.analysis': 'low',
  'earn.task.list': 'low',
  'earn.task.apply': 'low',
  'earn.task.submit_evidence': 'low',
  'plugin.xhs.collect': 'low',
  'plugin.xhs.publish': 'low',
  'plugin.account.sync': 'low',
  'content.wechat.longform.write': 'free',
  'content.hook.design': 'free',
  'reference.decode': 'free',
  'prompt.preflight.qa': 'free',
  'content.visual_hook.design': 'free',
  'content.opening_pattern.route': 'free',
};

const REQUIRED_ENV_BY_ID: Record<string, string[]> = {
  'xhs.note.collect': ['XHS_DOWNLOADER_BASE_URL'],
  'xhs.infographic.style.extract': ['N8N_STYLE_WORKFLOW_WEBHOOK'],
  'xhs.infographic.generate': ['N8N_XHS_TEXT2IMG_WEBHOOK or XHS_TEXT2IMG_WEBHOOK'],
  'digital-human.video.generate': ['N8N_DIGITAL_HUMAN_WEBHOOK or DIGITAL_HUMAN_WEBHOOK_URL'],
  'motion.replication.image_to_video': ['N8N_ACTION_TRANSFER_WEBHOOK'],
  'viral.midform.video.generate': ['N8N_T2V_WEBHOOK'],
  'social.tiktok.collect': ['N8N_SOCIAL_SCRAPER_WEBHOOK', 'SOCIAL_SCRAPER_APIFY_TOKEN or APIFY_API_TOKEN'],
  'social.facebook.collect': ['N8N_SOCIAL_SCRAPER_WEBHOOK', 'SOCIAL_SCRAPER_APIFY_TOKEN or APIFY_API_TOKEN'],
  'social.instagram.collect': ['N8N_INSTAGRAM_SCRAPER_WEBHOOK'],
  'social.comments.collect': ['N8N_TIKTOK_COMMENTS_WEBHOOK or N8N_SOCIAL_COMMENTS_WEBHOOK'],
};

const EXAMPLES_BY_ID: Record<string, Array<{ name: string; description?: string; input: Record<string, unknown> }>> = {
  'xhs.card.layout': [{ name: 'Markdown 生成小红书卡片', input: { title: 'AI 工具清单', markdown: '# AI 工具清单\n\n- Claude\n- NexTide', includeCover: true, maxPages: 6 } }],
  'viral.midform.video.generate': [{ name: '3D 骨骼中视频 standalone', input: { title: '久坐为什么让肩颈越来越僵', scriptText: '完整脚本文案...', theme: '3d-skeleton', allowText: false } }],
  'social.tiktok.collect': [
    { name: 'TikTok 关键词采集', input: { platform: 'tiktok', mode: 'keyword', queries: ['neck pain'], limit: 20 } },
    { name: 'TikTok 博主账号采集', description: '博主蒸馏器第一步：采集账号热门视频。', input: { platform: 'tiktok', mode: 'creator', targets: ['@quinclips3'], limit: 20, sortBy: 'likes' } },
  ],
  'digital-human.video.generate': [{ name: '图片数字人口播', input: { personImage: 'https://example.com/person.png', audioUrl: 'https://example.com/audio.mp3', script: '口播文案' } }],
  'product.selling_point.analysis': [{ name: '产品卖点分析', input: { name: '护颈枕', description: '适合久坐人群的支撑枕', images: [] } }],
  'earn.task.list': [{ name: '匹配小红书发布任务', input: { platform: 'xhs', type: 'publish', query: '护肤', limit: 10 } }],
  'earn.task.apply': [{ name: '接取小红书任务', input: { taskId: 'task_xxx', platform: 'xhs', platformAccountName: '我的小红书账号' } }],
  'earn.task.submit_evidence': [{ name: '提交发布证据', input: { userTaskId: 'ut_xxx', submissionUrl: 'https://www.xiaohongshu.com/explore/xxx', pluginEvidence: { workId: 'xxx' } } }],
  'plugin.xhs.collect': [{ name: '采集当前小红书页面', input: { saveToHotSquare: true } }],
  'plugin.xhs.publish': [{ name: '生成小红书发布指令', input: { title: '3 个护肤误区', description: '正文内容...', tags: ['护肤', '新手'], mediaUrls: [] } }],
  'plugin.account.sync': [{ name: '同步插件账号', input: { platform: 'xhs' } }],
  'content.hook.design': [{ name: '短视频 Hook Brief', input: { brief: '便携榨汁杯，目标用户是上班族，想做 15 秒 TikTok 种草视频', audience: '久坐上班族', productRevealPreference: 'delayed' } }],
  'reference.decode': [{ name: '爆款开头结构解码', input: { referenceSummary: '开头 1 秒是女生在办公室突然把一杯难喝奶昔推开，字幕说：Stop drinking this after lunch。', targetProduct: '便携榨汁杯' } }],
  'prompt.preflight.qa': [{ name: '视频生成前 QA', input: { prompt: '生成一个 15 秒产品种草视频，开头展示便携榨汁杯，然后女生说它很好用。', targetCapability: 'viral.midform.video.generate' } }],
  'content.visual_hook.design': [{ name: '第一帧视觉 Hook 优化', input: { visualDescription: '桌上摆着一个便携榨汁杯，背景干净，产品居中。', goal: '让上班族想知道为什么这个杯子能解决下午犯困问题' } }],
  'content.opening_pattern.route': [{ name: '短视频开头路线选择', input: { brief: '便携榨汁杯，面向办公室人群，希望突出健康和方便。', segmentType: 'hook' } }],
};

export function enrichCapability(capability: AgentCapabilityDefinition): AgentCapabilityDefinition {
  const costLevel = COST_BY_ID[capability.id] || (capability.async ? 'medium' : 'low');
  return {
    version: '0.2.0',
    category: inferCategory(capability.id),
    costLevel,
    requiredAuth: ['nexTideApiKey'],
    requiredEnv: REQUIRED_ENV_BY_ID[capability.id] || [],
    examples: EXAMPLES_BY_ID[capability.id] || [],
    docsUrl: `artifacts/capabilities/${capability.id}.input.schema.json`,
    rateLimit: rateLimitForCost(costLevel),
    requiredPlan: costLevel === 'high' || costLevel === 'variable' ? 'paid' : undefined,
    ...capability,
    estimatedCredits: estimateAgentCapabilityCredits({ ...capability, costLevel }),
  };
}

function rateLimitForCost(costLevel: AgentCapabilityCostLevel) {
  if (costLevel === 'medium') return { perMinute: 10, perHour: 60 };
  if (costLevel === 'high' || costLevel === 'variable') return { perMinute: 5, perHour: 20 };
  return undefined;
}

export function enrichCapabilities(capabilities: AgentCapabilityDefinition[]): AgentCapabilityDefinition[] {
  return capabilities.map(enrichCapability);
}

function inferCategory(id: string): AgentCapabilityCategory {
  for (const [prefix, category] of CATEGORY_BY_PREFIX) {
    if (id.startsWith(prefix)) return category;
  }
  return 'system';
}
