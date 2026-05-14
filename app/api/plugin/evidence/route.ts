import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/earn/auth';
import { chargeEarnFeature } from '@/lib/earn/credits';
import { jsonError, unauthorized } from '@/lib/earn/response';
import { badRequest } from '@/lib/earn/service';
import { buildPluginEventInput } from '@/lib/earn/plugin';

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth) return unauthorized();

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw badRequest('Invalid JSON body');

    const input = buildPluginEventInput(body);
    if (input.featureKey) {
      await chargeEarnFeature({
        apiKey: auth.apiKey,
        userId: auth.userId!,
        featureKey: input.featureKey,
        workflowName: '浏览器插件事件',
        defaultAmount: 0,
      });
    }

    const event = await prisma.earnPluginEvent.create({
      data: {
        userId: auth.userId!,
        eventType: input.eventType,
        platform: input.platform,
        requestId: input.requestId,
        payload: input.payload,
      },
    });

    return NextResponse.json({ data: event });
  } catch (error) {
    return jsonError(error);
  }
}
