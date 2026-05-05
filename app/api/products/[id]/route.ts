import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserContext } from '@/lib/authServer';
import prisma from '@/lib/prisma';

const productSummarySelect = {
  id: true,
  name: true,
  description: true,
  sellingPoints: true,
  sellingPointsText: true,
  images: true,
  analysisResult: true,
  status: true,
  progress: true,
  createdAt: true,
  updatedAt: true,
} as const;

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const product = await prisma.product.findFirst({
      where: { id, userId },
      select: productSummarySelect,
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.product.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const description = typeof payload.description === 'string' ? payload.description.trim() : '';
    const sellingPointsText =
      typeof payload.sellingPointsText === 'string' ? payload.sellingPointsText.trim() : '';
    const sellingPoints = normalizeStringList(payload.sellingPoints);
    const images = normalizeStringList(payload.images);

    const product = await prisma.product.update({
      where: { id },
      data: {
        name,
        description,
        sellingPoints: JSON.stringify(sellingPoints),
        sellingPointsText,
        images: JSON.stringify(images),
        analysisResult: JSON.stringify({ status: 'ANALYZING' }),
        status: 'PROCESSING',
        progress: 0,
      } as any,
      select: productSummarySelect,
    });

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const result = await prisma.product.deleteMany({
      where: { id, userId },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting product:', error);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
