export const dynamic = "force-dynamic";



import { ProductList } from './ProductList';
import prisma from '@/lib/prisma';


export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const serializedProducts = products.map(p => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return <ProductList initialProducts={serializedProducts} />;
}
