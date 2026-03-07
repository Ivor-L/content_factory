
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

  const [emoAudioFile, setEmoAudioFile] = useState<File | null>(null);
  const [emoAudioUrl, setEmoAudioUrl] = useState('');
  const [emoAudioDragActive, setEmoAudioDragActive] = useState(false);
  
  const [script, setScript] = useState('');
  const [uploading, setUploading] = useState(false);
  
  const [imageDragActive, setImageDragActive] = useState(false);
  const [audioDragActive, setAudioDragActive] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number>(0);

  const getDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(audio.duration);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
    });
  };

  const uploadFile = async (file: File, type: 'image' | 'audio' | 'emo_audio') => {
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
      } else if (type === 'audio') {
        setAudioUrl(data.url);
        setAudioFile(file);
        
        const duration = await getDuration(file);
        setAudioDuration(duration);
        if (duration > 32) {
          toast.error(t.storyboard.digitalHumanNote);
        }
      } else if (type === 'emo_audio') {
        setEmoAudioUrl(data.url);
        setEmoAudioFile(file);
      }
    } catch (error) {
      toast.error(`Failed to upload ${type}`);
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'audio' | 'emo_audio') => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, type);
  };

  const handleImageDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setImageDragActive(true);
    } else if (e.type === "dragleave") {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setImageDragActive(false);
    }
  };

  const handleAudioDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setAudioDragActive(true);
    } else if (e.type === "dragleave") {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setAudioDragActive(false);
    }
  };

  const handleEmoAudioDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setEmoAudioDragActive(true);
    } else if (e.type === "dragleave") {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setEmoAudioDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent, type: 'image' | 'audio' | 'emo_audio') => {
    e.preventDefault();
    e.stopPropagation();
    
    if (type === 'image') setImageDragActive(false);
    if (type === 'audio') setAudioDragActive(false);
    if (type === 'emo_audio') setEmoAudioDragActive(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      // Validate file type if needed
      if (type === 'image' && !file.type.startsWith('image/')) {
        return toast.error('Please upload an image file');
      }
      if ((type === 'audio' || type === 'emo_audio') && !file.type.startsWith('audio/')) {
        return toast.error('Please upload an audio file');
      }
      uploadFile(file, type);
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
      formData.append('duration', audioDuration.toString());
      if (mode === 'VOICE_CLONE') {
          formData.append('script', script);
          if (emoAudioUrl) {
              formData.append('emoAudioUrl', emoAudioUrl);
          }
      }
      
      await createDigitalHumanVideo(formData);
      
      toast.success('Digital Human task created!');
      router.push('/replication?tab=DIGITAL_HUMAN'); // Redirect to Replication page with Digital Human tab
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
                <label 
                  onDragEnter={handleImageDrag}
                  onDragLeave={handleImageDrag}
                  onDragOver={handleImageDrag}
                  onDrop={(e) => handleDrop(e, 'image')}
                  className={`relative flex flex-col items-center justify-center w-full h-40 border-2 rounded-lg cursor-pointer transition-colors overflow-hidden ${
                    imageDragActive 
                      ? 'border-black dark:border-white bg-gray-50 dark:bg-gray-800 border-dashed' 
                      : imageUrl 
                        ? 'border-transparent' 
                        : 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 border-dashed'
                  }`}>
                {imageUrl ? (
                    <div className="relative w-full h-full group">
                      <img src={imageUrl} alt="Avatar" className="w-full h-full object-contain" />
                      <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${imageDragActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                           <p className="text-white text-sm font-medium">{t.products.upload}</p>
                      </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
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
                {mode === 'VOICE_CLONE' ? t.storyboard.voiceRef : t.characters.voice}
            </label>
            <div className="flex items-center gap-4">
                <label 
                  onDragEnter={handleAudioDrag}
                  onDragLeave={handleAudioDrag}
                  onDragOver={handleAudioDrag}
                  onDrop={(e) => handleDrop(e, 'audio')}
                  className={`flex-1 flex flex-col items-center justify-center h-20 border-2 rounded-lg cursor-pointer transition-colors overflow-hidden ${
                    audioDragActive 
                      ? 'border-black dark:border-white bg-gray-50 dark:bg-gray-800 border-dashed' 
                      : audioUrl
                        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 border-solid'
                        : 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 border-dashed'
                  }`}>
                {audioUrl ? (
                    <div className="relative w-full h-full flex items-center px-4 gap-3 group">
                        <div className="flex items-center gap-2 flex-1 min-w-0 z-20">
                            <Mic className="w-5 h-5 text-gray-400 shrink-0" />
                            <span className="text-sm text-gray-900 dark:text-white truncate">
                                {audioFile ? audioFile.name : 'Audio File'}
                            </span>
                        </div>
                         <div className={`absolute inset-0 bg-black/5 flex items-center justify-center transition-opacity z-10 pointer-events-none ${audioDragActive ? 'opacity-100' : 'opacity-0'}`}>
                              <p className="text-black dark:text-white text-sm font-medium bg-white/80 dark:bg-black/80 px-2 py-1 rounded">Drop to replace</p>
                         </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 pointer-events-none">
                        <Mic className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                        {t.characters.uploadVoice}
                        </span>
                    </div>
                )}
                <input type="file" className="hidden" onChange={(e) => handleUpload(e, 'audio')} accept="audio/*" />
                </label>
                {audioUrl && (
                <audio controls src={audioUrl} className="h-10 w-40" />
                )}
            </div>
            </div>

            {/* Emotional Reference Audio (Voice Clone Only) */}
            {mode === 'VOICE_CLONE' && (
            <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                {t.storyboard.emoRef}
            </label>
            <div className="flex items-center gap-4">
                <label 
                  onDragEnter={handleEmoAudioDrag}
                  onDragLeave={handleEmoAudioDrag}
                  onDragOver={handleEmoAudioDrag}
                  onDrop={(e) => handleDrop(e, 'emo_audio')}
                  className={`flex-1 flex flex-col items-center justify-center h-20 border-2 rounded-lg cursor-pointer transition-colors overflow-hidden ${
                    emoAudioDragActive 
                      ? 'border-black dark:border-white bg-gray-50 dark:bg-gray-800 border-dashed' 
                      : emoAudioUrl
                        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 border-solid'
                        : 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 border-dashed'
                  }`}>
                {emoAudioUrl ? (
                    <div className="relative w-full h-full flex items-center px-4 gap-3 group">
                        <div className="flex items-center gap-2 flex-1 min-w-0 z-20">
                            <Mic className="w-5 h-5 text-gray-400 shrink-0" />
                            <span className="text-sm text-gray-900 dark:text-white truncate">
                                {emoAudioFile ? emoAudioFile.name : 'Audio File'}
                            </span>
                        </div>
                         <div className={`absolute inset-0 bg-black/5 flex items-center justify-center transition-opacity z-10 pointer-events-none ${emoAudioDragActive ? 'opacity-100' : 'opacity-0'}`}>
                              <p className="text-black dark:text-white text-sm font-medium bg-white/80 dark:bg-black/80 px-2 py-1 rounded">Drop to replace</p>
                         </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 pointer-events-none">
                        <Mic className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                        Upload Emotional Ref
                        </span>
                    </div>
                )}
                <input type="file" className="hidden" onChange={(e) => handleUpload(e, 'emo_audio')} accept="audio/*" />
                </label>
                {emoAudioUrl && (
                <audio controls src={emoAudioUrl} className="h-10 w-40" />
                )}
            </div>
            </div>
            )}

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
