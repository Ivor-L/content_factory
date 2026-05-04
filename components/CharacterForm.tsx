'use client';

/* eslint-disable @next/next/no-img-element -- Character avatar previews rely on blob URLs */

import { useEffect, useRef, useState } from 'react';
import { createCharacter } from "@/app/(main)/characters/actions";
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'react-hot-toast';
import { Loader2, Mic, Square, Upload, X } from 'lucide-react';

interface CharacterFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  initialData?: {
    id: string;
    name: string;
    avatar: string;
    voiceId?: string | null;
  };
}

export function CharacterForm({ onSuccess, onCancel, initialData }: CharacterFormProps) {
  const { t } = useLanguage();
  const characterToast = t.characters?.toast || {};
  const [loading, setLoading] = useState(false);

  // Form state
  const [id] = useState<string | null>(initialData?.id || null);
  const [name, setName] = useState(initialData?.name || '');
  const [avatar, setAvatar] = useState(initialData?.avatar || '');
  const [voiceId, setVoiceId] = useState<string | null>(initialData?.voiceId || null);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(initialData?.voiceId || null);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  
  // Inputs
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageDragActive, setImageDragActive] = useState(false);
  const [voiceDragActive, setVoiceDragActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const voiceInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const localVoicePreviewRef = useRef<string | null>(null);
  const voiceUploadSeqRef = useRef(0);
  const cancelRecordingUploadRef = useRef(false);

  useEffect(() => {
    return () => {
      if (localVoicePreviewRef.current) {
        URL.revokeObjectURL(localVoicePreviewRef.current);
      }
      stopRecordingTracks();
    };
  }, []);

  const stopRecordingTracks = () => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  };

  const setLocalVoicePreview = (file: File | Blob) => {
    if (localVoicePreviewRef.current) {
      URL.revokeObjectURL(localVoicePreviewRef.current);
    }
    const nextPreviewUrl = URL.createObjectURL(file);
    localVoicePreviewRef.current = nextPreviewUrl;
    setVoicePreviewUrl(nextPreviewUrl);
  };

  const uploadVoiceFile = async (file: File, options: { preview?: boolean } = {}) => {
    const uploadSeq = voiceUploadSeqRef.current + 1;
    voiceUploadSeqRef.current = uploadSeq;
    if (options.preview !== false) {
      setLocalVoicePreview(file);
      setVoiceId(null);
    }
    setUploadingVoice(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload/audio', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({} as { error?: string; url?: string }));
      if (!res.ok) throw new Error(data?.error || t.common.uploadFailed || 'Upload failed');

      if (uploadSeq !== voiceUploadSeqRef.current) return;
      setVoiceId(data.url);
      setVoicePreviewUrl(data.url);
      if (localVoicePreviewRef.current) {
        URL.revokeObjectURL(localVoicePreviewRef.current);
        localVoicePreviewRef.current = null;
      }
    } catch (error) {
      if (uploadSeq !== voiceUploadSeqRef.current) return;
      console.error('Error uploading voice file:', error);
      toast.error(characterToast.uploadVoiceFailed || t.common.uploadFailed || 'Failed to upload voice file');
    } finally {
      if (uploadSeq === voiceUploadSeqRef.current) {
        setUploadingVoice(false);
      }
    }
  };

  const handleVoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadVoiceFile(file);
    e.target.value = '';
  };

  const handleRemoveVoice = () => {
    if (recording) {
      cancelRecordingUploadRef.current = true;
      mediaRecorderRef.current?.stop();
    }
    voiceUploadSeqRef.current += 1;
    if (localVoicePreviewRef.current) {
      URL.revokeObjectURL(localVoicePreviewRef.current);
      localVoicePreviewRef.current = null;
    }
    setVoiceId(null);
    setVoicePreviewUrl(null);
    setUploadingVoice(false);
  };

  const handleStartRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error(t.characters.recordingUnsupported || 'Recording is not supported in this browser');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      cancelRecordingUploadRef.current = false;
      recordingChunksRef.current = [];
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        setRecording(false);
        stopRecordingTracks();
        const mimeType = recorder.mimeType || 'audio/webm';
        const extension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        recordingChunksRef.current = [];
        if (blob.size > 0 && !cancelRecordingUploadRef.current) {
          const file = new File([blob], `character-voice-${Date.now()}.${extension}`, { type: mimeType });
          void uploadVoiceFile(file);
        }
        cancelRecordingUploadRef.current = false;
      };

      recorder.start();
      setRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      stopRecordingTracks();
      setRecording(false);
      toast.error(t.characters.recordingPermissionError || 'Unable to start recording. Check microphone permission.');
    }
  };

  const handleStopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      setRecording(false);
      stopRecordingTracks();
    }
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
        return toast.error(characterToast.imageTypeError || 'Please upload an image file');
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
        return toast.error(characterToast.audioTypeError || 'Please upload an audio file');
      }
      await uploadVoiceFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    setUploadingImage(true);
    try {
      const contentType = file.type || 'application/octet-stream';
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType, type: 'character' }),
      });

      if (presignRes.ok) {
        const presignData = await presignRes.json().catch(() => ({} as { uploadUrl?: string; publicUrl?: string }));
        if (presignData.uploadUrl && presignData.publicUrl) {
          const putRes = await fetch(presignData.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: file,
          });
          if (putRes.ok) {
            setAvatar(presignData.publicUrl);
            return;
          }
        }
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'character');

      const res = await fetch('/api/upload/image', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({} as { error?: string; url?: string }));
      if (!res.ok) throw new Error(data?.error || t.common.uploadFailed || 'Upload failed');

      setAvatar(data.url);
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error(characterToast.uploadImageFailed || t.common.uploadFailed || 'Failed to upload image');
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
    if (!name) return toast.error(characterToast.nameRequired || 'Please enter a character name.');
    
    setLoading(true);

    try {
      const formData = new FormData();
      if (id) formData.append('id', id);
      formData.append('name', name);
      formData.append('avatar', avatar);
      if (voiceId) formData.append('voiceId', voiceId);

      await createCharacter(formData);
      
      toast.dismiss();
      toast.success(characterToast.savedSuccess || t.common.success || 'Character saved successfully!', {
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
      toast.error(characterToast.saveFailed || t.common.error || 'Failed to save character');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{t.characters.name}</label>
        <input
          type="text"
          required
          className="w-full rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.characters.name}
        />
      </div>

      {/* Avatar + Audio */}
      <div className="grid gap-5 md:grid-cols-[minmax(180px,240px)_1fr]">
        {/* Avatar */}
        <div className="flex flex-col">
          <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{t.characters.avatar}</label>
          <div
            role="button"
            tabIndex={0}
            className={`relative flex w-full flex-col items-center justify-center aspect-[3/4] rounded-xl cursor-pointer transition-colors overflow-hidden ${
              imageDragActive
                ? 'border-2 border-primary border-dashed bg-primary/10'
                : avatar
                  ? 'border-2 border-transparent'
                  : 'border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-primary/5 dark:hover:bg-primary/10'
            }`}
            onDragEnter={handleImageDrag}
            onDragLeave={handleImageDrag}
            onDragOver={handleImageDrag}
            onDrop={handleImageDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            {avatar ? (
              <div className="relative w-full h-full group">
                <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveImage(); }}
                  className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  &times;
                </button>
                <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${imageDragActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  <p className="text-white text-sm font-medium">{t.characters.upload}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
                {uploadingImage ? (
                  <svg className="animate-spin h-7 w-7 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <>
                    <svg className="w-7 h-7 text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2" />
                    </svg>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t.characters.upload}</p>
                  </>
                )}
              </div>
            )}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} accept="image/*" disabled={uploadingImage} />
          </div>
        </div>

        {/* Audio */}
        <div className="flex flex-col">
          <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{t.characters.voice || '音频文件'}</label>
          <div
            className={`relative flex min-h-[220px] flex-col items-center justify-center rounded-xl transition-colors overflow-hidden ${
              voiceDragActive
                ? 'border-2 border-primary border-dashed bg-primary/10'
                : voicePreviewUrl
                  ? 'border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                  : 'border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-primary/5 dark:hover:bg-primary/10'
            }`}
            onDragEnter={handleVoiceDrag}
            onDragLeave={handleVoiceDrag}
            onDragOver={handleVoiceDrag}
            onDrop={handleVoiceDrop}
          >
            {voicePreviewUrl ? (
              <div className="relative w-full h-full flex flex-col items-center justify-center px-3 gap-3 group">
                <div className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-black dark:text-white">
                  <Mic className="h-5 w-5" />
                </div>
                <audio controls src={voicePreviewUrl} className="w-full h-9" onClick={(e) => e.stopPropagation()} />
                {uploadingVoice && (
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500 shadow-sm dark:bg-gray-900 dark:text-gray-300">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t.characters.uploadingVoice || t.common.loading}
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); handleRemoveVoice(); }}
                  className="absolute top-1.5 right-1.5 rounded-full p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors z-20 dark:hover:bg-red-950/40"
                  aria-label={t.characters.remove || 'Remove'}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex w-full flex-col items-center justify-center gap-3 px-4 text-center">
                {uploadingVoice ? (
                  <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
                ) : (
                  <>
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                      <Mic className="h-5 w-5" />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t.characters.voicePlaceholder}</p>
                    <p className="text-xs text-gray-400">MP3, WAV, etc.</p>
                    <div className="grid w-full gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => voiceInputRef.current?.click()}
                        disabled={uploadingVoice || recording}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <Upload className="h-4 w-4" />
                        {t.characters.selectAudio || t.characters.uploadVoice || 'Select audio file'}
                      </button>
                      <button
                        type="button"
                        onClick={recording ? handleStopRecording : handleStartRecording}
                        disabled={uploadingVoice}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-black px-3 text-sm font-medium text-white transition-colors hover:bg-gray-900 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
                      >
                        {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                        {recording ? t.characters.stopRecording || 'Stop recording' : t.characters.recordAudio || 'Record'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <input ref={voiceInputRef} type="file" className="hidden" onChange={handleVoiceUpload} accept="audio/*" disabled={uploadingVoice} />
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="sticky bottom-0 space-y-2 pt-4 pb-2 bg-white dark:bg-gray-900 mt-auto">
        <button
          type="submit"
          disabled={loading || uploadingVoice || recording}
          className="w-full px-6 py-3 bg-black text-white dark:bg-white dark:text-black rounded-lg font-bold hover:bg-gray-900 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors shadow-sm uppercase tracking-wide flex items-center justify-center gap-2"
        >
          {loading || uploadingVoice || recording ? t.common.loading : id ? t.common.save : t.common.create}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="w-full px-6 py-3 rounded-lg font-bold border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {t.common.cancel}
          </button>
        )}
      </div>
    </form>
  );
}
