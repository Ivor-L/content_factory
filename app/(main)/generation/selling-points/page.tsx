import prisma from '@/lib/prisma';
import SellingPointsForm from './Form';

export const dynamic = 'force-dynamic';

export default async function GenerateFromSellingPointsPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      sellingPoints: true,
    },
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Generate from Selling Points</h1>
      </div>
      <SellingPointsForm products={products} />
    </div>
  );
}
