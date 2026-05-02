import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  DEFAULT_HOT_SQUARE_DATA_CENTER_CONFIG,
  HOT_SQUARE_DATA_CENTER_KEY,
  normalizeHotSquareDataCenterConfig,
} from '@/lib/hotSquareDataCenter';

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key') || HOT_SQUARE_DATA_CENTER_KEY;

  try {
    const found = await prisma.monetizationSquareConfig.findFirst({
      where: {
        key,
        published: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!found) {
      return NextResponse.json({
        data: {
          key,
          config: DEFAULT_HOT_SQUARE_DATA_CENTER_CONFIG,
          version: 1,
          source: 'fallback',
        },
      });
    }

    return NextResponse.json({
      data: {
        key,
        config: normalizeHotSquareDataCenterConfig(found.config),
        version: found.version,
        source: 'db',
      },
    });
  } catch {
    return NextResponse.json({
      data: {
        key,
        config: DEFAULT_HOT_SQUARE_DATA_CENTER_CONFIG,
        version: 1,
        source: 'fallback',
      },
    });
  }
}
