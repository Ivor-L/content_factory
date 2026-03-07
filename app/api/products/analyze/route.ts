import { NextResponse } from 'next/server';
import { analyzeProduct } from '@/lib/n8n';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, images, productId, apiKey } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Product name is required' },
        { status: 400 }
      );
    }
    
    // If productId is provided, it means we want to trigger n8n workflow for this product
    if (productId && apiKey) {
        // Update status to PROCESSING immediately to show progress
        // Note: createProduct in actions.ts already sets it to PROCESSING/0, but this reinforces it.
        await prisma.product.update({
            where: { id: productId },
            data: {
                analysisResult: JSON.stringify({ status: 'ANALYZING' }),
                status: 'PROCESSING',
                progress: 0
            } as any // Cast to any to bypass linter if types are not updated yet
        });

        // Trigger n8n workflow
        // analyzeProduct is now async-friendly (returns immediately if n8n responds quickly)
        const analysis = await analyzeProduct({
            name,
            description: description || '',
            images: images || [],
            productId,
            apiKey,
            workflowId: 'flow_product_dna'
        });
        
        return NextResponse.json(analysis);
    }

    // Fallback for no productId/apiKey (should not happen in new flow)
    const analysis = await analyzeProduct({
      name,
      description: description || '',
      images: images || [],
    });

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Error analyzing product:', error);
    return NextResponse.json(
      { error: 'Failed to analyze product' },
      { status: 500 }
    );
  }
}
