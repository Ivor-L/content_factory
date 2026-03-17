import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getApiKeyForUser } from '@/lib/authServer';
import { deductCredits } from '@/lib/credits';
import { emitStoryboardTaskUpsert } from '@/lib/storyboardEvents';

function normalizeTaskId(payload: any, queryTaskId?: string | null): string | null {
  return (
    queryTaskId ||
    payload?.task_id ||
    payload?.taskId ||
    payload?.taskID ||
    payload?.data?.task_id ||
    payload?.body?.task_id ||
    null
  );
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const queryTaskId =
      url.searchParams.get('task_id') ||
      url.searchParams.get('taskId') ||
      url.searchParams.get('taskID') ||
      null;
    const rawBody = await request.json().catch(() => ({}));
    const taskId = normalizeTaskId(rawBody, queryTaskId);

    if (!taskId) {
      console.error('Storyboard split webhook missing task_id', rawBody);
      return NextResponse.json({ error: 'Missing task_id' }, { status: 400 });
    }

    const parseJsonValue = (value: any) => {
      if (!value) return null;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      }
      return value;
    };

    const storyboardStructure = parseJsonValue(
      rawBody.storyboard_structure ||
        rawBody.storyboardStructure ||
        rawBody.data?.storyboard_structure ||
        rawBody.data?.storyboardStructure ||
        rawBody.results ||
        null
    );

    const storyboardImages = (() => {
      const rawImages =
        rawBody.storyboard_images ||
        rawBody.storyboardImages ||
        rawBody.data?.storyboard_images ||
        rawBody.storyboard_image_urls ||
        null;
      const parsed = parseJsonValue(rawImages) ?? parseJsonValue(rawBody.results);
      const arrayCandidate = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.images)
        ? parsed.images
        : null;
      if (!arrayCandidate) return parsed && Array.isArray(parsed.results) ? parsed.results : null;
      const normalized = arrayCandidate
        .map((item: any) => {
          if (!item) return null;
          if (typeof item === 'string') return { url: item };
          if (typeof item === 'object') {
            const url = item.url || item.image_url || item.imageUrl;
            if (!url) return null;
            return { ...item, url };
          }
          return null;
        })
        .filter(Boolean);
      return normalized.length > 0 ? normalized : null;
    })();

    const imageUrl =
      rawBody.storyboard_image_url ||
      rawBody.storyboardImageUrl ||
      rawBody.image_url ||
      rawBody.data?.storyboard_image_url ||
      (Array.isArray(storyboardImages) ? storyboardImages[0]?.url : null) ||
      rawBody.results?.[0]?.url ||
      null;

    const statusString = String(rawBody.status || rawBody.event || '').toUpperCase();
    const isSuccess = statusString === 'SUCCESS' || rawBody.code === 0;

    const existingTask = await prisma.storyboardTask.findUnique({
      where: { id: taskId },
    });

    const task = await prisma.storyboardTask.update({
      where: { id: taskId },
      data: {
        storyboardImageUrl: imageUrl ?? undefined,
        storyboardStructure: storyboardStructure ?? undefined,
        storyboardImages: storyboardImages ?? undefined,
        status: isSuccess ? 'SPLIT_COMPLETED' : 'SPLIT_FAILED',
        progress: isSuccess ? 100 : existingTask?.progress ?? 0,
      },
    });
    emitStoryboardTaskUpsert(task);

    if (isSuccess && task?.userId) {
      try {
        const apiKey = await getApiKeyForUser(task.userId);
        if (apiKey) {
          await deductCredits(apiKey, {
            amount: 1,
            workflowId: 'flow_storyboard_Split',
            workflowName: 'Storyboard Split',
            reason: 'storyboard_split',
          });
        }
      } catch (error) {
        console.error('Failed to deduct credits for storyboard split', error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing storyboard split webhook', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
