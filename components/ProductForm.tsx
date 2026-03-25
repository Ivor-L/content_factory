'use client';

/* eslint-disable @next/next/no-img-element -- Product form previews rely on temporary blob URLs */

import { useState } from 'react';
import { saveProductWithAnalysis } from '@/app/(main)/products/actions';
import { useLanguage } from '@/contexts/LanguageContext';
import { emitCreditsRefresh } from '@/lib/creditsBus';

import { toast } from 'react-hot-toast';

interface ProductFormProps {
  onSuccess?: () => void;
  initialData?: {
    id: string;
    name: string;
    description: string;
    images: string;
    sellingPoints: string;
  };
  showAssistant?: boolean;
  assistantLayout?: "inline" | "floating";
}

export function ProductForm({ onSuccess, initialData, showAssistant = true, assistantLayout = "inline" }: ProductFormProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'complete' | 'failed'>('idle');
  
  // Form state
  const [id, setId] = useState<string | null>(initialData?.id || null);
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [images, setImages] = useState<string[]>(() => {
    try {
        return initialData?.images ? JSON.parse(initialData.images) : [];
    } catch {
        return [];
    }
  });
  const [sellingPoints, setSellingPoints] = useState<string[]>(() => {
    try {
        return initialData?.sellingPoints ? JSON.parse(initialData.sellingPoints) : [];
    } catch {
        return [];
    }
  });
  const [workflowData, setWorkflowData] = useState<any>(null);
  
  // Inputs
  const [uploadingImage, setUploadingImage] = useState(false);

  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    // Client-side validation: Max 50MB
    if (file.size > 50 * 1024 * 1024) {
        toast.error(t.common.fileSizeTooLarge);
        return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload/image', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await res.json();
      setImages([...images, data.url]);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast.error(error.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    // Reset input value to allow uploading same file again if needed
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleAnalyzeAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      toast.error(t.products.enterNameError);
      return;
    }

    setLoading(true);
    setAnalyzing(true);
    setAnalysisStatus('analyzing');

    try {
      const formData = new FormData();
      if (id) {
        formData.append('id', id);
      }
      formData.append('name', name);
      formData.append('description', description);
      formData.append('sellingPoints', '[]');
      formData.append('sellingPointsText', '');
      formData.append('images', JSON.stringify(images));

      const productId = await saveProductWithAnalysis(formData);
      setId(productId);

      toast.dismiss();
      toast.success(t.products.savedSuccess, {
        duration: 2000,
        icon: '✅',
        style: {
          borderRadius: '10px',
          background: '#f0fdf4',
          color: '#166534',
          border: '1px solid #bbf7d0',
        },
      });
      setAnalysisStatus('complete');
      emitCreditsRefresh();

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : (t.products.analysisFailed || 'Analysis failed');
      toast.error(message);
      setAnalysisStatus('failed');
    } finally {
      setAnalyzing(false);
      setLoading(false);
    }
  };

  void showAssistant;
  void assistantLayout;

  return (
    <form onSubmit={handleAnalyzeAndSave} className="space-y-6">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t.products.name}</label>
        <input
          type="text"
          required
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Wireless Headphones"
        />
      </div>

      {/* Selling Points Display (Read-only / from AI) */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t.products.sellingPoints}</label>
        <textarea
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 h-32 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            value={sellingPoints.join('\n')}
            onChange={(e) => setSellingPoints(e.target.value.split('\n'))}
            placeholder={t.products.sellingPoints + "..."}
        />
        <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">{t.products.onePerLine}</p>
      </div>

      {/* Images */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Images</label>
        
        {/* File Upload (Only show if no images are uploaded) */}
        {images.length === 0 && (
            <div className="mb-4">
            <div className="flex items-center justify-center w-full">
                <label 
                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                        dragActive ? 'border-primary bg-primary-soft/60 dark:bg-primary/10' : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-primary-soft/50 dark:hover:bg-primary/10'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    {uploadingImage ? (
                    <div className="flex flex-col items-center">
                        <svg className="animate-spin h-8 w-8 text-gray-500 dark:text-gray-400 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t.common.loading}</p>
                    </div>
                    ) : (
                    <>
                        <svg className="w-8 h-8 mb-4 text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                        </svg>
                        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold">{t.products.upload}</span> {t.products.dragDrop}</p>
                    </>
                    )}
                </div>
                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*" disabled={uploadingImage} />
                </label>
            </div>
            </div>
        )}

        {/* Image Preview List */}
        {images.length > 0 && (
            <div className="grid grid-cols-4 gap-4">
            {images.map((img, i) => (
                <div key={i} className="relative group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 shadow-sm flex items-center justify-center p-2" style={{ height: '150px' }}>
                <img src={img} alt={`Product ${i}`} className="w-full h-full object-contain" />
                <button
                    type="button"
                    onClick={() => handleRemoveImage(i)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-600"
                >
                    &times;
                </button>
                </div>
            ))}
            </div>
        )}
      </div>

      {workflowData && (
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 dark:bg-gray-900/40 dark:border-white/10">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">{t.products.analysisResult}</h3>
          <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-white p-3 rounded border border-gray-200 max-h-48 overflow-y-auto font-mono dark:bg-gray-950/40 dark:text-gray-200 dark:border-white/5">
            {JSON.stringify(workflowData, null, 2)}
          </pre>
        </div>
      )}

      {/* Submit & Analyze (Sticky Bottom) */}
      <div className="sticky bottom-0 mt-6 pt-6 pb-2 relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-full h-16 bg-gradient-to-t from-white via-white/40 to-transparent dark:from-gray-950 dark:via-gray-950/60"
        />
        <button
          type="submit"
          disabled={loading || analyzing}
          className="w-full px-6 py-3 bg-black text-white dark:bg-white dark:text-black rounded-lg font-bold hover:bg-gray-900 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors shadow-sm uppercase tracking-wide flex items-center justify-center gap-2"
        >
          {analyzing ? (
            <>
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {t.common.analyzing}
            </>
          ) : (
            <>
                <span className="text-lg">✨</span> {t.products.analyze}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
