'use server'

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function createCharacter(formData: FormData) {
  const name = formData.get('name') as string;
  const avatar = formData.get('avatar') as string;
  const voiceId = formData.get('voiceId') as string;
  const id = formData.get('id') as string;

  if (!name) {
    throw new Error('Name is required');
  }

  if (id) {
    // Update
    await prisma.character.update({
      where: { id },
      data: {
        name,
        avatar: avatar || '',
        voiceId: voiceId || null,
      },
    });
  } else {
    // Create
    await prisma.character.create({
      data: {
        name,
        avatar: avatar || '',
        voiceId: voiceId || null,
      },
    });
  }

  revalidatePath('/characters');
}

export async function deleteCharacter(id: string) {
    if (!id) throw new Error('ID is required');
    await prisma.character.delete({
        where: { id }
    });
    revalidatePath('/characters');
}
