'use client';

/* eslint-disable @next/next/no-img-element -- Product imagery is user-provided and may reside on arbitrary remote hosts */

import { useState, useEffect, useMemo, useTransition } from 'react';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { ProductForm } from '@/components/ProductForm';
import { AddButton } from '@/components/AddButton';
import { EmptyState } from '@/components/EmptyState';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { deleteProduct } from './actions';
import { useLanguage } from '@/contexts/LanguageContext';
import { Package } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

const ANALYSIS_TIMEOUT_MS = 10 * 60 * 1000;
const TIME_TRACK_INTERVAL_MS = 30_000;

type ProductStatusMeta = {
  hasAnalysis: boolean;
  isAnalyzing: boolean;
  isTimedOut: boolean;
};

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
  showHeader?: boolean;
}

type StructuredPoint = {
  type?: string;
  description: string;
  proof?: string;
};

type StructuredAnalysis = {
  productName?: string;
  targetAudience?: string;
  idealScene?: string;
  visualDescription?: string;
  coreSellingPoints: StructuredPoint[];
  extras?: string[];
};

const safeText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
};

const normalizeCoreSellingPoints = (points: unknown): StructuredPoint[] => {
  if (!Array.isArray(points)) return [];

  return points.reduce<StructuredPoint[]>((acc, point) => {
    if (typeof point === 'string') {
      const description = safeText(point);
      if (description) {
        acc.push({ description });
      }
      return acc;
    }

    if (point && typeof point === 'object') {
      const candidate = point as Record<string, unknown>;
      const description = safeText(candidate.description ?? candidate.text ?? candidate.value);
      if (!description) return acc;

      const normalized: StructuredPoint = { description };
      const type = safeText(candidate.type ?? candidate.title ?? candidate.category);
      const proof = safeText(candidate.visual_proof ?? candidate.proof ?? candidate.evidence);

      if (type) normalized.type = type;
      if (proof) normalized.proof = proof;
      acc.push(normalized);
    }

    return acc;
  }, []);
};

const buildStructuredAnalysisFromJson = (raw: unknown): StructuredAnalysis | null => {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  const marketingProfile =
    (data.marketing_profile as Record<string, unknown> | undefined) ||
    (data.marketingProfile as Record<string, unknown> | undefined) ||
    undefined;

  const corePointsSource =
    (marketingProfile?.core_selling_points as unknown) ??
    (marketingProfile?.coreSellingPoints as unknown) ??
    (data.selling_points as unknown) ??
    (data.sellingPoints as unknown);

  const structured: StructuredAnalysis = {
    productName: safeText(data.product_name ?? data.productName),
    targetAudience: safeText(
      marketingProfile?.target_audience_vibe ?? marketingProfile?.targetAudienceVibe
    ),
    idealScene: safeText(
      marketingProfile?.ideal_environment ?? marketingProfile?.idealEnvironment
    ),
    visualDescription: safeText(data.visual_description ?? data.visualDescription),
    coreSellingPoints: normalizeCoreSellingPoints(corePointsSource),
  };

  const hasContent =
    Boolean(structured.productName) ||
    Boolean(structured.targetAudience) ||
    Boolean(structured.idealScene) ||
    Boolean(structured.visualDescription) ||
    structured.coreSellingPoints.length > 0;

  return hasContent ? structured : null;
};

const parsePointLine = (line: string): StructuredPoint | null => {
  if (!line) return null;

  let working = line.trim();
  const bulletPattern = /^([-–—•*]|-\s|\d+\.|\d+、)/;
  if (!bulletPattern.test(working)) return null;

  working = working.replace(/^[-–—•*]+\s*/, '');
  working = working.replace(/^\d+[.\-、]\s*/, '').trim();
  if (!working) return null;

  let proof: string | undefined;
  const proofMatch =
    working.match(/[（(]\s*(?:画面证明|证明|Proof)[:：]\s*([^（）()]+)[）)]/) ||
    working.match(/\((?:Proof|Evidence)[:：]\s*([^()]+)\)/i);
  if (proofMatch) {
    proof = proofMatch[1]?.trim();
    working = working.replace(proofMatch[0], '').trim();
  }

  let type: string | undefined;
  const typeMatch = working.match(/【([^】]+)】/);
  if (typeMatch) {
    type = typeMatch[1]?.trim();
    working = working.replace(typeMatch[0], '').trim();
  }

  const description = working.trim();
  if (!description) return null;

  const result: StructuredPoint = { description };
  if (type) result.type = type;
  if (proof) result.proof = proof;
  return result;
};

const parseSellingPointsText = (text: string | null | undefined): StructuredAnalysis | null => {
  if (typeof text !== 'string') return null;

  const lines = text.split(/\r?\n/);
  const structured: StructuredAnalysis = {
    coreSellingPoints: [],
  };
  const extras: string[] = [];

  let inPoints = false;
  let hasAny = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const handleField = (pattern: RegExp, assign: (value: string) => void) => {
      const match = line.match(pattern);
      if (match) {
        const value = safeText(match[1]);
        if (value) {
          assign(value);
          hasAny = true;
        }
        return true;
      }
      return false;
    };

    if (
      handleField(/^产品名称[:：]\s*(.*)$/i, (value) => {
        structured.productName = value;
      })
    ) {
      continue;
    }

    if (
      handleField(/^目标人群[:：]\s*(.*)$/i, (value) => {
        structured.targetAudience = value;
      })
    ) {
      continue;
    }

    if (
      handleField(/^(?:核心场景|场景|使用场景)[:：]\s*(.*)$/i, (value) => {
        structured.idealScene = value;
      })
    ) {
      continue;
    }

    if (
      handleField(/^(?:视觉描述|画面描述)[:：]\s*(.*)$/i, (value) => {
        structured.visualDescription = value;
      })
    ) {
      continue;
    }

    const coreIntroMatch = line.match(/^核心卖点[:：]\s*(.*)$/i);
    if (coreIntroMatch) {
      inPoints = true;
      const inline = safeText(coreIntroMatch[1]);
      if (inline) {
        const inlinePoint = parsePointLine(inline);
        if (inlinePoint) {
          structured.coreSellingPoints.push(inlinePoint);
          hasAny = true;
        } else {
          extras.push(inline);
        }
      }
      continue;
    }

    const pointCandidate = parsePointLine(line);
    if (pointCandidate) {
      structured.coreSellingPoints.push(pointCandidate);
      hasAny = true;
      inPoints = true;
      continue;
    }

    if (inPoints && structured.coreSellingPoints.length > 0) {
      const last = structured.coreSellingPoints[structured.coreSellingPoints.length - 1];
      last.description = `${last.description} ${line}`.trim();
      continue;
    }

    extras.push(line);
  }

  if (extras.length > 0) {
    structured.extras = extras;
  }

  const hasStructuredPoints = structured.coreSellingPoints.length > 0;
  const hasStructuredFields =
    Boolean(structured.productName) ||
    Boolean(structured.targetAudience) ||
    Boolean(structured.idealScene) ||
    Boolean(structured.visualDescription) ||
    hasStructuredPoints;

  if (hasStructuredFields || hasAny) {
    return structured;
  }

  return null;
};
export function ProductList({ initialProducts, showHeader = true }: ProductListProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  const { t } = useLanguage();

  const [now, setNow] = useState(() => Date.now());

  const productStatusMap = useMemo<Record<string, ProductStatusMeta>>(() => {
    const currentTime = now;
    return initialProducts.reduce<Record<string, ProductStatusMeta>>((acc, product) => {
      let hasPoints = false;
      try {
        const parsed = JSON.parse(product.sellingPoints);
        if (Array.isArray(parsed)) {
          hasPoints = parsed.length > 0;
        } else if (parsed && typeof parsed === 'object') {
          const corePoints = (parsed as any)?.marketing_profile?.core_selling_points;
          if (Array.isArray(corePoints)) {
            hasPoints = corePoints.length > 0;
          } else {
            hasPoints = Object.keys(parsed).length > 0;
          }
        }
      } catch {
        hasPoints = false;
      }

      const hasAnalysis = hasPoints || Boolean(product.sellingPointsText);
      const isAnalyzing =
        !hasAnalysis &&
        (product.analysisResult?.includes('ANALYZING') || product.status === 'PROCESSING');

      const updatedAtMs = new Date(product.updatedAt).getTime();
      const createdAtMs = new Date(product.createdAt).getTime();
      const referenceTime = Number.isFinite(updatedAtMs) ? updatedAtMs : createdAtMs;
      const isTimedOut =
        Boolean(isAnalyzing) &&
        Number.isFinite(referenceTime) &&
        currentTime - referenceTime >= ANALYSIS_TIMEOUT_MS;

      acc[product.id] = {
        hasAnalysis,
        isAnalyzing,
        isTimedOut,
      };
      return acc;
    }, {});
  }, [initialProducts, now]);

  const shouldPoll = useMemo(() => {
    return initialProducts.some(product => {
      const meta = productStatusMap[product.id];
      return meta?.isAnalyzing && !meta?.isTimedOut;
    });
  }, [initialProducts, productStatusMap]);

  const renderStructuredAnalysis = (structured: StructuredAnalysis) => {
    const {
      productName,
      visualDescription,
      targetAudience,
      idealScene,
      coreSellingPoints,
      extras,
    } = structured;

    return (
      <div className="space-y-8">
        <div className="space-y-4">
          {productName && (
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{productName}</h3>
          )}

          {visualDescription && (
            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl text-gray-600 dark:text-gray-300 text-sm leading-relaxed border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2 text-gray-900 dark:text-white font-semibold text-xs uppercase tracking-wider">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
                {t.products.visualDescription}
              </div>
              {visualDescription}
            </div>
          )}
        </div>

        {(targetAudience || idealScene) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {targetAudience && (
              <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-2 text-primary font-bold text-xs uppercase tracking-wider">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                  </svg>
                  {t.products.targetAudience}
                </div>
                <p className="text-gray-700 dark:text-gray-300 text-sm">{targetAudience}</p>
              </div>
            )}
            {idealScene && (
              <div className="bg-purple-50 dark:bg-purple-900/10 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30">
                <div className="flex items-center gap-2 mb-2 text-purple-700 dark:text-purple-300 font-bold text-xs uppercase tracking-wider">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                  </svg>
                  {t.products.idealScene}
                </div>
                <p className="text-gray-700 dark:text-gray-300 text-sm">{idealScene}</p>
              </div>
            )}
          </div>
        )}

        {coreSellingPoints && coreSellingPoints.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4 text-gray-900 dark:text-white font-bold text-lg">
              <span className="w-1.5 h-6 bg-black dark:bg-white rounded-full"></span>
              {t.products.coreSellingPoints}
            </div>
            <div className="space-y-4">
              {coreSellingPoints.map((point, idx) => {
                const { type, description, proof } = point;
                return (
                  <div
                    key={`core-point-${idx}`}
                    className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-black/10 dark:hover:border-white/10 hover:shadow-md transition-all duration-300 overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-900 dark:text-white font-bold text-sm">
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          {type && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-900 text-white dark:bg-white dark:text-black mb-2">
                              {type}
                            </span>
                          )}
                          <p className="text-gray-800 dark:text-gray-200 text-base leading-relaxed font-medium">
                            {description}
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

        {extras && extras.length > 0 && (
          <div className="space-y-2">
            {extras.map((extra, idx) => (
              <p key={`extra-line-${idx}`} className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {extra}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Subscribe to Supabase Realtime — when any product in the list changes,
  // refresh the server component once to pick up the new status.
  // This replaces polling: the DB push triggers exactly one refresh per change.
  useEffect(() => {
    if (!shouldPoll) return;

    const processingIds = new Set(
      initialProducts
        .filter((p) => productStatusMap[p.id]?.isAnalyzing && !productStatusMap[p.id]?.isTimedOut)
        .map((p) => p.id)
    );
    if (processingIds.size === 0) return;

    const channel = supabase
      .channel('product-status-watch')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products' },
        (payload) => {
          const updatedId = (payload.new as { id?: string })?.id;
          if (updatedId && processingIds.has(updatedId)) {
            startTransition(() => { router.refresh(); });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shouldPoll, initialProducts, productStatusMap, router]);

  useEffect(() => {
    if (!shouldPoll) return;
    const timer = setInterval(() => setNow(Date.now()), TIME_TRACK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [shouldPoll]);

  // Sync viewingProduct from initialProducts when data refreshes
  useEffect(() => {
    if (!viewingProduct || !isDetailOpen) return;
    const updated = initialProducts.find((p) => p.id === viewingProduct.id);
    if (updated) setViewingProduct(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProducts]);

  // Subscribe to the specific product being viewed — independent of shouldPoll.
  // This catches updates that arrive AFTER the main subscription tears down
  // (e.g. n8n writes analysis content asynchronously after returning the initial response).
  useEffect(() => {
    if (!viewingProduct || !isDetailOpen) return;
    const productId = viewingProduct.id;
    const channel = supabase
      .channel(`product-detail-${productId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products', filter: `id=eq.${productId}` },
        () => {
          startTransition(() => { router.refresh(); });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [viewingProduct?.id, isDetailOpen, router, startTransition]);

  const handleProductCreated = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    startTransition(() => { router.refresh(); });
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
        startTransition(() => { router.refresh(); });
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

  const viewingProductStatus = viewingProduct ? productStatusMap[viewingProduct.id] : undefined;
  const viewingProductHasAnalysis = viewingProductStatus?.hasAnalysis;
  const viewingProductIsTimedOut = viewingProductStatus?.isTimedOut;
  const viewingProductIsAnalyzing = viewingProductStatus?.isAnalyzing;

  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${showHeader ? "py-12" : "pt-2 pb-8"} font-sans`}>
      <div className={`flex items-center ${showHeader ? "justify-between mb-8" : "justify-end mb-4"}`}>
        {showHeader && (
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t.products.title}</h1>
        )}
        <AddButton
          label={t.products.newProduct}
          onClick={() => {
            setEditingProduct(null);
            setIsModalOpen(true);
          }}
        />
      </div>

      {initialProducts.length === 0 ? (
        <EmptyState
          icon={<Package className="h-6 w-6" />}
          title={t.products.noProducts}
          description={t.products.emptyDescription || t.products.createFirst}
          action={{
            label: t.products.createFirst,
            onClick: () => {
              setEditingProduct(null);
              setIsModalOpen(true);
            },
          }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {initialProducts.map((product) => {
            let images: string[] = [];
            try {
              images = JSON.parse(product.images);
            } catch (e) {
              // ignore
            }

            const meta = productStatusMap[product.id];
            const hasAnalysis = meta?.hasAnalysis ?? false;
            const isAnalyzing = meta?.isAnalyzing ?? false;
            const isTimedOut = meta?.isTimedOut ?? false;
            const progress = product.progress || 0;
            const showAnalyzingOverlay = isAnalyzing && !isTimedOut;

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
                  {showAnalyzingOverlay && (
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
                  {isTimedOut && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[1px] px-4 text-center gap-1">
                      <span className="text-white font-semibold text-sm">{t.products.status.timeout}</span>
                      <span className="text-xs text-white/80 leading-relaxed">{t.products.timeoutHint}</span>
                    </div>
                  )}
                  
                  {/* Status Badge */}
                  <div className="absolute top-2 right-2 px-2 py-1 text-xs font-bold rounded-full bg-white/90 dark:bg-black/70 backdrop-blur-sm shadow-sm z-30">
                    {hasAnalysis ? (
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                            {t.products.status.completed}
                        </span>
                    ) : isTimedOut ? (
                        <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                            {t.products.status.timeout}
                        </span>
                    ) : isAnalyzing ? (
                        <span className="text-primary flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
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
                            className="text-gray-400 hover:text-primary p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
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
                        {viewingProductHasAnalysis ? (
                            <span className="ml-auto px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                {t.products.status.completed}
                            </span>
                        ) : viewingProductIsTimedOut ? (
                            <span className="ml-auto px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                {t.products.status.timeout}
                            </span>
                        ) : viewingProductIsAnalyzing ? (
                            <span className="ml-auto px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 animate-pulse">
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
                            // 1. sellingPointsText takes priority — try to visualize it first
                            if (viewingProduct.sellingPointsText) {
                                const structuredFromText = parseSellingPointsText(
                                    viewingProduct.sellingPointsText
                                );
                                if (structuredFromText) {
                                    return renderStructuredAnalysis(structuredFromText);
                                }

                                return (
                                    <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none">
                                        <div className="whitespace-pre-wrap text-gray-600 dark:text-gray-300 leading-relaxed space-y-4">
                                            {viewingProduct.sellingPointsText}
                                        </div>
                                    </div>
                                );
                            }

                            // 2. Try parsing sellingPoints for structured rendering
                            let productData: unknown = null;
                            try {
                                const parsed = JSON.parse(viewingProduct.sellingPoints);
                                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as Record<string, unknown>).marketing_profile) {
                                    productData = parsed;
                                } else if (Array.isArray(parsed) && parsed.length > 0) {
                                    productData = { marketing_profile: { core_selling_points: parsed } };
                                } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                    const record = parsed as Record<string, unknown>;
                                    const corePoints = (record.core_selling_points ?? record.selling_points) as unknown;
                                    if (Array.isArray(corePoints) && corePoints.length > 0) {
                                        productData = { ...record, marketing_profile: { core_selling_points: corePoints } };
                                    }
                                }
                            } catch {
                                // Ignore parse errors and fall back below
                            }

                            if (productData) {
                                const structuredFromJson = buildStructuredAnalysisFromJson(productData);
                                if (structuredFromJson) {
                                    return renderStructuredAnalysis(structuredFromJson);
                                }
                            }

                            // If hasAnalysis is true but no structured/text content could be parsed,
                            // show raw sellingPoints JSON so data is never invisible
                            if (viewingProductHasAnalysis) {
                                let rawContent = viewingProduct.sellingPoints;
                                try {
                                    const parsed = JSON.parse(rawContent);
                                    rawContent = JSON.stringify(parsed, null, 2);
                                } catch { /* use as-is */ }
                                return (
                                    <div className="space-y-3">
                                        <p className="text-xs text-gray-400 dark:text-gray-500">{t.products.analysisResult}</p>
                                        <pre className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700 overflow-auto max-h-96 font-mono">
                                            {rawContent}
                                        </pre>
                                    </div>
                                );
                            }

                            if (viewingProductIsTimedOut) {
                                return (
                                    <div className="h-full flex flex-col items-center justify-center text-center text-red-500 gap-3 px-6">
                                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M5.455 19h13.09a1 1 0 00.894-1.447L12.894 5.553a1 1 0 00-1.788 0L4.561 17.553A1 1 0 005.455 19z"></path></svg>
                                        <p className="text-sm font-semibold">{t.products.status.timeout}</p>
                                        <p className="text-xs text-red-400 dark:text-red-300 leading-relaxed">{t.products.timeoutHint}</p>
                                    </div>
                                );
                            }

                            // Loading State
                            if (viewingProductIsAnalyzing) {
                                const progress = viewingProduct.progress || 0;
                                return (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                                        <div className="relative w-16 h-16">
                                            <div className="w-16 h-16 rounded-full border-4 border-gray-100 dark:border-gray-700"></div>
                                            <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
                                            {progress > 0 && (
                                                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-primary">
                                                    {progress}%
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium animate-pulse text-primary">
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
            assistantLayout="floating"
            showAssistant={false}
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
