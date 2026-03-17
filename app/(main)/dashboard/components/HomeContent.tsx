'use client';

/* eslint-disable @next/next/no-img-element -- Upload previews rely on raw <img> because files can be local or blob URLs */

import { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { AtomXLogo } from '@/components/AtomXLogo';
import { VideoCard } from '@/components/VideoCard';
import { Modal } from '@/components/Modal';
import { ProductForm } from '@/components/ProductForm';
import { 
  Upload, Link as LinkIcon, Zap, Layers, Play, Image as ImageIcon, 
  ArrowRight, ArrowUp, Plus, Search, ChevronDown, Check, 
  Sparkles, Sliders, Layout, Clapperboard, Mic, User, Film
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { createStoryboardTask } from '@/app/actions/storyboard';
import { createScript } from '@/app/(main)/scripts/actions';
import { emitCreditsRefresh } from '@/lib/creditsBus';
import { useTenant } from '@/hooks/useTenant';
import { DigitalHumanModal } from '@/components/DigitalHumanModal';
import { StoryboardGenModal } from '@/components/StoryboardGenModal';
import { CharacterEmptyGuide } from '@/components/characters/CharacterEmptyGuide';

const DIGITAL_HUMAN_GUIDE_KEY = 'digitalHumanGuideDismissed';

interface HomeContentProps {
  recentVideos: any[];
  products: any[];
}

export function HomeContent({ recentVideos, products }: HomeContentProps) {
  const { t } = useLanguage();
  const { tenant, tenantSlug, basePath } = useTenant();
  const router = useRouter();
  const [mode, setMode] = useState<'one-click' | 'storyboard'>('one-click');
  const [inputValue, setInputValue] = useState('');
  
  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState<string>('idle');
  const [progress, setProgress] = useState(0);
  
  // Form States
  const [product, setProduct] = useState('');
  const [country, setCountry] = useState('US');
  const [language, setLanguage] = useState('en');
  const [duration, setDuration] = useState('15s');
  const [quantity, setQuantity] = useState(1);
  const [influencer, setInfluencer] = useState('');
  
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isDigitalHumanModalOpen, setIsDigitalHumanModalOpen] = useState(false);
  const [isDigitalHumanGuideOpen, setIsDigitalHumanGuideOpen] = useState(false);
  const [storyboardModalContext, setStoryboardModalContext] = useState<'nine-grid' | 'batch' | null>(null);

  const getTenantPath = (path: string) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${basePath || ''}${normalizedPath}`;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type.startsWith('video/')) {
        setFile(droppedFile);
      }
    }
  };
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [errors, setErrors] = useState({ product: false, input: false });

  const countries = [
    { code: 'US', label: (t as any).countries?.US || 'United States' },
    { code: 'UK', label: (t as any).countries?.UK || 'United Kingdom' },
    { code: 'JP', label: (t as any).countries?.JP || 'Japan' },
    { code: 'DE', label: (t as any).countries?.DE || 'Germany' },
    { code: 'FR', label: (t as any).countries?.FR || 'France' },
    { code: 'ES', label: (t as any).countries?.ES || 'Spain' },
  ];

  const languages = [
    { code: 'en', label: (t as any).languages?.en || 'English' },
    { code: 'es', label: (t as any).languages?.es || 'Spanish' },
    { code: 'jp', label: (t as any).languages?.jp || 'Japanese' },
    { code: 'zh', label: (t as any).languages?.zh || 'Chinese' },
    { code: 'de', label: (t as any).languages?.de || 'German' },
    { code: 'fr', label: (t as any).languages?.fr || 'French' },
  ];

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const selectedProduct = products.find(p => p.id === product);

  const safeParseArray = (raw?: string | null) => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Invalid JSON array', raw, error);
      return [];
    }
  };

  const handleExecute = async () => {
    const newErrors = {
      product: !product,
      input: !inputValue && !file
    };

    setErrors(newErrors);

    if (newErrors.product) {
      toast.error((t as any).home?.pleaseSelectProduct || 'Please select a product');
    } else if (newErrors.input) {
      toast.error((t as any).home?.pleaseUploadVideo || 'Please upload a video or enter a link');
    }

    if (!newErrors.product && !newErrors.input) {
      
      if (mode === 'storyboard') {
        const loadingToast = toast.loading('Creating storyboard task...');
        try {
            const formData = new FormData();
            formData.append('productId', product);
            
            // Handle Video Source
            if (file) {
                 // Upload file first to get URL
                 const uploadData = new FormData();
                 uploadData.append('file', file);
                 const res = await fetch('/api/upload', { method: 'POST', body: uploadData });
                 if (!res.ok) throw new Error('Failed to upload video');
                 const data = await res.json();
                 formData.append('videoUrl', data.url);
            } else {
                 formData.append('videoUrl', inputValue);
            }

            if (influencer) {
                // Assuming influencer value is ID
                // formData.append('characterId', influencer);
            }

            const result = await createStoryboardTask(formData);
            emitCreditsRefresh();
            
            toast.dismiss(loadingToast);
            toast.success('Task created! Redirecting...');
            router.push(getTenantPath(`/storyboard/${result.taskId}`));
            
        } catch (error) {
            console.error(error);
            toast.dismiss(loadingToast);
            toast.error('Failed to create task');
        }
      } else {
        // One-Click Mode Logic (Sequential Flow)
        setIsProcessing(true);
        setProcessStep('uploading');
        setProgress(0);
        const loadingToast = toast.loading('Starting process...');

        try {
            // 1. Upload/Get Video URL
            let videoUrl = inputValue;
            if (file) {
                 const uploadData = new FormData();
                 uploadData.append('file', file);
                 const res = await fetch('/api/upload', { method: 'POST', body: uploadData });
                 if (!res.ok) throw new Error('Failed to upload video');
                 const data = await res.json();
                 videoUrl = data.url;
            }

            if (!videoUrl) throw new Error('No video URL provided');

            // 2. Create Script
            setProcessStep('creating_script');
            setProgress(5);
            toast.loading('Creating script...', { id: loadingToast });
            
            const scriptFormData = new FormData();
            scriptFormData.append('title', `Homepage Upload - ${new Date().toLocaleString()}`);
            scriptFormData.append('videoUrl', videoUrl);
            scriptFormData.append('description', 'Auto-generated from homepage upload');
            
            // Use server action to create script
            const script = await createScript(scriptFormData);
            
            if (!script || !script.id) throw new Error('Failed to create script');

            // 3. Trigger Breakdown
            setProcessStep('breakdown');
            setProgress(10);
            toast.loading('Analyzing video structure (Explosive Dismantling)...', { id: loadingToast });
            
            const breakdownRes = await fetch('/api/scripts/breakdown', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scriptId: script.id })
            });
            
            if (!breakdownRes.ok) throw new Error('Failed to start breakdown');

            // 4. Poll for Completion
            await new Promise((resolve, reject) => {
                const interval = setInterval(async () => {
                    try {
                        const res = await fetch(`/api/scripts/${script.id}/status`);
                        if (!res.ok) throw new Error('Failed to check status');
                        const data = await res.json();
                        
                        // Update progress based on status (approximate)
                        if (data.status === 'queued') setProgress(15);
                        else if (data.status === 'extracting') setProgress(25);
                        else if (data.status === 'downloading') setProgress(40);
                        else if (data.status === 'analyzing') setProgress(60);
                        else if (data.status === 'parsing') setProgress(80);
                        
                        if (data.status === 'completed') {
                            setProgress(100);
                            clearInterval(interval);
                            resolve(data);
                        } else if (data.status === 'failed') {
                            clearInterval(interval);
                            reject(new Error('Analysis failed'));
                        }
                    } catch (e) {
                        clearInterval(interval);
                        reject(e);
                    }
                }, 2000);
            });
            
            // 5. Trigger Replication
            setProcessStep('replication');
            setProgress(95);
            toast.loading('Starting replication process...', { id: loadingToast });
            
            const replicationRes = await fetch('/api/replication/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scriptId: script.id,
                    productId: product,
                    targetCountry: country,
                    targetLanguage: language,
                    duration: duration,
                    quantity: quantity.toString()
                })
            });
            
            if (!replicationRes.ok) throw new Error('Failed to start replication');
            
            const replicationData = await replicationRes.json();
            
            toast.success('Replication started! Redirecting...', { id: loadingToast });
            
            // 6. Redirect
            if (replicationData.id) {
                 router.push(`/replication/${replicationData.id}`);
            } else {
                 router.push('/replication');
            }

        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Something went wrong', { id: loadingToast });
            setIsProcessing(false);
            setProcessStep('idle');
            setProgress(0);
        }
      }
    }
  };

  const handleProductCreated = () => {
    setIsProductModalOpen(false);
    router.refresh();
  };

  // Quick Access Cards Data
  const openDigitalHumanModal = () => setIsDigitalHumanModalOpen(true);

  const handleDigitalHumanQuickAccess = () => {
    if (typeof window !== 'undefined') {
      const dismissed = window.localStorage.getItem(DIGITAL_HUMAN_GUIDE_KEY) === 'true';
      if (!dismissed) {
        setIsDigitalHumanGuideOpen(true);
        return;
      }
    }
    openDigitalHumanModal();
  };

  const handleDigitalHumanGuideContinue = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DIGITAL_HUMAN_GUIDE_KEY, 'true');
    }
    setIsDigitalHumanGuideOpen(false);
    openDigitalHumanModal();
  };

  const quickAccessCards = [
    {
      key: 'digital-human',
      title: (t as any).home?.quickAccess?.digitalHuman || 'Digital Human',
      subtitle: (t as any).home?.quickAccess?.digitalHumanSubtitle || 'High-fidelity Lip-sync',
      icon: <User className="w-6 h-6 text-red-500" />,
      badge: null,
      onClick: handleDigitalHumanQuickAccess
    },
    {
      key: 'storyboard-video',
      title: (t as any).home?.quickAccess?.storyboardVideo || 'Storyboard Video',
      subtitle: (t as any).home?.quickAccess?.storyboardSubtitle || 'High Consistency Video',
      icon: <Clapperboard className="w-6 h-6 text-orange-500" />,
      badge: null,
      onClick: () => setStoryboardModalContext('nine-grid')
    },
    {
      key: 'batch-video',
      title: (t as any).home?.quickAccess?.batchVideoGen || 'Batch Video Generation',
      subtitle: (t as any).home?.quickAccess?.batchVideoSubtitle || 'One-click Concurrent Generation',
      icon: <Film className="w-6 h-6 text-primary" />,
      badge: null,
      link: getTenantPath('/storyboard/create')
    }
  ];

  const isJubaopen = tenantSlug === 'jubaopen';
  const heroTitle = useMemo(() => {
    if (isJubaopen) return '聚保盆让内容营销更简单';
    return (t as any).home?.heroTitle || 'AtomX Makes Content Marketing Simpler';
  }, [isJubaopen, t]);

  const heroLogo = useMemo(() => {
    if (isJubaopen) {
      const logoSrc = tenant.browserLogo || '/logo/jubaopeng_logo.svg';
      return (
        <img
          src={logoSrc}
          alt={tenant.name}
          className="mr-2 h-12 w-12 rounded-full object-cover"
        />
      );
    }
    return <AtomXLogo className="inline-flex mr-2" size={48} showText={false} />;
  }, [isJubaopen, tenant.browserLogo, tenant.name]);

  return (
    <div className="min-h-screen bg-[#F6F7F9] dark:bg-black font-sans">
      <div className="max-w-6xl mx-auto px-4 py-12">
      
        {/* Hero Section */}
        <div className="flex flex-col items-center justify-center mb-10 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            {heroLogo}
            <span className="hidden">{tenant.name}</span>
            {heroTitle}
          </h1>
        </div>

        {/* Main Interaction Area - Styled like the Reference Image */}
        <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-800 mb-10 relative">
          
          {/* Processing Overlay */}
          {isProcessing && (
              <div className="absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-sm z-50 rounded-[2rem] flex flex-col items-center justify-center animate-in fade-in duration-300">
                  <div className="w-72 space-y-4 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700">
                      <div className="flex items-center justify-between text-sm font-bold text-gray-900 dark:text-white">
                          <span className="animate-pulse">
                              {processStep === 'uploading' && 'Uploading Video...'}
                              {processStep === 'creating_script' && 'Creating Script...'}
                              {processStep === 'breakdown' && 'Explosive Dismantling...'}
                              {processStep === 'replication' && 'Starting Replication...'}
                          </span>
                          <span>{Math.round(progress)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                          <div 
                              className="bg-primary h-full transition-all duration-300 ease-out"
                              style={{ width: `${progress}%` }}
                          />
                      </div>
                  </div>
              </div>
          )}

          <div className="flex flex-col md:flex-row gap-6 mb-20">
            {/* Upload Placeholder Box */}
            <label 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "w-24 h-32 md:w-32 md:h-32 shrink-0 bg-gray-50 dark:bg-gray-800 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer group hover:bg-gray-100 dark:hover:bg-gray-700",
                isDragging ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
              )}
            >
              <input 
                type="file" 
                className="hidden" 
                accept="video/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setFile(e.target.files[0]);
                    setErrors(prev => ({ ...prev, input: false }));
                  }
                }}
              />
              {file ? (
                file.type.startsWith('video/') ? (
                  <video 
                    src={URL.createObjectURL(file)} 
                    className="w-full h-full object-cover rounded-xl"
                    controls={false}
                    autoPlay
                    muted
                    loop
                  />
                ) : (
                  <img 
                    src={URL.createObjectURL(file)} 
                    alt={file.name} 
                    className="w-full h-full object-cover rounded-xl"
                  />
                )
              ) : (
                <Plus className="text-gray-400 group-hover:text-gray-600 dark:text-gray-500" size={24} />
              )}
            </label>

            {/* Text Input Area */}
            <div className="flex-1">
               <textarea
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (e.target.value) setErrors(prev => ({ ...prev, input: false }));
                }}
                placeholder={(t as any).home?.uploadPlaceholder || 'Seedance 2.0 Full Reference, Video Creativity Unlimited Possibilities...'}
                className="w-full h-full min-h-[100px] bg-transparent border-none outline-none text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 resize-none text-lg font-medium p-2"
              />
            </div>
          </div>

          {/* Bottom Controls Bar */}
          <div className="absolute bottom-6 left-6 right-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Mode Selector Pill */}
              <div className="relative">
                <button
                  onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                  className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white border border-transparent rounded-full shadow-sm text-sm font-bold text-white dark:text-black hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors"
                >
                  <Sparkles size={16} />
                  <span>
                    {mode === 'one-click' ? ((t as any).home?.oneClickMode || 'Agent Mode') : ((t as any).home?.storyboardMode || 'Storyboard')}
                  </span>
                  <ChevronDown size={14} className="text-gray-400" />
                </button>
                
                {isModeDropdownOpen && (
                   <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsModeDropdownOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                      <button
                        onClick={() => { 
                          setMode('one-click'); 
                          setDuration('15s');
                          setIsModeDropdownOpen(false); 
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium flex items-center justify-between"
                      >
                        {(t as any).home?.oneClickMode || 'Agent Mode'}
                        {mode === 'one-click' && <Check size={14} className="text-black dark:text-white" />}
                      </button>
                      <button
                        onClick={() => { 
                          setMode('storyboard'); 
                          setDuration('32s');
                          setIsModeDropdownOpen(false); 
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium flex items-center justify-between"
                      >
                        {(t as any).home?.storyboardMode || 'Storyboard Mode'}
                        {mode === 'storyboard' && <Check size={14} className="text-black dark:text-white" />}
                      </button>
                    </div>
                   </>
                )}
              </div>

              {/* Product Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border rounded-full shadow-sm text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors max-w-[160px]",
                            errors.product ? "border-red-500" : "border-gray-200 dark:border-gray-700"
                        )}
                    >
                        <span className="truncate">
                            {selectedProduct ? selectedProduct.name : ((t as any).home?.selectProduct || 'Select Product')}
                        </span>
                        <ChevronDown size={14} className="text-gray-400 shrink-0" />
                    </button>

                    {isProductDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setIsProductDropdownOpen(false)} />
                            <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input 
                                            type="text" 
                                            placeholder="Search..." 
                                            value={productSearch}
                                            onChange={(e) => setProductSearch(e.target.value)}
                                            className="w-full bg-gray-50 dark:bg-gray-900 rounded-lg pl-9 pr-3 py-2 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-gray-400"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                                    <button
                                        onClick={() => {
                                            setIsProductDropdownOpen(false);
                                            setIsProductModalOpen(true);
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs font-bold text-primary dark:text-primary hover:bg-primary-soft/60 dark:hover:bg-primary/10 rounded-lg flex items-center gap-2 mb-1"
                                    >
                                        <Plus size={14} />
                                        {t.products.newProduct}
                                    </button>
                                    
                                  {filteredProducts.length > 0 ? (
                                        filteredProducts.map(p => {
                                            const images = safeParseArray(p.images);
                                            const imageUrl = images.length > 0 ? images[0] : null;

                                            return (
                                                <button
                                                    key={p.id}
                                                    onClick={() => {
                                                        setProduct(p.id);
                                                        setErrors(prev => ({ ...prev, product: false }));
                                                        setIsProductDropdownOpen(false);
                                                    }}
                                                    className={cn(
                                                        "w-full text-left px-3 py-2 text-xs rounded-lg flex items-center gap-3 transition-colors",
                                                        product === p.id 
                                                            ? "bg-black/5 dark:bg-white/10 text-black dark:text-white font-bold" 
                                                            : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                                    )}
                                                >
                                                    <div className="w-6 h-6 rounded bg-gray-200 dark:bg-gray-600 shrink-0 overflow-hidden">
                                                        {imageUrl ? (
                                                            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                                <ImageIcon size={12} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="truncate">{p.name}</span>
                                                    {product === p.id && <Check size={14} className="ml-auto text-black dark:text-white" />}
                                                </button>
                                            );
                                        })
                                    ) : (
                                        <div className="px-3 py-4 text-center text-xs text-gray-400">
                                            No products found
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Country Dropdown */}
                <div className="relative hidden md:block">
                    <button
                        onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-sm text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        <span className="truncate max-w-[100px]">
                             {countries.find(c => c.code === country)?.label || country}
                        </span>
                        <ChevronDown size={14} className="text-gray-400" />
                    </button>

                    {isCountryDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setIsCountryDropdownOpen(false)} />
                            <div className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                                    {countries.map(c => (
                                        <button
                                            key={c.code}
                                            onClick={() => {
                                                setCountry(c.code);
                                                setIsCountryDropdownOpen(false);
                                            }}
                                            className={cn(
                                                "w-full text-left px-3 py-2 text-xs rounded-lg flex items-center justify-between transition-colors",
                                                country === c.code 
                                                    ? "bg-black/5 dark:bg-white/10 text-black dark:text-white font-bold" 
                                                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                            )}
                                        >
                                            <span>{c.label}</span>
                                            {country === c.code && <Check size={14} className="text-black dark:text-white" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                 {/* Language Dropdown */}
                 <div className="relative hidden md:block">
                    <button
                        onClick={() => setIsLanguageDropdownOpen(!isLanguageDropdownOpen)}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-sm text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        <span className="truncate max-w-[100px]">
                             {languages.find(l => l.code === language)?.label || language}
                        </span>
                        <ChevronDown size={14} className="text-gray-400" />
                    </button>

                    {isLanguageDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setIsLanguageDropdownOpen(false)} />
                            <div className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
                                    {languages.map(l => (
                                        <button
                                            key={l.code}
                                            onClick={() => {
                                                setLanguage(l.code);
                                                setIsLanguageDropdownOpen(false);
                                            }}
                                            className={cn(
                                                "w-full text-left px-3 py-2 text-xs rounded-lg flex items-center justify-between transition-colors",
                                                language === l.code 
                                                    ? "bg-black/5 dark:bg-white/10 text-black dark:text-white font-bold" 
                                                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                            )}
                                        >
                                            <span>{l.label}</span>
                                            {language === l.code && <Check size={14} className="text-black dark:text-white" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Duration */}
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 p-0.5">
                    {mode === 'one-click' ? (
                        <>
                            {['10s', '15s'].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setDuration(d)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                                        duration === d ? "bg-white text-black shadow-sm dark:bg-gray-700 dark:text-white" : "text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
                                    )}
                                >
                                    {d}
                                </button>
                            ))}
                        </>
                    ) : (
                         <>
                            {['16s', '24s', '32s', '40s', '48s', '56s'].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setDuration(d)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                                        duration === d ? "bg-white text-black shadow-sm dark:bg-gray-700 dark:text-white" : "text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
                                    )}
                                >
                                    {d}
                                </button>
                            ))}
                        </>
                    )}
                </div>

                {/* Quantity */}
                <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1.5">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-bold">{(t as any).home?.quantity || 'Qty'}:</span>
                    <input 
                        type="number" 
                        min="1" 
                        max="10" 
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value))}
                        className="w-8 bg-transparent text-center text-xs font-bold outline-none text-gray-900 dark:text-white"
                    />
                </div>
            </div>

            {/* Execute Button */}
            <button 
              onClick={handleExecute}
              className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors group ml-auto"
            >
              <ArrowUp size={20} className="text-gray-500 dark:text-gray-400 group-hover:text-white dark:group-hover:text-black" />
            </button>
          </div>
        </div>

        {/* Quick Access Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4 mb-12">
          {quickAccessCards.map((card) => {
            const sharedContent = (
              <>
                <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0 group-hover:bg-primary-soft dark:group-hover:bg-primary/10 transition-colors">
                  {card.badge && (
                      <span className={cn(
                          "absolute -top-1 -right-1 text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full",
                          card.badge === '4.1' ? "bg-black text-white" : "bg-primary"
                      )}>
                          {card.badge}
                      </span>
                  )}
                  <div className="relative">
                      {card.icon}
                      {card.badge && (
                          <div className={cn(
                              "absolute -top-2 -right-2 text-[8px] font-bold text-white px-1 rounded-full",
                              card.badge === '4.1' ? "bg-black text-white" : "bg-primary"
                          )}>
                              {card.badge}
                          </div>
                      )}
                  </div>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-sm text-gray-900 dark:text-white truncate group-hover:text-primary dark:group-hover:text-primary transition-colors">
                      {card.title}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {card.subtitle}
                  </span>
                </div>
              </>
            );

            const baseClasses = "bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-all flex items-center gap-3 group";

            if (card.link) {
              return (
                <Link key={card.key} href={card.link!} className={baseClasses}>
                  {sharedContent}
                </Link>
              );
            }

            return (
              <button
                key={card.key}
                type="button"
                onClick={card.onClick}
                className={cn(baseClasses, "text-left")}
              >
                {sharedContent}
              </button>
            );
          })}
        </div>

        {/* Recent Projects (Simplified/Moved down) */}
        <div className="mb-8">
            <div className="flex items-center justify-between mb-6 px-2">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-black dark:bg-white rounded-full"></div>
                    {(t as any).home?.recentProjects || 'Recent Projects'}
                </h2>
                <Link href={getTenantPath('/replication')} className="text-sm font-bold text-gray-500 hover:text-black dark:hover:text-white flex items-center gap-1 transition-colors">
                    {(t as any).home?.viewMore || 'View More'} <ArrowRight size={14} />
                </Link>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {recentVideos.length > 0 ? (
                    recentVideos.map((video) => (
                        <div key={video.id} className="aspect-[9/16] h-auto">
                             <VideoCard 
                                item={video} 
                                onClick={() => {}} 
                             />
                        </div>
                    ))
                ) : (
                    <div className="col-span-full py-12 text-center text-gray-400 bg-white dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <p>No recent projects found</p>
                    </div>
                )}
            </div>
        </div>

        <Modal
          isOpen={isProductModalOpen}
          onClose={() => setIsProductModalOpen(false)}
          title={t.products.formTitle}
        >
          <ProductForm 
              onSuccess={handleProductCreated} 
          />
        </Modal>

        <Modal
          isOpen={isDigitalHumanGuideOpen}
          onClose={() => setIsDigitalHumanGuideOpen(false)}
          title={t.characters?.emptyGuide?.badge || '数字人生成指引'}
          maxWidth="max-w-6xl"
        >
          <CharacterEmptyGuide
            copy={t.characters?.emptyGuide}
            onCtaClick={handleDigitalHumanGuideContinue}
          />
        </Modal>

        <Modal
          isOpen={isDigitalHumanModalOpen}
          onClose={() => setIsDigitalHumanModalOpen(false)}
          title={
            <span className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <User className="w-5 h-5" />
              {t.storyboard.digitalHuman}
            </span>
          }
          maxWidth="max-w-6xl"
        >
          <DigitalHumanModal hideInternalTitle onClose={() => setIsDigitalHumanModalOpen(false)} />
        </Modal>

        {storyboardModalContext && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setStoryboardModalContext(null)}
          >
            <div
              className="w-full max-w-6xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <StoryboardGenModal
                onClose={() => setStoryboardModalContext(null)}
                initialValues={
                  storyboardModalContext === 'batch'
                    ? { videoType: 'story' }
                    : undefined
                }
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
