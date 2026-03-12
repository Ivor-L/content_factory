
'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function generateStoryboardGrid(formData: FormData) {
  const imageUrl = formData.get('imageUrl') as string;
  const script = formData.get('script') as string;
  const userId = formData.get('userId') as string | null;
  const aspectRatio = formData.get('aspectRatio') as string || '9:16';
  const videoType = formData.get('videoType') as string || 'ugc';

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
      userId: userId || undefined, // Use undefined instead of null
      taskId: undefined, // Will be set after creation or use ID
      videoType: videoType,
    } as any
  });

  // Update taskId with the generated ID (or keep them same)
  // Since we added taskId as unique, we can just use the ID as taskId for simplicity
  await prisma.storyboardTask.update({
    where: { id: task.id },
    data: { taskId: task.id }
  });

  // revalidatePath('/storyboard-gen'); // Removed to avoid lock issues, frontend polls instead

  // Call N8N Webhook
  try {
    const webhookUrl = process.env.N8N_STORYBOARD_GEN_WEBHOOK!;
    const payload = {
      script,
      imageUrl,
      taskId: task.id, // Send the ID as taskId
      userId: userId || undefined,
      aspectRatio,
      content_type: videoType === 'ugc' ? 'ugc带货' : videoType === 'product' ? '产品展示' : '剧情故事',
    };
    console.log('Calling N8N Webhook:', webhookUrl);
    console.log('Webhook Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('N8N Webhook failed:', response.status, errorText);
        
        // Optional: Update task to FAILED
        await prisma.storyboardTask.update({
            where: { id: task.id },
            data: { status: 'FAILED' } as any
        });
        throw new Error(`Failed to start generation workflow: ${response.status} ${errorText}`);
    }
    
    console.log('N8N Webhook success');
  } catch (error) {
    console.error('Error calling N8N:', error);
    await prisma.storyboardTask.update({
        where: { id: task.id },
        data: { status: 'FAILED' } as any
    });
    throw error;
  }

  // The workflow will update the task status to GRID_COMPLETED
  // We return the task ID so frontend can poll/subscribe
  return { taskId: task.id };
}

export async function breakdownStoryboardGrid(formData: FormData) {
  const gridImageUrl = formData.get('gridImageUrl') as string;
  const script = formData.get('script') as string;
  const taskId = formData.get('taskId') as string;
  const userId = formData.get('userId') as string | null;

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
        userId: userId || undefined, // Use undefined instead of null
      } as any
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

  // revalidatePath('/storyboard');
  // revalidatePath('/storyboard-gen');
  return { taskId: task.id };
}

export async function deleteStoryboardTask(taskId: string) {
  try {
    await prisma.storyboardTask.delete({
      where: { id: taskId }
    });
    revalidatePath('/storyboard-gen');
    revalidatePath('/storyboard');
    return { success: true };
  } catch (error) {
    console.error('Error deleting task:', error);
    return { success: false, error: 'Failed to delete task' };
  }
}

export async function deleteStoryboardTasks(taskIds: string[]) {
  try {
    await prisma.storyboardTask.deleteMany({
      where: {
        id: {
          in: taskIds
        }
      }
    });
    revalidatePath('/storyboard-gen');
    revalidatePath('/storyboard');
    return { success: true };
  } catch (error) {
    console.error('Error deleting tasks:', error);
    return { success: false, error: 'Failed to delete tasks' };
  }
}
