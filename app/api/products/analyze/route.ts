import { NextResponse } from 'next/server';
import { analyzeProduct } from '@/lib/n8n';

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
        // Trigger n8n workflow
        const analysis = await analyzeProduct({
            name,
            description: description || '',
            images: images || [],
            productId,
            apiKey,
            workflowId: 'yNIjqrlSnTeWDFIx'
        });
        
        // Since n8n updates the DB asynchronously, we might just return the "triggered" status
        // OR if analyzeProduct waits (which it currently does for mock data), we return the result.
        // For real n8n, analyzeProduct should probably return "processing" or wait if n8n returns data.
        // But n8n JSON shows it writes to DB and doesn't return data.
        // So analyzeProduct for n8n case should just trigger.
        
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
