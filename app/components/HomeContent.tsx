'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { AtomXLogo } from '@/components/AtomXLogo';
import { VideoCard } from '@/components/VideoCard';
import { Modal } from '@/components/Modal';
import { ProductForm } from '@/components/ProductForm';
import { Upload, Link as LinkIcon, Zap, Layers, Play, Image as ImageIcon, ArrowRight, Plus, Search, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { createStoryboardTask } from '../actions/storyboard';

interface HomeContentProps {
  recentVideos: any[];
  products: any[];
}

export function HomeContent({ recentVideos, products }: HomeContentProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [mode, setMode] = useState<'one-click' | 'storyboard'>('one-click');
  const [inputValue, setInputValue] = useState('');
  
  // Form States
  const [product, setProduct] = useState('');
  const [country, setCountry] = useState('US');
  const [language, setLanguage] = useState('en');
  const [duration, setDuration] = useState('15s');
  const [quantity, setQuantity] = useState(1);
  const [influencer, setInfluencer] = useState('');
  
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);

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
                // Assuming influencer value is ID, but we might need to map it if it's just a mock string
                // For now let's skip or handle properly if we had real influencer data
                // formData.append('characterId', influencer);
            }

            const result = await createStoryboardTask(formData);
            
            toast.dismiss(loadingToast);
            toast.success('Task created! Redirecting...');
            router.push(`/storyboard/${result.taskId}`);
            
        } catch (error) {
            console.error(error);
            toast.dismiss(loadingToast);
            toast.error('Failed to create task');
        }
      } else {
        // One-Click Mode Logic (Existing)
        console.log('Execute One-Click task', { mode, inputValue, product, country, language, duration, quantity, influencer });
        toast.success('One-click task started (Mock)');
      }
    }
  };

  const handleProductCreated = () => {
    setIsProductModalOpen(false);
    router.refresh();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 font-sans">
      
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center mb-10 text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
            {(t as any).home?.heroTitle || 'AtomX Makes Content Marketing Simpler'}
        </h1>
      </div>

      {/* Main Interaction Area */}
      <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-3xl p-1 shadow-2xl max-w-4xl mx-auto mb-16 border border-gray-200 dark:border-gray-800">
        
        {/* Tabs */}
        <div className="flex justify-center pt-6 pb-6">
            <div className="bg-gray-100 dark:bg-gray-800/50 p-1 rounded-full inline-flex">
                <button
                    onClick={() => {
                        setMode('one-click');
                        setDuration('15s');
                    }}
                    className={cn(
                        "px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2",
                        mode === 'one-click' 
                            ? "bg-white dark:bg-gray-700 text-black dark:text-white shadow-sm" 
                            : "text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
                    )}
                >
                    <Zap size={16} />
                    {(t as any).home?.oneClickMode || 'One-Click Video'}
                </button>
                <button
                    onClick={() => {
                        setMode('storyboard');
                        setDuration('32s');
                    }}
                    className={cn(
                        "px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2",
                        mode === 'storyboard' 
                            ? "bg-white dark:bg-gray-700 text-black dark:text-white shadow-sm" 
                            : "text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
                    )}
                >
                    <Layers size={16} />
                    {(t as any).home?.storyboardMode || 'Storyboard Control'}
                </button>
            </div>
        </div>

        {/* Input Card */}
        <div className={cn(
            "bg-gray-50 dark:bg-[#1E1E1E] rounded-[2rem] p-6 mx-4 mb-4 border shadow-inner transition-colors",
            errors.input ? "border-red-500" : "border-gray-200 dark:border-gray-800"
        )}>
            <div className="flex gap-6">
                {/* Upload Placeholder Box */}
                <label 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                        "w-32 h-32 shrink-0 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors cursor-pointer group",
                        isDragging 
                            ? "border-brand-yellow bg-brand-yellow/5" 
                            : "border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800/50"
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
                            <>
                                <div className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors",
                                    isDragging 
                                        ? "bg-brand-yellow/20" 
                                        : "bg-gray-200 dark:bg-gray-800 group-hover:bg-gray-300 dark:group-hover:bg-gray-700"
                                )}>
                                    <Play size={20} className={cn(
                                        "ml-0.5", 
                                        isDragging ? "text-brand-yellow" : "text-gray-500 dark:text-gray-400"
                                    )} fill="currentColor" />
                                </div>
                                <span className={cn(
                                    "text-xs font-medium max-w-[90%] truncate px-1",
                                    isDragging ? "text-brand-yellow" : "text-gray-400 dark:text-gray-500"
                                )}>
                                    Upload
                                </span>
                            </>
                        )}
                </label>

                {/* Text Input Area */}
                <div className="flex-1 relative">
                    <textarea
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            if (e.target.value) setErrors(prev => ({ ...prev, input: false }));
                        }}
                        placeholder={(t as any).home?.uploadPlaceholder || 'Paste TikTok link or upload viral video file...'}
                        className="w-full h-20 bg-transparent border-none outline-none text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 resize-none text-lg font-medium"
                    />
                    
                    <div className="flex items-center gap-3 mt-2">
                         <span className="px-3 py-1 bg-gray-200 dark:bg-gray-800 rounded-full text-xs font-bold text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-700">
                            {(t as any).home?.uploadTip || 'Upload a viral video to start replication'}
                         </span>
                    </div>
                </div>
            </div>
        </div>
        
        {/* Options Bar Outside */}
        <div className="px-6 pb-6 pt-2 flex flex-wrap items-center gap-3">
                {/* Product Dropdown - Custom Implementation */}
                <div className="relative">
                    <button
                        onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                        className={cn(
                            "bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-white pl-4 pr-10 py-2 rounded-full border outline-none focus:border-gray-400 dark:focus:border-gray-500 hover:bg-gray-200 dark:hover:bg-gray-750 flex items-center min-w-[150px] justify-between transition-all",
                            errors.product ? "border-red-500" : "border-gray-200 dark:border-gray-700"
                        )}
                    >
                        <span className="truncate max-w-[120px]">
                            {selectedProduct ? selectedProduct.name : ((t as any).home?.selectProduct || 'Select Product')}
                        </span>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                            <ChevronDown size={14} />
                        </div>
                    </button>

                    {isProductDropdownOpen && (
                        <>
                            <div 
                                className="fixed inset-0 z-10" 
                                onClick={() => setIsProductDropdownOpen(false)}
                            />
                            <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input 
                                            type="text" 
                                            placeholder="Search..." 
                                            value={productSearch}
                                            onChange={(e) => setProductSearch(e.target.value)}
                                            className="w-full bg-gray-50 dark:bg-gray-900 rounded-lg pl-9 pr-3 py-2 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-yellow placeholder:text-gray-400"
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
                                        className="w-full text-left px-3 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg flex items-center gap-2 mb-1"
                                    >
                                        <Plus size={14} />
                                        {t.products.newProduct}
                                    </button>
                                    
                                    {filteredProducts.length > 0 ? (
                                        filteredProducts.map(p => {
                                            // Try to parse images
                                            let imageUrl = null;
                                            try {
                                                const images = JSON.parse(p.images || '[]');
                                                if (images.length > 0) imageUrl = images[0];
                                            } catch (e) {}

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
                                                            ? "bg-brand-yellow/10 text-black dark:text-white font-bold" 
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
                                                    {product === p.id && <Check size={14} className="ml-auto text-brand-yellow" />}
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

                {mode === 'storyboard' && (
                    <select 
                        value={influencer}
                        onChange={(e) => setInfluencer(e.target.value)}
                        className="bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 outline-none focus:border-gray-400 dark:focus:border-gray-500 hover:bg-gray-200 dark:hover:bg-gray-750 appearance-none cursor-pointer"
                    >
                        <option value="">{(t as any).home?.selectInfluencer || 'Select Influencer'}</option>
                        <option value="i1">Influencer A</option>
                        <option value="i2">Influencer B</option>
                    </select>
                )}

                {/* Country Dropdown - Custom Implementation */}
                <div className="relative">
                    <button
                        onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                        className="bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-white pl-4 pr-10 py-2 rounded-full border border-gray-200 dark:border-gray-700 outline-none focus:border-gray-400 dark:focus:border-gray-500 hover:bg-gray-200 dark:hover:bg-gray-750 flex items-center min-w-[150px] justify-between transition-all"
                    >
                        <span className="truncate max-w-[120px]">
                            {(t as any).replication?.targetCountry || 'Target Country'}: {countries.find(c => c.code === country)?.label || country}
                        </span>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                            <ChevronDown size={14} />
                        </div>
                    </button>

                    {isCountryDropdownOpen && (
                        <>
                            <div 
                                className="fixed inset-0 z-10" 
                                onClick={() => setIsCountryDropdownOpen(false)}
                            />
                            <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input 
                                            type="text" 
                                            placeholder="Search..." 
                                            className="w-full bg-gray-50 dark:bg-gray-900 rounded-lg pl-9 pr-3 py-2 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-yellow placeholder:text-gray-400"
                                            autoFocus
                                        />
                                    </div>
                                </div>
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
                                                    ? "bg-brand-yellow/10 text-black dark:text-white font-bold" 
                                                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                            )}
                                        >
                                            <span>{c.label}</span>
                                            {country === c.code && <Check size={14} className="text-brand-yellow" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Language Dropdown - Custom Implementation */}
                <div className="relative">
                    <button
                        onClick={() => setIsLanguageDropdownOpen(!isLanguageDropdownOpen)}
                        className="bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-white pl-4 pr-10 py-2 rounded-full border border-gray-200 dark:border-gray-700 outline-none focus:border-gray-400 dark:focus:border-gray-500 hover:bg-gray-200 dark:hover:bg-gray-750 flex items-center min-w-[150px] justify-between transition-all"
                    >
                        <span className="truncate max-w-[120px]">
                            {(t as any).replication?.videoLanguage || 'Video Language'}: {languages.find(l => l.code === language)?.label || language}
                        </span>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
                            <ChevronDown size={14} />
                        </div>
                    </button>

                    {isLanguageDropdownOpen && (
                        <>
                            <div 
                                className="fixed inset-0 z-10" 
                                onClick={() => setIsLanguageDropdownOpen(false)}
                            />
                            <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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
                                                    ? "bg-brand-yellow/10 text-black dark:text-white font-bold" 
                                                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                            )}
                                        >
                                            <span>{l.label}</span>
                                            {language === l.code && <Check size={14} className="text-brand-yellow" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 p-0.5">
                    {mode === 'one-click' ? (
                        <>
                            {['10s', '15s'].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setDuration(d)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                                        duration === d ? "bg-black text-white dark:bg-white dark:text-black shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
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
                                        duration === d ? "bg-black text-white dark:bg-white dark:text-black shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
                                    )}
                                >
                                    {d}
                                </button>
                            ))}
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1.5 ml-auto">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-bold">{(t as any).home?.quantity || 'Quantity'}:</span>
                    <input 
                        type="number" 
                        min="1" 
                        max="10" 
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value))}
                        className="w-8 bg-transparent text-center text-xs font-bold outline-none text-gray-900 dark:text-white"
                    />
                </div>

                {/* Execute Button */}
                <button 
                    onClick={handleExecute}
                    className="ml-2 w-10 h-10 rounded-full flex items-center justify-center transition-colors shadow-lg bg-brand-yellow text-black hover:bg-yellow-400 shadow-yellow-500/20"
                >
                    <Zap size={18} fill="currentColor" />
                </button>
            </div>
      </div>

      {/* Recent Projects */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6 px-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <div className="w-1.5 h-6 bg-brand-yellow rounded-full"></div>
                {(t as any).home?.recentProjects || 'Recent Projects'}
            </h2>
            <Link href="/replication" className="text-sm font-bold text-gray-500 hover:text-black dark:hover:text-white flex items-center gap-1 transition-colors">
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
                            // Compact mode for home page if needed, or just standard
                         />
                    </div>
                ))
            ) : (
                <div className="col-span-full py-12 text-center text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
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

    </div>
  );
}
