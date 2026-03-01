'use server'

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createStoryboardTask(formData: FormData) {
  const videoUrl = formData.get('videoUrl') as string;
  const productId = formData.get('productId') as string;
  const characterId = formData.get('characterId') as string;
  
  // Mock cover image for now (would come from video processing)
  const coverImage = "https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop"; 

  if (!productId) throw new Error('Product is required');
  // Video URL might be empty if it's a file upload handled separately, 
  // but for now let's assume we get a URL or handle file upload before calling this action.
  // In HomeContent, file upload is handled via state, so we might need to upload it first.

  const task = await prisma.storyboardTask.create({
    data: {
      status: 'ANALYZING',
      videoUrl: videoUrl || '', 
      coverImage: coverImage,
      productId: productId,
      characterId: characterId || null,
      // Create mock segments for demonstration since we don't have real n8n backend yet
      segments: {
        create: [
          { order: 0, duration: 8, status: 'PENDING', imagePrompt: 'Close up shot of product...', videoPrompt: 'Product rotating slowly...' },
          { order: 1, duration: 8, status: 'PENDING', imagePrompt: 'Woman holding the product...', videoPrompt: 'Woman smiling and using product...' },
          { order: 2, duration: 8, status: 'PENDING', imagePrompt: 'Product usage demonstration...', videoPrompt: 'Hands applying the cream...' },
        ]
      }
    }
  });

  revalidatePath('/storyboard');
  return { success: true, taskId: task.id };
}
