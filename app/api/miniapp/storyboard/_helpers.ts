import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export function safeParseImages(images: string | null | undefined): string[] {
  if (!images) return [];
  try {
    const parsed = JSON.parse(images);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    if (typeof parsed === 'string' && parsed.trim()) return [parsed.trim()];
  } catch {
    const list = images.split(',').map((item) => item.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }
  return [];
}

export function safeParseJson(value: string | null | undefined): unknown | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function safeReadString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringifyRawProductAnalysis(product: {
  sellingPoints?: string | null;
  analysisResult?: string | null;
}): string {
  const parsedSellingPoints = safeParseJson(product.sellingPoints);
  if (parsedSellingPoints) return JSON.stringify(parsedSellingPoints, null, 2);
  const parsedAnalysis = safeParseJson(product.analysisResult);
  if (parsedAnalysis) return JSON.stringify(parsedAnalysis, null, 2);
  return product.sellingPoints || product.analysisResult || '';
}

export function readMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export async function attachProductContext(input: {
  userId: string;
  productId?: string | null;
  pipelineKey: 'viral_clone' | 'skeleton_video';
  taskData: Record<string, unknown>;
  payloadData: Record<string, unknown>;
  metadata: Record<string, unknown>;
}) {
  const productId = safeReadString(input.productId);
  if (!productId) return null;

  const product = await prisma.product.findFirst({
    where: { id: productId, userId: input.userId },
    select: {
      id: true,
      name: true,
      description: true,
      sellingPoints: true,
      sellingPointsText: true,
      analysisResult: true,
      images: true,
    },
  });
  if (!product) {
    throw new Error('Selected product not found');
  }

  const imageList = safeParseImages(product.images);
  const primaryImage = imageList[0] || '';
  const productRawAnalysis = stringifyRawProductAnalysis(product);
  const productSellingPointsJson = product.sellingPoints || '[]';
  const productSellingPointsText = product.sellingPointsText || '';
  const productSellingPointsData = safeParseJson(productSellingPointsJson);
  const productSellingPointsForWorkflow = input.pipelineKey === 'skeleton_video'
    ? productRawAnalysis
    : productSellingPointsText || productSellingPointsJson;

  input.taskData.productId = product.id;
  input.payloadData.product_id = product.id;
  input.payloadData.productId = product.id;
  input.payloadData.product_name = product.name || '';
  input.payloadData.productName = product.name || '';
  input.payloadData.product_description = product.description || '';
  input.payloadData.productDescription = product.description || '';
  input.payloadData.product_selling_points = productSellingPointsForWorkflow;
  input.payloadData.productSellingPoints = productSellingPointsForWorkflow;
  input.payloadData.product_selling_points_json = productSellingPointsJson;
  input.payloadData.productSellingPointsJson = productSellingPointsJson;
  input.payloadData.product_selling_points_text = productSellingPointsText;
  input.payloadData.productSellingPointsText = productSellingPointsText;
  input.payloadData.product_raw_analysis = productRawAnalysis;
  input.payloadData.productRawAnalysis = productRawAnalysis;
  input.payloadData.product_analysis_result = product.analysisResult || '';
  input.payloadData.productAnalysisResult = product.analysisResult || '';
  if (productSellingPointsData !== null) {
    input.payloadData.product_selling_points_data = productSellingPointsData;
    input.payloadData.productSellingPointsData = productSellingPointsData;
  }
  input.payloadData.product_images = imageList;
  input.payloadData.productImages = imageList;
  input.payloadData.product_image_url = primaryImage;
  input.payloadData.productImageUrl = primaryImage;
  input.metadata.selected_product = {
    id: product.id,
    name: product.name || '',
    image_count: imageList.length,
  };

  return product;
}

export function attachLanguageContext(input: {
  metadata: Record<string, unknown>;
  payloadData: Record<string, unknown>;
}) {
  const targetLanguage =
    safeReadString(input.metadata.target_language) ||
    safeReadString(input.metadata.targetLanguage) ||
    safeReadString(input.metadata.language);
  const targetLanguageLabel =
    safeReadString(input.metadata.target_language_label) ||
    safeReadString(input.metadata.targetLanguageLabel);

  if (targetLanguage) {
    input.payloadData.target_language = targetLanguage;
    input.payloadData.targetLanguage = targetLanguage;
    input.payloadData.language = targetLanguage;
    input.payloadData.video_language = targetLanguage;
    input.payloadData.videoLanguage = targetLanguage;
  }
  if (targetLanguageLabel) {
    input.payloadData.target_language_label = targetLanguageLabel;
    input.payloadData.targetLanguageLabel = targetLanguageLabel;
    input.payloadData.language_label = targetLanguageLabel;
    input.payloadData.languageLabel = targetLanguageLabel;
  }
}

export async function attachCharacterContext(input: {
  userId: string;
  characterId: string;
  taskData: Record<string, unknown>;
  payloadData: Record<string, unknown>;
  metadata: Record<string, unknown>;
}) {
  const characterId = safeReadString(input.characterId);
  if (!characterId) throw new Error('character_id is required');

  const character = await prisma.character.findFirst({
    where: { id: characterId, userId: input.userId },
    select: { id: true, name: true, avatar: true },
  });
  if (!character) throw new Error('Selected character not found');

  input.taskData.characterId = character.id;
  input.payloadData.character_id = character.id;
  input.payloadData.characterId = character.id;
  input.payloadData.character_name = character.name || '';
  input.payloadData.characterName = character.name || '';
  input.payloadData.character_avatar = character.avatar || '';
  input.payloadData.characterAvatar = character.avatar || '';
  input.payloadData.character_image_url = character.avatar || '';
  input.payloadData.characterImageUrl = character.avatar || '';
  input.payloadData.person_image_url = character.avatar || '';
  input.payloadData.personImageUrl = character.avatar || '';
  input.metadata.selected_character = {
    id: character.id,
    name: character.name || '',
    has_avatar: Boolean(character.avatar),
  };

  return character;
}

export function storyboardJobErrorResponse(error: unknown, label: string) {
  console.error(`[miniapp/storyboard/${label}] Failed to create job`, error);
  const message = error instanceof Error ? error.message : 'Failed to create storyboard job';
  const lower = message.toLowerCase();
  const isWorkflowError = lower.includes('n8n webhook failed');
  const isCreditError = message.includes('积分') || lower.includes('credit') || lower.includes('insufficient');
  const isUserInputError =
    message.includes('not found') ||
    message.includes('required') ||
    message.includes('必须') ||
    message.includes('缺少');
  const status = isCreditError ? 402 : isWorkflowError ? 502 : isUserInputError ? 400 : 500;
  return NextResponse.json({ error: message, message }, { status });
}
