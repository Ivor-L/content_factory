"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createScript } from "@/app/(main)/scripts/actions";
import { useLanguage } from '@/contexts/LanguageContext';

import { toast } from "react-hot-toast";

interface ScriptFormProps {
  onSuccess?: () => void;
  initialData?: {
    id: string;
    title: string;
    videoUrl: string | null;
    // description isn't in script schema top level anymore, stored in breakdown JSON, but we can pass it if extracted
  };
  showAssistant?: boolean;
  assistantLayout?: "inline" | "floating";
}

import { supabase } from "@/lib/supabase";

const UPLOAD_MODE_STORAGE_KEY = "script_form_upload_mode";

export function ScriptForm({
  onSuccess,
  initialData,
  showAssistant = true,
  assistantLayout = "inline",
}: ScriptFormProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [uploadMode, setUploadMode] = useState<'url' | 'file'>(initialData?.videoUrl ? 'url' : 'url');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  
  // State initialization
  const [title, setTitle] = useState(initialData?.title || '');
  const [videoUrl, setVideoUrl] = useState(initialData?.videoUrl || '');
  const [scriptPurpose, setScriptPurpose] = useState<'one-click' | 'storyboard' | 'extract-copy'>('one-click');

  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedMode = window.localStorage.getItem(UPLOAD_MODE_STORAGE_KEY);
    if (storedMode === "url" || storedMode === "file") {
      setUploadMode(storedMode);
    }
  }, []);

  const switchUploadMode = (mode: 'url' | 'file') => {
    setUploadMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(UPLOAD_MODE_STORAGE_KEY, mode);
    }
  };


  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/')) {
        setVideoFile(file);
      } else {
        toast.error('Please upload a video file');
      }
    }
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append('title', title);

    // If initialData exists, we might be editing. 
    // However, createScript currently creates new. We need update logic or just recreate for now.
    // Given instructions "Edit and Delete buttons", we should support update if possible, 
    // but without backend updateScript action, we can't fully update.
    // For now, let's assume this form is only for CREATE or "Re-create" logic, 
    // OR we modify createScript to handle update if ID passed.
    // Let's modify the form behavior:
    
    // Logic: 
    // If uploadMode is file: check videoFile
    // If uploadMode is url: check videoUrl
    
    if (uploadMode === 'file') {
        if (!videoFile && !initialData) { // If editing, maybe keep old video if no new file?
            setError("Please select a video file");
            setLoading(false);
            return;
        }
        if (videoFile) {
             const toastId = toast.loading(t.common.uploadingVideo || 'Uploading video...');
             try {
                 const fileFormData = new FormData();
                 fileFormData.append('file', videoFile);
                 const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: fileFormData
                 });

                 if (!response.ok) {
                    const errorPayload = await response.json().catch(() => ({}));
                    throw new Error(errorPayload.error || (t.common.uploadFailed || 'Upload failed'));
                 }

                 const payload = await response.json();
                 formData.append('videoUrl', payload.url);
                 toast.success(t.common.uploadSuccess || 'Upload complete', { id: toastId });
             } catch (e: any) {
                 console.error('Upload failed:', e);
                 toast.error(`${t.common.uploadFailed || 'Upload failed'}: ${e.message}`, { id: toastId });
                 setLoading(false);
                 return;
             }
        } else if (initialData && initialData.videoUrl) {
             formData.append('videoUrl', initialData.videoUrl);
        }
    } else {
        if (!videoUrl) {
            setError("Please enter a TikTok URL");
            setLoading(false);
            return;
        }
        formData.append('videoUrl', videoUrl);
    }
    
    // Pass ID if editing
    if (initialData?.id) {
        formData.append('id', initialData.id);
    }

    // Pass script purpose
    formData.append('scriptPurpose', scriptPurpose);

    // Get session for Authorization header
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
        formData.append('userId', session.user.id);
    }

    try {
      const script = await createScript(formData);

      if (!script || !script.id) {
        throw new Error("Failed to save script");
      }

      toast.success(initialData ? (t.scripts.toastUpdated || "Script updated successfully!") : (t.scripts.toastCreated || "Script created successfully!"), {
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
        }, 600);
      } else {
        router.push(`/scripts/${script.id}`);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
      toast.error(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
    }
  };

  void showAssistant;
  void assistantLayout;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg border border-red-100 dark:border-red-800 text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t.scripts.scriptTitle}</label>
          <input
            type="text"
            id="title"
            name="title"
            required
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder={t.scripts.namePlaceholder || "e.g., How to make coffee"}
            value={title || ''}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">{t.scripts.videoSource}</label>
          
          <div className="flex space-x-4 mb-4">
            <button
              type="button"
              onClick={() => switchUploadMode('file')}
              className={`flex-1 ${
                uploadMode === 'file' 
                  ? 'btn-openclaw w-full justify-center py-2 text-sm font-medium'
                  : 'py-2 rounded-full text-sm font-medium transition-colors bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-primary-soft/60'
              }`}
            >
              {t.scripts.uploadFile}
            </button>
            <button
              type="button"
              onClick={() => switchUploadMode('url')}
              className={`flex-1 ${
                uploadMode === 'url' 
                  ? 'btn-openclaw w-full justify-center py-2 text-sm font-medium'
                  : 'py-2 rounded-full text-sm font-medium transition-colors bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-primary-soft/60'
              }`}
            >
              {t.scripts.tiktokUrl}
            </button>
          </div>

          {uploadMode === 'url' ? (
            <div key="url-mode">
              <input
                type="url"
                value={videoUrl || ''}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent transition-all outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="https://www.tiktok.com/@user/video/..."
              />
              <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">{t.scripts.pasteUrl}</p>
            </div>
          ) : (
            <div 
              key="file-mode"
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                dragActive ? 'border-primary bg-primary-soft/60' : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 hover:bg-primary-soft/60 dark:hover:bg-primary/10'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('video-upload')?.click()}
            >
              <input 
                type="file" 
                id="video-upload" 
                className="hidden" 
                accept="video/*"
                onChange={handleVideoFileChange}
              />
              
              {videoFile ? (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{videoFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{(videoFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                  <button 
                    type="button"
                    className="mt-2 text-xs text-red-500 hover:text-red-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setVideoFile(null);
                    }}
                  >
                    {t.common.delete}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <svg className="w-10 h-10 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t.scripts.clickUpload}</p>
                  <p className="text-xs text-gray-400 mt-1">MP4, MOV or WebM (Max 50MB)</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">脚本用途</label>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setScriptPurpose('one-click')}
              className={`group relative p-4 rounded-xl border-2 transition-all ${
                scriptPurpose === 'one-click'
                  ? 'border-[var(--tenant-primary)] bg-[var(--tenant-primary-muted)]'
                  : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
              }`}
              title="基于Sora2/seedance2.0模型一键成片"
            >
              <div className="text-left">
                <div className="font-semibold text-gray-900 dark:text-white mb-1">一键复刻</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">基于Sora2/seedance2.0模型一键成片</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setScriptPurpose('storyboard')}
              className={`group relative p-4 rounded-xl border-2 transition-all ${
                scriptPurpose === 'storyboard'
                  ? 'border-[var(--tenant-primary)] bg-[var(--tenant-primary-muted)]'
                  : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
              }`}
              title="基于veo3生成分镜视频，拼接完成复刻"
            >
              <div className="text-left">
                <div className="font-semibold text-gray-900 dark:text-white mb-1">分镜复刻</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">基于veo3生成分镜视频，拼接完成复刻</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setScriptPurpose('extract-copy')}
              className={`group relative p-4 rounded-xl border-2 transition-all ${
                scriptPurpose === 'extract-copy'
                  ? 'border-[var(--tenant-primary)] bg-[var(--tenant-primary-muted)]'
                  : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
              }`}
              title="仅提取视频文案，不生成视频"
            >
              <div className="text-left">
                <div className="font-semibold text-gray-900 dark:text-white mb-1">提取文案</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">仅提取视频文案，不生成视频</div>
              </div>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
          <button
            type="submit"
            disabled={loading}
            className="btn-openclaw w-full py-3 font-bold uppercase tracking-wide"
          >
            {loading ? t.common.loading : t.scripts.createAnalyze}
          </button>
        </div>
      </form>
    </div>
  );
}
