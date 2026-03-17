'use client';

/* eslint-disable @next/next/no-img-element -- Character avatar previews rely on blob URLs */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCharacter } from "@/app/(main)/characters/actions";
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'react-hot-toast';

interface CharacterFormProps {
  onSuccess?: () => void;
  initialData?: {
    id: string;
    name: string;
    avatar: string;
    voiceId?: string | null;
  };
}

export function CharacterForm({ onSuccess, initialData }: CharacterFormProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [id, setId] = useState<string | null>(initialData?.id || null);
  const [name, setName] = useState(initialData?.name || '');
  const [avatar, setAvatar] = useState(initialData?.avatar || '');
  const [voiceId, setVoiceId] = useState<string | null>(initialData?.voiceId || null);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  
  // Inputs
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [voiceDragActive, setVoiceDragActive] = useState(false);

  const uploadVoiceFile = async (file: File) => {
    setUploadingVoice(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      setVoiceId(data.url);
    } catch (error) {
      console.error('Error uploading voice file:', error);
      toast.error('Failed to upload voice file');
    } finally {
      setUploadingVoice(false);
    }
  };

  const handleVoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadVoiceFile(file);
  };

  const handleRemoveVoice = () => {
    setVoiceId(null);
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

  const handleImageDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImageDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.type.startsWith('image/')) {
        return toast.error('Please upload an image file');
      }
      await uploadFile(file);
    }
  };

  const handleVoiceDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setVoiceDragActive(true);
    } else if (e.type === "dragleave") {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setVoiceDragActive(false);
    }
  };

  const handleVoiceDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setVoiceDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.type.startsWith('audio/')) {
        return toast.error('Please upload an audio file');
      }
      await uploadVoiceFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      setAvatar(data.url);
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    e.target.value = '';
  };

  const handleRemoveImage = () => {
    setAvatar('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return toast.error('Please enter a character name.');
    
    setLoading(true);

    try {
      const formData = new FormData();
      if (id) formData.append('id', id);
      formData.append('name', name);
      formData.append('avatar', avatar);
      if (voiceId) formData.append('voiceId', voiceId);

      await createCharacter(formData);
      
      toast.dismiss();
      toast.success('Character saved successfully!', {
        duration: 2000,
        icon: '✅',
        style: {
          borderRadius: '10px',
          background: '#f0fdf4',
          color: '#166534',
          border: '1px solid #bbf7d0',
        },
      });

      if (onSuccess) {
        setTimeout(() => {
            onSuccess();
        }, 1000);
      }

    } catch (error) {
      console.error(error);
      toast.error('Failed to save character');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t.characters.name}</label>
        <input
          type="text"
          required
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.characters.name}
        />
      </div>

      {/* Avatar */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t.characters.avatar}</label>
        
        <div className="mb-4">
          <div className="flex items-center justify-center w-full">
            <label 
                className={`relative flex flex-col items-center justify-center w-full h-32 border-2 rounded-lg cursor-pointer transition-colors overflow-hidden ${
                    imageDragActive 
                      ? 'border-primary bg-primary-soft/60 border-dashed' 
                      : avatar 
                        ? 'border-transparent' 
                        : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-primary-soft/50 dark:hover:bg-primary/10 border-dashed'
                }`}
                onDragEnter={handleImageDrag}
                onDragLeave={handleImageDrag}
                onDragOver={handleImageDrag}
                onDrop={handleImageDrop}
            >
              {avatar ? (
                <div className="relative w-full h-full group">
                  <img src={avatar} alt="Avatar" className="w-full h-full object-contain" />
                  <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); handleRemoveImage(); }}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                      &times;
                  </button>
                  <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${imageDragActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                       <p className="text-white text-sm font-medium">{t.characters.upload}</p>
                  </div>
                </div>
              ) : (
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
                        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold">{t.characters.upload}</span></p>
                    </>
                    )}
                </div>
              )}
              <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*" disabled={uploadingImage} />
            </label>
          </div>
        </div>
      </div>

      {/* Voice File */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t.characters.voice || 'Voice Audio'}</label>
        
        <div className="flex items-center gap-4">
            <label 
                className={`flex-1 flex flex-col items-center justify-center h-24 border-2 rounded-lg cursor-pointer transition-colors overflow-hidden ${
                    voiceDragActive 
                      ? 'border-black dark:border-white bg-gray-50 dark:bg-gray-800 border-dashed' 
                      : voiceId
                        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 border-solid'
                        : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-dashed'
                }`}
                onDragEnter={handleVoiceDrag}
                onDragLeave={handleVoiceDrag}
                onDragOver={handleVoiceDrag}
                onDrop={handleVoiceDrop}
            >
                {voiceId ? (
                   <div className="relative w-full h-full flex items-center px-4 gap-3 group">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-black dark:text-white">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path>
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0 z-20">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                Audio File Uploaded
                            </p>
                            <audio controls src={voiceId} className="w-full h-8 mt-1" onClick={(e) => e.stopPropagation()} />
                        </div>
                        <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); handleRemoveVoice(); }}
                            className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors z-20"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                        <div className={`absolute inset-0 bg-black/5 flex items-center justify-center transition-opacity z-10 pointer-events-none ${voiceDragActive ? 'opacity-100' : 'opacity-0'}`}>
                             <p className="text-black dark:text-white text-sm font-medium bg-white/80 dark:bg-black/80 px-2 py-1 rounded">Drop to replace</p>
                        </div>
                   </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-4">
                        {uploadingVoice ? (
                            <div className="flex items-center gap-2">
                                <svg className="animate-spin h-5 w-5 text-gray-500 dark:text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="text-sm text-gray-500">{t.common.loading}</span>
                            </div>
                        ) : (
                            <>
                                <svg className="w-6 h-6 mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                                </svg>
                                <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">{t.characters.uploadVoice || 'Upload Audio'}</span>
                                <span className="text-xs text-gray-400 mt-1">MP3, WAV, etc.</span>
                            </>
                        )}
                    </div>
                )}
                <input 
                    type="file" 
                    className="hidden" 
                    onChange={handleVoiceUpload} 
                    accept="audio/*" 
                    disabled={uploadingVoice} 
                />
            </label>
        </div>
      </div>

      {/* Submit */}
      <div className="sticky bottom-0 pt-4 pb-2 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 mt-auto">
        <button
          type="submit"
          disabled={loading}
          className="w-full px-6 py-3 bg-black text-white dark:bg-white dark:text-black rounded-lg font-bold hover:bg-gray-900 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors shadow-sm uppercase tracking-wide flex items-center justify-center gap-2"
        >
          {loading ? t.common.loading : t.common.save}
        </button>
      </div>
    </form>
  );
}
