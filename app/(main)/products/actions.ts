'use server'

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createProduct(formData: FormData) {
  const name = formData.get('name') as string;
  const description = formData.get('description') as string;
  const sellingPoints = formData.get('sellingPoints') as string;
  const images = formData.get('images') as string;
  const analysisResult = formData.get('analysisResult') as string;
  const id = formData.get('id') as string; // Check if updating an existing product

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
        images: images || '[]',
        // analysisResult: analysisResult || null, // Removed field
      },
    });
  } else {
    // Create new product
    await prisma.product.create({
      data: {
        name,
        description: description || '',
        sellingPoints: sellingPoints || '[]',
        images: images || '[]',
        // analysisResult: analysisResult || null, // Removed field
      },
    });
  }

  revalidatePath('/products');
  // redirect('/products'); // Remove redirect to stay on same page (modal)
}

export async function createDraftProduct(formData: FormData) {
  const name = formData.get('name') as string;
  const images = formData.get('images') as string;

  if (!name) throw new Error('Name is required');

  const product = await prisma.product.create({
    data: {
      name,
      description: '',
      sellingPoints: '[]',
      images: images || '[]',
      // analysisResult: null, // Removed field
    },
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
