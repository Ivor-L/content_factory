import prisma from '@/lib/prisma';
import { toInputJson } from '@/lib/jsonUtils';
import { IMAGE_UNDERSTANDING_PROMPT_EXACT_TEXT } from '@/lib/imageUnderstandingPrompts';
import { XHS_TITLE_FORMULA_PROMPT } from '@/lib/xhsTitleFormulaPrompt';
import { randomUUID } from 'node:crypto';

const MAX_RECOGNIZE_CONCURRENCY = 3;

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function getBaseUrl() {
  const base = process.env.CANVAS_API_BASE_URL || process.env.CLOUD_API_BASE_URL || '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function getSystemApiKey() {
  return process.env.CANVAS_UPSTREAM_DEFAULT_API_KEY || process.env.CLOUD_API_KEY || '';
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseSourceImages(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => normalizeText(item)).filter(Boolean);
      }
    } catch {
      // ignore
    }
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function clipText(input: string, max = 120): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1)}…`;
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parseObject(parsed);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return parseObject(parsed);
    } catch {
      return null;
    }
  }
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function parseTitleFormulaCandidates(value: unknown): TitleFormulaCandidate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const obj = parseObject(item);
      if (!obj) return null;
      const title = normalizeText(obj.title);
      const formulaId = Number(obj.formulaId);
      const triggerType = normalizeText(obj.triggerType);
      const formulaTemplate = normalizeText(obj.formulaTemplate);
      const originalExample = normalizeText(obj.originalExample);
      const reason = normalizeText(obj.reason);
      if (!title || !Number.isInteger(formulaId) || formulaId < 1 || formulaId > 75) return null;
      return {
        title,
        formulaId,
        triggerType,
        formulaTemplate,
        originalExample,
        reason,
      };
    })
    .filter((item): item is TitleFormulaCandidate => Boolean(item));
}

type TitleFormulaCandidate = {
  title: string;
  formulaId: number;
  triggerType: string;
  formulaTemplate: string;
  originalExample: string;
  reason: string;
};

type ExtractedImageText = {
  index: number;
  text: string;
  success: boolean;
  error?: string | null;
};

async function imageUrlToDataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:')) return imageUrl;
  const res = await fetch(imageUrl, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`图片下载失败: ${res.status}`);
  }
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const mimeType = contentType.split(';')[0].trim();
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

async function callVisionExactText(imageUrl: string): Promise<string> {
  const baseUrl = getBaseUrl();
  const apiKey = getSystemApiKey();
  if (!baseUrl || !apiKey) {
    throw new Error('LLM 服务未配置');
  }

  const dataUrl = await imageUrlToDataUrl(imageUrl);
  const chatUrl = `${baseUrl}/chat/completions`;
  const response = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gemini-3.1-flash-lite-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: IMAGE_UNDERSTANDING_PROMPT_EXACT_TEXT },
          ],
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `视觉模型调用失败: ${response.status}`);
  }

  const payload = await response.json().catch(() => ({})) as any;
  const text =
    payload?.choices?.[0]?.message?.content ||
    payload?.candidates?.[0]?.content?.parts?.map((item: { text?: string }) => item.text || '').join('') ||
    '';

  const normalized = normalizeText(text);
  if (!normalized) {
    throw new Error('未获取到识别结果');
  }
  return normalized;
}

async function callRewriteModel(params: {
  title: string;
  body: string;
  imageTexts: string[];
}): Promise<{
  title: string;
  body: string;
  imageTexts: string[];
  titleFormula: {
    topic: string;
    industry: string;
    candidates: TitleFormulaCandidate[];
    top3: TitleFormulaCandidate[];
  };
}> {
  const baseUrl = getBaseUrl();
  const apiKey = getSystemApiKey();
  if (!baseUrl || !apiKey) {
    throw new Error('LLM 服务未配置');
  }

  const prompt = [
    '你是一个小红书图文/视频笔记仿写助手。请在保留原意和事实信息的前提下，进行二创改写。',
    '',
    '标题必须严格使用下面的小红书标题公式工具规则：',
    XHS_TITLE_FORMULA_PROMPT,
    '',
    '改写要求：',
    '1. 标题必须从 75 个公式中匹配生成，不能自由发挥。',
    '2. 正文结构更清晰，可读性更好。',
    '3. 图片文案或视频字幕逐条改写，保持与原内容语义一致。',
    '4. 如果是视频笔记，imageTexts 可以为空，但 body 必须基于视频文案仿写。',
    '5. 输出 JSON，不要输出任何额外说明。',
    '6. title 字段必须等于 top3[0].title。',
    '',
    '输出格式：',
    [
      '{',
      '  "topic": "提取的话题",',
      '  "industry": "提取的行业/领域",',
      '  "title": "Top 1 标题，必须等于 top3[0].title",',
      '  "titleCandidates": [',
      '    {',
      '      "title": "≤20字标题",',
      '      "formulaId": 7,',
      '      "triggerType": "好奇缺口",',
      '      "formulaTemplate": "[一群人] 不会告诉你的建议",',
      '      "originalExample": "会赚钱的博主不会告诉你的建议",',
      '      "reason": "一句话解释为什么适合"',
      '    }',
      '  ],',
      '  "top3": [',
      '    {',
      '      "title": "≤20字标题",',
      '      "formulaId": 7,',
      '      "triggerType": "好奇缺口",',
      '      "formulaTemplate": "[一群人] 不会告诉你的建议",',
      '      "originalExample": "会赚钱的博主不会告诉你的建议",',
      '      "reason": "一句话解释为什么最推荐"',
      '    }',
      '  ],',
      '  "body": "...",',
      '  "imageTexts": ["...", "..."]',
      '}',
    ].join('\n'),
    '',
    `原标题：${params.title || '未命名标题'}`,
    `原正文：${params.body || '暂无正文'}`,
    `原图片文案：${JSON.stringify(params.imageTexts || [])}`,
  ].join('\n');

  const chatUrl = `${baseUrl}/chat/completions`;
  const response = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `改写模型调用失败: ${response.status}`);
  }

  const payload = await response.json().catch(() => ({})) as any;
  const raw = normalizeText(
    payload?.choices?.[0]?.message?.content ||
    payload?.candidates?.[0]?.content?.parts?.map((item: { text?: string }) => item.text || '').join('') ||
    '',
  );

  const parsed = extractJsonObject(raw);
  const candidates = parseTitleFormulaCandidates(parsed?.titleCandidates);
  const top3Raw = parseTitleFormulaCandidates(parsed?.top3);
  const top3 = top3Raw.length > 0 ? top3Raw.slice(0, 3) : candidates.slice(0, 3);
  const formulaTitle = normalizeText(top3[0]?.title || candidates[0]?.title);
  const title = formulaTitle || normalizeText(parsed?.title) || clipText(params.title || '仿写标题', 60);
  const body = normalizeText(parsed?.body) || params.body;
  const imageTexts = parseStringArray(parsed?.imageTexts);

  return {
    title,
    body,
    imageTexts: imageTexts.length > 0 ? imageTexts : params.imageTexts,
    titleFormula: {
      topic: normalizeText(parsed?.topic),
      industry: normalizeText(parsed?.industry),
      candidates,
      top3,
    },
  };
}

export async function runBreakdownForMyNote(noteId: string): Promise<void> {
  const note = await prisma.imageTextReplicationTask.findUnique({
    where: { id: noteId },
  });

  if (!note) return;

  const sourceImages = parseSourceImages(note.sourceImages);
  if (sourceImages.length === 0) {
    const analysisResult = {
      sourceTitle: note.sourceTitle || '',
      sourceText: note.sourceText || '',
      sourceImages: [],
      extractedImageTexts: [],
      completedAt: new Date().toISOString(),
    };

    await prisma.imageTextReplicationTask.update({
      where: { id: noteId },
      data: {
        status: 'BREAKDOWN_COMPLETED',
        analysisResult: toInputJson(analysisResult),
        errorMessage: null,
      },
    });
    return;
  }

  await prisma.imageTextReplicationTask.update({
    where: { id: noteId },
    data: {
      status: 'BREAKDOWN_PENDING',
      errorMessage: null,
    },
  });

  try {
    const total = sourceImages.length;
    const ordered = new Array<{ index: number; text: string; success: boolean; error?: string }>(total);
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const current = cursor;
        cursor += 1;
        if (current >= total) return;

        const imageUrl = sourceImages[current];
        try {
          const text = await callVisionExactText(imageUrl);
          ordered[current] = {
            index: current + 1,
            text,
            success: true,
          };
        } catch (error) {
          ordered[current] = {
            index: current + 1,
            text: '',
            success: false,
            error: error instanceof Error ? error.message : '识别失败',
          };
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(MAX_RECOGNIZE_CONCURRENCY, total) }, () => worker()),
    );

    const extractedImageTexts = ordered.map((item) => ({
      index: item.index,
      text: item.success ? item.text : '[识别失败]',
      success: item.success,
      error: item.error || null,
    }));

    const hasAnySuccess = extractedImageTexts.some((item) => item.success && normalizeText(item.text));

    const analysisResult = {
      sourceTitle: note.sourceTitle || '',
      sourceText: note.sourceText || '',
      sourceImages,
      extractedImageTexts,
      completedAt: new Date().toISOString(),
    };

    await prisma.imageTextReplicationTask.update({
      where: { id: noteId },
      data: {
        status: hasAnySuccess ? 'BREAKDOWN_COMPLETED' : 'BREAKDOWN_FAILED',
        analysisResult: toInputJson(analysisResult),
        errorMessage: hasAnySuccess ? null : '图片文案提取失败',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '图片文案提取失败';
    await prisma.imageTextReplicationTask.update({
      where: { id: noteId },
      data: {
        status: 'BREAKDOWN_FAILED',
        errorMessage: message,
      },
    });
  }
}

export async function retryBreakdownImageForMyNote(
  noteId: string,
  imageIndex: number,
): Promise<{ status: string; imageText: ExtractedImageText }> {
  const note = await prisma.imageTextReplicationTask.findUnique({
    where: { id: noteId },
  });

  if (!note) {
    throw new Error('笔记不存在');
  }

  const sourceImages = parseSourceImages(note.sourceImages);
  const normalizedIndex = Math.floor(Number(imageIndex));
  if (!Number.isFinite(normalizedIndex) || normalizedIndex < 1 || normalizedIndex > sourceImages.length) {
    throw new Error('图片序号无效');
  }

  const analysis = parseObject(note.analysisResult) || {};
  const rawTexts = Array.isArray(analysis.extractedImageTexts) ? analysis.extractedImageTexts : [];
  const existingTexts = new Map<number, ExtractedImageText>();

  for (const item of rawTexts) {
    const obj = parseObject(item);
    if (!obj) continue;
    const idx = Math.floor(Number(obj.index));
    if (!Number.isFinite(idx) || idx < 1) continue;
    existingTexts.set(idx, {
      index: idx,
      text: typeof obj.text === 'string' ? obj.text : '',
      success: Boolean(obj.success),
      error: typeof obj.error === 'string' ? obj.error : null,
    });
  }

  const nextTexts: ExtractedImageText[] = sourceImages.map((_, index) => {
    const idx = index + 1;
    return existingTexts.get(idx) || {
      index: idx,
      text: '[识别失败]',
      success: false,
      error: '未识别',
    };
  });

  await prisma.imageTextReplicationTask.update({
    where: { id: noteId },
    data: {
      status: 'BREAKDOWN_PENDING',
      errorMessage: null,
    },
  });

  let imageText: ExtractedImageText;
  try {
    const text = await callVisionExactText(sourceImages[normalizedIndex - 1]);
    imageText = {
      index: normalizedIndex,
      text,
      success: true,
      error: null,
    };
  } catch (error) {
    imageText = {
      index: normalizedIndex,
      text: '[识别失败]',
      success: false,
      error: error instanceof Error ? error.message : '识别失败',
    };
  }

  nextTexts[normalizedIndex - 1] = imageText;
  const hasAnySuccess = nextTexts.some((item) => item.success && normalizeText(item.text));
  const status = hasAnySuccess ? 'BREAKDOWN_COMPLETED' : 'BREAKDOWN_FAILED';
  const { rewriteResult: _rewriteResult, ...analysisWithoutRewrite } = analysis;

  const nextAnalysisResult = {
    ...analysisWithoutRewrite,
    sourceTitle: note.sourceTitle || '',
    sourceText: note.sourceText || '',
    sourceImages,
    extractedImageTexts: nextTexts,
    completedAt: new Date().toISOString(),
  };

  await prisma.imageTextReplicationTask.update({
    where: { id: noteId },
    data: {
      status,
      analysisResult: toInputJson(nextAnalysisResult),
      generatedCopy: null,
      imageGuidance: toInputJson([]),
      errorMessage: hasAnySuccess ? null : '图片文案提取失败',
    },
  });

  return { status, imageText };
}

export async function rewriteMyNoteAndCreateWork(noteId: string): Promise<{ workTaskId: string }> {
  const note = await prisma.imageTextReplicationTask.findUnique({ where: { id: noteId } });
  if (!note) {
    throw new Error('笔记不存在');
  }

  const analysis = parseObject(note.analysisResult) || {};
  const extractedRaw = Array.isArray(analysis.extractedImageTexts) ? analysis.extractedImageTexts : [];
  const extractedTexts = extractedRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      return normalizeText((item as Record<string, unknown>).text);
    })
    .filter(Boolean);

  const normalizedStatus = normalizeText(note.status).toUpperCase();
  if (!['BREAKDOWN_COMPLETED', 'VIDEO_COPY_COMPLETED'].includes(normalizedStatus)) {
    throw new Error('请先等待解析完成再仿写');
  }

  await prisma.imageTextReplicationTask.update({
    where: { id: noteId },
    data: {
      status: 'REWRITE_PENDING',
      errorMessage: null,
    },
  });

  try {
    const rewritten = await callRewriteModel({
      title: normalizeText(note.sourceTitle) || '未命名标题',
      body: normalizeText(note.sourceText),
      imageTexts: extractedTexts,
    });

    const rewriteResult = {
      title: rewritten.title,
      body: rewritten.body,
      imageTexts: rewritten.imageTexts,
      titleFormula: rewritten.titleFormula,
      rewrittenAt: new Date().toISOString(),
    };

    const workTaskId = randomUUID();
    const preview = clipText(rewritten.body || rewritten.title, 140);

    await prisma.$transaction(async (tx) => {
      const mergedAnalysis = {
        ...analysis,
        rewriteResult,
      };

      await tx.imageTextReplicationTask.update({
        where: { id: noteId },
        data: {
          status: 'REWRITE_COMPLETED',
          generatedCopy: rewritten.body,
          imageGuidance: toInputJson(
            rewritten.imageTexts.map((text, index) => ({ index: index + 1, description: text })),
          ),
          analysisResult: toInputJson(mergedAnalysis),
          errorMessage: null,
        },
      });

      await tx.creativeTask.create({
        data: {
          id: workTaskId,
          userId: note.userId,
          title: rewritten.title,
          ideaText: rewritten.body,
          channel: 'xhs',
          targetOutput: 'poster',
          status: 'BREAKDOWN_COMPLETED',
          progress: 15,
          metadata: toInputJson({
            custom: {
              posterMode: 'text2image',
              source: 'image_text_replication',
              replication: {
                phase: 'ready_to_generate',
                sourceTitle: note.sourceTitle || '',
                sourceText: rewritten.body,
                sourceImages: parseSourceImages(note.sourceImages),
                sourcePlatform: note.sourcePlatform || 'miniapp',
                sourceId: note.sourceId || note.id,
                sourceUrl: note.sourceUrl || '',
                rewrittenTitle: rewritten.title,
                rewrittenImageTexts: rewritten.imageTexts,
                fromMyNoteId: note.id,
              },
            },
          }),
        },
      });

      await tx.taskSummary.upsert({
        where: {
          taskType_taskId: {
            taskType: 'poster',
            taskId: workTaskId,
          },
        },
        create: {
          userId: note.userId,
          taskType: 'poster',
          taskId: workTaskId,
          title: rewritten.title,
          status: 'PROCESSING',
          preview,
          progress: 15,
          metadata: {
            posterMode: 'text2image',
            source: 'image_text_replication',
            fromMyNoteId: note.id,
          },
        },
        update: {
          title: rewritten.title,
          status: 'PROCESSING',
          preview,
          progress: 15,
          metadata: {
            posterMode: 'text2image',
            source: 'image_text_replication',
            fromMyNoteId: note.id,
          },
        },
      });
    });

    return { workTaskId };
  } catch (error) {
    const message = error instanceof Error ? error.message : '仿写失败';
    await prisma.imageTextReplicationTask.update({
      where: { id: noteId },
      data: {
        status: 'REWRITE_FAILED',
        errorMessage: message,
      },
    });
    throw error;
  }
}
