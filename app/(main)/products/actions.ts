'use server'

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createProduct(formData: FormData) {
  const name = formData.get('name') as string;
  const description = formData.get('description') as string;
  const sellingPoints = formData.get('sellingPoints') as string;
  const sellingPointsText = formData.get('sellingPointsText') as string;
  const images = formData.get('images') as string;
  const analysisResult = formData.get('analysisResult') as string;
  const status = formData.get('status') as string;
  const progress = formData.get('progress') ? parseInt(formData.get('progress') as string) : undefined;
  const id = formData.get('id') as string; // Check if updating an existing product
  const userId = formData.get('userId') as string | null;

  if (!name) {
    throw new Error('Name is required');
  }

  // Validate JSON strings
  try {
    if (sellingPoints) JSON.parse(sellingPoints);
    if (images) JSON.parse(images);
    if (analysisResult) JSON.parse(analysisResult);
  } catch (e) {
    throw new Error('Invalid JSON format for sellingPoints, images or analysisResult');
  }

  if (id) {
    // Update existing product
    await prisma.product.update({
      where: { id },
      data: {
        name,
        description: description || '',
        sellingPoints: sellingPoints || '[]',
        sellingPointsText: sellingPointsText !== null ? sellingPointsText : undefined,
        images: images || '[]',
        analysisResult: analysisResult || null,
        status: status || undefined,
        progress: progress,
      } as any, // Cast to any to bypass linter
    });
  } else {
    // Create new product
    await prisma.product.create({
      data: {
        name,
        description: description || '',
        sellingPoints: sellingPoints || '[]',
        sellingPointsText: sellingPointsText || '',
        images: images || '[]',
        analysisResult: analysisResult || null,
        status: status || 'PENDING',
        progress: progress || 0,
        userId: userId, // Save user ID
      } as any, // Cast to any to bypass linter
    });
  }

  revalidatePath('/products');
  // redirect('/products'); // Remove redirect to stay on same page (modal)
}

export async function createDraftProduct(formData: FormData) {
  const name = formData.get('name') as string;
  const images = formData.get('images') as string;
  const userId = formData.get('userId') as string | null;

  if (!name) throw new Error('Name is required');

  const product = await prisma.product.create({
    data: {
      name,
      description: '',
      sellingPoints: '[]',
      images: images || '[]',
      userId: userId, // Save user ID
      // analysisResult: null, // Removed field
    } as any,
  });

  return product.id;
}

export async function deleteProduct(id: string) {
    if (!id) throw new Error('ID is required');
    await prisma.product.delete({
        where: { id }
    });
    revalidatePath('/products');
}
