import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';

export async function GET(request: Request) {
  const ctx = await getRequestUserContext(request);
  if (!ctx.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const models = await prisma.modelPrice.findMany({
    orderBy: { displayName: 'asc' },
  });

  return NextResponse.json({
    ok: true,
    models: models.map((model) => ({
      modelId: model.modelId,
      displayName: model.displayName,
      provider: model.provider,
      type: model.type,
      baseCostCnyPer1K: Number(model.baseCostCnyPer1K),
      sellPriceCnyPer1K: Number(model.sellPriceCnyPer1K),
      minIncrement: model.minIncrement,
      routes: model.routes,
      capabilities: model.capabilities,
      description: model.description,
      docsLink: model.docsLink,
      status: model.status,
      updatedAt: model.updatedAt,
    })),
  });
}
