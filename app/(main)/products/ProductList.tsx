'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
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
  sellingPointsText?: string | null;
  analysisResult?: string | null;
  status?: string; // PENDING, PROCESSING, COMPLETED, FAILED
  progress?: number; // 0-100
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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  const { t } = useLanguage();

  // Poll for updates if any product is processing
  useEffect(() => {
    const hasProcessing = initialProducts.some(p => {
        let hasPoints = false;
        try {
            const points = JSON.parse(p.sellingPoints);
            hasPoints = Array.isArray(points) && points.length > 0;
        } catch (e) {
            hasPoints = false;
        }
        return p.status === 'PROCESSING' || (p.analysisResult?.includes('ANALYZING') && !hasPoints && !p.sellingPointsText);
    });

    if (hasProcessing) {
        const interval = setInterval(() => {
            router.refresh();
        }, 2000);
        return () => clearInterval(interval);
    }
  }, [initialProducts, router]);

  const handleProductCreated = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    router.refresh(); // Refresh the server component to get new data
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault(); // Prevent navigation
    setProductToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete) return;

    try {
        await deleteProduct(productToDelete);
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

            let hasPoints = false;
            try {
                const points = JSON.parse(product.sellingPoints);
                hasPoints = Array.isArray(points) && points.length > 0;
            } catch (e) {
                hasPoints = false;
            }

            const hasAnalysis = hasPoints || !!product.sellingPointsText;
            const isAnalyzing = !hasAnalysis && (product.analysisResult?.includes('ANALYZING') || product.status === 'PROCESSING');
            const progress = product.progress || 0;

            return (
              <div
                key={product.id}
                onClick={() => {
                  setViewingProduct(product);
                  setIsDetailOpen(true);
                }}
                className="group block bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100 dark:border-gray-700 cursor-pointer relative"
              >
                
                <div className="relative h-48 bg-gray-50 dark:bg-gray-700 overflow-hidden z-10">
                  {images && images.length > 0 ? (
                    <img
                      src={images[0]}
                      alt={product.name}
                      className="w-full h-full object-contain object-center group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <span className="text-sm font-medium">{t.products.noImage}</span>
                    </div>
                  )}

                  {/* Processing Overlay with Circular Progress */}
                  {isAnalyzing && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[1px] transition-all duration-300">
                        <div className="relative w-16 h-16">
                            <svg className="w-full h-full transform -rotate-90">
                            {/* Background Circle */}
                            <circle
                                cx="32"
                                cy="32"
                                r="28"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="transparent"
                                className="text-white/20"
                            />
                            {/* Progress Circle */}
                            <circle
                                cx="32"
                                cy="32"
                                r="28"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="transparent"
                                strokeDasharray={2 * Math.PI * 28}
                                strokeDashoffset={2 * Math.PI * 28 * (1 - progress / 100)}
                                className="text-white transition-all duration-500 ease-out"
                                strokeLinecap="round"
                            />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm">
                            {progress}%
                            </div>
                        </div>
                    </div>
                  )}
                  
                  {/* Status Badge */}
                  <div className="absolute top-2 right-2 px-2 py-1 text-xs font-bold rounded-full bg-white/90 dark:bg-black/70 backdrop-blur-sm shadow-sm z-30">
                    {hasAnalysis ? (
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                            {t.products.status.completed}
                        </span>
                    ) : isAnalyzing ? (
                        <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                            {t.products.status.analyzing}
                        </span>
                    ) : (
                        <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                            {t.products.status.pending}
                        </span>
                    )}
                  </div>

                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300 z-10" />
                </div>
                <div className="p-5 relative z-10">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate mb-1">{product.name}</h3>
                  <div className="mt-4 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                    <span suppressHydrationWarning>{new Date(product.createdAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={(e) => handleEdit(e, product)}
                            className="text-gray-400 hover:text-blue-600 p-1 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                            title={t.common.edit}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 00 2 2h11a2 2 0 00 2-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button
                            onClick={(e) => handleDeleteClick(e, product.id)}
                            className="text-gray-400 hover:text-red-600 p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors group-hover:opacity-100"
                            title={t.common.delete}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => {
            setIsDetailOpen(false);
            setViewingProduct(null);
        }}
        title={viewingProduct?.name || ''}
        maxWidth="max-w-5xl"
      >
        {viewingProduct && (
            <div className="flex flex-col md:flex-row gap-8 h-[70vh] md:h-[600px]">
                {/* Left Column: Image */}
                <div className="w-full md:w-5/12 flex flex-col h-full">
                    <div className="flex-1 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden flex items-center justify-center p-4 relative group">
                        {(() => {
                            try {
                                const images = JSON.parse(viewingProduct.images);
                                return images && images.length > 0 ? (
                                    <>
                                        <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-[0.03] pointer-events-none" />
                                        <img 
                                            src={images[0]} 
                                            alt={viewingProduct.name}
                                            className="max-w-full max-h-full object-contain drop-shadow-sm transition-transform duration-700 group-hover:scale-105"
                                        />
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center text-gray-400 gap-3">
                                        <svg className="w-12 h-12 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                        <span className="text-sm">{t.products.noImage}</span>
                                    </div>
                                );
                            } catch (e) {
                                return (
                                    <div className="text-gray-400 text-sm">
                                        {t.products.invalidImageData}
                                    </div>
                                );
                            }
                        })()}
                    </div>
                </div>
                
                {/* Right Column: Analysis */}
                <div className="w-full md:w-7/12 flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-black dark:text-white">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        </div>
                        <h4 className="font-bold text-gray-900 dark:text-white text-xl tracking-tight">
                            {t.products.analysisResultTitle}
                        </h4>
                        {viewingProduct.sellingPointsText || (
                            (() => {
                                try {
                                    const points = JSON.parse(viewingProduct.sellingPoints);
                                    return Array.isArray(points) && points.length > 0;
                                } catch { return false; }
                            })()
                        ) ? (
                            <span className="ml-auto px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                {t.products.status.completed}
                            </span>
                        ) : (viewingProduct.analysisResult?.includes('ANALYZING') || viewingProduct.status === 'PROCESSING') ? (
                            <span className="ml-auto px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse">
                                {viewingProduct.progress && viewingProduct.progress > 0 ? `${viewingProduct.progress}%` : t.products.status.analyzing}
                            </span>
                        ) : (
                            <span className="ml-auto px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400">
                                {t.products.status.pending}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 overflow-y-auto shadow-sm custom-scrollbar">
                        {(() => {
                            // Try parsing sellingPoints JSON
                            let productData: any = null;
                            try {
                                const parsed = JSON.parse(viewingProduct.sellingPoints);
                                // Check if it's the new object structure (has marketing_profile)
                                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.marketing_profile) {
                                    productData = parsed;
                                } else if (Array.isArray(parsed)) {
                                    // Fallback for old array format
                                    productData = { marketing_profile: { core_selling_points: parsed } };
                                }
                            } catch (e) {
                                // Ignore
                            }

                            // Render Structured Data
                            if (productData) {
                                const { product_name, visual_description, marketing_profile } = productData;
                                const { target_audience_vibe, ideal_environment, core_selling_points } = marketing_profile || {};

                                return (
                                    <div className="space-y-8">
                                        {/* 1. Header Info */}
                                        <div className="space-y-4">
                                            {product_name && (
                                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                                                    {product_name}
                                                </h3>
                                            )}
                                            
                                            {visual_description && (
                                                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl text-gray-600 dark:text-gray-300 text-sm leading-relaxed border border-gray-100 dark:border-gray-700">
                                                    <div className="flex items-center gap-2 mb-2 text-gray-900 dark:text-white font-semibold text-xs uppercase tracking-wider">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                                        {t.products.visualDescription}
                                                    </div>
                                                    {visual_description}
                                                </div>
                                            )}
                                        </div>

                                        {/* 2. Target & Scene Grid */}
                                        {(target_audience_vibe || ideal_environment) && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {target_audience_vibe && (
                                                    <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                                        <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-300 font-bold text-xs uppercase tracking-wider">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                                                            {t.products.targetAudience}
                                                        </div>
                                                        <p className="text-gray-700 dark:text-gray-300 text-sm">{target_audience_vibe}</p>
                                                    </div>
                                                )}
                                                {ideal_environment && (
                                                    <div className="bg-purple-50 dark:bg-purple-900/10 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30">
                                                        <div className="flex items-center gap-2 mb-2 text-purple-700 dark:text-purple-300 font-bold text-xs uppercase tracking-wider">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                                                            {t.products.idealScene}
                                                        </div>
                                                        <p className="text-gray-700 dark:text-gray-300 text-sm">{ideal_environment}</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* 3. Selling Points List */}
                                        {core_selling_points && core_selling_points.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4 text-gray-900 dark:text-white font-bold text-lg">
                                                    <span className="w-1.5 h-6 bg-black dark:bg-white rounded-full"></span>
                                                    {t.products.coreSellingPoints}
                                                </div>
                                                <div className="space-y-4">
                                                    {core_selling_points.map((point: any, idx: number) => {
                                                        // Handle both string format (legacy) and object format
                                                        const isObj = typeof point === 'object';
                                                        const type = isObj ? point.type : t.products.feature;
                                                        const desc = isObj ? point.description : point;
                                                        const proof = isObj ? point.visual_proof : null;

                                                        return (
                                                            <div key={idx} className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-black/10 dark:hover:border-white/10 hover:shadow-md transition-all duration-300 overflow-hidden">
                                                                <div className="p-4">
                                                                    <div className="flex items-start gap-3">
                                                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-900 dark:text-white font-bold text-sm">
                                                                            {idx + 1}
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            {isObj && type && (
                                                                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-900 text-white dark:bg-white dark:text-black mb-2">
                                                                                    {type}
                                                                                </span>
                                                                            )}
                                                                            <p className="text-gray-800 dark:text-gray-200 text-base leading-relaxed font-medium">
                                                                                {desc}
                                                                            </p>
                                                                            {proof && (
                                                                                <div className="mt-3 pl-3 border-l-2 border-gray-200 dark:border-gray-600">
                                                                                    <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                                        <span className="not-italic font-semibold mr-1">{t.products.visualProof}:</span>
                                                        {proof}
                                                    </p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            // Fallback to Markdown (sellingPointsText) or Loading
                            if (viewingProduct.sellingPointsText) {
                                return (
                                    <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none">
                                        <div className="whitespace-pre-wrap text-gray-600 dark:text-gray-300 leading-relaxed space-y-4">
                                            {viewingProduct.sellingPointsText}
                                        </div>
                                    </div>
                                );
                            }
                            
                            // Loading State
                            if (viewingProduct.analysisResult?.includes('ANALYZING') || viewingProduct.status === 'PROCESSING') {
                                const progress = viewingProduct.progress || 0;
                                return (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                                        <div className="relative w-16 h-16">
                                            <div className="w-16 h-16 rounded-full border-4 border-gray-100 dark:border-gray-700"></div>
                                            <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                                            {progress > 0 && (
                                                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-blue-500">
                                                    {progress}%
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium animate-pulse text-blue-500">
                                            {t.products.status.analyzing}
                                        </p>
                                    </div>
                                );
                            }

                            return (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                                    <p className="text-sm font-medium">{t.products.status.pending}</p>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
        )}
      </Modal>

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

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
            setIsDeleteModalOpen(false);
            setProductToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title={t.common.delete}
        message={t.common.confirmDelete}
      />
    </div>
  );
}
