
'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Upload, X, Loader2, Mic, User, FileText, Check, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { createDigitalHumanVideo } from '@/app/actions/digital-human';
import { useRouter } from 'next/navigation';

interface DigitalHumanModalProps {
  onClose: () => void;
}

export function DigitalHumanModal({ onClose }: DigitalHumanModalProps) {
  const { t } = useLanguage();
  const router = useRouter();
  
  const [mode, setMode] = useState<'LIP_SYNC' | 'VOICE_CLONE'>('LIP_SYNC');
  const [loading, setLoading] = useState(false);
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  
  const [script, setScript] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'audio') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      
      if (type === 'image') {
        setImageUrl(data.url);
        setImageFile(file);
      } else {
        setAudioUrl(data.url);
        setAudioFile(file);
      }
    } catch (error) {
      toast.error(`Failed to upload ${type}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!imageUrl) return toast.error('Please upload an image');
    if (!audioUrl) return toast.error('Please upload audio');
    if (mode === 'VOICE_CLONE' && !script) return toast.error('Please enter script for voice clone');

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('type', mode);
      formData.append('imageUrl', imageUrl);
      formData.append('audioUrl', audioUrl);
      if (mode === 'VOICE_CLONE') formData.append('script', script);
      
      await createDigitalHumanVideo(formData);
      
      toast.success('Digital Human task created!');
      router.push('/my-videos'); // Redirect to My Videos
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Left Content */}
      <div className="flex-1 flex flex-col border-r dark:border-gray-700">
        {/* Header */}
      <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <User className="text-black dark:text-white" />
          {t.storyboard.digitalHuman}
        </h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 md:hidden">
          <X size={20} />
        </button>
      </div>

        {/* Tabs */}
        <div className="flex p-2 gap-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <button
            onClick={() => setMode('LIP_SYNC')}
            className={cn(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2",
                mode === 'LIP_SYNC'
                ? "bg-white dark:bg-gray-700 text-black dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            )}
            >
            <Mic size={16} /> {t.storyboard.lipSync}
            </button>
            <button
            onClick={() => setMode('VOICE_CLONE')}
            className={cn(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2",
                mode === 'VOICE_CLONE'
                ? "bg-white dark:bg-gray-700 text-black dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            )}
            >
            <User size={16} /> {t.storyboard.voiceClone}
            </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Image Upload */}
            <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                {t.characters.avatar}
            </label>
            <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors">
                {imageUrl ? (
                    <img src={imageUrl} alt="Avatar" className="h-full object-contain rounded-lg" />
                ) : (
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-3 text-gray-400" />
                    <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">{t.products.upload}</p>
                    </div>
                )}
                <input type="file" className="hidden" onChange={(e) => handleUpload(e, 'image')} accept="image/*" />
                </label>
            </div>
            </div>

            {/* Audio Upload */}
            <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                {t.characters.voice}
            </label>
            <div className="flex items-center gap-4">
                <label className="flex-1 flex flex-col items-center justify-center h-20 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors">
                <div className="flex items-center gap-2">
                    <Mic className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                    {audioFile ? audioFile.name : t.characters.uploadVoice}
                    </span>
                </div>
                <input type="file" className="hidden" onChange={(e) => handleUpload(e, 'audio')} accept="audio/*" />
                </label>
                {audioUrl && (
                <audio controls src={audioUrl} className="h-10 w-40" />
                )}
            </div>
            </div>

            {/* Script (Voice Clone Only) */}
            {mode === 'VOICE_CLONE' && (
            <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                {t.generation.scriptContent}
                </label>
                <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder={t.generation.enterContent}
                className="w-full h-32 p-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-black dark:focus:ring-white outline-none resize-none"
                />
            </div>
            )}
        </div>

        {/* Footer */}
      <div className="p-6 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
        <button
          onClick={handleSubmit}
          disabled={loading || uploading}
          className="w-full py-3 bg-black dark:bg-white text-white dark:text-black font-bold rounded-lg hover:bg-gray-900 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Check size={20} />}
          {loading ? t.common.create : `${t.common.create} ${t.storyboard.digitalHuman}`}
        </button>
      </div>
      </div>

      {/* Right Guide Panel */}
      <div className="w-80 bg-gray-50 dark:bg-gray-800/50 p-6 hidden md:flex flex-col gap-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
        </button>
        
        <div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Info size={18} className="text-black dark:text-white" />
                {t.storyboard.guide}
            </h3>
            
            <div className="space-y-6">
                <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <Mic size={14} /> {t.storyboard.lipSync}
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        {t.storyboard.lipSyncDesc}
                    </p>
                </div>

                <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <User size={14} /> {t.storyboard.voiceClone}
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        {t.storyboard.voiceCloneDesc}
                    </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                    <p className="text-xs text-gray-800 dark:text-gray-200 font-medium">
                        {t.storyboard.digitalHumanNote}
                    </p>
                    <p className="text-xs text-gray-800 dark:text-gray-200 font-medium">
                        {t.storyboard.highQualityNote}
                    </p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
