import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { emitStoryboardTaskUpsert } from '@/lib/storyboardEvents';

const SPLIT_WEBHOOK_URLS = Array.from(
  new Set(
    [
      process.env.N8N_STORYBOARD_SPLIT_WEBHOOK,
      'https://hooks.atomx.top/webhook/storyboard_split_web',
      'https://hooks.atomx.top/webhook/storyboard_Split_web',
    ]
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
      .map((url) => url.trim())
  )
);

const APP_BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  'http://localhost:3000'
).replace(/\/$/, '');

type WebhookError = {
  status: number;
  url: string;
  body: string;
};

async function triggerSplitWorkflow(payload: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: WebhookError | null }> {
  if (SPLIT_WEBHOOK_URLS.length === 0) {
    return {
      ok: false,
      error: {
        status: 500,
        url: 'not-configured',
        body: 'No storyboard split webhook URL configured',
      },
    };
  }

  let lastError: WebhookError | null = null;
  for (const url of SPLIT_WEBHOOK_URLS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return { ok: true };
      }

      const errorText = await response.text().catch(() => response.statusText);
      lastError = {
        status: response.status,
        url,
        body: errorText.slice(0, 500),
      };
    } catch (error) {
      lastError = {
        status: 500,
        url,
        body: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  return { ok: false, error: lastError };
}

export async function POST(request: Request) {
  try {
    const { userId, apiKey } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const taskId = body.taskId as string | undefined;
    const storyboardImageUrl = (body.storyboardImageUrl as string | undefined)?.trim();

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    const task = await prisma.storyboardTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const imageUrl = storyboardImageUrl || task.storyboardImageUrl || task.coverImage || task.sceneImage;
    if (!imageUrl) {
      return NextResponse.json({ error: 'No storyboard image available for this task' }, { status: 400 });
    }

    const callbackUrl = `${APP_BASE_URL}/api/webhook/storyboard-split`;
    const payload = {
      workflow_id: 'flow_storyboard_Split',
      api_key: apiKey,
      storyboard_image_url: imageUrl,
      task_id: task.id,
      user_id: userId,
      callback_url: callbackUrl,
    };

    const triggerResult = await triggerSplitWorkflow(payload);
    if (!triggerResult.ok) {
      const normalizedError = triggerResult.error
        ? `${triggerResult.error.status} @ ${triggerResult.error.url} ${triggerResult.error.body}`
        : 'Unknown trigger error';
      return NextResponse.json(
        { error: `Split workflow failed: ${normalizedError}` },
        { status: triggerResult.error?.status === 404 ? 404 : 502 }
      );
    }

    const updatedTask = await prisma.storyboardTask.update({
      where: { id: task.id },
      data: {
        storyboardImageUrl: imageUrl,
        status: 'SPLIT_PENDING',
        userId,
      },
    });
    emitStoryboardTaskUpsert(updatedTask);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to trigger storyboard split workflow', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
