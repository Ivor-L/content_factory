import 'dotenv/config';

import { cacheReferenceMediaAssets } from '../lib/remoteMediaCache';
import { needsProxy } from '../lib/mediaProxy';
import prisma from '../lib/prisma';

const BATCH_SIZE = Number(process.env.MEDIA_CACHE_BACKFILL_BATCH ?? 25);
const TARGET_PLATFORMS = (process.env.MEDIA_CACHE_BACKFILL_PLATFORMS || 'tiktok,instagram')
  .split(',')
  .map((p) => p.trim().toLowerCase())
  .filter(Boolean);

function extractStrings(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  }
  return [];
}

function recordNeedsCaching(item: { coverUrl: string | null; videoUrl: string | null; mediaUrls: unknown }): boolean {
  const urls: string[] = [];
  if (typeof item.videoUrl === 'string') urls.push(item.videoUrl);
  if (typeof item.coverUrl === 'string') urls.push(item.coverUrl);
  urls.push(...extractStrings(item.mediaUrls));
  return urls.some((url) => needsProxy(url));
}

async function main() {
  let totalProcessed = 0;
  let totalUpdated = 0;
  let cursor: string | null = null;

  while (true) {
    const batch = await prisma.viralReferenceItem.findMany({
      where: {
        platform: { in: TARGET_PLATFORMS },
      },
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        platform: true,
        sourceId: true,
        coverUrl: true,
        videoUrl: true,
        mediaUrls: true,
      },
    });

    if (batch.length === 0) {
      break;
    }

    for (const item of batch) {
      cursor = item.id;
      totalProcessed += 1;
      if (!recordNeedsCaching(item)) {
        continue;
      }

      try {
        const cached = await cacheReferenceMediaAssets(
          {
            coverUrl: item.coverUrl,
            videoUrl: item.videoUrl,
            mediaUrls: extractStrings(item.mediaUrls),
          },
          { platform: item.platform, sourceId: item.sourceId },
        );

        const updateData: Record<string, unknown> = {};
        if (cached.coverUrl && cached.coverUrl !== item.coverUrl) {
          updateData.coverUrl = cached.coverUrl;
        }
        if (cached.videoUrl && cached.videoUrl !== item.videoUrl) {
          updateData.videoUrl = cached.videoUrl;
        }
        if (cached.mediaUrls && JSON.stringify(cached.mediaUrls) !== JSON.stringify(extractStrings(item.mediaUrls))) {
          updateData.mediaUrls = cached.mediaUrls;
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.viralReferenceItem.update({
            where: { id: item.id },
            data: updateData,
          });
          totalUpdated += 1;
          console.log(
            `[cached] ${item.platform} ${item.sourceId} -> ${updateData.videoUrl || updateData.coverUrl || 'media list'}`,
          );
        }
      } catch (error) {
        console.error(`[error] ${item.platform} ${item.sourceId}`, error);
      }
    }

    if (batch.length < BATCH_SIZE) {
      break;
    }
  }

  await prisma.$disconnect();
  console.log(`Done. processed=${totalProcessed}, updated=${totalUpdated}`);
}

main().catch((error) => {
  console.error('Backfill failed', error);
  process.exit(1);
});
