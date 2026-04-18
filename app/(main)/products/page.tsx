export const dynamic = "force-dynamic";



import { ProductList } from './ProductList';
import prisma from '@/lib/prisma';
import { getServerRequestUserContext } from "@/lib/serverRequestContext";


export default async function ProductsPage() {
  const { userId } = await getServerRequestUserContext();
  if (!userId) {
    return <div className="p-8">Unauthorized</div>;
  }

  const products = await prisma.product.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  const serializedProducts = products.map(p => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return <ProductList initialProducts={serializedProducts} />;
}
