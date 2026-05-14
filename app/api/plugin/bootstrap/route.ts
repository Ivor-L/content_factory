import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/earn/auth';
import { jsonError, unauthorized } from '@/lib/earn/response';
import { PLUGIN_PLATFORMS } from '@/lib/earn/plugin';

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth) return unauthorized();

  try {
    const accounts = await prisma.earnPluginAccount.findMany({
      where: { userId: auth.userId! },
      orderBy: [{ lastSeenAt: 'desc' }],
    });
    const activeTasks = await prisma.earnUserTask.findMany({
      where: {
        userId: auth.userId!,
        status: { in: ['doing', 'rejected'] },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 20,
      include: {
        task: true,
        taskMaterial: true,
      },
    });

    return NextResponse.json({
      data: {
        version: '0.1.0',
        apiBaseUrl: new URL(request.url).origin,
        userId: auth.userId,
        platforms: PLUGIN_PLATFORMS,
        accounts,
        activeTasks,
        capabilities: [
          'checkPermission',
          'login',
          'getAccounts',
          'getEarnTasks',
          'collectCurrentPage',
          'captureEvidence',
          'publish',
          'xhsRequest',
          'douyinRequest',
        ],
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
