import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/earn/auth';
import { chargeEarnFeature } from '@/lib/earn/credits';
import { jsonError, unauthorized } from '@/lib/earn/response';
import { applyTask, badRequest } from '@/lib/earn/service';
import { safeTrim } from '@/lib/earn/normalize';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(request);
  if (!auth) return unauthorized();

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw badRequest('Invalid JSON body');

    const platform = safeTrim(body.platform);
    if (!platform) throw badRequest('Missing platform');

    await chargeEarnFeature({
      apiKey: auth.apiKey,
      userId: auth.userId!,
      featureKey: 'earn_task_apply',
      workflowName: '淘金任务接单',
      defaultAmount: 0,
    });

    const { id } = await params;
    const result = await applyTask({
      taskId: id,
      userId: auth.userId!,
      platform,
      platformUid: safeTrim(body.platformUid),
      platformAccountName: safeTrim(body.platformAccountName),
      taskMaterialId: safeTrim(body.taskMaterialId),
    });

    return NextResponse.json({
      data: result.userTask,
      existing: result.existing,
    });
  } catch (error) {
    return jsonError(error);
  }
}
