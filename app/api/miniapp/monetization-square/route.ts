import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  DEFAULT_MONETIZATION_SQUARE_CONFIG,
  DEFAULT_MONETIZATION_SQUARE_KEY,
  normalizeMonetizationConfig,
} from '@/lib/monetizationSquare';

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key') || DEFAULT_MONETIZATION_SQUARE_KEY;

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
          config: DEFAULT_MONETIZATION_SQUARE_CONFIG,
          version: 1,
          source: 'fallback',
        },
      });
    }

    return NextResponse.json({
      data: {
        key,
        config: normalizeMonetizationConfig(found.config),
        version: found.version,
        source: 'db',
      },
    });
  } catch {
    return NextResponse.json({
      data: {
        key,
        config: DEFAULT_MONETIZATION_SQUARE_CONFIG,
        version: 1,
        source: 'fallback',
      },
    });
  }
}
