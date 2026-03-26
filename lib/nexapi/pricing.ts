import prisma from '@/lib/prisma';
import type { model_prices } from '@prisma/client';

export interface ModelPriceInfo {
  modelId: string;
  displayName: string;
  provider: string;
  type: string;
  baseCostCnyPer1K: number;
  sellPriceCnyPer1K: number;
  minIncrement: number;
  routes: string[];
  capabilities: string[];
  description?: string | null;
  docsLink?: string | null;
  status: string;
  updatedAt: Date;
}

const DEFAULT_MARKUP = 5;
const CREDITS_PER_CNY = 100;

export async function listModelPrices(): Promise<ModelPriceInfo[]> {
  const models = await prisma.model_prices.findMany({
    orderBy: { display_name: 'asc' },
  });
  return models.map(mapModelPrice);
}

export async function getModelPrice(modelId: string): Promise<ModelPriceInfo | null> {
  const model = await prisma.model_prices.findUnique({ where: { model_id: modelId } });
  return model ? mapModelPrice(model) : null;
}

export async function upsertModelPrice(data: Omit<ModelPriceInfo, 'updatedAt'>) {
  await prisma.model_prices.upsert({
    where: { model_id: data.modelId },
    update: {
      display_name: data.displayName,
      provider: data.provider,
      type: data.type,
      base_cost_cny_per_1k: data.baseCostCnyPer1K,
      sell_price_cny_per_1k: data.sellPriceCnyPer1K,
      min_increment: data.minIncrement,
      routes: data.routes,
      capabilities: data.capabilities,
      description: data.description,
      docs_link: data.docsLink,
      status: data.status,
    },
    create: {
      model_id: data.modelId,
      display_name: data.displayName,
      provider: data.provider,
      type: data.type,
      base_cost_cny_per_1k: data.baseCostCnyPer1K,
      sell_price_cny_per_1k: data.sellPriceCnyPer1K,
      min_increment: data.minIncrement,
      routes: data.routes,
      capabilities: data.capabilities,
      description: data.description,
      docs_link: data.docsLink,
      status: data.status,
    },
  });
}

export function computePricing({
  model,
  promptTokens,
  completionTokens,
}: {
  model: ModelPriceInfo;
  promptTokens: number;
  completionTokens: number;
}) {
  const totalTokens = promptTokens + completionTokens;
  const units = totalTokens / 1000;
  const baseCost = roundCurrency(model.baseCostCnyPer1K * units);
  const sellCost =
    model.sellPriceCnyPer1K > 0
      ? roundCurrency(model.sellPriceCnyPer1K * units)
      : roundCurrency(model.baseCostCnyPer1K * DEFAULT_MARKUP * units);
  const credits = Math.round(sellCost * CREDITS_PER_CNY);
  return { baseCost, sellCost, credits };
}

function mapModelPrice(model: model_prices) {
  return {
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
    updatedAt: model.updated_at ?? new Date(),
  };
}

function roundCurrency(amount: number) {
  return Math.round(amount * 10000) / 10000;
}
