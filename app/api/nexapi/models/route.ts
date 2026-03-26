import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';

export async function GET(request: Request) {
  const ctx = await getRequestUserContext(request);
  if (!ctx.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const models = await prisma.model_prices.findMany({
    orderBy: { display_name: 'asc' },
  });

  return NextResponse.json({
    ok: true,
    models: models.map((model) => ({
      modelId: model.model_id,
      displayName: model.display_name,
      provider: model.provider,
      type: model.type,
      baseCostCnyPer1K: Number(model.base_cost_cny_per_1k),
      sellPriceCnyPer1K: Number(model.sell_price_cny_per_1k),
      minIncrement: model.min_increment,
      routes: model.routes,
      capabilities: model.capabilities,
      description: model.description,
      docsLink: model.docs_link,
      status: model.status,
      updatedAt: model.updated_at,
    })),
  });
}
