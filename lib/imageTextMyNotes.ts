import prisma from '@/lib/prisma';
import { toInputJson } from '@/lib/jsonUtils';
import { IMAGE_UNDERSTANDING_PROMPT_EXACT_TEXT } from '@/lib/imageUnderstandingPrompts';
import { rewriteXhsNote } from '@/lib/xhsRewritePrompt';
import { deductConfiguredCredits } from '@/lib/creditBilling';
import { getApiKeyForUser } from '@/lib/authServer';

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

export async function runBreakdownForMyNote(noteId: string): Promise<void> {
  const note = await prisma.imageTextReplicationTask.findUnique({
    where: { id: noteId },
  });

  if (!note) return;

  const sourceImages = parseSourceImages(note.sourceImages);
  const creditsApiKey = await getApiKeyForUser(note.userId).catch(() => null);
  if (!creditsApiKey) {
    await prisma.imageTextReplicationTask.update({
      where: { id: noteId },
      data: {
        status: 'BREAKDOWN_FAILED',
        errorMessage: '请先在设置页绑定 API Key',
      },
    });
    return;
  }
  try {
    await deductConfiguredCredits({
      apiKey: creditsApiKey,
      featureKey: 'my_note_breakdown',
      userId: note.userId,
      defaultAmount: 1,
      modelKey: 'gemini-3.1-flash-lite-preview',
      units: Math.max(1, sourceImages.length),
      workflowId: 'my_note_breakdown',
      workflowName: '我的笔记图片解析',
    });
  } catch (error) {
    await prisma.imageTextReplicationTask.update({
      where: { id: noteId },
      data: {
        status: 'BREAKDOWN_FAILED',
        errorMessage: error instanceof Error ? error.message : '积分不足或扣费失败',
      },
    });
    return;
  }

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
    const creditsApiKey = await getApiKeyForUser(note.userId).catch(() => null);
    if (!creditsApiKey) throw new Error('请先在设置页绑定 API Key');
    await deductConfiguredCredits({
      apiKey: creditsApiKey,
      featureKey: 'my_note_breakdown_retry',
      userId: note.userId,
      defaultAmount: 1,
      modelKey: 'gemini-3.1-flash-lite-preview',
      workflowId: 'my_note_breakdown_retry',
      workflowName: '我的笔记图片解析重试',
    });
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

export async function rewriteMyNoteAndCreateWork(noteId: string): Promise<{ status: string }> {
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
    const creditsApiKey = await getApiKeyForUser(note.userId).catch(() => null);
    if (!creditsApiKey) throw new Error('请先在设置页绑定 API Key');
    await deductConfiguredCredits({
      apiKey: creditsApiKey,
      featureKey: 'my_note_rewrite',
      userId: note.userId,
      defaultAmount: 1,
      modelKey: 'xhs_rewrite',
      workflowId: 'my_note_rewrite',
      workflowName: '我的笔记仿写',
    });
    const rewritten = await rewriteXhsNote({
      title: normalizeText(note.sourceTitle) || '未命名标题',
      body: normalizeText(note.sourceText),
      imageTexts: extractedTexts,
    });

    const rewriteResult = {
      title: rewritten.title,
      body: rewritten.body,
      imageTexts: rewritten.imageTexts,
      tags: rewritten.tags,
      titleFormula: rewritten.titleFormula,
      rewrittenAt: new Date().toISOString(),
    };

    const mergedAnalysis = {
      ...analysis,
      rewriteResult,
    };

    await prisma.imageTextReplicationTask.update({
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

    return { status: 'REWRITE_COMPLETED' };
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
