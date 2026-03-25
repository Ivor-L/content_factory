'use server'

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getServerRequestUserContext } from '@/lib/serverRequestContext';

export async function createCharacter(formData: FormData) {
  const { userId } = await getServerRequestUserContext();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const name = formData.get('name') as string;
  const avatar = formData.get('avatar') as string;
  const voiceId = (formData.get('voiceId') as string) || null;
  const id = formData.get('id') as string | null;

  if (!name || !avatar) {
    throw new Error('Name and avatar are required');
  }

  if (id) {
    const existing = await prisma.character.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new Error('Character not found');
    }
    await prisma.character.update({
      where: { id },
      data: {
        name,
        avatar,
        voiceId,
      },
    });
  } else {
    await prisma.character.create({
      data: {
        name,
        avatar,
        voiceId,
        userId,
      },
    });
  }

  revalidatePath('/characters');
}

export async function deleteCharacter(id: string) {
  if (!id) throw new Error('ID is required');

  const { userId } = await getServerRequestUserContext();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const result = await prisma.character.deleteMany({ where: { id, userId } });
  if (result.count === 0) {
    throw new Error('Character not found');
  }

  revalidatePath('/characters');
}
