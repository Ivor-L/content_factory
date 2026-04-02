import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { syncTaskToSummary } from '@/lib/taskSummary';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    task_id?: string;
    status?: string;
    video_url?: string;
    error?: string;
  };

  const { task_id, status, video_url } = body;

  if (!task_id) {
    return NextResponse.json({ error: 'task_id is required' }, { status: 400 });
  }

  try {
    if (status === 'success' && video_url) {
      await prisma.storyboardTask.update({
        where: { id: task_id },
        data: {
          status: 'COMPLETED',
          finalVideoUrl: video_url,
          progress: 100,
        },
      });
      await syncTaskToSummary({
        taskType: 'storyboard',
        taskId: task_id,
        operation: 'update',
      });
    } else if (status === 'error') {
      await prisma.storyboardTask.update({
        where: { id: task_id },
        data: { status: 'MERGE_FAILED' },
      });
    }
  } catch (error) {
    console.error('[auto-edit-callback] failed', { task_id, error });
  }

  return NextResponse.json({ ok: true });
}
