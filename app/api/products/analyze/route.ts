import { NextResponse } from 'next/server';
import { analyzeProduct } from '@/lib/n8n';
import prisma from '@/lib/prisma';
import { getRequestUserContext } from '@/lib/authServer';
import { deductConfiguredCredits } from '@/lib/creditBilling';
import { logCreditUsage } from '@/lib/logCreditUsage';

const PRODUCT_ANALYSIS_WORKFLOW_ID = 'flow_product_dna';
const PRODUCT_ANALYSIS_WORKFLOW_NAME = '产品分析';

export async function POST(request: Request) {
  let verifiedProductIdForFailure: string | null = null;
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
        if (!context.userId) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          );
        }

        const product = await prisma.product.findFirst({
            where: { id: productId, userId: context.userId },
            select: { id: true },
        });
        if (!product) {
          return NextResponse.json(
            { error: 'Product not found' },
            { status: 404 }
          );
        }
        verifiedProductIdForFailure = productId;

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
        try {
          await deductConfiguredCredits({
            apiKey,
            featureKey: 'product_analysis',
            userId: context.userId,
            defaultAmount: 2,
            workflowId: PRODUCT_ANALYSIS_WORKFLOW_ID,
            workflowName: PRODUCT_ANALYSIS_WORKFLOW_NAME,
          });
        } catch (error) {
          console.error('[product/analyze] deduct credits failed:', error);
          return NextResponse.json({ error: '积分不足或扣费失败' }, { status: 402 });
        }

        const sellingPoints = analysis.workflowData ?? { selling_points: analysis.sellingPoints };
        const hasWorkflowData = Boolean(analysis.workflowData);
        const hasDetailedText = Boolean(analysis.detailedDescription);
        const hasSellingPoints = Array.isArray(analysis.sellingPoints) && analysis.sellingPoints.length > 0;
        if (hasWorkflowData || hasDetailedText || hasSellingPoints) {
          await prisma.product.update({
            where: { id: productId },
            data: {
              status: 'COMPLETED',
              progress: 100,
              sellingPoints: JSON.stringify(sellingPoints),
              sellingPointsText: analysis.detailedDescription || null,
              analysisResult: JSON.stringify({
                status: 'COMPLETED',
                data: analysis.workflowData ?? null,
              }),
            } as any,
          });
        }

        return NextResponse.json({
          ...analysis,
          success: true,
          productId,
          triggered: analysis.triggered === true,
          processing: !(hasWorkflowData || hasDetailedText || hasSellingPoints),
        });
    }

    const analysis = await analyzeProduct({
      name,
      description: description || '',
      images: imageList,
      apiKey,
      workflowId: PRODUCT_ANALYSIS_WORKFLOW_ID,
      workflowName: PRODUCT_ANALYSIS_WORKFLOW_NAME,
    });

    try {
      await deductConfiguredCredits({
        apiKey,
        featureKey: 'product_analysis',
        userId: context.userId,
        defaultAmount: 2,
        workflowId: PRODUCT_ANALYSIS_WORKFLOW_ID,
        workflowName: PRODUCT_ANALYSIS_WORKFLOW_NAME,
      });
    } catch (error) {
      console.error('[product/analyze] deduct credits failed:', error);
      return NextResponse.json({ error: '积分不足或扣费失败' }, { status: 402 });
    }

    return NextResponse.json({
      ...analysis,
      success: true,
      triggered: analysis.triggered === true,
      processing: analysis.status !== 'COMPLETED',
    });
  } catch (error) {
    console.error('Error analyzing product:', error);
    const message = error instanceof Error ? error.message : 'Failed to analyze product';
    if (verifiedProductIdForFailure) {
      await prisma.product.update({
        where: { id: verifiedProductIdForFailure },
        data: {
          status: 'FAILED',
          analysisResult: JSON.stringify({
            status: 'FAILED',
            message,
          }),
        } as any,
      }).catch((updateError) => {
        console.error('[product/analyze] failed to mark product as failed:', updateError);
      });
    }
    logCreditUsage({ featureKey: 'product_analysis', success: false, errorMessage: message });
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
