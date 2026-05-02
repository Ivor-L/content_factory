import prisma from '@/lib/prisma';
import { toInputJson } from '@/lib/jsonUtils';
import { IMAGE_UNDERSTANDING_PROMPT_EXACT_TEXT } from '@/lib/imageUnderstandingPrompts';
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
}): Promise<{ title: string; body: string; imageTexts: string[] }> {
  const baseUrl = getBaseUrl();
  const apiKey = getSystemApiKey();
  if (!baseUrl || !apiKey) {
    throw new Error('LLM 服务未配置');
  }

  const prompt = [
    '你是一个小红书图文内容改写助手。请在保留原意和事实信息的前提下，进行二创改写。',
    '改写要求：',
    '1. 标题更有吸引力，但不夸张。',
    '2. 正文结构更清晰，可读性更好。',
    '3. 图片文案逐条改写，保持与原图语义一致。',
    '4. 输出 JSON，不要输出任何额外说明。',
    '',
    '输出格式：',
    '{"title":"...","body":"...","imageTexts":["...", "..."]}',
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
  const title = normalizeText(parsed?.title) || clipText(params.title || '仿写标题', 60);
  const body = normalizeText(parsed?.body) || params.body;
  const imageTextsRaw = Array.isArray(parsed?.imageTexts) ? parsed?.imageTexts : [];
  const imageTexts = imageTextsRaw
    .map((item) => normalizeText(item))
    .filter(Boolean);

  return {
    title,
    body,
    imageTexts: imageTexts.length > 0 ? imageTexts : params.imageTexts,
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

  if (note.status !== 'BREAKDOWN_COMPLETED') {
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
