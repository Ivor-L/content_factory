'use client';

/* eslint-disable @next/next/no-img-element -- Dashboard cards render remote task thumbnails with mixed dimensions */

import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { User, Grid3x3, SendHorizontal, Sparkles, Image as ImageIcon, Paperclip, Play, X } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
import { Modal } from '@/components/Modal';
import { DigitalHumanModal } from '@/components/DigitalHumanModal';
import { QuickPosterForm, QuickGridForm } from './QuickActionForms';
import { CreativeQuickStartModal } from './CreativeQuickStart';
import { createCanvasProjectOnServer } from '@/app/(main)/canvas/lib/api';

type Attachment = {
  id: string;
  localUrl: string;
  uploadedUrl: string | null;
  type: 'image' | 'video';
  name: string;
  uploading: boolean;
};

const PLACEHOLDER_HINTS = [
  '帮我拆解这个爆款视频的分镜结构…',
  '帮我复刻这个爆款视频…',
  '帮我生成一套小红书图文…',
  '帮我把产品图片变成视频…',
  '帮我生成一个数字人口播视频…',
  '帮我生成一张竖版产品海报…',
];

async function uploadFile(file: File): Promise<string> {
  const isVideo = file.type.startsWith('video/');
  const endpoint = isVideo ? '/api/upload/video' : '/api/upload/image';
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(endpoint, { method: 'POST', body: formData, credentials: 'include' });
  const payload = await res.json().catch(() => ({})) as { url?: string };
  if (!res.ok || !payload.url) throw new Error('上传失败');
  return payload.url;
}

export function HomeContent() {
  const { t } = useLanguage();
  const { tenant, tenantSlug, basePath } = useTenant();
  const router = useRouter();
  const pathname = usePathname();
  const [showGridModal, setShowGridModal] = useState(false);
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [showCreativeModal, setShowCreativeModal] = useState(false);
  const [showDigitalHumanModal, setShowDigitalHumanModal] = useState(false);
  const [canvasPrompt, setCanvasPrompt] = useState('');
  const [heroTitleEntered, setHeroTitleEntered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Typewriter placeholder
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState('');
  const [typingForward, setTypingForward] = useState(true);
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const target = PLACEHOLDER_HINTS[placeholderIdx];
    if (typingForward) {
      if (displayedPlaceholder.length < target.length) {
        typingRef.current = setTimeout(() => {
          setDisplayedPlaceholder(target.slice(0, displayedPlaceholder.length + 1));
        }, 60);
      } else {
        typingRef.current = setTimeout(() => setTypingForward(false), 2200);
      }
    } else {
      if (displayedPlaceholder.length > 0) {
        typingRef.current = setTimeout(() => {
          setDisplayedPlaceholder(displayedPlaceholder.slice(0, -1));
        }, 28);
      } else {
        setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_HINTS.length);
        setTypingForward(true);
      }
    }
    return () => { if (typingRef.current) clearTimeout(typingRef.current); };
  }, [displayedPlaceholder, typingForward, placeholderIdx]);

  const getTenantPath = useCallback((path: string) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${basePath || ''}${normalizedPath}`;
  }, [basePath]);

  const heroTenantName = tenant.name || 'NexTide';
  const isNextideTenant =
    (tenantSlug?.toLowerCase() ?? '') === 'nextide' || heroTenantName.toLowerCase() === 'nextide';
  const heroTitle = isNextideTenant
    ? `${heroTenantName}让内容营销更简单`
    : `${heroTenantName}内容创作工作台`;

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setHeroTitleEntered(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => setHeroTitleEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!list.length) return;
    const newItems: Attachment[] = list.map((f) => ({
      id: Math.random().toString(36).slice(2),
      localUrl: URL.createObjectURL(f),
      uploadedUrl: null,
      type: f.type.startsWith('video/') ? 'video' : 'image',
      name: f.name,
      uploading: true,
    }));
    setAttachments((prev) => [...prev, ...newItems]);
    for (const [i, file] of list.entries()) {
      const id = newItems[i].id;
      try {
        const url = await uploadFile(file);
        setAttachments((prev) => prev.map((a) => a.id === id ? { ...a, uploadedUrl: url, uploading: false } : a));
      } catch {
        setAttachments((prev) => prev.filter((a) => a.id !== id));
      }
    }
  }, []);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Element)) setIsDragOver(false);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
  };

  const openQuickAction = useCallback(
    (action: 'creative' | 'grid' | 'poster' | 'digitalHuman') => {
      if (action === 'creative') { setShowCreativeModal(true); return; }
      if (action === 'grid') { setShowGridModal(true); return; }
      if (action === 'poster') { setShowPosterModal(true); return; }
      if (action === 'digitalHuman') { setShowDigitalHumanModal(true); return; }
    },
  []);

  const openCanvasProject = useCallback(async () => {
    const prompt = canvasPrompt.trim();
    try {
      const project = await createCanvasProjectOnServer(prompt || '未命名项目');
      const search = new URLSearchParams();
      search.set('projectId', project.id);
      if (prompt) search.set('prompt', prompt);
      // Pass first uploaded media URL for AI assistant to use as reference
      const firstMedia = attachments.find((a) => a.uploadedUrl)?.uploadedUrl;
      if (firstMedia) search.set('media', firstMedia);
      const currentReturnTo = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('returnTo') : null;
      if (!currentReturnTo && pathname !== getTenantPath('/canvas')) {
        search.set('returnTo', pathname || getTenantPath('/dashboard'));
      }
      router.push(`${getTenantPath('/canvas')}?${search.toString()}`);
      setCanvasPrompt('');
      setAttachments([]);
    } catch (error) {
      console.error('Failed to create canvas project', error);
    }
  }, [canvasPrompt, attachments, getTenantPath, router, pathname]);

  const handleCanvasPromptKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void openCanvasProject();
      }
    },
    [openCanvasProject],
  );

  return (
    <div className="min-h-screen bg-[#F6F7F9] dark:bg-black font-sans">
      <div className="max-w-6xl mx-auto px-4 py-12">

        {/* Hero Section */}
        <section className="mb-10 py-8 md:py-12">
          <div className="text-center space-y-3">
            <h1
              className={`text-[1.45rem] sm:text-[2.1rem] md:text-[2.75rem] font-semibold leading-snug sm:leading-tight text-gray-900 dark:text-white transform-gpu transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                heroTitleEntered
                  ? 'opacity-100 translate-y-0 blur-0 scale-100'
                  : 'opacity-0 translate-y-3 blur-[2px] scale-[0.985]'
              }`}
            >
              {heroTitle}
            </h1>
          </div>
          <div className="mx-auto mt-8 max-w-4xl">
            <div
              className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-gray-900 transition-colors ${isDragOver ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-200 dark:border-gray-800'}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Attachment thumbnails row — fixed height, no vertical expansion */}
              {attachments.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {attachments.map((att) => (
                    <div key={att.id} className="group/thumb relative flex-shrink-0">
                      {att.type === 'image' ? (
                        <img src={att.localUrl} alt={att.name} className="h-14 w-14 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700">
                          <Play className="h-6 w-6 text-gray-500" />
                        </div>
                      )}
                      {att.uploading && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white opacity-0 transition group-hover/thumb:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {isDragOver ? (
                <div className="flex min-h-[110px] items-center justify-center gap-3 text-blue-500">
                  <Paperclip className="h-5 w-5" />
                  <span className="text-sm font-medium">松开鼠标导入图片或视频</span>
                </div>
              ) : (
                <textarea
                  value={canvasPrompt}
                  onChange={(event) => setCanvasPrompt(event.target.value)}
                  onKeyDown={handleCanvasPromptKeyDown}
                  placeholder={displayedPlaceholder || ' '}
                  className="min-h-[110px] w-full resize-none bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
                />
              )}
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white"
                  title="上传图片或视频"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void openCanvasProject()}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--tenant-primary,#16a34a)] text-white transition hover:opacity-90"
                  title="打开无限画布"
                >
                  <SendHorizontal className="h-5 w-5" />
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); e.target.value = ''; }}
            />
          </div>
          <div className="mx-auto mt-10 max-w-4xl">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <button
                type="button"
                onClick={() => openQuickAction('creative')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white/90 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-[#ffd445] hover:bg-white hover:text-gray-900 dark:border-transparent dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-[#ffd445] dark:hover:bg-gray-900"
              >
                <Sparkles className="h-4 w-4" />
                智能创作
              </button>
              <button
                type="button"
                onClick={() => openQuickAction('grid')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white/90 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-[#ffd445] hover:bg-white hover:text-gray-900 dark:border-transparent dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-[#ffd445] dark:hover:bg-gray-900"
              >
                <Grid3x3 className="h-4 w-4" />
                九宫格创作
              </button>
              <button
                type="button"
                onClick={() => openQuickAction('poster')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white/90 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-[#ffd445] hover:bg-white hover:text-gray-900 dark:border-transparent dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-[#ffd445] dark:hover:bg-gray-900"
              >
                <ImageIcon className="h-4 w-4" />
                小红书图文
              </button>
              <button
                type="button"
                onClick={() => openQuickAction('digitalHuman')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white/90 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-[#ffd445] hover:bg-white hover:text-gray-900 dark:border-transparent dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-[#ffd445] dark:hover:bg-gray-900"
              >
                <User className="h-4 w-4" />
                数字人视频
              </button>
            </div>
          </div>
        </section>

        {showGridModal && (
          <Modal
            isOpen={showGridModal}
            onClose={() => setShowGridModal(false)}
            title={<span className="text-base font-semibold">九宫格创作</span>}
            maxWidth="max-w-4xl"
          >
            <QuickGridForm onClose={() => setShowGridModal(false)} />
          </Modal>
        )}

        {showPosterModal && (
          <Modal
            isOpen={showPosterModal}
            onClose={() => setShowPosterModal(false)}
            title={<span className="text-base font-semibold">创建小红书图文</span>}
            maxWidth="max-w-4xl"
          >
            <QuickPosterForm onClose={() => setShowPosterModal(false)} />
          </Modal>
        )}
        {showDigitalHumanModal && (
          <Modal
            isOpen={showDigitalHumanModal}
            onClose={() => setShowDigitalHumanModal(false)}
            title={
              <span className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
                <User className="w-5 h-5" />
                {t.storyboard?.digitalHuman ?? '数字人视频'}
              </span>
            }
            maxWidth="max-w-4xl"
          >
            <DigitalHumanModal
              hideInternalTitle
              showAssistant={false}
              onClose={() => setShowDigitalHumanModal(false)}
            />
          </Modal>
        )}
        <CreativeQuickStartModal isOpen={showCreativeModal} onClose={() => setShowCreativeModal(false)} />
      </div>
    </div>
  );

}
