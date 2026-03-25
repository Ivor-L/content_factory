import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { emitStoryboardTaskUpsert } from '@/lib/storyboardEvents';
import { syncTaskToSummary } from '@/lib/taskSummary';

const DEFAULT_WEBHOOK_URL = 'https://n8n.atomx.top/webhook/897bb7fb-b878-4135-9aaf-d60beba1dbef';
const APP_BASE_URL = (
  process.env.N8N_CALLBACK_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  'http://localhost:3000'
).replace(/\/$/, '');

const WORKFLOW_ID = 'flow_xhs_chuangzuo';
const WORKFLOW_NAME = '正文转视频分镜';

type StoryboardLaunchRequest = {
  script?: unknown;
  title?: unknown;
  creativeTaskId?: unknown;
  metadata?: unknown;
};

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export async function POST(request: Request) {
  try {
    const { userId, apiKey } = await getRequestUserContext(request);
    if (!userId || !apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as StoryboardLaunchRequest | null;
    if (!payload) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const script = readString(payload.script);
    if (!script) {
      return NextResponse.json({ error: 'Script content is required' }, { status: 400 });
    }

    const title = readString(payload.title);
    const creativeTaskId = readString(payload.creativeTaskId);
    const webhookUrl = (process.env.N8N_STORYBOARD_SCRIPT_WEBHOOK || '').trim() || DEFAULT_WEBHOOK_URL;
    const callbackUrl = `${APP_BASE_URL}/api/webhook/storyboard-content`;

    const task = await prisma.storyboardTask.create({
      data: {
        status: 'ANALYZING',
        scriptContent: script,
        userId,
        progress: 5,
      } as any,
    });

    await syncTaskToSummary({
      taskType: 'storyboard',
      taskId: task.id,
      operation: 'create',
    });

    emitStoryboardTaskUpsert(task);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_id: task.id,
          record_id: task.id,
          api_key: apiKey,
          script,
          title,
          creative_task_id: creativeTaskId || undefined,
          workflow_id: WORKFLOW_ID,
          workflow_name: WORKFLOW_NAME,
          callback_url: callbackUrl,
          source: 'creative_workspace',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`n8n webhook failed: ${response.status} ${errorText}`);
      }
    } catch (error) {
      const failedTask = await prisma.storyboardTask.update({
        where: { id: task.id },
        data: { status: 'FAILED', progress: 0 },
      });
      emitStoryboardTaskUpsert(failedTask);
      console.error('Failed to trigger storyboard content workflow', error);
      return NextResponse.json({ error: 'Failed to start storyboard workflow' }, { status: 502 });
    }

    const syncedTask = await prisma.storyboardTask.update({
      where: { id: task.id },
      data: { taskId: task.id },
    });
    emitStoryboardTaskUpsert(syncedTask);

    return NextResponse.json({ success: true, taskId: task.id });
  } catch (error) {
    console.error('Unexpected error triggering storyboard workflow', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
