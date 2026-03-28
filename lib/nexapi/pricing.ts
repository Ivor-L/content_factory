import prisma from '@/lib/prisma';
import type { ModelPrice } from '@prisma/client';

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
  const models = await prisma.modelPrice.findMany({
    orderBy: { displayName: 'asc' },
  });
  return models.map(mapModelPrice);
}

export async function getModelPrice(modelId: string): Promise<ModelPriceInfo | null> {
  const model = await prisma.modelPrice.findUnique({ where: { modelId } });
  return model ? mapModelPrice(model) : null;
}

export async function upsertModelPrice(data: Omit<ModelPriceInfo, 'updatedAt'>) {
  await prisma.modelPrice.upsert({
    where: { modelId: data.modelId },
    update: {
      displayName: data.displayName,
      provider: data.provider,
      type: data.type,
      baseCostCnyPer1K: data.baseCostCnyPer1K,
      sellPriceCnyPer1K: data.sellPriceCnyPer1K,
      minIncrement: data.minIncrement,
      routes: data.routes,
      capabilities: data.capabilities,
      description: data.description,
      docsLink: data.docsLink,
      status: data.status,
    },
    create: {
      modelId: data.modelId,
      displayName: data.displayName,
      provider: data.provider,
      type: data.type,
      baseCostCnyPer1K: data.baseCostCnyPer1K,
      sellPriceCnyPer1K: data.sellPriceCnyPer1K,
      minIncrement: data.minIncrement,
      routes: data.routes,
      capabilities: data.capabilities,
      description: data.description,
      docsLink: data.docsLink,
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

function mapModelPrice(model: ModelPrice) {
  return {
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
    updatedAt: model.updatedAt ?? new Date(),
  };
}

function roundCurrency(amount: number) {
  return Math.round(amount * 10000) / 10000;
}
