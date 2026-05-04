import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { toInputJson } from '@/lib/jsonUtils';

const webhookUrl =
  process.env.N8N_EXTRACT_VIDEO_TEXT_WEBHOOK ||
  'https://hooks.atomx.top/webhook/extract_video_text';

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function getByPath(payload: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    const obj = parseObject(current);
    return obj ? obj[key] : undefined;
  }, payload);
}

function pickText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return null;
}

function collectObjects(value: unknown): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const queue: unknown[] = [value];
  const seen = new Set<unknown>();

  while (queue.length > 0 && result.length < 160) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const obj = current as Record<string, unknown>;
    result.push(obj);
    queue.push(...Object.values(obj));
  }

  return result;
}

function resolveVideoUrl(raw: unknown): string | null {
  const root = parseObject(raw) ?? {};
  const direct = pickText(
    getByPath(root, 'media.videoUrl'),
    root.videoUrl,
    root.video_url,
    root['视频地址'],
    root['视频链接'],
    root['播放地址'],
  );
  if (direct) return direct;

  for (const obj of collectObjects(root)) {
    const value = pickText(
      obj.videoUrl,
      obj.video_url,
      obj.playUrl,
      obj.play_url,
      obj.masterUrl,
      obj.master_url,
      obj['视频地址'],
      obj['视频链接'],
      obj['播放地址'],
    );
    if (value) return value;
  }
  return null;
}

function normalizeWebhookEnvelope(rawData: unknown): Record<string, unknown> | null {
  const normalized = Array.isArray(rawData) ? rawData[0] ?? null : rawData;
  const obj = parseObject(normalized);
  if (!obj) return null;
  const data = parseObject(obj.data);
  return data || obj;
}

function extractTextFromEnvelope(envelope: Record<string, unknown> | null): string {
  if (!envelope) return '';
  const result = parseObject(envelope.result);
  const raw = parseObject(envelope.raw);
  const data = parseObject(envelope.data);
  return pickText(
    envelope.text,
    envelope.transcript,
    envelope.copyText,
    envelope.copy_text,
    result?.text,
    raw?.text,
    data?.text,
    data?.transcript,
    parseObject(data?.result)?.text,
  ) || '';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const note = await prisma.imageTextReplicationTask.findFirst({
    where: { id, userId },
  });

  if (!note) {
    return NextResponse.json({ error: '笔记不存在' }, { status: 404 });
  }

  const videoUrl = resolveVideoUrl(note.generatedImages);
  if (!videoUrl) {
    return NextResponse.json({ error: '未找到可提取的视频地址' }, { status: 400 });
  }

  const callbackBase = (process.env.N8N_CALLBACK_BASE_URL || '').replace(/\/+$/, '');
  let callbackUrl: string | null = null;
  if (callbackBase) {
    try {
      const callback = new URL(`${callbackBase}/api/replication/copy/extract/callback`);
      callback.searchParams.set('my_note_id', id);
      callbackUrl = callback.toString();
    } catch (error) {
      console.error('[image-text-replication/extract-video-copy] invalid callback base url', {
        callbackBase,
        error,
      });
      callbackUrl = null;
    }
  }

  const payload: Record<string, unknown> = {
    video_url: videoUrl,
    videoUrl,
    user_id: userId,
    userId,
    my_note_id: id,
    myNoteId: id,
    extract_type: 'subtitle',
    content_hint: 'video_subtitle_only',
    source_platform: note.sourcePlatform || 'miniapp-my',
    note_description: note.sourceText || null,
    language: 'zh-CN',
    target_language: 'zh-CN',
    callback_url: callbackUrl,
    callbackUrl,
  };

  await prisma.imageTextReplicationTask.update({
    where: { id },
    data: {
      status: 'VIDEO_COPY_EXTRACTING',
      errorMessage: null,
    },
  });

  try {
    if (callbackUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async (res) => {
          const rawData = await res.json().catch(() => null);
          if (!res.ok) {
            console.error('[image-text-replication/extract-video-copy] background fetch failed', {
              status: res.status,
              body: rawData,
            });
            return;
          }

          const envelope = normalizeWebhookEnvelope(rawData);
          const extractedText = extractTextFromEnvelope(envelope);
          if (!extractedText) return;

          const rawMeta = parseObject(note.generatedImages) ?? {};
          const videoMeta = parseObject(rawMeta.video) ?? {};
          const nextMeta = {
            ...rawMeta,
            video: {
              ...videoMeta,
              extractedCopy: extractedText,
              extractedAt: new Date().toISOString(),
            },
          };

          await prisma.imageTextReplicationTask.update({
            where: { id },
            data: {
              status: 'VIDEO_COPY_COMPLETED',
              sourceText: extractedText,
              generatedImages: toInputJson(nextMeta),
              errorMessage: null,
            },
          });
        })
        .catch((error) => {
          console.error('[image-text-replication/extract-video-copy] background fetch error', error);
        });

      return NextResponse.json({
        data: {
          status: 'pending',
          videoUrl,
        },
      });
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const rawData = await res.json().catch(() => null);
    if (!res.ok) {
      const message = parseObject(rawData)?.error || parseObject(rawData)?.message || `提取服务失败 (${res.status})`;
      throw new Error(String(message));
    }

    const envelope = normalizeWebhookEnvelope(rawData);
    const extractedText = extractTextFromEnvelope(envelope);

    if (!extractedText) {
      return NextResponse.json({
        data: {
          status: 'pending',
          videoUrl,
        },
      });
    }

    const rawMeta = parseObject(note.generatedImages) ?? {};
    const videoMeta = parseObject(rawMeta.video) ?? {};
    const nextMeta = {
      ...rawMeta,
      video: {
        ...videoMeta,
        extractedCopy: extractedText,
        extractedAt: new Date().toISOString(),
      },
    };

    await prisma.imageTextReplicationTask.update({
      where: { id },
      data: {
        status: 'VIDEO_COPY_COMPLETED',
        sourceText: extractedText,
        generatedImages: toInputJson(nextMeta),
        errorMessage: null,
      },
    });

    return NextResponse.json({
      data: {
        status: 'completed',
        text: extractedText,
        transcript: extractedText,
        videoUrl,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '提取失败';
    await prisma.imageTextReplicationTask.update({
      where: { id },
      data: {
        status: 'VIDEO_COPY_FAILED',
        errorMessage: message,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
