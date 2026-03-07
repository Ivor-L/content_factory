
'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Upload, X, Loader2, LayoutGrid, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { generateStoryboardGrid, breakdownStoryboardGrid } from '@/app/actions/storyboard-gen';
import { useRouter } from 'next/navigation';

interface StoryboardGenModalProps {
  onClose: () => void;
}

export function StoryboardGenModal({ onClose }: StoryboardGenModalProps) {
  const { t } = useLanguage();
  const router = useRouter();
  
  // Helper to safely access nested keys
  const getText = (key: keyof typeof t.storyboard.genList, defaultText: string) => {
    return t.storyboard.genList?.[key] || defaultText;
  };
  
  // Steps: 'input' -> 'generating' -> 'result' -> 'breaking-down'
  const [step, setStep] = useState<'input' | 'generating' | 'result' | 'breaking-down'>('input');
  
  const [script, setScript] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  
  // Mock Result
  const [gridResultUrl, setGridResultUrl] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  
  // Timer
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (step === 'generating') {
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return prev;
          return prev + 2; // ~5 seconds to reach 100% conceptually, but we wait for API
        });
      }, 600); // 30s / 50 steps = 0.6s
      return () => clearInterval(interval);
    }
  }, [step]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setImageUrl(data.url);
      setImageFile(file);
    } catch (error) {
      toast.error(getText('uploadFailed', 'Failed to upload image'));
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!imageUrl) return toast.error(getText('pleaseUploadImage', 'Please upload an image'));
    if (!script) return toast.error(getText('pleaseWriteScript', 'Please write a script'));

    setStep('generating');
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('imageUrl', imageUrl);
      formData.append('script', script);
      
      const result = await generateStoryboardGrid(formData);
      
      setGridResultUrl(result.gridImageUrl);
      setTaskId(result.taskId);
      setStep('result');
    } catch (error) {
      console.error(error);
      toast.error(getText('generationFailed', 'Generation failed'));
      setStep('input');
    }
  };

  const handleBreakdown = async () => {
    setStep('breaking-down');
    try {
      const formData = new FormData();
      formData.append('gridImageUrl', gridResultUrl);
      formData.append('script', script);
      if (taskId) formData.append('taskId', taskId);
      
      const result = await breakdownStoryboardGrid(formData);
      
      toast.success(getText('breakdownComplete', 'Breakdown complete!'));
      router.push(`/storyboard/${result.taskId}`);
      onClose();
    } catch (error) {
      console.error(error);
      toast.error(getText('breakdownFailed', 'Breakdown failed'));
      setStep('result');
    }
  };

  return (
    <div className="flex h-full">
      {/* Left Content */}
      <div className="flex-1 flex flex-col border-r dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <LayoutGrid className="text-black dark:text-white" />
            {getText('title', t.storyboard.storyboardGen || "Storyboard Gen")}
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 md:hidden">
            <X size={20} />
            </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
            {step === 'input' && (
            <div className="space-y-6">
                {/* Image Upload */}
                <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    {t.storyboard.sceneRef}
                </label>
                <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors">
                    {imageUrl ? (
                        <img src={imageUrl} alt="Reference" className="h-full object-contain rounded-lg" />
                    ) : (
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        {uploading ? (
                            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                        ) : (
                            <>
                            <Upload className="w-8 h-8 mb-3 text-gray-400" />
                            <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                                <span className="font-semibold">{t.scripts.clickUpload}</span>
                            </p>
                            </>
                        )}
                        </div>
                    )}
                    <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
                    </label>
                </div>
                </div>

                {/* Script Input */}
                <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    {t.generation.scriptContent}
                </label>
                <textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder={t.generation.enterContent}
                    className="w-full h-32 p-3 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:shadow-outline resize-none"
                />
                </div>
            </div>
            )}

            {step === 'generating' && (
            <div className="flex flex-col items-center justify-center h-64 space-y-6">
                <div className="relative w-24 h-24">
                <svg className="w-full h-full transform -rotate-90">
                    <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-gray-200 dark:text-gray-700"
                    />
                    <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * progress) / 100}
                    className="text-black dark:text-white transition-all duration-500 ease-linear"
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-lg font-bold">
                    {Math.round(progress)}%
                </div>
                </div>
                <p className="text-gray-600 dark:text-gray-400 font-medium">
                {t.replication.generating}
                </p>
            </div>
            )}

            {(step === 'result' || step === 'breaking-down') && (
            <div className="space-y-6">
                <div className="aspect-square w-full bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border dark:border-gray-700">
                <img src={gridResultUrl} alt="Generated Grid" className="w-full h-full object-contain" />
                </div>
                {step === 'breaking-down' && (
                <div className="flex items-center justify-center gap-2 text-black dark:text-white font-medium">
                    <Loader2 className="animate-spin" size={20} />
                    {t.replication.processing}
                </div>
                )}
            </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
            {step === 'input' && (
            <button
                onClick={handleGenerate}
                disabled={!imageUrl || !script || uploading}
                className="w-full py-3 bg-black dark:bg-white text-white dark:text-black font-bold rounded hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                <Film size={20} />
                {t.storyboard.generate}
            </button>
            )}
            {step === 'result' && (
            <button
                onClick={handleBreakdown}
                className="w-full py-3 bg-black dark:bg-white text-white dark:text-black font-bold rounded hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
                <LayoutGrid size={20} />
                {getText('breakdown', t.storyboard.step3)}
            </button>
            )}
        </div>
      </div>

      {/* Right Guide Panel */}
      <div className="w-80 bg-gray-50 dark:bg-gray-800/50 p-6 hidden md:flex flex-col gap-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
        </button>
        
        <div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Film size={18} className="text-black dark:text-white" />
                {t.storyboard.guide}
            </h3>
            <ul className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black font-bold flex items-center justify-center text-xs">1</span>
                    <span>{t.storyboard.guideStep1}</span>
                </li>
                <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black font-bold flex items-center justify-center text-xs">2</span>
                    <span>{t.storyboard.guideStep2}</span>
                </li>
                <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black font-bold flex items-center justify-center text-xs">3</span>
                    <span>{t.storyboard.guideStep3}</span>
                </li>
                <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black font-bold flex items-center justify-center text-xs">4</span>
                    <span>{t.storyboard.guideStep4}</span>
                </li>
            </ul>
        </div>
      </div>
    </div>
  );
}
