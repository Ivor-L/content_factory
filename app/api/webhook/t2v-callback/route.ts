import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { syncTaskToSummary } from '@/lib/taskSummary';
import type { T2VShot } from '@/lib/n8n';
import { Prisma } from '@prisma/client';
import { updateAgentRunsForBusiness } from '@/lib/agent-runs/callback-updates';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    task_id?: string;
    status?: string;
    data?: { shots?: T2VShot[]; title?: string };
  };

  const { task_id, status, data } = body;

  if (!task_id) {
    return NextResponse.json({ error: 'task_id is required' }, { status: 400 });
  }

  if (status === 'success' && Array.isArray(data?.shots) && data.shots.length > 0) {
    try {
      const existing = await prisma.creativeTask.findUnique({
        where: { id: task_id },
        select: { id: true, metadata: true, title: true, userId: true },
      });

      if (existing) {
        // 创建分镜板任务
        const shots = data.shots;
        const currentCustom = ((existing.metadata as Record<string, unknown>)?.custom as Record<string, unknown>) ?? {};
        const t2vStyle = (currentCustom.t2v_style as Record<string, unknown>) ?? {};

        const storyboardTask = await prisma.storyboardTask.create({
          data: {
            status: 'COMPLETED',
            scriptContent: shots.map((s) => `镜${s.shot_idx}：${s.speech_text}`).join('\n'),
            storyboardStructure: shots.map((s) => ({
              index: s.shot_idx,
              prompt: s.speech_text,
            })) as Prisma.InputJsonValue,
            detailedBreakdown: Object.keys(t2vStyle).length > 0
              ? ({ style: t2vStyle } as Prisma.InputJsonValue)
              : undefined,
            userId: existing.userId ?? undefined,
            progress: 100,
          } as any,
        });

        await prisma.storyboardSegment.createMany({
          data: shots.map((s) => ({
            taskId: storyboardTask.id,
            order: s.shot_idx - 1,
            duration: s.estimated_duration ?? 8,
            imagePrompt: s.image_prompt,
            videoPrompt: s.video_prompt,
            originalScript: s.speech_text,
            status: 'PENDING',
          })),
        });

        await syncTaskToSummary({
          taskType: 'storyboard',
          taskId: storyboardTask.id,
          operation: 'create',
        });

        // 把 storyboard_id 写回 creative task metadata
        const currentMeta = (existing.metadata as Record<string, unknown>) ?? {};
        await prisma.creativeTask.update({
          where: { id: task_id },
          data: {
            metadata: {
              ...currentMeta,
              custom: {
                ...currentCustom,
                t2v_status: 'done',
                t2v_storyboard_id: storyboardTask.id,
                t2v_shots: null,
              },
            },
          },
        });

        await updateAgentRunsForBusiness({
          businessType: 'creativeTask',
          businessId: task_id,
          businessStatus: 'done',
          status: 'succeeded',
          result: { data: { creativeTaskId: task_id, storyboardTaskId: storyboardTask.id, shots } },
        });
      }
    } catch (error) {
      console.error('[t2v-callback] failed', { task_id, error });
    }
  }

  return NextResponse.json({ ok: true });
}
