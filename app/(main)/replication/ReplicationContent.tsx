'use client';

/* eslint-disable @next/next/no-img-element -- Poster previews rely on remote URLs that are not managed by next/image */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { VideoCard } from "@/components/VideoCard";
import { VideoDetailsModal } from "@/components/VideoDetailsModal";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { toForcedProxyUrl } from "@/lib/mediaProxy";
import { Clapperboard, Download, AlertTriangle, LayoutGrid, User, Image as ImageIcon, FileText, Copy, ExternalLink, Loader2, Check } from "lucide-react";
import { StoryboardGenModal } from "@/components/StoryboardGenModal";
import { DigitalHumanModal } from "@/components/DigitalHumanModal";

import { deleteVideos } from "@/app/actions/video";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface ReplicationContentProps {
  history: any[];
  digitalHumanVideos?: any[];
  context?: 'replication' | 'myVideos';
  showCreationActions?: boolean;
  enableImageTab?: boolean;
}

type MediaTab = 'VIDEO' | 'GRAPHIC' | 'IMAGE';
type PosterJob = {
  id: string;
  title?: string | null;
  copyText: string;
  status: "pending" | "ready" | "error";
  error?: string | null;
  createdAt: string;
  sourceTaskId?: string | null;
  style?: {
    id: string;
    name?: string | null;
  } | null;
  images: Array<{
    id: string;
    imageUrl: string;
    prompt?: string;
  }>;
  variationCount?: number | null;
};

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isTouchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || isTouchMac;
}

function toDownloadUrl(url: string, filename: string): string {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(url, base);
    if (parsed.pathname === "/api/proxy/download") {
      parsed.searchParams.set("filename", filename);
      if (typeof window !== "undefined" && parsed.origin === window.location.origin) {
        return `${parsed.pathname}?${parsed.searchParams.toString()}`;
      }
      return parsed.toString();
    }
  } catch {
    // fall through
  }
  return toForcedProxyUrl(url, filename);
}

export default function ReplicationContent({
  history,
  digitalHumanVideos = [],
  context = 'replication',
  showCreationActions,
  enableImageTab,
}: ReplicationContentProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedVideo, setSelectedVideo] = useState<any | null>(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [selectedPosterIds, setSelectedPosterIds] = useState<Set<string>>(new Set());
  const hasMediaTabs = context === 'myVideos' || context === 'replication';
  const isImageTabEnabled = typeof enableImageTab === 'boolean' ? enableImageTab : context !== 'myVideos';
  const shouldShowCreationActions = typeof showCreationActions === 'boolean' ? showCreationActions : !hasMediaTabs;
  const [activeMediaTab, setActiveMediaTab] = useState<MediaTab>('VIDEO');
  const isGraphicView = hasMediaTabs && activeMediaTab === 'GRAPHIC';
  const isImageView = hasMediaTabs && activeMediaTab === 'IMAGE' && isImageTabEnabled;
  const creationActionsVisible = shouldShowCreationActions && !isGraphicView;
  const isMyVideosPage = context === 'myVideos';
  const tabSectionSpacing = isMyVideosPage ? 'mb-4' : 'mb-8';
  const bannerSpacing = isMyVideosPage ? 'mb-2' : 'mb-4';
  const emptyStateOffset = isMyVideosPage ? 'mt-1' : 'mt-6';
  const emptyStatePadding = isMyVideosPage ? 'py-6' : 'py-12';

  const mediaTabOptions = useMemo(() => {
    if (!hasMediaTabs) return [];
    const options = [
      { id: 'VIDEO' as MediaTab, label: t.replication.mediaTabs?.video || '视频', icon: Clapperboard },
      { id: 'GRAPHIC' as MediaTab, label: t.replication.mediaTabs?.article || '图文', icon: FileText },
    ];
    if (isImageTabEnabled) {
      options.push({ id: 'IMAGE' as MediaTab, label: t.replication.mediaTabs?.image || '图片', icon: ImageIcon });
    }
    return options;
  }, [hasMediaTabs, isImageTabEnabled, t]);
  const showMediaTabs = hasMediaTabs && mediaTabOptions.length > 0;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [pendingDeleteType, setPendingDeleteType] = useState<'video' | 'graphic'>('video');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [posterJobs, setPosterJobs] = useState<PosterJob[]>([]);
  const [posterReloadToken, setPosterReloadToken] = useState(0);
  const [posterLoading, setPosterLoading] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);
  const [selectedPosterJob, setSelectedPosterJob] = useState<PosterJob | null>(null);
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);

  // Digital human videos client state (initialized from server-side prop, then kept live via Supabase realtime)
  const [dhVideos, setDhVideos] = useState(digitalHumanVideos);
  
  // New Modals
  const [isStoryboardGenOpen, setIsStoryboardGenOpen] = useState(false);
  const [isDigitalHumanOpen, setIsDigitalHumanOpen] = useState(false);

  useEffect(() => {
    if (context !== 'myVideos' && context !== 'replication') return;
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const token = data.session?.access_token ?? null;
      setAuthToken(token);
      setRequiresAuth(!token);
      setCurrentUserId(data.session?.user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token ?? null;
      setAuthToken(token);
      setRequiresAuth(!token);
      setCurrentUserId(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [context]);

  useEffect(() => {
    const tab = searchParams?.get('tab');
    if (!tab || !hasMediaTabs) return;

    let normalizedTab: MediaTab = 'VIDEO';
    if (tab === 'GRAPHIC') {
      normalizedTab = 'GRAPHIC';
    } else if (tab === 'IMAGE' || tab === 'STORYBOARD_GEN') {
      normalizedTab = isImageTabEnabled ? 'IMAGE' : 'VIDEO';
    }

    setActiveMediaTab(normalizedTab);
  }, [searchParams, hasMediaTabs, isImageTabEnabled]);

  useEffect(() => {
    if (!isImageTabEnabled && activeMediaTab === 'IMAGE') {
      setActiveMediaTab('VIDEO');
    }
  }, [isImageTabEnabled, activeMediaTab]);

  useEffect(() => {
    if (context !== 'myVideos' && context !== 'replication') return;
    if (!authToken) {
      setPosterJobs([]);
      setPosterError(null);
      setPosterLoading(false);
      setSelectedPosterIds(new Set());
      return;
    }
    let cancelled = false;
    const load = async () => {
      setPosterLoading(true);
      setPosterError(null);
      try {
        const res = await fetch("/api/xhs-images/jobs", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || "Failed to load posts");
        }
        if (!cancelled) {
          const jobs: PosterJob[] = Array.isArray(payload.data) ? payload.data : [];
          jobs.sort((a: PosterJob, b: PosterJob) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setPosterJobs(jobs);
        }
      } catch (error) {
        if (!cancelled) {
          setPosterError(error instanceof Error ? error.message : t.common.error);
        }
      } finally {
        if (!cancelled) {
          setPosterLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authToken, context, t.common.error, posterReloadToken]);

  const requestPosterReload = useCallback(() => {
    setPosterReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (context !== 'myVideos') return;
    if (!authToken || !currentUserId) return;

    const channel = supabase
      .channel(`poster-jobs-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'xhs_poster_jobs',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          requestPosterReload();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authToken, context, currentUserId, requestPosterReload]);

  useEffect(() => {
    if (context !== 'myVideos') return;
    if (typeof document === 'undefined') return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestPosterReload();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [context, requestPosterReload]);

  // ── Digital human video real-time updates ────────────────────────────────
  const fetchDhVideos = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/digital-human/videos?limit=50', {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const payload = await res.json().catch(() => null);
      if (Array.isArray(payload?.data)) {
        setDhVideos(payload.data);
      }
    } catch {
      // silently ignore
    }
  }, [authToken]);

  useEffect(() => {
    if (context !== 'myVideos' && context !== 'replication') return;
    if (!authToken || !currentUserId) return;

    // Subscribe to digital_human_videos changes for this user.
    // When n8n webhook updates the record (COMPLETED/FAILED), Supabase pushes
    // the change here and we re-fetch the list — no polling needed.
    const channel = supabase
      .channel(`digital-human-videos-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'digital_human_videos',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          void fetchDhVideos();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authToken, context, currentUserId, fetchDhVideos]);
  // ─────────────────────────────────────────────────────────────────────────

  const handleMediaTabChange = (tabId: MediaTab) => {
    if (tabId === 'IMAGE' && !isImageTabEnabled) return;
    setActiveMediaTab(tabId);
  };

  // Map Digital Human videos to match VideoCard expectation
  const mappedDigitalHumanVideos = dhVideos.map((v: any) => ({
    ...v,
    result: { videoUrl: v.resultUrl }
  }));

  // Merge all videos for "ALL" view
  const allVideos = [...history, ...mappedDigitalHumanVideos].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const videoItems = allVideos.filter(item => item.type !== 'STORYBOARD_GEN');
  const imageItems = history.filter(item => item.type === 'STORYBOARD_GEN');
  const emptyStateTitle =
    t.replication?.emptyState?.title ||
    t.replication?.title ||
    t.sidebar?.myVideos ||
    "My Projects";
  const emptyStateDescription =
    t.replication?.emptyState?.description ||
    t.replication?.history ||
    "Start by generating or uploading content to see it here.";
  const emptyStateActionLabel =
    t.replication?.emptyState?.action ||
    t.replication?.startNew ||
    t.common?.create ||
    "Create now";
  const emptyStateAction = isMyVideosPage || !creationActionsVisible
    ? undefined
    : {
        label: emptyStateActionLabel,
        href: "/",
      };


  const toggleSelection = useCallback((setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleVideoSelect = useCallback((id: string) => toggleSelection(setSelectedVideoIds, id), [toggleSelection]);
  const handleImageSelect = useCallback((id: string) => toggleSelection(setSelectedImageIds, id), [toggleSelection]);
  const handlePosterSelect = useCallback((id: string) => toggleSelection(setSelectedPosterIds, id), [toggleSelection]);

  const parseResult = (item: any) => {
    if (!item) return null;
    if (typeof item.result === 'string') {
      try {
        return JSON.parse(item.result || '{}');
      } catch (error) {
        console.error('Failed to parse result JSON for item', item.id, error);
        return null;
      }
    }
    return item.result || null;
  };

  const getVideoUrl = (item: any) => {
    const parsed = parseResult(item);
    return parsed?.videoUrl || item.resultUrl || null;
  };

  const triggerDownload = (url: string, filename: string) => {
    const downloadUrl = toDownloadUrl(url, filename);
    if (typeof window !== "undefined" && isMobileBrowser()) {
      const opened = window.open(downloadUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        window.location.assign(downloadUrl);
      }
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.setAttribute('download', filename);
    anchor.setAttribute('target', '_blank');
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleBatchDownload = () => {
    if (isGraphicView) {
      if (!selectedPosterIds.size) return;
      let downloaded = 0;
      let missing = 0;
      selectedPosterIds.forEach((id) => {
        const job = posterJobs.find((poster) => poster.id === id);
        const cover = job?.images?.[0]?.imageUrl;
        if (!job || !cover) {
          missing += 1;
          return;
        }
        const urlWithoutQuery = cover.split('?')[0];
        const extension = urlWithoutQuery.includes('.') ? urlWithoutQuery.split('.').pop() : 'png';
        triggerDownload(cover, `${job.title || 'poster'}-${job.id}.${extension}`);
        downloaded += 1;
      });
      if (downloaded) toast.success(t.common.success);
      if (missing) toast.error(t.common.error);
      return;
    }

    const selection = isImageView ? selectedImageIds : selectedVideoIds;
    if (!selection.size) return;

    const sourceItems = isImageView ? imageItems : videoItems;
    const targets = sourceItems.filter((item) => selection.has(item.id));
    let successCount = 0;
    let missingCount = 0;

    targets.forEach(item => {
      const videoUrl = getVideoUrl(item);
      if (!videoUrl) {
        missingCount += 1;
        return;
      }
      const urlWithoutQuery = videoUrl.split('?')[0];
      const extension = urlWithoutQuery.includes('.') ? urlWithoutQuery.split('.').pop() : 'mp4';
      triggerDownload(videoUrl, `${item.type || 'video'}-${item.id}.${extension}`);
      successCount += 1;
    });

    if (successCount) {
      toast.success(t.common.success);
    }
    if (missingCount) {
      toast.error(t.replication?.promptUnavailable || t.common.error);
    }
  };

  const handleBatchDeleteClick = () => {
    if (isGraphicView) {
      handleDeleteRequest(Array.from(selectedPosterIds), 'graphic');
      return;
    }
    const selection = isImageView ? selectedImageIds : selectedVideoIds;
    handleDeleteRequest(Array.from(selection), 'video');
  };

  const currentSelectionCount = isGraphicView
    ? selectedPosterIds.size
    : isImageView
    ? selectedImageIds.size
    : selectedVideoIds.size;
  const showCreationButtons = creationActionsVisible;
  const creationActionButtons = showCreationButtons ? (
    <div className="flex flex-wrap gap-3">
      <button
        onClick={() => setIsStoryboardGenOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold shadow-md hover:bg-gray-900 transition-colors"
      >
        <LayoutGrid size={16} />
        {t.storyboard.genList?.create || t.storyboard.storyboardGen}
      </button>
      <button
        onClick={() => setIsDigitalHumanOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold shadow-md hover:bg-gray-800 transition-colors"
      >
        <User size={16} />
        {t.storyboard.generateDigitalHumanVideo}
      </button>
    </div>
  ) : null;
  const batchActionButtons = (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={handleBatchDeleteClick}
        disabled={currentSelectionCount === 0 || isDeleting}
        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isDeleting ? t.common.loading : t.replication.batchDelete}
      </button>
      <button
        onClick={handleBatchDownload}
        disabled={currentSelectionCount === 0}
        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Download size={16} />
        {t.replication.batchDownload}
        {currentSelectionCount > 0 && (
          <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-xs">{currentSelectionCount}</span>
        )}
      </button>
    </div>
  );

  const getPosterStatusMeta = useCallback(
    (status: PosterJob["status"]) => {
      const directCopy = t.contentCreation?.newTask?.direct;
      if (status === "ready") {
        return {
          label: directCopy?.readyStatus || t.common.success,
          tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-100",
        };
      }
      if (status === "error") {
        return {
          label: directCopy?.errorStatus || t.common.error,
          tone: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-100",
        };
      }
      return {
        label: directCopy?.pendingStatus || t.replication.processing,
        tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-100",
      };
    },
    [t.common.error, t.common.success, t.contentCreation?.newTask?.direct, t.replication.processing]
  );

  const handlePosterCopy = useCallback(
    async (text: string) => {
      const payload = text?.trim();
      if (!payload) return;
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        toast.error(t.contentCreation?.stagePanel?.copyFailed ?? t.common.error);
        return;
      }
      try {
        await navigator.clipboard.writeText(payload);
        toast.success(t.common.copied);
      } catch (error) {
        console.error(error);
        toast.error(t.contentCreation?.stagePanel?.copyFailed ?? t.common.error);
      }
    },
    [t.common.copied, t.common.error, t.contentCreation?.stagePanel?.copyFailed]
  );

  const handlePosterOpen = useCallback((url?: string) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const openPosterModal = useCallback((job: PosterJob) => {
    setSelectedPosterJob(job);
    setIsPosterModalOpen(true);
  }, []);

  const closePosterModal = useCallback(() => {
    setIsPosterModalOpen(false);
    setSelectedPosterJob(null);
  }, []);

  const formatPosterDate = useCallback((dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  }, []);

  const removeIdsFromSelection = useCallback((ids: string[]) => {
    setSelectedVideoIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
    setSelectedImageIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  }, []);

  const removePosterIdsFromSelection = useCallback((ids: string[]) => {
    setSelectedPosterIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  }, []);

  const deletePosterJobs = useCallback(async (ids: string[]) => {
    if (!authToken) {
      toast.error(t.common.loginPlease);
      return false;
    }
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/xhs-images/jobs/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${authToken}` },
          }).then((res) => {
            if (!res.ok) {
              return res.json().then((data) => {
                throw new Error(data?.error || "Failed to delete");
              });
            }
          })
        )
      );
      setPosterJobs((prev) => prev.filter((job) => !ids.includes(job.id)));
      removePosterIdsFromSelection(ids);
      toast.success(t.common.success);
      return true;
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : t.common.error);
      return false;
    }
  }, [authToken, removePosterIdsFromSelection, t.common.error, t.common.loginPlease, t.common.success]);

  const handleDeleteRequest = (ids: string[], type: 'video' | 'graphic' = 'video') => {
    if (!ids.length) return;
    setPendingDeleteType(type);
    setPendingDeleteIds(ids);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setPendingDeleteIds([]);
    setIsDeleteModalOpen(false);
  };

  const handleDelete = (id: string) => {
    handleDeleteRequest([id], 'video');
  };

  const confirmDelete = async () => {
    if (!pendingDeleteIds.length) return;
    setIsDeleting(true);
    try {
      if (pendingDeleteType === 'graphic') {
        const result = await deletePosterJobs(pendingDeleteIds);
        if (result) {
          setPendingDeleteIds([]);
          setIsDeleteModalOpen(false);
        }
      } else {
        const res = await deleteVideos(pendingDeleteIds);
        if (res.success) {
          toast.success(t.common.success);
          removeIdsFromSelection(pendingDeleteIds);
          setPendingDeleteIds([]);
          setIsDeleteModalOpen(false);
          router.refresh();
        } else {
          toast.error(t.common.error);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error(t.common.error);
    } finally {
      setIsDeleting(false);
    }
  };

  const currentItems = isImageView ? imageItems : videoItems;
  const selectionSet = isImageView ? selectedImageIds : selectedVideoIds;
  const handleSelectFn = isImageView ? handleImageSelect : handleVideoSelect;

  return (
    <div
      className={cn(
        "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 font-sans h-full flex flex-col",
        isMyVideosPage ? "py-8" : "py-12"
      )}
    >
      <div
        className={cn(
          "flex justify-between items-center",
          isMyVideosPage ? "mb-6" : "mb-8"
        )}
      >
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {context === 'myVideos' ? t.sidebar.myVideos : t.replication.title}
        </h1>
      </div>

      {showMediaTabs ? (
        <div
          className={cn(
            "flex flex-col gap-4",
            tabSectionSpacing
          )}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex flex-wrap gap-3">
              {mediaTabOptions.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleMediaTabChange(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border",
                    activeMediaTab === tab.id
                      ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white shadow-md"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                  )}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </div>
            {batchActionButtons}
          </div>
          {creationActionButtons}
        </div>
      ) : (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 shrink-0">
          {creationActionButtons || <div />}
          {batchActionButtons}
        </div>
      )}

      {/* Warning Banner */}
      {showBanner && (
        <div
          className={cn(
            "p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-start justify-between gap-3 shrink-0",
            bannerSpacing
          )}
        >
            <div className="flex items-start gap-3">
                <AlertTriangle className="text-gray-600 dark:text-gray-400 mt-0.5 shrink-0" size={18} />
                <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">
                {t.replication.retentionWarning}
                </p>
            </div>
            <button 
                onClick={() => setShowBanner(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
      )}

      {isGraphicView ? (
        <div className={cn(isMyVideosPage ? "pb-6" : "pb-8")}>
          {posterLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t.common.loading}
            </div>
          ) : requiresAuth ? (
            <EmptyState
              className={cn(emptyStateOffset, emptyStatePadding)}
              fullHeight={!isMyVideosPage}
              compact={isMyVideosPage}
              icon={<FileText className="h-6 w-6" />}
              title={t.replication.graphicAuthRequired || t.common.loginPlease}
              description={t.replication.graphicEmptyDescription}
            />
          ) : posterError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200 px-4 py-3 text-sm">
              {posterError}
            </div>
          ) : posterJobs.length === 0 ? (
            <EmptyState
              className={cn(emptyStateOffset, emptyStatePadding)}
              fullHeight={!isMyVideosPage}
              compact={isMyVideosPage}
              icon={<FileText className="h-6 w-6" />}
              title={t.replication.graphicEmptyTitle || emptyStateTitle}
              description={t.replication.graphicEmptyDescription || emptyStateDescription}
            />
          ) : (
            <div
              className={cn(
                "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
                isMyVideosPage ? "gap-5" : "gap-6"
              )}
            >
              {posterJobs.map((job) => {
                const statusMeta = getPosterStatusMeta(job.status);
                const cover = job.images[0]?.imageUrl;
                const displayTitle =
                  job.title ||
                  t.contentCreation?.newTask.direct?.untitledPoster ||
                  t.replication.mediaTabs?.article ||
                  "Poster";
                const isSelected = selectedPosterIds.has(job.id);
                return (
                  <div
                    key={job.id}
                    className={cn(
                      "h-full rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-lg transition-all flex flex-col",
                      isSelected ? "ring-2 ring-black dark:ring-white" : ""
                    )}
                    onClick={() => openPosterModal(job)}
                  >
                    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl rounded-b-none bg-gray-50 dark:bg-gray-800">
                      {cover ? (
                        <img src={cover} alt={displayTitle} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                          {t.common.loading}
                        </div>
                      )}
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handlePosterSelect(job.id);
                        }}
                        className={cn(
                          "absolute top-3 right-3 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-semibold",
                          isSelected
                            ? "bg-black text-white border-black dark:bg-white dark:text-black"
                            : "bg-white/80 dark:bg-black/60 text-gray-600 border-gray-200 dark:border-gray-700"
                        )}
                        aria-label="select poster"
                      >
                        {isSelected ? <Check size={14} /> : null}
                      </button>
                      <span
                        className={cn(
                          "absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold shadow-sm",
                          statusMeta.tone
                        )}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                    <div className="flex flex-col gap-3 p-4 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold text-gray-900 dark:text-white">{displayTitle}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{formatPosterDate(job.createdAt)}</p>
                        </div>
                        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                          {t.replication.viewDetails}
                        </span>
                      </div>
                      {job.style?.name && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300 self-start">
                          {job.style.name}
                        </span>
                      )}
                      <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-line max-h-32 overflow-hidden">
                        {job.copyText}
                      </p>
                      <div className="mt-auto flex flex-wrap gap-2">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePosterCopy(job.copyText);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <Copy size={14} />
                          {t.common.copy}
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePosterOpen(cover);
                          }}
                          disabled={!cover}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 transition-colors"
                        >
                          <ExternalLink size={14} />
                          {t.replication.download}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {currentItems.length > 0 && (
            <div
              className={cn(
                "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
                isMyVideosPage ? "gap-5 pb-2" : "gap-6 pb-4"
              )}
            >
              {currentItems.map((item) => (
                <VideoCard
                  key={item.id}
                  item={item}
                  selected={selectionSet.has(item.id)}
                  onSelect={handleSelectFn}
                  onClick={() => {
                    setSelectedVideo(item);
                    setIsModalOpen(true);
                  }}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {currentItems.length === 0 && (
            <EmptyState
              className={cn(emptyStateOffset, emptyStatePadding)}
              fullHeight={!isMyVideosPage}
              compact={isMyVideosPage}
              icon={<Clapperboard className="h-6 w-6" />}
              title={emptyStateTitle}
              description={emptyStateDescription}
              action={emptyStateAction}
            />
          )}
        </>
      )}

      {/* Details Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVideo(null);
        }}
        title={selectedVideo?.product?.name || t.replication.viewDetails}
        maxWidth="max-w-4xl"
      >
        {selectedVideo && (
          <VideoDetailsModal 
            item={selectedVideo} 
            onClose={() => setIsModalOpen(false)} 
          />
        )}
      </Modal>

      {/* Poster Details Modal */}
      <Modal
        isOpen={isPosterModalOpen}
        onClose={closePosterModal}
        title={selectedPosterJob?.title || t.replication.mediaTabs?.article || "图文"}
        maxWidth="max-w-4xl"
      >
        {selectedPosterJob && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedPosterJob.images.length > 0 ? (
                selectedPosterJob.images.map((image) => (
                  <div key={image.id} className="rounded-2xl overflow-hidden bg-gray-50 dark:bg-gray-800">
                    <img src={image.imageUrl} alt={selectedPosterJob.title || "poster"} className="w-full h-full object-cover" />
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-300">
                  {t.contentCreation?.newTask.direct?.emptyResults || t.common.loading}
                </div>
              )}
            </div>
            <div className="rounded-2xl bg-gray-50 dark:bg-gray-900/40 p-4 space-y-3">
              <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-line">{selectedPosterJob.copyText}</p>
              <button
                onClick={() => handlePosterCopy(selectedPosterJob.copyText)}
                className="inline-flex items-center gap-2 rounded-lg bg-black text-white px-4 py-2 text-sm font-semibold dark:bg-white dark:text-black"
              >
                <Copy size={16} />
                {t.common.copy}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Storyboard Generation Modal */}
      <Modal
        isOpen={isStoryboardGenOpen}
        onClose={() => setIsStoryboardGenOpen(false)}
        title="" // Custom header in component
        maxWidth="max-w-2xl"
      >
        <StoryboardGenModal
          onClose={() => setIsStoryboardGenOpen(false)}
          onTaskCreated={(taskId) => {
            setIsStoryboardGenOpen(false);
            router.push(`/storyboard/${taskId}`);
          }}
        />
      </Modal>

      {/* Digital Human Modal */}
      <Modal
        isOpen={isDigitalHumanOpen}
        onClose={() => setIsDigitalHumanOpen(false)}
        title={
          <span className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <User className="w-5 h-5" />
            {t.storyboard.digitalHuman}
          </span>
        }
        maxWidth="max-w-6xl"
      >
        <DigitalHumanModal hideInternalTitle onClose={() => setIsDigitalHumanOpen(false)} />
      </Modal>
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        title={
          <span className="flex items-center gap-3 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-5 h-5" />
            {t.replication.batchDelete}
          </span>
        }
        maxWidth="max-w-md"
      >
        <div className="space-y-6">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            {t.common.confirmDelete}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              onClick={closeDeleteModal}
              disabled={isDeleting}
              className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={confirmDelete}
              disabled={isDeleting}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-500 disabled:opacity-60 transition-colors"
            >
              {isDeleting ? t.common.loading : t.common.delete}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
