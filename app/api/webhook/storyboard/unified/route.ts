import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isValidAdminWebhookRequest } from '@/lib/webhookAuth';
import { normalizeStoryboardSegments } from '@/lib/storyboardTime';
import { emitStoryboardTaskUpsert } from '@/lib/storyboardEvents';
import { syncTaskToSummary } from '@/lib/taskSummary';

type JsonRecord = Record<string, unknown>;

type ShotPayload = {
  idx?: unknown;
  order?: unknown;
  shot_number?: unknown;
  time_range?: unknown;
  timeRange?: unknown;
  timestamp?: unknown;
  duration?: unknown;
  estimatedSeconds?: unknown;
  estimated_seconds?: unknown;
  duration_seconds?: unknown;
  voiceover?: unknown;
  speech?: unknown;
  text?: unknown;
  original_script?: unknown;
  image_prompt?: unknown;
  imagePrompt?: unknown;
  first_frame?: unknown;
  video_prompt?: unknown;
  videoPrompt?: unknown;
  image_url?: unknown;
  imageUrl?: unknown;
  video_url?: unknown;
  videoUrl?: unknown;
  has_product?: unknown;
  hasProduct?: unknown;
  是否有产品?: unknown;
  has_person?: unknown;
  hasPerson?: unknown;
};

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const readNumber = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const readPositiveNumber = (value: unknown, fallback: number): number => {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return num;
  return fallback;
};

const readPositiveInt = (value: unknown, fallback: number): number => {
  const num = Number(value);
  if (Number.isInteger(num) && num > 0) return num;
  return fallback;
};

const parseJsonMaybe = (value: unknown): JsonRecord | null => {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JsonRecord;
    }
  } catch {
    return null;
  }
  return null;
};

const parseArrayMaybe = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const readBool = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (['1', 'true', 'yes', 'y', '是', '有'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', '否', '无'].includes(v)) return false;
  return null;
};

const normalizeStatus = (input: string, hasShots: boolean): string => {
  const status = input.toLowerCase();
  if (['success', 'succeeded', 'completed', 'done', 'finished'].includes(status)) return 'COMPLETED';
  if (['failed', 'error', 'errored', 'fail', 'timeout', 'cancelled', 'canceled'].includes(status)) return 'FAILED';
  if (['running', 'processing', 'in_progress', 'started'].includes(status)) return 'RUNNING';
  if (['queued', 'pending', 'created'].includes(status)) return 'QUEUED';
  if (!status && hasShots) return 'COMPLETED';
  return 'RUNNING';
};

const statusToProgress = (status: string): number => {
  if (status === 'COMPLETED') return 100;
  if (status === 'FAILED') return 0;
  if (status === 'QUEUED') return 10;
  return 40;
};

const pickTaskId = (body: JsonRecord, workflowData: JsonRecord | null): string => {
  return (
    readString(body.task_id) ||
    readString(body.taskId) ||
    readString(body.record_id) ||
    readString(body.recordId) ||
    readString(workflowData?.task_id) ||
    readString(workflowData?.taskId) ||
    readString(workflowData?.record_id) ||
    readString(workflowData?.recordId)
  );
};

const pickStage = (body: JsonRecord, workflowData: JsonRecord | null): string => {
  return readString(body.stage) || readString(body.event) || readString(workflowData?.stage) || 'breakdown';
};

const pickShots = (body: JsonRecord, workflowData: JsonRecord | null): ShotPayload[] => {
  const candidates = [
    body.shots,
    (body.data as JsonRecord | undefined)?.shots,
    body.results,
    (body.data as JsonRecord | undefined)?.results,
    workflowData?.shots,
    workflowData?.results,
    workflowData?.scene_breakdown,
  ];

  for (const candidate of candidates) {
    const arr = parseArrayMaybe(candidate);
    if (arr.length > 0) {
      return arr.filter((item): item is ShotPayload => Boolean(item) && typeof item === 'object') as ShotPayload[];
    }
  }
  return [];
};

const asJsonValue = (
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
};

export async function POST(request: Request) {
  try {
    if (!isValidAdminWebhookRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as JsonRecord | null;
    if (!body) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const workflowData =
      parseJsonMaybe(body.workflow_data) ||
      parseJsonMaybe(body.workflowData) ||
      parseJsonMaybe((body.data as JsonRecord | undefined)?.workflow_data) ||
      parseJsonMaybe((body.data as JsonRecord | undefined)?.workflowData) ||
      parseJsonMaybe(body.result) ||
      null;

    const taskId = pickTaskId(body, workflowData);
    if (!taskId) {
      return NextResponse.json({ error: 'Missing task_id' }, { status: 400 });
    }

    const stage = pickStage(body, workflowData);
    const shots = pickShots(body, workflowData);
    const normalizedStatus = normalizeStatus(readString(body.status) || readString(workflowData?.status), shots.length > 0);
    const errorMessage =
      readString(body.error) ||
      readString(body.error_message) ||
      readString(body.errorMessage) ||
      readString(workflowData?.error) ||
      readString((body.data as JsonRecord | undefined)?.error);

    const task = await prisma.storyboardTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ success: true, ignored: true, reason: 'task_not_found', task_id: taskId });
    }

    if (shots.length > 0) {
      const segmentInputs = shots.map((shot, index) => {
        const hasProduct = readBool(shot['是否有产品'] ?? shot.has_product ?? shot.hasProduct);
        const hasPerson = readBool(shot.has_person ?? shot.hasPerson);

        return {
          taskId,
          order: readPositiveInt(shot.idx ?? shot.order ?? shot.shot_number, index + 1),
          duration: readPositiveNumber(
            shot.duration ?? shot.estimatedSeconds ?? shot.estimated_seconds ?? shot.duration_seconds,
            8,
          ),
          timeRange: readString(shot.time_range ?? shot.timeRange ?? shot.timestamp),
          originalScript: readString(shot.voiceover ?? shot.speech ?? shot.text ?? shot.original_script),
          imagePrompt: readString(shot.image_prompt ?? shot.imagePrompt ?? shot.first_frame),
          videoPrompt: readString(shot.video_prompt ?? shot.videoPrompt),
          generatedImage: readString(shot.image_url ?? shot.imageUrl),
          generatedVideo: readString(shot.video_url ?? shot.videoUrl),
          generationParams: {
            hasProduct,
            hasPerson,
            stage,
          },
        };
      });

      const normalizedSegments = normalizeStoryboardSegments(segmentInputs);

      await prisma.$transaction([
        prisma.storyboardSegment.deleteMany({ where: { taskId } }),
        prisma.storyboardSegment.createMany({
          data: normalizedSegments.map((segment) => ({
            taskId,
            order: segment.order,
            duration: segment.duration,
            timeRange: segment.timeRange,
            originalScript: segment.originalScript || null,
            imagePrompt: segment.imagePrompt || null,
            videoPrompt: segment.videoPrompt || null,
            generatedImage: segment.generatedImage || null,
            generatedVideo: segment.generatedVideo || null,
            generationParams: segment.generationParams as Prisma.InputJsonValue,
            status: normalizedStatus,
          })),
        }),
      ]);
    }

    const mergedBreakdown = {
      ...(task.detailedBreakdown && typeof task.detailedBreakdown === 'object' ? (task.detailedBreakdown as JsonRecord) : {}),
      pipeline_key:
        readString(body.pipeline_key) ||
        readString(workflowData?.pipeline_key) ||
        (task.detailedBreakdown as JsonRecord | null)?.pipeline_key ||
        null,
      last_callback: {
        stage,
        status: normalizedStatus,
        has_shots: shots.length > 0,
        received_at: new Date().toISOString(),
      },
      workflow_data: workflowData,
    };

    const updatedTask = await prisma.storyboardTask.update({
      where: { id: taskId },
      data: {
        status: normalizedStatus,
        progress: statusToProgress(normalizedStatus),
        detailedBreakdown: asJsonValue(mergedBreakdown),
      },
    });

    await syncTaskToSummary({ taskType: 'storyboard', taskId, operation: 'update' });
    emitStoryboardTaskUpsert(updatedTask);

    return NextResponse.json({
      success: true,
      task_id: taskId,
      status: normalizedStatus,
      stage,
      segment_count: shots.length,
      error: errorMessage || null,
    });
  } catch (error) {
    console.error('[storyboard/unified webhook] Failed to process callback', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
