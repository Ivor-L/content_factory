'use client';

/* eslint-disable @next/next/no-img-element -- Dashboard cards render remote task thumbnails with mixed dimensions */

import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowRight, User, Clock, Clapperboard, SendHorizontal, Sparkles, Image } from 'lucide-react';
import Link from 'next/link';
import { useTenant } from '@/hooks/useTenant';
import { Modal } from '@/components/Modal';
import { DigitalHumanModal } from '@/components/DigitalHumanModal';
import { QuickPosterForm, QuickReplicationForm } from './QuickActionForms';
import { CreativeQuickStartModal } from './CreativeQuickStart';
import type { TaskType } from '@/lib/taskSummary';
import { createCanvasProjectOnServer } from '@/app/(main)/canvas/lib/api';
import { formatDashboardTimestamp } from '@/lib/formatDashboardTimestamp';

interface HomeContentProps {
  recentTasks: DashboardTaskSummary[];
  products: any[];
}

type DashboardTaskSummary = {
  id: string;
  taskType: TaskType;
  taskId: string;
  title: string | null;
  status: string;
  preview?: string | null;
  thumbnailUrl?: string | null;
  progress?: number | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  updatedAtFormatted?: string;
};

type CopyMap = { en: string; zh: string; 'zh-TW': string };
type LanguageCode = keyof CopyMap;
type StatusTone = 'success' | 'processing' | 'pending' | 'danger';

const DEFAULT_TYPE_COPY: CopyMap = { en: 'Project', zh: '项目', 'zh-TW': '專案' };
const DEFAULT_STATUS_COPY: CopyMap = { en: 'Processing', zh: '处理中', 'zh-TW': '處理中' };

const TYPE_LABELS: Record<TaskType, CopyMap> = {
  creative: { en: 'Creative workspace', zh: '智能创作', 'zh-TW': '智能創作' },
  poster: { en: 'Poster experiments', zh: '图文创意', 'zh-TW': '圖文創意' },
  digitalHuman: { en: 'Digital human', zh: '数字人视频', 'zh-TW': '數字人影片' },
  replication: { en: 'Viral replications', zh: '爆款复刻', 'zh-TW': '爆款復刻' },
  storyboard: { en: 'Storyboards', zh: '分镜任务', 'zh-TW': '分鏡任務' },
  knowledgeVideo: { en: 'Knowledge videos', zh: '知识视频', 'zh-TW': '知識影片' },
  replicationShot: { en: 'Scene clones', zh: '场景复刻', 'zh-TW': '場景復刻' },
};

const STATUS_DISPLAY: Record<string, { label: CopyMap; tone: StatusTone }> = {
  COMPLETED: { label: { en: 'Completed', zh: '已完成', 'zh-TW': '已完成' }, tone: 'success' },
  READY: { label: { en: 'Ready', zh: '可下载', 'zh-TW': '可下載' }, tone: 'success' },
  ACTIVE: { label: { en: 'Active', zh: '进行中', 'zh-TW': '進行中' }, tone: 'processing' },
  PUBLISHED: { label: { en: 'Published', zh: '已发布', 'zh-TW': '已發布' }, tone: 'success' },
  PROCESSING: { label: { en: 'Processing', zh: '处理中', 'zh-TW': '處理中' }, tone: 'processing' },
  ANALYZING: { label: { en: 'Analyzing', zh: '分析中', 'zh-TW': '分析中' }, tone: 'processing' },
  RUNNING: { label: { en: 'Running', zh: '运行中', 'zh-TW': '執行中' }, tone: 'processing' },
  IN_PROGRESS: { label: { en: 'In progress', zh: '处理中', 'zh-TW': '處理中' }, tone: 'processing' },
  QUEUED: { label: { en: 'Queued', zh: '排队中', 'zh-TW': '排隊中' }, tone: 'pending' },
  PENDING: { label: { en: 'Queued', zh: '排队中', 'zh-TW': '排隊中' }, tone: 'pending' },
  FAILED: { label: { en: 'Failed', zh: '失败', 'zh-TW': '失敗' }, tone: 'danger' },
  ERROR: { label: { en: 'Error', zh: '出错', 'zh-TW': '錯誤' }, tone: 'danger' },
  BREAKDOWN_COMPLETED: { label: { en: 'Analyzed', zh: '拆解完成', 'zh-TW': '拆解完成' }, tone: 'success' },
  VIDEO_GENERATION_COMPLETED: { label: { en: 'Video ready', zh: '视频就绪', 'zh-TW': '影片就緒' }, tone: 'success' },
  IMAGE_GENERATION_COMPLETED: { label: { en: 'Images ready', zh: '首帧图就绪', 'zh-TW': '首幀圖就緒' }, tone: 'success' },
};

const STATUS_BADGE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-emerald-50/95 text-emerald-800 border border-emerald-100/70 backdrop-blur-sm',
  processing: 'bg-sky-50/95 text-sky-800 border border-sky-100/70 backdrop-blur-sm',
  pending: 'bg-amber-50/95 text-amber-800 border border-amber-100/70 backdrop-blur-sm',
  danger: 'bg-rose-50/95 text-rose-800 border border-rose-100/70 backdrop-blur-sm',
};

const clampProgress = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
const pickCopy = (map: CopyMap | undefined, lang: LanguageCode, fallback: string) =>
  map?.[lang] ?? fallback;
const looksLikeVideoUrl = (url?: string | null) => {
  if (!url) return false;
  const normalized = url.split('?')[0]?.toLowerCase() ?? '';
  return normalized.endsWith('.mp4') || normalized.endsWith('.mov') || normalized.endsWith('.webm');
};
export function HomeContent({ recentTasks, products: _products }: HomeContentProps) {
  const { t, language } = useLanguage();
  const { tenant, tenantSlug, basePath } = useTenant();
  const router = useRouter();
  const [showReplicationModal, setShowReplicationModal] = useState(false);
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [showCreativeModal, setShowCreativeModal] = useState(false);
  const [showDigitalHumanModal, setShowDigitalHumanModal] = useState(false);
  const [canvasPrompt, setCanvasPrompt] = useState('');
  const [heroTitleEntered, setHeroTitleEntered] = useState(false);

  const getTenantPath = (path: string) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${basePath || ''}${normalizedPath}`;
  };

  const heroTenantName = tenant.name || 'NexTide';
  const langKey = (language ?? 'zh') as LanguageCode;
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

    const frame = window.requestAnimationFrame(() => {
      setHeroTitleEntered(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const openQuickAction = useCallback(
    (action: 'creative' | 'replication' | 'poster' | 'digitalHuman') => {
      if (action === 'creative') {
        setShowCreativeModal(true);
        return;
      }
      if (action === 'replication') {
        setShowReplicationModal(true);
        return;
      }
      if (action === 'poster') {
        setShowPosterModal(true);
        return;
      }
      if (action === 'digitalHuman') {
        setShowDigitalHumanModal(true);
        return;
      }
    },
  []);

  const openCanvasProject = useCallback(async () => {
    const prompt = canvasPrompt.trim();
    try {
      const project = await createCanvasProjectOnServer(prompt || '未命名项目');
      if (prompt) {
        await fetch('/api/canvas/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: project.id,
            messages: [
              {
                role: 'system',
                content: '你是 NexTide 的创作助手，请根据用户给出的创意补充成可供无限画布使用的提示词。',
              },
              { role: 'user', content: prompt },
            ],
            stream: false,
          }),
        }).catch((error) => {
          console.error('Canvas agent call failed', error);
        });
      }
      const search = new URLSearchParams();
      search.set('projectId', project.id);
      if (prompt) {
        search.set('prompt', prompt);
      }
      search.set('returnTo', getTenantPath('/dashboard'));
      const targetUrl = `${getTenantPath('/canvas')}?${search.toString()}`;
      router.push(targetUrl);
      setCanvasPrompt('');
    } catch (error) {
      console.error('Failed to create canvas project', error);
    }
  }, [canvasPrompt, getTenantPath, router]);

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
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <textarea
                value={canvasPrompt}
                onChange={(event) => setCanvasPrompt(event.target.value)}
                onKeyDown={handleCanvasPromptKeyDown}
                placeholder="输入你的创意，开始新项目"
                className="min-h-[110px] w-full resize-none bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
              />
              <div className="mt-3 flex justify-end">
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
          </div>
          <div className="mx-auto mt-10 max-w-4xl">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <button
                type="button"
                onClick={() => openQuickAction('creative')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white/90 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-[#ffd445] hover:bg-white hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-[#ffd445] dark:hover:bg-gray-900"
              >
                <Sparkles className="h-4 w-4" />
                智能创作
              </button>
              <button
                type="button"
                onClick={() => openQuickAction('replication')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white/90 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-[#ffd445] hover:bg-white hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-[#ffd445] dark:hover:bg-gray-900"
              >
                <Clapperboard className="h-4 w-4" />
                视频复刻
              </button>
              <button
                type="button"
                onClick={() => openQuickAction('poster')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white/90 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-[#ffd445] hover:bg-white hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-[#ffd445] dark:hover:bg-gray-900"
              >
                <Image className="h-4 w-4" />
                小红书图文
              </button>
              <button
                type="button"
                onClick={() => openQuickAction('digitalHuman')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white/90 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-[#ffd445] hover:bg-white hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-[#ffd445] dark:hover:bg-gray-900"
              >
                <User className="h-4 w-4" />
                数字人视频
              </button>
            </div>
          </div>
        </section>

        {/* Recent Projects (Simplified/Moved down) */}
        <div className="mb-8">
            <div className="flex items-center justify-between mb-6 px-2">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-black dark:bg-white rounded-full"></div>
                    {(t as any).home?.recentProjects || 'Recent Projects'}
                </h2>
                <Link href={getTenantPath('/my-works')} className="text-sm font-bold text-gray-500 hover:text-black dark:hover:text-white flex items-center gap-1 transition-colors">
                    {(t as any).home?.viewMore || 'View More'} <ArrowRight size={14} />
                </Link>
            </div>
            
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
                {recentTasks.length > 0 ? (
                    recentTasks.map((task) => (
                        <RecentProjectCard
                          key={task.id}
                          task={task}
                          lang={langKey}
                          detailHref={`${getTenantPath('/my-works')}?taskId=${encodeURIComponent(task.taskId)}`}
                        />
                    ))
                ) : (
                    <div className="col-span-full py-12 text-center text-gray-400 bg-white dark:bg-[#1F2127]/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-[#34363E]">
                        <p>No recent projects found</p>
                    </div>
                )}
            </div>
        </div>

        {showReplicationModal && (
          <Modal
            isOpen={showReplicationModal}
            onClose={() => setShowReplicationModal(false)}
            title={<span className="text-base font-semibold">视频复刻</span>}
            maxWidth="max-w-4xl"
          >
            <QuickReplicationForm onClose={() => setShowReplicationModal(false)} />
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
            maxWidth="max-w-6xl"
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

interface RecentProjectCardProps {
  task: DashboardTaskSummary;
  lang: LanguageCode;
  detailHref: string;
}

function RecentProjectCard({ task, lang, detailHref }: RecentProjectCardProps) {
  const statusKey = (task.status || '').toUpperCase();
  const statusEntry =
    STATUS_DISPLAY[statusKey] ?? ({ label: DEFAULT_STATUS_COPY, tone: 'processing' } as {
      label: CopyMap;
      tone: StatusTone;
    });
  const statusLabel = pickCopy(
    statusEntry.label,
    lang,
    task.status || pickCopy(DEFAULT_STATUS_COPY, lang, 'Processing'),
  );
  const typeLabel = pickCopy(
    TYPE_LABELS[task.taskType],
    lang,
    pickCopy(DEFAULT_TYPE_COPY, lang, 'Project'),
  );
  const thumbnailIsVideo = looksLikeVideoUrl(task.thumbnailUrl);
  const timestampSource = task.updatedAtFormatted ?? formatDashboardTimestamp(task.updatedAt);
  const timestamp = (timestampSource ?? "未知时间").replace(/,\s*/g, " ");

  return (
    <Link
      href={detailHref}
      className="group relative flex aspect-[2/3] sm:aspect-[9/16] w-full flex-col overflow-hidden rounded-3xl border border-white/20 bg-white/10 text-left shadow-lg backdrop-blur dark:border-white/10 dark:bg-white/5"
    >
      <div className="absolute inset-0">
        {task.thumbnailUrl ? (
          thumbnailIsVideo ? (
            <video
              src={task.thumbnailUrl}
              className="h-full w-full object-cover"
              autoPlay
              loop
              muted
              playsInline
            />
          ) : (
            <img
              src={task.thumbnailUrl}
              alt={task.title || typeLabel}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white/60">
            <Clapperboard className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="absolute inset-0 bg-black/45 transition group-hover:bg-black/60" />
      {statusEntry.tone === 'processing' && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="animate-shimmer-sweep absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.25] to-transparent" />
        </div>
      )}
      <div className="relative z-10 flex h-full flex-col justify-between p-5 text-white">
        <div className="flex flex-col items-start gap-1.5 text-xs font-semibold">
          <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 leading-5">
            {typeLabel}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 leading-5 ${STATUS_BADGE_CLASSES[statusEntry.tone]}`}
          >
            {statusLabel}
          </span>
        </div>
        <div>
          <h3 className="text-sm font-semibold leading-tight line-clamp-1">
            {task.title || typeLabel}
          </h3>
          <p className="mt-2 inline-flex items-center gap-2 text-sm text-white/75">
            <Clock className="h-4 w-4" />
            {timestamp}
          </p>
        </div>
      </div>
    </Link>
  );
}
