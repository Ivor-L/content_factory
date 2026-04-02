import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserContext, getApiKeyForUser } from '@/lib/authServer';
import { triggerT2V } from '@/lib/n8n';
import prisma from '@/lib/prisma';

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { return null; }
  }
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function extractStyleProfileFromStyle(style: { metadata?: unknown; spec?: unknown } | null): string {
  if (!style) return '';
  const metadata = parseMetadata(style.metadata);
  if (metadata) {
    for (const key of ['analysis', 'style_profile_json', 'styleProfileJson']) {
      const v = metadata[key];
      if (v && typeof v === 'object') { try { return JSON.stringify(v); } catch { /* skip */ } }
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    if (metadata.style_dna) {
      const profile: Record<string, unknown> = { style_dna: metadata.style_dna };
      if (metadata.generation_prompts) profile.generation_prompts = metadata.generation_prompts;
      if (metadata.layout_blueprint) profile.layout_blueprint = metadata.layout_blueprint;
      try { return JSON.stringify(profile); } catch { /* skip */ }
    }
  }
  // fallback: spec.analysis
  const spec = parseMetadata(style.spec);
  if (spec?.analysis && typeof spec.analysis === 'object') {
    try { return JSON.stringify(spec.analysis); } catch { /* skip */ }
  }
  return '';
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    taskId?: string;
    title?: string;
    scriptText?: string;
    styleId?: string;
    creativeStyleRaw?: string;
    creativeStyleNorm?: string;
    styleProfileText?: string;
    allowText?: boolean;
  };

  const { taskId, title, scriptText, styleId, creativeStyleRaw, creativeStyleNorm, allowText } = body;
  let { styleProfileText } = body;

  if (!taskId || !scriptText) {
    return NextResponse.json({ error: 'taskId and scriptText are required' }, { status: 400 });
  }

  // If styleId provided, load style profile from DB (more reliable than client-side extraction)
  if (styleId && !styleProfileText) {
    const style = await prisma.stylePreset.findUnique({
      where: { id: styleId },
      select: { metadata: true, spec: true },
    });
    styleProfileText = extractStyleProfileFromStyle(style);
  }

  // 先把状态写入 DB，关闭弹窗后重新打开仍能显示"生成中"
  const existing = await prisma.creativeTask.findUnique({
    where: { id: taskId },
    select: { id: true, metadata: true },
  });
  if (existing) {
    const currentMeta = (existing.metadata as Record<string, unknown>) ?? {};
    const currentCustom = (currentMeta.custom as Record<string, unknown>) ?? {};
    await prisma.creativeTask.update({
      where: { id: taskId },
      data: {
        metadata: {
          ...currentMeta,
          custom: {
            ...currentCustom,
            t2v_status: 'processing',
            t2v_shots: null,
            t2v_style: {
              creativeStyleRaw: creativeStyleRaw ?? null,
              creativeStyleNorm: creativeStyleNorm ?? null,
              styleProfileText: styleProfileText ?? null,
              allowText: allowText ?? false,
            },
          },
        },
      },
    });
  }

  const apiKey = (await getApiKeyForUser(userId)) ?? process.env.DEFAULT_USER_API_KEY ?? '';
  const callbackBase = (process.env.N8N_CALLBACK_BASE_URL ?? '').replace(/\/+$/, '') || request.nextUrl.origin;
  const callbackUrl = `${callbackBase}/api/webhook/t2v-callback`;

  await triggerT2V({
    taskId,
    title: title ?? '',
    scriptText,
    apiKey,
    callbackUrl,
    creativeStyleRaw,
    creativeStyleNorm,
    styleProfileText,
    allowText,
  });

  return NextResponse.json({ ok: true });
}
