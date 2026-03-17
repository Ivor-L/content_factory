'use client';

/* eslint-disable @next/next/no-img-element -- Detailed product previews display arbitrary Supabase media */

import { useLanguage } from '@/contexts/LanguageContext';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useLanguage();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchProduct() {
      const { id } = await params;
      try {
        const res = await fetch(`/api/products/${id}`);
        if (!res.ok) {
           notFound();
           return;
        }
        const data = await res.json();
        setProduct(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchProduct();
  }, [params]);

  if (loading) {
      return <div className="p-8 text-center">{t.common.loading}</div>;
  }

  if (!product) {
    notFound();
    return null;
  }

  let images: string[] = [];
  let sellingPoints: string[] = [];
  let analysisResult: any = null;
  
  try {
    images = typeof product.images === 'string' ? JSON.parse(product.images) : product.images || [];
    sellingPoints = typeof product.sellingPoints === 'string' ? JSON.parse(product.sellingPoints) : product.sellingPoints || [];
    if (product.analysisResult) {
      analysisResult = typeof product.analysisResult === 'string' ? JSON.parse(product.analysisResult) : product.analysisResult;
    }
  } catch (e) {
    console.error('Failed to parse product JSON fields', e);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-6">
        <Link href="/products" className="text-indigo-600 hover:text-indigo-500 font-medium flex items-center gap-2">
          <ArrowLeft size={16} /> {t.products.backToList}
        </Link>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-8 lg:items-start">
        {/* Image Gallery */}
        <div className="flex flex-col gap-4">
          <div className="w-full bg-gray-100 rounded-lg overflow-hidden relative">
            {images.length > 0 ? (
              <img
                src={images[0]}
                alt={product.name}
                className="w-full h-auto object-contain"
                style={{ maxHeight: '600px' }}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-400">
                {t.products.noImage}
              </div>
            )}
          </div>
          
          {images.length > 1 && (
             <div className="grid grid-cols-4 gap-4">
               {images.slice(1).map((img, i) => (
                 <div key={i} className="bg-gray-100 rounded-lg overflow-hidden relative">
                   <img src={img} alt="" className="w-full h-auto object-contain" />
                 </div>
               ))}
             </div>
          )}
        </div>

        {/* Product Info */}
        <div className="mt-10 px-4 sm:px-0 sm:mt-16 lg:mt-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">{product.name}</h1>

          <div className="mt-6">
            <h3 className="sr-only">Description</h3>
            <div className="text-base text-gray-700 dark:text-gray-300 space-y-6 whitespace-pre-line">
              {product.description || t.products.noDescription}
            </div>
          </div>

          {sellingPoints.length > 0 && (
            <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-8">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t.products.sellingPoints}</h2>
              <ul role="list" className="list-disc pl-5 space-y-2 text-gray-600 dark:text-gray-400">
                {sellingPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-8 text-xs text-gray-400">
            <p>{t.products.productId}: {product.id}</p>
            <p>{t.products.created}: {new Date(product.createdAt).toLocaleDateString()}</p>
          </div>

          {analysisResult && (
            <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-8">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t.products.analysisResult}</h2>
              <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 p-4 rounded border dark:border-gray-700 overflow-x-auto max-h-96">
                {JSON.stringify(analysisResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
