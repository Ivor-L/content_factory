'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function deleteVideos(ids: string[]) {
  try {
    // Attempt to delete from both tables since IDs are unique UUIDs
    // Or we could check which table they belong to, but UUID collision is unlikely
    // A more robust way is to delete from both and ignore errors if not found in one
    
    // Delete from Replication
    await prisma.replication.deleteMany({
      where: { id: { in: ids } }
    });

    // Delete from DigitalHumanVideo
    await prisma.digitalHumanVideo.deleteMany({
      where: { id: { in: ids } }
    });

    revalidatePath('/replication');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete videos:', error);
    return { success: false, error: 'Failed to delete videos' };
  }
}
