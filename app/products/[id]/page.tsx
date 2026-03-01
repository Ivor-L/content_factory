import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
  });

  if (!product) {
    notFound();
  }

  let images: string[] = [];
  let sellingPoints: string[] = [];
  let analysisResult: any = null;
  try {
    const p = product as any;
    images = JSON.parse(p.images);
    sellingPoints = JSON.parse(p.sellingPoints);
    if (p.analysisResult) {
      analysisResult = JSON.parse(p.analysisResult);
    }
  } catch (e) {
    console.error('Failed to parse product JSON fields', e);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-6">
        <Link href="/products" className="text-indigo-600 hover:text-indigo-500 font-medium flex items-center">
          &larr; Back to Products
        </Link>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-8 lg:items-start">
        {/* Image Gallery */}
        <div className="flex flex-col gap-4">
          <div className="w-full aspect-square bg-gray-100 rounded-lg overflow-hidden relative">
            {images.length > 0 ? (
              <img
                src={images[0]}
                alt={product.name}
                className="w-full h-full object-center object-cover absolute inset-0"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                No Image Available
              </div>
            )}
          </div>
          
          {images.length > 1 && (
             <div className="grid grid-cols-4 gap-4">
               {images.slice(1).map((img, i) => (
                 <div key={i} className="aspect-square bg-gray-100 rounded-lg overflow-hidden relative">
                   <img src={img} alt="" className="w-full h-full object-center object-cover absolute inset-0" />
                 </div>
               ))}
             </div>
          )}
        </div>

        {/* Product Info */}
        <div className="mt-10 px-4 sm:px-0 sm:mt-16 lg:mt-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">{product.name}</h1>

          <div className="mt-6">
            <h3 className="sr-only">Description</h3>
            <div className="text-base text-gray-700 space-y-6 whitespace-pre-line">
              {product.description || 'No description provided.'}
            </div>
          </div>

          {sellingPoints.length > 0 && (
            <div className="mt-8 border-t border-gray-200 pt-8">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Selling Points</h2>
              <ul role="list" className="list-disc pl-5 space-y-2 text-gray-600">
                {sellingPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 border-t border-gray-200 pt-8 text-xs text-gray-400">
            <p>Product ID: {product.id}</p>
            <p>Created: {new Date(product.createdAt).toLocaleDateString()}</p>
          </div>

          {analysisResult && (
            <div className="mt-8 border-t border-gray-200 pt-8">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Analysis Result (For Workflow)</h2>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 p-4 rounded border overflow-x-auto max-h-96">
                {JSON.stringify(analysisResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
