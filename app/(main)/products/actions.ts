'use server'

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { analyzeProduct } from '@/lib/n8n';
import { getServerRequestUserContext } from '@/lib/serverRequestContext';

const PRODUCT_ANALYSIS_WORKFLOW_ID = 'flow_product_dna';
const PRODUCT_ANALYSIS_WORKFLOW_NAME = '产品分析';

export async function createProduct(formData: FormData) {
  const { userId: currentUserId } = await getServerRequestUserContext();
  if (!currentUserId) {
    throw new Error('Unauthorized');
  }

  const name = formData.get('name') as string;
  const description = formData.get('description') as string;
  const sellingPoints = formData.get('sellingPoints') as string;
  const sellingPointsText = formData.get('sellingPointsText') as string;
  const images = formData.get('images') as string;
  const analysisResult = formData.get('analysisResult') as string;
  const status = formData.get('status') as string;
  const progress = formData.get('progress') ? parseInt(formData.get('progress') as string) : undefined;
  const id = formData.get('id') as string; // Check if updating an existing product

  if (!name) {
    throw new Error('Name is required');
  }

  // Validate JSON strings
  try {
    if (sellingPoints) JSON.parse(sellingPoints);
    if (images) JSON.parse(images);
    if (analysisResult) JSON.parse(analysisResult);
  } catch (e) {
    throw new Error('Invalid JSON format for sellingPoints, images or analysisResult');
  }

  if (id) {
    // Update existing product
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!existing || existing.userId !== currentUserId) {
      throw new Error('未找到对应的产品或无权限更新');
    }

    await prisma.product.update({
      where: { id },
      data: {
        name,
        description: description || '',
        sellingPoints: sellingPoints || '[]',
        sellingPointsText: sellingPointsText !== null ? sellingPointsText : undefined,
        images: images || '[]',
        analysisResult: analysisResult || null,
        status: status || undefined,
        progress: progress,
      } as any, // Cast to any to bypass linter
    });
  } else {
    // Create new product
    await prisma.product.create({
      data: {
        name,
        description: description || '',
        sellingPoints: sellingPoints || '[]',
        sellingPointsText: sellingPointsText || '',
        images: images || '[]',
        analysisResult: analysisResult || null,
        status: status || 'PENDING',
        progress: progress || 0,
        userId: currentUserId,
      } as any, // Cast to any to bypass linter
    });
  }

  revalidatePath('/products');
  // redirect('/products'); // Remove redirect to stay on same page (modal)
}

export async function saveProductWithAnalysis(formData: FormData) {
  const { userId, apiKey } = await getServerRequestUserContext();

  if (!userId) {
    throw new Error('请先登录后再上传产品');
  }
  if (!apiKey) {
    throw new Error('请先在设置页绑定 API Key');
  }

  const id = (formData.get('id') as string) || null;
  const name = (formData.get('name') as string)?.trim();
  if (!name) {
    throw new Error('Name is required');
  }

  const description = (formData.get('description') as string) || '';
  const sellingPoints = sanitizeJsonString(formData.get('sellingPoints') as string | null, 'sellingPoints', '[]');
  const sellingPointsText = (formData.get('sellingPointsText') as string) ?? '';
  const imageList = parseImageList(formData.get('images') as string | null);

  let productId: string;
  const baseData = {
    name,
    description,
    sellingPoints,
    sellingPointsText,
    images: JSON.stringify(imageList),
    analysisResult: JSON.stringify({ status: 'ANALYZING' }),
    status: 'PROCESSING',
    progress: 0,
    userId,
  } as any;

  if (id) {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new Error('未找到对应的产品或无权限更新');
    }
    await prisma.product.update({
      where: { id },
      data: baseData,
    });
    productId = id;
  } else {
    const product = await prisma.product.create({
      data: baseData,
    });
    productId = product.id;
  }

  revalidatePath('/products');
  revalidatePath('/resources');

  void triggerProductAnalysis({
    productId,
    apiKey,
    name,
    description,
    images: imageList,
  });

  return productId;
}

export async function createDraftProduct(formData: FormData) {
  const { userId } = await getServerRequestUserContext();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const name = formData.get('name') as string;
  const images = formData.get('images') as string;

  if (!name) throw new Error('Name is required');

  const product = await prisma.product.create({
    data: {
      name,
      description: '',
      sellingPoints: '[]',
      images: images || '[]',
      userId: userId, // Save user ID
      // analysisResult: null, // Removed field
    } as any,
  });

  return product.id;
}

export async function deleteProduct(id: string) {
    if (!id) throw new Error('ID is required');

    const { userId } = await getServerRequestUserContext();
    if (!userId) {
      throw new Error('Unauthorized');
    }

    const result = await prisma.product.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      throw new Error('未找到对应的产品或无权限删除');
    }

    revalidatePath('/products');
    revalidatePath('/resources');
}

type ProductAnalysisPayload = {
  productId: string;
  apiKey: string;
  name: string;
  description: string;
  images: string[];
};

function parseImageList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  } catch {
    throw new Error('Invalid JSON format for images');
  }
}

function sanitizeJsonString(source: string | null, field: string, fallback: string) {
  const value = source ?? fallback;
  try {
    JSON.parse(value);
    return value;
  } catch {
    throw new Error(`Invalid JSON format for ${field}`);
  }
}

async function triggerProductAnalysis(payload: ProductAnalysisPayload) {
  try {
    const analysis = await analyzeProduct({
      productId: payload.productId,
      apiKey: payload.apiKey,
      name: payload.name,
      description: payload.description,
      images: payload.images,
      workflowId: PRODUCT_ANALYSIS_WORKFLOW_ID,
      workflowName: PRODUCT_ANALYSIS_WORKFLOW_NAME,
    });
    // Write analysis result back to database on success
    const sellingPoints = analysis.workflowData ?? { selling_points: analysis.sellingPoints };
    await prisma.product.update({
      where: { id: payload.productId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        sellingPoints: JSON.stringify(sellingPoints),
        sellingPointsText: analysis.detailedDescription || null,
        analysisResult: JSON.stringify({ status: 'COMPLETED' }),
      } as any,
    });
    revalidatePath('/products');
    revalidatePath('/resources');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Product analysis failed';
    console.error('Product analysis trigger failed', error);
    await prisma.product.update({
      where: { id: payload.productId },
      data: {
        status: 'FAILED',
        analysisResult: JSON.stringify({ status: 'FAILED', message }),
      } as any,
    });
  }
}
