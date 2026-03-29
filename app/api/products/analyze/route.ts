import { NextResponse } from 'next/server';
import { analyzeProduct } from '@/lib/n8n';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { deductCredits } from '@/lib/credits';
import { getCreditCost } from '@/lib/creditCosts';
import { logCreditUsage } from '@/lib/logCreditUsage';

const PRODUCT_ANALYSIS_WORKFLOW_ID = 'flow_product_dna';
const PRODUCT_ANALYSIS_WORKFLOW_NAME = '产品分析';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, images, productId } = body;
    const bodyApiKey: string | null = body?.apiKey ?? null;
    const context = await getRequestUserContext(request);
    const apiKey = bodyApiKey || context.apiKey;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing API Key. Please configure it in Settings.' },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { error: 'Product name is required' },
        { status: 400 }
      );
    }

    const imageList = Array.isArray(images) ? images : [];

    if (productId) {
        await prisma.product.update({
            where: { id: productId },
            data: {
                analysisResult: JSON.stringify({ status: 'ANALYZING' }),
                status: 'PROCESSING',
                progress: 0
            } as any
        });

        const analysis = await analyzeProduct({
            name,
            description: description || '',
            images: imageList,
            productId,
            apiKey,
            workflowId: PRODUCT_ANALYSIS_WORKFLOW_ID,
            workflowName: PRODUCT_ANALYSIS_WORKFLOW_NAME,
        });

        // 触发成功后扣费
        const amount = await getCreditCost('product_analysis', 2);
        deductCredits(apiKey, {
          amount,
          reason: 'product_analysis',
          workflowId: PRODUCT_ANALYSIS_WORKFLOW_ID,
          workflowName: PRODUCT_ANALYSIS_WORKFLOW_NAME,
        }).catch((e) => console.error('[product/analyze] deduct credits failed:', e));
        logCreditUsage({ featureKey: 'product_analysis', userId: context.userId, amount, success: true });

        return NextResponse.json(analysis);
    }

    const analysis = await analyzeProduct({
      name,
      description: description || '',
      images: imageList,
      apiKey,
      workflowId: PRODUCT_ANALYSIS_WORKFLOW_ID,
      workflowName: PRODUCT_ANALYSIS_WORKFLOW_NAME,
    });

    const amount = await getCreditCost('product_analysis', 2);
    deductCredits(apiKey, {
      amount,
      reason: 'product_analysis',
      workflowId: PRODUCT_ANALYSIS_WORKFLOW_ID,
      workflowName: PRODUCT_ANALYSIS_WORKFLOW_NAME,
    }).catch((e) => console.error('[product/analyze] deduct credits failed:', e));
    logCreditUsage({ featureKey: 'product_analysis', userId: context.userId, amount, success: true });

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Error analyzing product:', error);
    logCreditUsage({ featureKey: 'product_analysis', success: false, errorMessage: error instanceof Error ? error.message : 'Unknown error' });
    return NextResponse.json(
      { error: 'Failed to analyze product' },
      { status: 500 }
    );
  }
}
