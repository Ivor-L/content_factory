'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { ProductForm } from '@/components/ProductForm';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { deleteProduct } from './actions';
import { useLanguage } from '@/contexts/LanguageContext';

interface Product {
  id: string;
  name: string;
  description: string;
  images: string;
  sellingPoints: string;
  createdAt: string;
  updatedAt: string;
}

interface ProductListProps {
  initialProducts: Product[];
}

export function ProductList({ initialProducts }: ProductListProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const { t } = useLanguage();

  const handleProductCreated = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    router.refresh(); // Refresh the server component to get new data
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); // Prevent navigation
    if (!confirm(t.common.confirmDelete)) return;

    try {
        await deleteProduct(id);
        toast.success(t.common.success);
        router.refresh();
    } catch (error) {
        console.error(error);
        toast.error(t.common.error);
    }
  };

  const handleEdit = (e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-sans">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t.products.title}</h1>
        <button
          onClick={() => {
            setEditingProduct(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-bold rounded-lg shadow-sm text-white dark:text-black bg-black dark:bg-white hover:bg-gray-900 dark:hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black dark:focus:ring-white transition-colors uppercase tracking-wide"
        >
          {t.products.newProduct}
        </button>
      </div>

      {initialProducts.length === 0 ? (
        <div className="text-center py-20 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="mb-4">{t.products.noProducts}</p>
          <button 
            onClick={() => {
                setEditingProduct(null);
                setIsModalOpen(true);
            }}
            className="text-blue-600 hover:text-blue-500 font-medium underline"
          >
            {t.products.createFirst}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {initialProducts.map((product) => {
            let images: string[] = [];
            try {
              images = JSON.parse(product.images);
            } catch (e) {
              // ignore
            }

            return (
              <Link
                key={product.id}
                href={`/products/${product.id}`}
                className="group block bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100 dark:border-gray-700"
              >
                <div className="relative h-48 bg-gray-50 dark:bg-gray-700 overflow-hidden">
                  {images && images.length > 0 ? (
                    <img
                      src={images[0]}
                      alt={product.name}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <span className="text-sm font-medium">No Image</span>
                    </div>
                  )}
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate mb-1">{product.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 h-10 leading-relaxed">
                    {product.description || 'No description available'}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                    <span suppressHydrationWarning>{new Date(product.createdAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={(e) => handleEdit(e, product)}
                            className="text-gray-400 hover:text-blue-600 p-1 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                            title={t.common.edit}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 00 2 2h11a2 2 0 00 2-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button
                            onClick={(e) => handleDelete(e, product.id)}
                            className="text-gray-400 hover:text-red-600 p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors group-hover:opacity-100"
                            title={t.common.delete}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
            setIsModalOpen(false);
            setEditingProduct(null);
        }}
        title={editingProduct ? t.products.editTitle : t.products.formTitle}
      >
        <ProductForm 
            onSuccess={handleProductCreated} 
            initialData={editingProduct || undefined}
            key={editingProduct?.id || 'new'} // Force re-render on switch
        />
      </Modal>
    </div>
  );
}
