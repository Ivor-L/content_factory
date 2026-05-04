import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { syncTaskToSummary } from '@/lib/taskSummary';

type CreatePayload = {
  imageUrl?: string;
  videoUrl?: string;
  referenceVideoUrl?: string;
  durationSeconds?: number | string | null;
  referenceDurationSeconds?: number | string | null;
};

function serializeVideo(video: Awaited<ReturnType<typeof prisma.digitalHumanVideo.findFirst>> & { id: string }) {
  if (!video) return null;
  return {
    id: video.id,
    type: video.type,
    status: video.status,
    sourceType: 'ACTION_TRANSFER',
    imageUrl: video.imageUrl,
    videoUrl: video.audioUrl,
    audioUrl: video.audioUrl,
    scriptContent: video.scriptContent,
    resultUrl: video.resultUrl,
    durationSeconds: video.durationSeconds,
    workflowId: video.workflowId,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  };
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function parsePositiveNumber(value: unknown): number | null {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: CreatePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const imageUrl = typeof payload.imageUrl === 'string' ? payload.imageUrl.trim() : '';
  const videoUrl =
    typeof payload.videoUrl === 'string'
      ? payload.videoUrl.trim()
      : typeof payload.referenceVideoUrl === 'string'
        ? payload.referenceVideoUrl.trim()
        : '';

  if (!imageUrl || !isHttpUrl(imageUrl)) {
    return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
  }
  if (!videoUrl || !isHttpUrl(videoUrl)) {
    return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 });
  }
  const durationSeconds =
    parsePositiveNumber(payload.durationSeconds) ??
    parsePositiveNumber(payload.referenceDurationSeconds);

  let apiKey: string | null = null;
  const profile = await prisma.profiles.findUnique({
    where: { id: userId },
    select: { api_key: true },
  });
  apiKey = profile?.api_key ?? process.env.DEFAULT_USER_API_KEY ?? null;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'No api_key found for this user. Please configure an API key in profiles or set DEFAULT_USER_API_KEY.' },
      { status: 400 }
    );
  }

  try {
    const workflowId = process.env.N8N_ACTION_TRANSFER_WORKFLOW_ID_FOR_CREDITS || 'flow_action_transfer_wan_animate';
    const record = await prisma.digitalHumanVideo.create({
      data: {
        type: 'ACTION_TRANSFER',
        imageUrl,
        audioUrl: videoUrl,
        scriptContent: '动作复刻',
        status: 'GENERATING',
        userId,
        workflowId,
        durationSeconds,
      },
    });

    await syncTaskToSummary({
      taskType: 'digitalHuman',
      taskId: record.id,
      operation: 'create',
    });

    const webhookUrl =
      process.env.N8N_ACTION_TRANSFER_WEBHOOK ||
      'https://hooks.atomx.top/webhook/action-transfer-wan-animate';
    const payloadToN8n = {
      task_id: record.id,
      image_url: imageUrl,
      video_url: videoUrl,
      reference_video_url: videoUrl,
      duration_seconds: durationSeconds,
      reference_duration_seconds: durationSeconds,
      type: 'ACTION_TRANSFER',
      timestamp: new Date().toISOString(),
      api_key: apiKey,
      workflow_id: workflowId,
      workflow_name: '动作迁移 Wan Animate',
    };

    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadToN8n),
    }).catch((error) => {
      console.error('Failed to trigger action transfer N8N webhook:', error);
    });

    return NextResponse.json({ data: serializeVideo(record) }, { status: 201 });
  } catch (error) {
    console.error('Failed to create action transfer job', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create action transfer job' },
      { status: 500 }
    );
  }
}
