'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

interface Product {
  id: string;
  name: string;
  sellingPoints: string; // JSON string
}

interface Props {
  products: Product[];
}

export default function SellingPointsForm({ products }: Props) {
  const router = useRouter();
  const { t } = useLanguage();
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [sellingPoints, setSellingPoints] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    if (productId) {
      const product = products.find((p) => p.id === productId);
      if (product) {
        try {
          const points = JSON.parse(product.sellingPoints);
          if (Array.isArray(points)) {
            setSellingPoints(points.join('\n'));
          } else {
            setSellingPoints(String(product.sellingPoints));
          }
        } catch (e) {
          setSellingPoints(product.sellingPoints);
        }
      }
    } else {
        setSellingPoints('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/generation/selling-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sellingPoints,
          productId: selectedProductId || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate');
      }

      const data = await res.json();
      router.push(`/replication/${data.id}`);
    } catch (error) {
      console.error('Error generating:', error);
      alert('Failed to generate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 shadow-md rounded px-8 pt-6 pb-8 mb-4 border border-gray-100 dark:border-gray-700">
      {/* Optional Product Selection */}
      <div className="mb-4">
        <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="product">
          {t.replication.selectProduct}
        </label>
        <select
          id="product"
          className="shadow border dark:border-gray-600 rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          value={selectedProductId}
          onChange={(e) => handleProductChange(e.target.value)}
        >
          <option value="">-- {t.replication.selectProduct} --</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <p className="text-gray-500 dark:text-gray-400 text-xs italic mt-1">
          Selecting a product will pre-fill the selling points if available.
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2" htmlFor="sellingPoints">
          {t.products.sellingPoints}
        </label>
        <textarea
          id="sellingPoints"
          className="shadow appearance-none border dark:border-gray-600 rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 leading-tight focus:outline-none focus:shadow-outline h-48"
          placeholder={t.products.sellingPoints + "..."}
          value={sellingPoints}
          onChange={(e) => setSellingPoints(e.target.value)}
          required
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          className={`bg-black dark:bg-white hover:bg-gray-900 dark:hover:bg-gray-100 text-white dark:text-black font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          type="submit"
          disabled={loading}
        >
          {loading ? t.generation.generating : t.generation.generate}
        </button>
      </div>
    </form>
  );
}
