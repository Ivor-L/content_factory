import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/earn/auth';
import { jsonError, unauthorized } from '@/lib/earn/response';
import { parsePluginAccounts } from '@/lib/earn/plugin';
import { badRequest } from '@/lib/earn/service';

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth) return unauthorized();

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

    let accounts;
    try {
      accounts = parsePluginAccounts(body);
    } catch (error) {
      if (error instanceof Error && error.message === 'Missing accounts') {
        await prisma.earnPluginEvent.create({
          data: {
            userId: auth.userId!,
            eventType: 'accounts_sync_requested',
            platform: typeof body.platform === 'string' ? body.platform : null,
            payload: { source: 'web_bridge', note: 'No platform account payload was provided.' },
          },
        });
        return NextResponse.json({
          data: [],
          needsPlatformPage: true,
          message: 'Open the target platform page with the extension installed to sync account details.',
        });
      }
      throw error;
    }
    if (!accounts) throw badRequest('Missing accounts');
    const saved = await Promise.all(
      accounts.map(account => prisma.earnPluginAccount.upsert({
        where: {
          userId_platform_platformUid: {
            userId: auth.userId!,
            platform: account.platform,
            platformUid: account.platformUid,
          },
        },
        create: {
          userId: auth.userId!,
          platform: account.platform,
          platformUid: account.platformUid,
          nickname: account.nickname,
          avatarUrl: account.avatarUrl,
          status: account.status,
          metadata: account.metadata,
        },
        update: {
          nickname: account.nickname,
          avatarUrl: account.avatarUrl,
          status: account.status,
          metadata: account.metadata,
          lastSeenAt: new Date(),
        },
      })),
    );

    await prisma.earnPluginEvent.create({
      data: {
        userId: auth.userId!,
        eventType: 'accounts_sync',
        payload: { count: saved.length, platforms: saved.map(item => item.platform) },
      },
    });

    return NextResponse.json({ data: saved });
  } catch (error) {
    return jsonError(error);
  }
}
