import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/earn/auth';
import { chargeEarnFeature } from '@/lib/earn/credits';
import { jsonError, unauthorized } from '@/lib/earn/response';
import { badRequest, buildSubmissionInput } from '@/lib/earn/service';
import { buildPluginEventInput } from '@/lib/earn/plugin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(request);
  if (!auth) return unauthorized();

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw badRequest('Invalid JSON body');

    const { id } = await params;
    const current = await prisma.earnUserTask.findFirst({
      where: { id, userId: auth.userId! },
    });
    if (!current) return NextResponse.json({ error: 'User task not found' }, { status: 404 });
    if (!['doing', 'rejected'].includes(current.status)) {
      throw badRequest('User task cannot be submitted in current status');
    }

    await chargeEarnFeature({
      apiKey: auth.apiKey,
      userId: auth.userId!,
      featureKey: 'earn_task_submit_evidence',
      workflowName: '插件提交淘金任务证据',
      defaultAmount: 0,
    });

    const pluginEvent = buildPluginEventInput({
      ...body,
      eventType: body.eventType || 'task_submit_evidence',
    });

    const updated = await prisma.$transaction(async (tx) => {
      const userTask = await tx.earnUserTask.update({
        where: { id },
        data: buildSubmissionInput(body),
        include: {
          task: true,
          taskMaterial: true,
        },
      });

      await tx.earnPluginEvent.create({
        data: {
          userId: auth.userId!,
          eventType: pluginEvent.eventType,
          platform: pluginEvent.platform,
          requestId: pluginEvent.requestId,
          payload: {
            ...pluginEvent.payload,
            userTaskId: id,
            taskId: current.taskId,
          },
        },
      });

      return userTask;
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return jsonError(error);
  }
}
