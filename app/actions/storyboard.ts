'use server'

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function parseSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  try {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

function parseDuration(timeRange: string): number {
  if (!timeRange) return 5;
  try {
    const parts = timeRange.split('-').map(p => p.trim());
    if (parts.length === 2) {
      const start = parseSeconds(parts[0]);
      const end = parseSeconds(parts[1]);
      const diff = end - start;
      return diff > 0 ? diff : 5;
    }
  } catch (e) {}
  return 5;
}

export async function createStoryboardTask(formData: FormData) {
  const videoUrl = formData.get('videoUrl') as string;
  const productId = formData.get('productId') as string;
  const characterId = formData.get('characterId') as string;
  
  // Mock cover image for now (would come from video processing)
  const coverImage = "https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop"; 

  if (!productId) throw new Error('Product is required');

  // 1. Get product details for AI prompt
  const product = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!product) throw new Error('Product not found');

  // Prepare selling points
  let sellingPoints = product.sellingPointsText || product.description || '';
  if (!sellingPoints && product.sellingPoints) {
      try {
          const spJson = JSON.parse(product.sellingPoints);
          if (Array.isArray(spJson)) {
              sellingPoints = spJson.map((sp: any) => sp.text || sp.value || JSON.stringify(sp)).join('\n');
          } else {
              sellingPoints = String(product.sellingPoints);
          }
      } catch (e) {
          sellingPoints = String(product.sellingPoints);
      }
  }

  // 2. Call n8n webhook
  let segmentsData: any[] = [];
  
  try {
      console.log('Calling n8n webhook for product:', product.name);
      // Ensure we catch any fetch errors
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for GPT generation

      const response = await fetch("https://n8n.atomx.top/webhook/storyboard-gen", {
          method: "POST",
          headers: {
              "Content-Type": "application/json"
          },
          body: JSON.stringify({
              productName: product.name,
              productSellingPoints: sellingPoints,
              videoLanguage: "Chinese", 
              videoDuration: 15,
              country: "China"
          }),
          signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
          const errorText = await response.text();
          console.error("n8n webhook failed:", response.status, errorText);
          throw new Error(`n8n generation failed: ${response.statusText}`);
      }

      const data = await response.json();
      // Handle array response (n8n might return array of items)
      const result = Array.isArray(data) ? data[0] : data;
      
      console.log('n8n response segments count:', result.segments?.length);

      if (result.segments && Array.isArray(result.segments)) {
          segmentsData = result.segments.map((seg: any) => ({
              order: seg.order,
              duration: parseDuration(seg.time_range),
              status: 'PENDING',
              imagePrompt: seg.content, 
              videoPrompt: seg.content 
          }));
      }
  } catch (error) {
      console.error("Error generating storyboard from n8n:", error);
      // Fallback to mock data if n8n fails
      segmentsData = [
          { order: 0, duration: 5, status: 'PENDING', imagePrompt: 'Fallback: Close up shot of product...', videoPrompt: 'Product rotating slowly...' },
          { order: 1, duration: 5, status: 'PENDING', imagePrompt: 'Fallback: Woman holding the product...', videoPrompt: 'Woman smiling and using product...' },
          { order: 2, duration: 5, status: 'PENDING', imagePrompt: 'Fallback: Product usage demonstration...', videoPrompt: 'Hands applying the cream...' },
      ];
  }

  const task = await prisma.storyboardTask.create({
    data: {
      status: segmentsData.length > 0 ? 'SCENE_CONFIRMATION' : 'ANALYZING',
      videoUrl: videoUrl || '', 
      coverImage: coverImage,
      productId: productId,
      characterId: characterId || null,
      segments: {
        create: segmentsData
      }
    }
  });

  revalidatePath('/storyboard');
  return { success: true, taskId: task.id };
}
