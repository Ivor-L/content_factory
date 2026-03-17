import { NextRequest, NextResponse } from 'next/server';

import { getRequestUserContext } from '@/lib/authServer';
import prisma from '@/lib/prisma';
import { deriveCopyInsights } from '@/lib/copyInsights';
import { callCloudChat } from '@/lib/cloudLLM';
import { createDigitalHumanJob } from '@/lib/digitalHumanJob';

const CREATIVE_MODEL =
  process.env.CLOUD_WRITING_MODEL ||
  process.env.CLOUD_DEFAULT_MODEL ||
  'gpt-4o-mini';

function sanitizeWordCount(raw: unknown): number {
  const parsed = typeof raw === 'string' ? Number(raw) : Number(raw);
  if (!Number.isFinite(parsed)) return 320;
  return Math.max(180, Math.min(700, Math.round(parsed)));
}

function estimateSpeechDuration(text: string): number {
  const content = String(text || '').trim();
  if (!content) return 10;
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = content
    .replace(/[\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  let seconds = 0;
  if (chineseChars) seconds += chineseChars / 4.2;
  if (englishWords) seconds += englishWords / 2.5;
  return Number((seconds + 0.8).toFixed(2));
}

async function rewriteScript(params: {
  baseText: string;
  targetWordCount: number;
  audience?: string;
  highlights?: string[];
  structure?: string[];
  title?: string;
}) {
  const { baseText, targetWordCount, audience, highlights = [], structure = [], title } = params;
  if (!process.env.CLOUD_API_BASE_URL || !process.env.CLOUD_API_KEY) {
    return baseText;
  }

  const instructions = [
    `请基于以下原始脚本进行二次创作，生成一段可直接用于数字人口播的中文口播稿。`,
    `- 语气自然、口语化，像真人主播。`,
    `- 保留原脚本的卖点与冲突，但允许换角度和更强的行动号召。`,
    `- 目标受众：${audience || '泛兴趣用户'}.`,
    `- 字数控制在约 ${targetWordCount} 字，允许上下浮动 10%。`,
    `- 输出纯文本，不要使用列表、标题或 Markdown。`,
  ];

  if (highlights.length) {
    instructions.push(`- 卖点参考：${highlights.join('；')}`);
  }
  if (structure.length) {
    instructions.push(`- 可参考的结构节奏：${structure.join(' | ')}`);
  }

  const prompt = [
    instructions.join('\n'),
    '',
    title ? `【爆款标题】${title}` : null,
    '【原始脚本】',
    baseText,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await callCloudChat({
      model: CREATIVE_MODEL,
      system: '你是一名顶级中文脚本编剧，擅长把产品卖点转成高转化、真诚自然的口播脚本。',
      user: prompt,
      temperature: 0.55,
      maxOutputTokens: Math.min(2400, Math.max(900, targetWordCount * 4)),
      metadata: { reason: 'replication-digital-human' },
    });
    const text = response.text?.trim();
    if (text) {
      return text.replace(/^"|"$/g, '').trim();
    }
  } catch (error) {
    console.error('Digital human rewrite failed, falling back to base text', error);
  }
  return baseText;
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { scriptId, characterId, wordCount, ideaText, audience, title } = body || {};
  if (!scriptId || !characterId) {
    return NextResponse.json({ error: 'scriptId and characterId are required' }, { status: 400 });
  }

  const [script, character] = await Promise.all([
    prisma.script.findUnique({
      where: { id: scriptId },
      select: { id: true, title: true, breakdown: true, blueprint: true },
    }),
    prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true, name: true, avatar: true, voiceId: true },
    }),
  ]);

  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 });
  }
  if (!character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 });
  }
  if (!character.avatar) {
    return NextResponse.json({ error: '角色缺少头像，无法生成数字人视频' }, { status: 400 });
  }
  if (!character.voiceId) {
    return NextResponse.json({ error: '角色缺少音色参考，请先上传音色' }, { status: 400 });
  }

  const insights = deriveCopyInsights({ breakdown: script.breakdown, blueprint: script.blueprint });
  const baseText = (
    (typeof ideaText === 'string' ? ideaText : '') ||
    insights.copyText ||
    insights.coreViewpoint ||
    script.title ||
    ''
  ).trim();

  if (!baseText) {
    return NextResponse.json({ error: '脚本暂无可用文案，请先完成拆解' }, { status: 400 });
  }

  const targetWordCount = sanitizeWordCount(wordCount);
  const rewritten = await rewriteScript({
    baseText,
    targetWordCount,
    audience,
    highlights: insights.painPoints,
    structure: insights.structureLogic,
    title: title || script.title || undefined,
  });

  const durationSeconds = estimateSpeechDuration(rewritten);

  const job = await createDigitalHumanJob({
    type: 'VOICE_CLONE',
    imageUrl: character.avatar,
    audioUrl: character.voiceId,
    script: rewritten,
    durationSeconds,
    userId,
  });

  return NextResponse.json({ data: { videoId: job.id } }, { status: 201 });
}
