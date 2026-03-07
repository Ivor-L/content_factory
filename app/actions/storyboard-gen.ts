
'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function generateStoryboardGrid(formData: FormData) {
  const imageUrl = formData.get('imageUrl') as string;
  const script = formData.get('script') as string;

  if (!imageUrl || !script) {
    throw new Error('Missing required fields');
  }

  // Create initial task
  const task = await prisma.storyboardTask.create({
    data: {
      status: 'GENERATING_GRID',
      videoUrl: '', 
      scriptContent: script,
      referenceImage: imageUrl,
    }
  });

  revalidatePath('/storyboard-gen');

  // Simulate AI Generation Time (30 seconds)
  // In reality, this would call an N8N webhook which would process asynchronously.
  // For this synchronous simulation:
  await new Promise(resolve => setTimeout(resolve, 2000)); // Shorten for dev testing, in prod use 30s or async webhook

  // Mock Result: A 9-grid placeholder image
  // You can replace this with a real AI generation call later
  const gridImageUrl = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop"; 

  // Update task with result
  await prisma.storyboardTask.update({
    where: { id: task.id },
    data: {
      status: 'GRID_COMPLETED',
      coverImage: gridImageUrl,
    }
  });

  revalidatePath('/storyboard-gen');

  return { gridImageUrl, taskId: task.id };
}

export async function breakdownStoryboardGrid(formData: FormData) {
  const gridImageUrl = formData.get('gridImageUrl') as string;
  const script = formData.get('script') as string;
  const taskId = formData.get('taskId') as string;

  let task;

  if (taskId) {
    // Update existing task
    task = await prisma.storyboardTask.update({
      where: { id: taskId },
      data: {
        status: 'SCENE_CONFIRMATION',
        // Ensure grid image is set if not already (though it should be)
        coverImage: gridImageUrl || undefined,
      }
    });
  } else {
    // Fallback: Create new task if no ID provided (legacy behavior)
    task = await prisma.storyboardTask.create({
      data: {
        status: 'SCENE_CONFIRMATION',
        videoUrl: '', 
        coverImage: gridImageUrl,
        scriptContent: script,
      }
    });
  }

  // 2. Create 8 Segments (Mock Breakdown)
  // In reality, N8N would analyze the grid and script to generate these
  // Check if segments already exist to avoid duplicates if re-running
  const existingSegments = await prisma.storyboardSegment.findMany({
    where: { taskId: task.id }
  });

  if (existingSegments.length === 0) {
    const segments = Array.from({ length: 8 }).map((_, i) => ({
        taskId: task.id,
        order: i + 1,
        duration: 3, // Default 3s
        // description: `Scene ${i + 1}: Based on script section...`,
        imagePrompt: `Cinematic shot of scene ${i + 1}, ${script ? script.slice(0, 20) : ''}...`,
        videoPrompt: `Camera pans over scene ${i + 1}, high quality, 4k`,
        status: 'PENDING',
        // We use the grid image as placeholder for now, or you could slice it
        generatedImage: gridImageUrl 
    }));

    await prisma.storyboardSegment.createMany({
        data: segments as any // Type casting for quick proto
    });
  }

  revalidatePath('/storyboard');
  revalidatePath('/storyboard-gen');
  return { taskId: task.id };
}
