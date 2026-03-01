'use server'

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function createScript(formData: FormData) {
  const title = formData.get('title') as string;
  const videoUrl = formData.get('videoUrl') as string;
  const description = formData.get('description') as string;
  const id = formData.get('id') as string;

  if (!title || !videoUrl) {
    throw new Error('Title and Video URL are required');
  }

  // Store description in breakdown as initial data
  const initialBreakdown = {
    description: description || '',
  };

  let script;
  if (id) {
    // Update
    script = await prisma.script.update({
        where: { id },
        data: {
            title,
            videoUrl,
        }
    });
  } else {
    // Create
    script = await prisma.script.create({
        data: {
            title,
            videoUrl,
            breakdown: JSON.stringify(initialBreakdown),
        },
    });
  }

  revalidatePath('/scripts');
  return script;
}

export async function deleteScript(id: string) {
    if (!id) throw new Error('ID is required');
    await prisma.script.delete({
        where: { id }
    });
    revalidatePath('/scripts');
}
