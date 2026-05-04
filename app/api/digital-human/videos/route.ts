import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import {
  createDigitalHumanJobs,
  type DigitalHumanMode,
  type DigitalHumanSourceType,
} from '@/lib/digitalHumanJob';

function inferSourceType(url: string | null | undefined): DigitalHumanSourceType {
  const normalized = String(url ?? '').trim().toLowerCase();
  if (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(normalized)) return 'VIDEO';
  return 'IMAGE';
}

function serializeVideo(video: Awaited<ReturnType<typeof prisma.digitalHumanVideo.findFirst>> & { id: string }) {
  if (!video) return null;
  return {
    id: video.id,
    type: video.type,
    status: video.status,
    sourceType: inferSourceType(video.imageUrl),
    imageUrl: video.imageUrl,
    audioUrl: video.audioUrl,
    scriptContent: video.scriptContent,
    resultUrl: video.resultUrl,
    durationSeconds: video.durationSeconds,
    workflowId: video.workflowId,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get('limit') ?? '30');
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 30;

  const videos = await prisma.digitalHumanVideo.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ data: videos.map((video) => serializeVideo(video)!) });
}

type CreatePayload = {
  type?: DigitalHumanMode;
  mode?: DigitalHumanMode;
  sourceType?: DigitalHumanSourceType | string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  emoAudioUrl?: string | null;
  scriptContent?: string | null;
  durationSeconds?: number | string | null;
  sourceWidth?: number | string | null;
  sourceHeight?: number | string | null;
  sourceTaskId?: string | null;
};

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

  const type = (payload.type ?? payload.mode)?.toUpperCase() as DigitalHumanMode | undefined;
  if (!type || (type !== 'LIP_SYNC' && type !== 'VOICE_CLONE')) {
    return NextResponse.json({ error: 'type must be LIP_SYNC or VOICE_CLONE' }, { status: 400 });
  }
  const sourceTypeRaw = String(payload.sourceType ?? 'IMAGE').toUpperCase();
  const sourceType: DigitalHumanSourceType = sourceTypeRaw === 'VIDEO' ? 'VIDEO' : 'IMAGE';
  const imageUrl = typeof payload.imageUrl === 'string' ? payload.imageUrl.trim() : '';
  const videoUrl = typeof payload.videoUrl === 'string' ? payload.videoUrl.trim() : '';
  const resolvedSourceUrl = sourceType === 'VIDEO' ? (videoUrl || imageUrl) : (imageUrl || videoUrl);
  if (!resolvedSourceUrl) {
    return NextResponse.json(
      { error: sourceType === 'VIDEO' ? 'videoUrl is required' : 'imageUrl is required' },
      { status: 400 }
    );
  }
  if (!payload.audioUrl || typeof payload.audioUrl !== 'string') {
    return NextResponse.json({ error: 'audioUrl is required' }, { status: 400 });
  }
  if (type === 'VOICE_CLONE' && !payload.scriptContent) {
    return NextResponse.json({ error: 'VOICE_CLONE requires scriptContent' }, { status: 400 });
  }

  const parsedDuration =
    typeof payload.durationSeconds === 'number'
      ? payload.durationSeconds
      : payload.durationSeconds != null
        ? Number(payload.durationSeconds)
        : null;
  const durationSeconds =
    parsedDuration != null && Number.isFinite(parsedDuration) && parsedDuration > 0
      ? parsedDuration
      : null;
  const parsedSourceWidth =
    typeof payload.sourceWidth === 'number'
      ? payload.sourceWidth
      : payload.sourceWidth != null
        ? Number(payload.sourceWidth)
        : null;
  const parsedSourceHeight =
    typeof payload.sourceHeight === 'number'
      ? payload.sourceHeight
      : payload.sourceHeight != null
        ? Number(payload.sourceHeight)
        : null;
  const sourceWidth =
    parsedSourceWidth != null && Number.isFinite(parsedSourceWidth) && parsedSourceWidth > 0
      ? parsedSourceWidth
      : null;
  const sourceHeight =
    parsedSourceHeight != null && Number.isFinite(parsedSourceHeight) && parsedSourceHeight > 0
      ? parsedSourceHeight
      : null;
  const sourceTaskId =
    typeof payload.sourceTaskId === 'string' && payload.sourceTaskId.trim().length > 0
      ? payload.sourceTaskId.trim()
      : undefined;

  try {
    const batch = await createDigitalHumanJobs({
      type,
      sourceType,
      sourceWidth,
      sourceHeight,
      imageUrl: sourceType === 'IMAGE' ? resolvedSourceUrl : undefined,
      videoUrl: sourceType === 'VIDEO' ? resolvedSourceUrl : undefined,
      audioUrl: payload.audioUrl,
      script: payload.scriptContent,
      emoAudioUrl: payload.emoAudioUrl,
      durationSeconds,
      userId,
      sourceTaskId,
      splitIfNeeded: false,
    });
    const video = batch.jobs[0];
    if (!video) {
      return NextResponse.json({ error: 'Failed to create digital human job' }, { status: 500 });
    }

    return NextResponse.json(
      {
        data: serializeVideo(video),
        videoIds: batch.jobs.map((job) => job.id),
        jobCount: batch.jobs.length,
        split: batch.isSplit,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create digital human job via API', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create digital human job' },
      { status: 500 }
    );
  }
}
