'use client';

/* eslint-disable @next/next/no-img-element -- Storyboard creation page renders direct previews */

import { useState, useMemo, useRef, useEffect, useCallback, useTransition } from 'react';
import clsx from 'clsx';
import type { DragEvent, SyntheticEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import {
  Loader2,
  FileSpreadsheet,
  FolderOpen,
  UploadCloud,
  Trash2,
  Plus,
  Download,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Clapperboard,
  Clock3,
  X,
  Share2,
  RefreshCcw,
  Wand2,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTenant } from '@/hooks/useTenant';
import { StoryboardAssetViewer, ViewerItem } from './StoryboardAssetViewer';
import { useSidebarAutoCollapse } from '@/hooks/useSidebarAutoCollapse';
import { createManualStoryboardTask, type ManualStoryboardSegmentInput } from '@/app/actions/storyboard';
import { supabase } from '@/lib/supabaseClient';

type FrameType = 'firstFrame' | 'lastFrame';

interface FrameAttachment {
  id?: string;
  previewUrl?: string;
  remoteUrl?: string;
  uploading?: boolean;
  filename?: string;
  type?: 'image' | 'video';
}

interface StoryboardRow {
  id: string;
  prompt: string;
  timeRange: string;
  firstFrame: FrameAttachment | null;
  lastFrame: FrameAttachment | null;
  firstGallery: FrameAttachment[];
  lastGallery: FrameAttachment[];
  referenceGallery: FrameAttachment[];
}

interface TimelinePreviewRow {
  id: string;
  order: number;
  prompt: string;
  timeRange: string;
  firstAsset: FrameAttachment | null;
  lastAsset: FrameAttachment | null;
}

const DEFAULT_ROWS = 3;

const generateRowId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const createEmptyRow = (idOverride?: string): StoryboardRow => ({
  id: idOverride ?? generateRowId(),
  prompt: '',
  timeRange: '',
  firstFrame: null,
  lastFrame: null,
  firstGallery: [],
  lastGallery: [],
  referenceGallery: [],
});

const createInitialRows = () =>
  Array.from({ length: DEFAULT_ROWS }, (_, index) => createEmptyRow(`initial-row-${index}`));

interface StoryboardDraftRow {
  id: string;
  prompt: string;
  timeRange: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  firstGalleryUrls?: string[];
  lastGalleryUrls?: string[];
  referenceGalleryUrls?: string[];
}

interface StoryboardDraft {
  version: number;
  taskName: string;
  rows: StoryboardDraftRow[];
  savedAt: number;
}

const STORYBOARD_DRAFT_STORAGE_PREFIX = 'storyboard-manual-draft';
const STORYBOARD_DRAFT_VERSION = 1;

const buildDraftStorageKey = (tenantSlug?: string) =>
  `${STORYBOARD_DRAFT_STORAGE_PREFIX}:${tenantSlug || 'default'}`;

export interface StoryboardPrefillRow {
  id?: string;
  prompt?: string | null;
  timeRange?: string | null;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
}

export interface StoryboardWorkspaceInitialData {
  taskName?: string | null;
  rows?: StoryboardPrefillRow[];
}

interface StoryboardCreationPageProps {
  initialData?: StoryboardWorkspaceInitialData | null;
  timelineLink?: {
    href: string;
    label?: string;
  } | null;
}

interface AssetPreviewProps {
  src: string;
  alt?: string;
  className?: string;
}

const AssetPreview = ({ src, alt = 'preview', className }: AssetPreviewProps) => {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    setIsPortrait(false);
  }, [src]);

  return (
    <img
      src={src}
      alt={alt}
      className={clsx(
        'h-full w-full transition-transform duration-500',
        isPortrait ? 'object-contain bg-black/80 dark:bg-black/70' : 'object-cover',
        className
      )}
      onLoad={(event) => {
        const { naturalHeight, naturalWidth } = event.currentTarget;
        if (!naturalHeight || !naturalWidth) {
          setIsPortrait(false);
          return;
        }
        setIsPortrait(naturalHeight > naturalWidth);
      }}
    />
  );
};

const sanitizePersistableUrl = (url?: string | null) => {
  if (!url || url.startsWith('blob:')) return undefined;
  return url;
};

const attachmentFromUrl = (url: string, type: FrameType): FrameAttachment => ({
  id: generateRowId(),
  previewUrl: url,
  remoteUrl: url,
  uploading: false,
  type: type === 'firstFrame' ? 'image' : 'video',
});

const rehydrateDraftRows = (draftRows: StoryboardDraftRow[]): StoryboardRow[] => {
  const rows = draftRows.map((row) => {
    const firstGallery =
      row.firstGalleryUrls?.map((url) => attachmentFromUrl(url, 'firstFrame')) || [];
    const lastGallery =
      row.lastGalleryUrls?.map((url) => attachmentFromUrl(url, 'lastFrame')) || [];
    const referenceGallery =
      row.referenceGalleryUrls?.map((url) => attachmentFromUrl(url, 'firstFrame')) || [];
    const firstFrame = row.firstFrameUrl
      ? attachmentFromUrl(row.firstFrameUrl, 'firstFrame')
      : firstGallery[0] || null;
    const lastFrame = row.lastFrameUrl
      ? attachmentFromUrl(row.lastFrameUrl, 'lastFrame')
      : lastGallery[0] || null;

    if (!firstGallery.length && firstFrame) {
      firstGallery.push(firstFrame);
    }
    if (!lastGallery.length && lastFrame) {
      lastGallery.push(lastFrame);
    }

    return {
      id: row.id || generateRowId(),
      prompt: row.prompt || '',
      timeRange: row.timeRange || '',
      firstFrame,
      lastFrame,
      firstGallery,
      lastGallery,
      referenceGallery,
    };
  });

  return rows;
};

const ensureMinimumRows = (rows: StoryboardRow[]): StoryboardRow[] => {
  const next = rows.length ? [...rows] : [createEmptyRow()];
  while (next.length < DEFAULT_ROWS) {
    next.push(createEmptyRow());
  }
  return next;
};

const serializeRowsToDraft = (rows: StoryboardRow[]): StoryboardDraftRow[] =>
  rows.map((row) => {
    const firstGalleryUrls =
      row.firstGallery
        ?.map((attachment) => sanitizePersistableUrl(attachment.remoteUrl || attachment.previewUrl))
        .filter((url): url is string => Boolean(url)) ?? [];
    const lastGalleryUrls =
      row.lastGallery
        ?.map((attachment) => sanitizePersistableUrl(attachment.remoteUrl || attachment.previewUrl))
        .filter((url): url is string => Boolean(url)) ?? [];
    const referenceGalleryUrls =
      row.referenceGallery
        ?.map((attachment) => sanitizePersistableUrl(attachment.remoteUrl || attachment.previewUrl))
        .filter((url): url is string => Boolean(url)) ?? [];

    return {
      id: row.id,
      prompt: row.prompt,
      timeRange: row.timeRange,
      firstFrameUrl: sanitizePersistableUrl(row.firstFrame?.remoteUrl || row.firstFrame?.previewUrl),
      lastFrameUrl: sanitizePersistableUrl(row.lastFrame?.remoteUrl || row.lastFrame?.previewUrl),
      firstGalleryUrls,
      lastGalleryUrls,
      referenceGalleryUrls,
    };
  });

const hydrateRowsFromPrefill = (
  prefill?: StoryboardWorkspaceInitialData | null
): StoryboardRow[] => {
  if (!prefill?.rows || prefill.rows.length === 0) {
    return createInitialRows();
  }
  const hydrated = prefill.rows.map((row) => {
    const first =
      row.firstFrameUrl && typeof row.firstFrameUrl === 'string'
        ? attachmentFromUrl(row.firstFrameUrl, 'firstFrame')
        : null;
    const last =
      row.lastFrameUrl && typeof row.lastFrameUrl === 'string'
        ? attachmentFromUrl(row.lastFrameUrl, 'lastFrame')
        : null;
    return {
      id: row.id || generateRowId(),
      prompt: row.prompt || '',
      timeRange: row.timeRange || '',
      firstFrame: first,
      lastFrame: last,
      firstGallery: first ? [first] : [],
      lastGallery: last ? [last] : [],
      referenceGallery: [],
    };
  });
  return ensureMinimumRows(hydrated);
};
export function StoryboardCreationPage({
  initialData = null,
  timelineLink = null,
}: StoryboardCreationPageProps = {}) {
  const { t: i18nText } = useLanguage();
  const t = i18nText as any;
  const manualText = t.storyboard.manual;
  const storyboardTabLabel = manualText?.storyboardTab || '分镜板';
  const timelineTabLabel = manualText?.timelineTab || '时间轴';
  const { tenantSlug, isLoading: tenantLoading, basePath } = useTenant();
  const router = useRouter();
  useSidebarAutoCollapse(true, true);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const initialRowsRef = useRef<StoryboardRow[] | null>(null);
  if (!initialRowsRef.current) {
    initialRowsRef.current = hydrateRowsFromPrefill(initialData);
  }
  const initialRows = initialRowsRef.current ?? createInitialRows();
  const [rows, setRows] = useState<StoryboardRow[]>(initialRows);
  const [taskName, setTaskName] = useState(() => initialData?.taskName || '新的任务');
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(initialRows[0]?.id ?? null);
  const previewUrlsRef = useRef(new Set<string>());
  const [draggingTarget, setDraggingTarget] = useState<string | null>(null);
  const [activeViewer, setActiveViewer] = useState<{
    rowId: string;
    type: FrameType;
    items: ViewerItem[];
    rowTitle: string;
    originalPrompt?: string;
    referenceItems?: ViewerItem[];
  } | null>(null);

  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const firstFolderInputRef = useRef<HTMLInputElement | null>(null);
  const downloadMenuRef = useRef<HTMLDivElement | null>(null);
  const promptRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<'board' | 'timeline'>('board');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDraftRef = useRef<string | null>(null);
  const draftStorageKey = useMemo(() => buildDraftStorageKey(tenantSlug), [tenantSlug]);
  const allowDraftPersistence = !initialData;
  const timelinePreviewRows = useMemo(() => {
    const previewRows: TimelinePreviewRow[] = [];
    rows.forEach((row, index) => {
      const firstAsset = row.firstFrame || row.firstGallery[0] || null;
      const lastAsset = row.lastFrame || row.lastGallery[0] || null;
      const trimmedPrompt = row.prompt?.trim() || '';
      const trimmedTime = row.timeRange?.trim() || '';
      if (!trimmedPrompt && !trimmedTime && !firstAsset && !lastAsset) {
        return;
      }
      previewRows.push({
        id: row.id,
        order: index + 1,
        prompt: trimmedPrompt,
        timeRange: trimmedTime,
        firstAsset,
        lastAsset,
      });
    });
    return previewRows;
  }, [rows]);
  const selectedRowIndex = useMemo(
    () => rows.findIndex((row) => row.id === selectedRowId),
    [rows, selectedRowId]
  );
  const selectedRow = selectedRowIndex >= 0 ? rows[selectedRowIndex] : rows[0];
  const selectedRowLabel =
    selectedRowIndex >= 0
      ? `${manualText?.rowTitle || '分镜'} ${selectedRowIndex + 1}`
      : manualText?.rowTitle || '分镜';
  const selectedFirstAsset =
    selectedRow?.firstFrame || selectedRow?.firstGallery?.[0] || null;
  const selectedLastAsset =
    selectedRow?.lastFrame || selectedRow?.lastGallery?.[0] || null;
  const previewActions = [
    { key: 'reference', label: t.storyboard.sceneRef || '用作参考图', icon: ImageIcon },
    { key: 'edit', label: t.storyboard.partialEdit || '局部修改', icon: Wand2 },
    {
      key: 'regenerate',
      label: t.storyboard.regenerate || t.storyboard.generate || '重新生成',
      icon: RefreshCcw,
    },
    { key: 'share', label: t.storyboard.share || '分享', icon: Share2 },
    {
      key: 'download',
      label: manualText?.downloadImages || t.storyboard.download || '下载',
      icon: Download,
    },
  ] as const;

  const clearDraftStorage = () => {
    if (!allowDraftPersistence || typeof window === 'undefined') return;
    window.localStorage.removeItem(draftStorageKey);
    lastSavedDraftRef.current = null;
  };

  const activeUploads = useMemo(
    () =>
      rows.some(
        (row) =>
          row.firstFrame?.uploading ||
          row.lastFrame?.uploading ||
          row.referenceGallery.some((attachment) => attachment.uploading)
      ),
    [rows]
  );

  useEffect(() => {
    const previewUrls = previewUrlsRef.current;
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.clear();
    };
  }, []);

  useEffect(() => {
    if (!initialData) return;
    cleanupPreviews();
    const hydrated = hydrateRowsFromPrefill(initialData);
    initialRowsRef.current = hydrated;
    setRows(hydrated);
    setSelectedRowId(hydrated[0]?.id ?? null);
    if (initialData.taskName) {
      setTaskName(initialData.taskName);
    }
  }, [initialData]);

  useEffect(() => {
    if (!isDownloadMenuOpen) return undefined;
    const handleClickOutside = (event: MouseEvent) => {
      if (!downloadMenuRef.current) return;
      if (!downloadMenuRef.current.contains(event.target as Node)) {
        setIsDownloadMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDownloadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isDownloadMenuOpen]);

  useEffect(() => {
    if (!allowDraftPersistence) return;
    setDraftLoaded(false);
  }, [draftStorageKey, allowDraftPersistence]);

  useEffect(() => {
    if (!allowDraftPersistence || tenantLoading || draftLoaded) return;
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (!raw) {
        setDraftLoaded(true);
        return;
      }
      const parsed = JSON.parse(raw) as StoryboardDraft;
      if (parsed?.version !== STORYBOARD_DRAFT_VERSION || !Array.isArray(parsed.rows)) {
        window.localStorage.removeItem(draftStorageKey);
        setDraftLoaded(true);
        return;
      }
      cleanupPreviews();
      const restoredRows = ensureMinimumRows(rehydrateDraftRows(parsed.rows));
      setRows(restoredRows);
      setSelectedRowId(restoredRows[0]?.id ?? null);
      if (parsed.taskName) {
        setTaskName(parsed.taskName);
      }
      lastSavedDraftRef.current = raw;
      setDraftLoaded(true);
    } catch (error) {
      console.error('Failed to load storyboard draft', error);
      setDraftLoaded(true);
    }
  }, [tenantLoading, draftLoaded, draftStorageKey, allowDraftPersistence]);

  useEffect(() => {
    if (!allowDraftPersistence || tenantLoading || !draftLoaded) return;
    if (typeof window === 'undefined') return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      const draft: StoryboardDraft = {
        version: STORYBOARD_DRAFT_VERSION,
        taskName,
        rows: serializeRowsToDraft(rows),
        savedAt: Date.now(),
      };
      const serialized = JSON.stringify(draft);
      if (serialized === lastSavedDraftRef.current) return;
      try {
        window.localStorage.setItem(draftStorageKey, serialized);
        lastSavedDraftRef.current = serialized;
      } catch (error) {
        console.error('Failed to persist storyboard draft', error);
      }
    }, 600);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [rows, taskName, draftStorageKey, tenantLoading, draftLoaded, allowDraftPersistence]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedRowId(null);
      return;
    }
    if (!selectedRowId || !rows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(rows[0].id);
    }
  }, [rows, selectedRowId]);

  useEffect(() => {
    if (submissionError) {
      setSubmissionError(null);
    }
  }, [rows, taskName, submissionError]);

  const renderViewTabs = () => (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 p-1">
      {(['board', 'timeline'] as const).map((view) => {
        const label = view === 'board' ? storyboardTabLabel : timelineTabLabel;
        const Icon = view === 'board' ? Clapperboard : Clock3;
        const isTimelineLink = view === 'timeline' && Boolean(timelineLink?.href);
        const isActive = !isTimelineLink && activeView === view;
        const baseClass =
          'relative inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all';
        const activeClass = 'bg-white text-gray-900 shadow-theme-glow';
        const inactiveClass = 'text-white/70 hover:text-white';
        const children = (
          <span className="inline-flex items-center gap-2">
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </span>
        );

        if (isTimelineLink && timelineLink?.href) {
          return (
            <Link key={view} href={timelineLink.href} className={`${baseClass} ${activeClass}`}>
              {children}
            </Link>
          );
        }

        return (
          <button
            key={view}
            type="button"
            onClick={() => setActiveView(view)}
            className={`${baseClass} ${isActive ? activeClass : inactiveClass}`}
          >
            {children}
            {isActive && (
              <span className="absolute inset-0 rounded-full border border-white/40 shadow-[0_0_12px_rgba(255,255,255,0.3)]" />
            )}
          </button>
        );
      })}
    </div>
  );
  const timelinePreviewTitle =
    manualText?.timelinePreviewTitle || manualText?.viewTimeline || timelineTabLabel;
  const timelinePreviewEmpty =
    manualText?.timelinePreviewEmpty || 'Add storyboard rows to preview the timeline.';
  const promptHeading = manualText?.promptHeader || manualText?.prompt || '场景提示';
  const firstFrameHeading = manualText?.firstFrame || '首帧图';
  const videoHeading =
    manualText?.lastFrameVideo || manualText?.lastFrame || t.storyboard.video || '视频';
  const referenceHeading = manualText?.subjectReference || '主体参考';
  const referencePlaceholder =
    manualText?.subjectReferencePlaceholder || '上传主体参考图（可多张）';

  const registerPromptRef = useCallback((rowId: string, node: HTMLTextAreaElement | null) => {
    if (!node) {
      promptRefs.current.delete(rowId);
      return;
    }
    promptRefs.current.set(rowId, node);
  }, []);

  const focusPromptField = useCallback((rowId: string | null) => {
    if (!rowId) return;
    const target = promptRefs.current.get(rowId);
    if (!target) return;
    target.focus();
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  function cleanupPreviews() {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current.clear();
  }

  const registerPreviewUrl = (url?: string) => {
    if (url && url.startsWith('blob:')) {
      previewUrlsRef.current.add(url);
    }
  };

  const revokePreviewUrl = (url?: string) => {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
      previewUrlsRef.current.delete(url);
    }
  };

  const getDropKey = (rowId: string, type: FrameType) => `${rowId}-${type}`;
  const getReferenceDropKey = (rowId: string) => `${rowId}-reference`;

  const isFileDrag = (event: DragEvent<HTMLElement>) => {
    const types = Array.from(event.dataTransfer?.types ?? []);
    return types.includes('Files');
  };

  const handleDragOverZone = (
    event: DragEvent<HTMLLabelElement>,
    rowId: string,
    type: FrameType
  ) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    setDraggingTarget(getDropKey(rowId, type));
  };

  const handleDragLeaveZone = (
    event: DragEvent<HTMLLabelElement>,
    rowId: string,
    type: FrameType
  ) => {
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    setDraggingTarget((prev) => (prev === getDropKey(rowId, type) ? null : prev));
  };

  const handleDropOnZone = (
    event: DragEvent<HTMLLabelElement>,
    rowId: string,
    type: FrameType
  ) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    setDraggingTarget((prev) => (prev === getDropKey(rowId, type) ? null : prev));
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    void assignImageToRow({ rowId, type, file });
  };

  const handleReferenceDragOver = (event: DragEvent<HTMLDivElement>, rowId: string) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    setDraggingTarget(getReferenceDropKey(rowId));
  };

  const handleReferenceDragLeave = (event: DragEvent<HTMLDivElement>, rowId: string) => {
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    setDraggingTarget((prev) => (prev === getReferenceDropKey(rowId) ? null : prev));
  };

  const handleReferenceDrop = (event: DragEvent<HTMLDivElement>, rowId: string) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    setDraggingTarget((prev) => (prev === getReferenceDropKey(rowId) ? null : prev));
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    void handleReferenceFiles(rowId, files);
  };

  const handlePromptChange = (rowId: string, value: string) => {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, prompt: value } : row))
    );
  };

  const handleTimeRangeChange = (rowId: string, value: string) => {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, timeRange: value } : row))
    );
  };

  const openViewerForRow = (row: StoryboardRow, type: FrameType, rowIndex: number) => {
    const gallery = (type === 'firstFrame' ? row.firstGallery : row.lastGallery) ?? [];
    const fallback = row[type] ? [row[type] as FrameAttachment] : [];
    const attachments = gallery.length ? gallery : fallback;
    if (!attachments.length) return;
    const items: ViewerItem[] = attachments
      .filter((att) => att.previewUrl || att.remoteUrl)
      .map((att, idx) => ({
        id: att.id || `${row.id}-${type}-${idx}`,
        url: att.previewUrl || att.remoteUrl || '',
        type: type === 'firstFrame' ? 'image' : 'video',
        remoteUrl: att.remoteUrl || att.previewUrl || '',
        filename: att.filename,
      }));
    if (!items.length) return;
    setActiveViewer({
      rowId: row.id,
      type,
      items,
      rowTitle: `${manualText?.rowTitle || '分镜'} ${rowIndex + 1}`,
      originalPrompt: row.prompt,
      referenceItems: items,
    });
  };

  const handleViewerUpload = async (file: File, type: FrameType): Promise<ViewerItem> => {
    const remoteUrl = await uploadAsset(file);
    return {
      id: generateRowId(),
      url: remoteUrl,
      remoteUrl,
      filename: file.name,
      type: type === 'firstFrame' ? 'image' : 'video',
    };
  };

  const handleViewerSave = (rowId: string, type: FrameType, items: ViewerItem[]) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const attachments: FrameAttachment[] = items.map((item) => ({
          id: item.id,
          previewUrl: item.url,
          remoteUrl: item.remoteUrl || item.url,
          filename: item.filename,
          uploading: false,
          type: item.type,
        }));
        const primary = attachments[0] || null;
        return {
          ...row,
          [type]: primary,
          [type === 'firstFrame' ? 'firstGallery' : 'lastGallery']: attachments,
        };
      })
    );
  };

  const uploadAsset = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok || !data?.url) {
      throw new Error(data?.error || manualText?.uploadFailed || '上传失败');
    }
    return data.url as string;
  };

  const assignImageToRow = async (params: { rowId: string; type: FrameType; file: File }) => {
    const { rowId, type, file } = params;
    const previewUrl = URL.createObjectURL(file);
    registerPreviewUrl(previewUrl);
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        revokePreviewUrl(row[type]?.previewUrl);
        const galleryKey = type === 'firstFrame' ? 'firstGallery' : 'lastGallery';
        const attachment: FrameAttachment = {
          id: generateRowId(),
          previewUrl,
          uploading: true,
          filename: file.name,
          type: type === 'firstFrame' ? 'image' : 'video',
        };
        return {
          ...row,
          [type]: attachment,
          [galleryKey]: [attachment],
        };
      })
    );
    try {
      const remoteUrl = await uploadAsset(file);
      setRows((prev) =>
        prev.map((row) =>
          row.id === rowId
            ? {
                ...row,
                [type]: {
                  ...row[type],
                  previewUrl,
                  remoteUrl,
                  uploading: false,
                  filename: file.name,
                  type: type === 'firstFrame' ? 'image' : 'video',
                },
                [type === 'firstFrame' ? 'firstGallery' : 'lastGallery']: [
                  {
                    previewUrl,
                    remoteUrl,
                    filename: file.name,
                    type: type === 'firstFrame' ? 'image' : 'video',
                  },
                ],
              }
            : row
        )
      );
    } catch (error: any) {
      toast.error(error?.message || manualText?.uploadFailed || '上传失败');
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== rowId) return row;
          revokePreviewUrl(previewUrl);
          return { ...row, [type]: null, [type === 'firstFrame' ? 'firstGallery' : 'lastGallery']: [] };
        })
      );
    }
  };

  const handleSingleFileChange = async (
    rowId: string,
    type: FrameType,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await assignImageToRow({ rowId, type, file });
  };

  const handleFolderFiles = async (type: FrameType, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const sorted = Array.from(files).sort((a, b) => {
      const aPath = (a as File & { webkitRelativePath?: string }).webkitRelativePath || a.name;
      const bPath = (b as File & { webkitRelativePath?: string }).webkitRelativePath || b.name;
      return aPath.localeCompare(bPath, undefined, { numeric: true });
    });

    let snapshot: StoryboardRow[] = [];
    setRows((prev) => {
      const next = [...prev];
      while (next.length < sorted.length) {
        next.push(createEmptyRow());
      }
      snapshot = next;
      return next;
    });

    for (let i = 0; i < sorted.length; i += 1) {
      const row = snapshot[i];
      if (row) {
        await assignImageToRow({ rowId: row.id, type, file: sorted[i] });
      }
    }
  };

  const handleReferenceFiles = async (rowId: string, fileList: FileList | File[]) => {
    const files = Array.isArray(fileList) ? fileList : Array.from(fileList);
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;

    const placeholders = images.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      registerPreviewUrl(previewUrl);
      return {
        id: generateRowId(),
        previewUrl,
        uploading: true,
        filename: file.name,
        type: 'image' as const,
      };
    });

    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, referenceGallery: [...row.referenceGallery, ...placeholders] }
          : row
      )
    );

    await Promise.all(
      placeholders.map(async (placeholder, index) => {
        const file = images[index];
        try {
          const remoteUrl = await uploadAsset(file);
          setRows((prev) =>
            prev.map((row) => {
              if (row.id !== rowId) return row;
              const referenceGallery = row.referenceGallery.map((attachment) =>
                attachment.id === placeholder.id
                  ? { ...attachment, remoteUrl, uploading: false }
                  : attachment
              );
              return { ...row, referenceGallery };
            })
          );
        } catch (error: any) {
          toast.error(error?.message || manualText?.uploadFailed || '上传失败');
          setRows((prev) =>
            prev.map((row) => {
              if (row.id !== rowId) return row;
              const referenceGallery = row.referenceGallery.filter(
                (attachment) => attachment.id !== placeholder.id
              );
              return { ...row, referenceGallery };
            })
          );
          revokePreviewUrl(placeholder.previewUrl);
        }
      })
    );
  };

  const handleReferenceInputChange = (
    rowId: string,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    event.target.value = '';
    if (!files?.length) return;
    void handleReferenceFiles(rowId, files);
  };

  const removeReferenceAttachment = (rowId: string, attachmentKey: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const target = row.referenceGallery.find(
          (attachment) => (attachment.id || attachment.previewUrl) === attachmentKey
        );
        revokePreviewUrl(target?.previewUrl);
        return {
          ...row,
          referenceGallery: row.referenceGallery.filter(
            (attachment) => (attachment.id || attachment.previewUrl) !== attachmentKey
          ),
        };
      })
    );
  };

  const triggerBrowserDownload = (url: string, filename: string) => {
    if (typeof document === 'undefined') return;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.setAttribute('download', filename);
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const buildDownloadFilename = (rowIndex: number, type: FrameType, attachment?: FrameAttachment | null) => {
    const paddedIndex = String(rowIndex + 1).padStart(2, '0');
    const baseName = type === 'firstFrame' ? `first-frame-${paddedIndex}` : `video-${paddedIndex}`;
    const getExtFromSource = (source?: string) => {
      if (!source) return '';
      const sanitized = source.split('?')[0];
      const parts = sanitized.split('.');
      return parts.length > 1 ? parts.pop() ?? '' : '';
    };
    const nameExtension =
      attachment?.filename && attachment.filename.includes('.')
        ? attachment.filename.split('.').pop()
        : '';
    const urlExtension = getExtFromSource(attachment?.remoteUrl || attachment?.previewUrl);
    const fallbackExt = type === 'firstFrame' ? 'png' : 'mp4';
    const extension = (nameExtension || urlExtension || fallbackExt).replace(/[^a-zA-Z0-9]/g, '') || fallbackExt;
    return `${baseName}.${extension}`;
  };

  const handleBatchDownload = (type: FrameType) => {
    setIsDownloadMenuOpen(false);
    const targets = rows
      .map((row, rowIndex) => ({ rowIndex, attachment: row[type] }))
      .filter(({ attachment }) => attachment?.remoteUrl || attachment?.previewUrl);

    if (!targets.length) {
      toast.error(
        type === 'firstFrame'
          ? manualText?.noImagesToDownload || '当前没有可下载的图片'
          : manualText?.noVideosToDownload || '当前没有可下载的视频'
      );
      return;
    }

    targets.forEach(({ rowIndex, attachment }) => {
      const sourceUrl = attachment?.remoteUrl || attachment?.previewUrl;
      if (!sourceUrl) return;
      triggerBrowserDownload(sourceUrl, buildDownloadFilename(rowIndex, type, attachment));
    });

    toast.success(
      type === 'firstFrame'
        ? manualText?.downloadingImages || '已开始批量下载图片'
        : manualText?.downloadingVideos || '已开始批量下载视频'
    );
  };

  const buildSubmissionSegments = (): ManualStoryboardSegmentInput[] =>
    rows
      .map((row) => {
        const prompt = row.prompt?.trim() || '';
        const fallbackFirst = row.firstGallery?.[0];
        const fallbackLast = row.lastGallery?.[0];
        const firstFrameUrl = sanitizePersistableUrl(
          row.firstFrame?.remoteUrl ||
            row.firstFrame?.previewUrl ||
            fallbackFirst?.remoteUrl ||
            fallbackFirst?.previewUrl
        );
        const lastFrameUrl = sanitizePersistableUrl(
          row.lastFrame?.remoteUrl ||
            row.lastFrame?.previewUrl ||
            fallbackLast?.remoteUrl ||
            fallbackLast?.previewUrl
        );
        const timeRange = typeof row.timeRange === 'string' ? row.timeRange.trim() : '';

        if (!prompt && !firstFrameUrl && !lastFrameUrl) {
          return null;
        }

        const segment: ManualStoryboardSegmentInput = {
          prompt,
          firstFrameUrl,
          lastFrameUrl,
        };
        if (timeRange) {
          segment.timeRange = timeRange;
        }
        return segment;
      })
      .filter((segment): segment is ManualStoryboardSegmentInput => Boolean(segment));

  const handleSubmitStoryboard = () => {
    if (isSubmitting) return;
    if (activeUploads) {
      toast.error(manualText?.waitUpload || '请等待所有文件上传完成。');
      return;
    }
    const segments = buildSubmissionSegments();
    if (!segments.length) {
      toast.error(manualText?.needOneRow || '至少保留一行分镜。');
      return;
    }

    startSubmitTransition(async () => {
      try {
        setSubmissionError(null);
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id ?? null;
        const trimmedTitle = taskName?.trim() || manualText?.taskName || '手工分镜任务';
        const result = await createManualStoryboardTask({
          title: trimmedTitle,
          userId,
          segments,
        });
        toast.success(manualText?.success || '手工分镜已创建');
        clearDraftStorage();
        cleanupPreviews();
        const targetTaskId = result?.taskId;
        const destination =
          targetTaskId != null ? `${basePath || ''}/storyboard/${targetTaskId}` : `${basePath || ''}/storyboard`;
        router.push(destination);
      } catch (error: any) {
        const message = error?.message || manualText?.failed || '提交失败，请稍后再试。';
        setSubmissionError(message);
        toast.error(message);
      }
    });
  };

  const handleExcelImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        toast.error(manualText?.excelEmpty || '无法解析 Excel 内容');
        return;
      }
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!json.length) {
        toast.error(manualText?.excelEmpty || '无法解析 Excel 内容');
        return;
      }
      const headers = Object.keys(json[0]);
      const findKey = (patterns: string[]) =>
        headers.find((key) =>
          patterns.some((pattern) => key.toLowerCase().includes(pattern.toLowerCase()))
        );
      const promptKey = findKey(['提示', 'prompt', '描述']) || headers[0];
      const firstKey = findKey(['首', 'first', '开头']);
      const lastKey = findKey(['尾', 'last', 'ending']);
      const timeKey = findKey(['时间段', '时间', 'timerange', 'timeline', 'time']);

      const importedRows: StoryboardRow[] = json
        .map((row) => {
          const promptValue = row[promptKey];
          const firstValue = firstKey ? row[firstKey] : '';
          const lastValue = lastKey ? row[lastKey] : '';
          const timeValue = timeKey ? row[timeKey] : '';
          const firstAttachment =
            typeof firstValue === 'string' && firstValue
              ? { remoteUrl: firstValue, previewUrl: firstValue, type: 'image' as const }
              : null;
          const lastAttachment =
            typeof lastValue === 'string' && lastValue
              ? { remoteUrl: lastValue, previewUrl: lastValue, type: 'video' as const }
              : null;

          return {
            id: generateRowId(),
            prompt: typeof promptValue === 'string' ? promptValue : String(promptValue || ''),
            timeRange:
              typeof timeValue === 'string'
                ? timeValue
                : timeValue != null && timeValue !== ''
                ? String(timeValue)
                : '',
            firstFrame: firstAttachment,
            lastFrame: lastAttachment,
            firstGallery: firstAttachment ? [firstAttachment] : [],
            lastGallery: lastAttachment ? [lastAttachment] : [],
            referenceGallery: [],
          };
        })
        .filter(
          (row) =>
            row.prompt.trim() ||
            row.firstFrame?.remoteUrl ||
            row.lastFrame?.remoteUrl
        );

      if (!importedRows.length) {
        toast.error(manualText?.excelEmpty || 'Excel 中没有有效的提示词');
        return;
      }

      while (importedRows.length < DEFAULT_ROWS) {
        importedRows.push(createEmptyRow());
      }

      cleanupPreviews();
      setRows(importedRows);
      toast.success(manualText?.excelSuccess || '已导入提示词');
    } catch (error: any) {
      console.error(error);
      toast.error(manualText?.excelFailed || '导入失败，请检查 Excel 模板');
    }
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => {
      if (prev.length === 1) return prev;
      const index = prev.findIndex((row) => row.id === rowId);
      const next = prev.filter((row) => row.id !== rowId);
      const removedRow = prev.find((row) => row.id === rowId);
      revokePreviewUrl(removedRow?.firstFrame?.previewUrl);
      revokePreviewUrl(removedRow?.lastFrame?.previewUrl);
      removedRow?.referenceGallery?.forEach((attachment) => revokePreviewUrl(attachment.previewUrl));
      if (selectedRowId === rowId) {
        const fallback = next[Math.min(Math.max(index, 0), next.length - 1)]?.id;
        setSelectedRowId(fallback || next[0]?.id || null);
      }
      return next.length ? next : [createEmptyRow()];
    });
  };

  const removeFrame = (rowId: string, type: FrameType) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        revokePreviewUrl(row[type]?.previewUrl);
        return {
          ...row,
          [type]: null,
        };
      })
    );
  };

  const insertRowAtPosition = useCallback(
    (position: number, options: { focus?: boolean; selectNew?: boolean } = {}) => {
      let newRowId: string | null = null;
      setRows((prev) => {
        const next = [...prev];
        const clamped = Math.max(0, Math.min(position, next.length));
        const newRow = createEmptyRow();
        newRowId = newRow.id;
        next.splice(clamped, 0, newRow);
        return next;
      });
      if (newRowId && options.selectNew !== false) {
        setSelectedRowId(newRowId);
      }
      if (options.focus !== false && newRowId && typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          focusPromptField(newRowId);
        });
      }
    },
    [focusPromptField]
  );

  const addRow = () => {
    insertRowAtPosition(rows.length, { selectNew: true });
  };

  const renderFrameField = (row: StoryboardRow, rowIndex: number, type: FrameType, label: string) => {
    const attachment = row[type];
    const inputId = `${type}-${row.id}`;
    const dropKey = getDropKey(row.id, type);
    const isActive = draggingTarget === dropKey;
    const mediaUrl = attachment?.previewUrl || attachment?.remoteUrl || '';
    const isVideoField = type === 'lastFrame';
    const hasAsset = Boolean(mediaUrl);
    return (
      <div className="relative space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
          {attachment && (
            <button
              type="button"
              onClick={() => removeFrame(row.id, type)}
              className="text-[11px] text-white/60 hover:text-red-300 transition"
            >
              {manualText?.remove || '清除'}
            </button>
          )}
        </div>
        {hasAsset ? (
          <button
            type="button"
            onClick={() => openViewerForRow(row, type, rowIndex)}
            className="group relative block overflow-hidden rounded-[24px] border border-white/10 bg-black/70"
            style={{ aspectRatio: '16 / 9' }}
          >
            {isVideoField ? (
              <video
                src={mediaUrl}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                muted
              />
            ) : (
              <AssetPreview
                src={mediaUrl}
                alt={attachment?.filename || 'preview'}
                className="group-hover:scale-105"
              />
            )}
            <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white bg-black/60 opacity-0 group-hover:opacity-100 transition">
              {t.storyboard.viewOrEdit || '查看 / 编辑'}
            </span>
          </button>
        ) : (
          <label
            htmlFor={inputId}
            aria-label={label}
            className={`block relative rounded-[24px] border border-dashed border-white/15 bg-white/5 p-4 text-white/60 cursor-pointer transition ${
              isActive ? 'border-white/60 bg-white/10' : ''
            }`}
            onDragOver={(event) => handleDragOverZone(event, row.id, type)}
            onDragEnter={(event) => handleDragOverZone(event, row.id, type)}
            onDragLeave={(event) => handleDragLeaveZone(event, row.id, type)}
            onDrop={(event) => handleDropOnZone(event, row.id, type)}
          >
            <div
              className="w-full aspect-video rounded-2xl border border-white/10 bg-black/40 flex items-center justify-center"
            >
              <div className="text-xs text-white/50 flex flex-col items-center text-center px-4">
                <UploadCloud className="h-5 w-5 mb-1" />
                {isVideoField
                  ? manualText?.videoPlaceholder || '点击或拖拽视频到此处'
                  : manualText?.imagePlaceholder || '点击或拖拽图片到此处'}
              </div>
            </div>
            {attachment?.uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-[24px] pointer-events-none">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </div>
            )}
            <input
              id={inputId}
              type="file"
              aria-label={label}
              className="sr-only"
              accept={isVideoField ? 'video/*' : 'image/*'}
              onChange={(event) => handleSingleFileChange(row.id, type, event)}
            />
          </label>
        )}
      </div>
    );
  };

  const renderReferenceField = (row: StoryboardRow, label: string) => {
    const gallery = row.referenceGallery || [];
    const dropKey = getReferenceDropKey(row.id);
    const isActive = draggingTarget === dropKey;
    const inputId = `${dropKey}-input`;
    return (
      <div className="space-y-3">
        <div
          className={`rounded-[28px] border border-dashed ${
            isActive ? 'border-white/60 bg-white/10' : 'border-white/15 bg-white/5'
          } p-4 transition`}
          onDragOver={(event) => handleReferenceDragOver(event, row.id)}
          onDragEnter={(event) => handleReferenceDragOver(event, row.id)}
          onDragLeave={(event) => handleReferenceDragLeave(event, row.id)}
          onDrop={(event) => handleReferenceDrop(event, row.id)}
        >
          {gallery.length ? (
            <div className="grid grid-cols-2 gap-2">
              {gallery.map((attachment) => {
                const mediaUrl = attachment.previewUrl || attachment.remoteUrl;
                if (!mediaUrl) return null;
                return (
                  <div
                    key={attachment.id}
                    className="group relative aspect-square rounded-2xl overflow-hidden border border-white/10 bg-black/40"
                  >
                    <img src={mediaUrl} alt={attachment.filename || 'reference'} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() =>
                        removeReferenceAttachment(
                          row.id,
                          attachment.id || attachment.previewUrl || ''
                        )
                      }
                      className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white text-xs opacity-0 transition group-hover:opacity-100 hover:bg-black/90"
                      aria-label={manualText?.remove || '清除'}
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {attachment.uploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    )}
                  </div>
                );
              })}
              <label
                htmlFor={inputId}
                className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 text-xs text-white/70 hover:border-white/60 hover:text-white transition"
              >
                <Plus className="h-4 w-4 mb-1" />
                {manualText?.addReference || '添加参考'}
              </label>
            </div>
          ) : (
            <label
              htmlFor={inputId}
              className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center text-center text-xs text-white/60 gap-2"
            >
              <UploadCloud className="h-5 w-5" />
              <span>{label}</span>
              <span className="text-[11px] text-white/40">
                {manualText?.multiImageHint || '支持多张图片，拖拽或点击上传'}
              </span>
            </label>
          )}
        </div>
        <input
          id={inputId}
          type="file"
          className="sr-only"
          multiple
          accept="image/*"
          onChange={(event) => handleReferenceInputChange(row.id, event)}
        />
      </div>
    );
  };

  const summarizePrompt = (value?: string | null) => {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      return manualText?.promptPlaceholder || '描述镜头、景别、动作…';
    }
    const firstLine =
      trimmed
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) || trimmed;
    return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
  };

  const handleSelectRow = (rowId: string, options: { focus?: boolean } = {}) => {
    setSelectedRowId(rowId);
    if (options.focus !== false) {
      focusPromptField(rowId);
    }
  };

  const handleNavigateRow = (direction: 'prev' | 'next') => {
    if (!rows.length) return;
    if (selectedRowIndex < 0) {
      setSelectedRowId(rows[0].id);
      return;
    }
    const delta = direction === 'prev' ? -1 : 1;
    const nextIndex = (selectedRowIndex + delta + rows.length) % rows.length;
    const targetId = rows[nextIndex]?.id;
    if (targetId) {
      setSelectedRowId(targetId);
      focusPromptField(targetId);
    }
  };

  const handlePreviewAction = (action: 'reference' | 'edit' | 'regenerate' | 'share' | 'download') => {
    switch (action) {
      case 'reference':
        toast.success(t.storyboard.sceneRef || '用作参考图');
        break;
      case 'edit':
        toast.success(t.storyboard.partialEdit || '局部修改');
        break;
      case 'regenerate':
        toast.success(t.storyboard.regenerate || t.storyboard.generate || '重新生成');
        break;
      case 'share':
        toast.success(t.storyboard.share || '分享');
        break;
      case 'download': {
        const targetAsset = selectedFirstAsset || selectedLastAsset;
        const url = targetAsset?.remoteUrl || targetAsset?.previewUrl;
        if (url) {
          triggerBrowserDownload(
            url,
            buildDownloadFilename(
              selectedRowIndex >= 0 ? selectedRowIndex : 0,
              targetAsset?.type === 'video' ? 'lastFrame' : 'firstFrame',
              targetAsset || undefined
            )
          );
        } else {
          toast.error(manualText?.noImagesToDownload || '当前没有可下载的素材');
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <>
      <div className="-mx-8 -mb-8 min-h-screen bg-[#050505] text-white">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#050505]/90 backdrop-blur">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-3 sm:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 items-center gap-4 min-w-0">
                {renderViewTabs()}
                <input
                  type="text"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  className="flex-1 min-w-0 border-none bg-transparent text-2xl font-semibold text-white placeholder:text-white/40 focus:outline-none focus:ring-0"
                  placeholder={manualText?.taskNamePlaceholder || '新的任务'}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => excelInputRef.current?.click()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:border-white/50 hover:text-white"
                  title={manualText?.importPrompts || '导入提示词'}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => firstFolderInputRef.current?.click()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:border-white/50 hover:text-white"
                  title={manualText?.importFirst || '导入首帧图'}
                >
                  <FolderOpen className="h-4 w-4" />
                </button>
                <div className="relative" ref={downloadMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsDownloadMenuOpen((prev) => !prev)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:border-white/50 hover:text-white"
                    aria-expanded={isDownloadMenuOpen}
                    title={manualText?.batchDownload || '批量下载'}
                  >
                    <Download className="h-4 w-4" />
                    <ChevronDown
                      className={`absolute -right-1 -bottom-1 h-3 w-3 text-white/50 transition ${isDownloadMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isDownloadMenuOpen && (
                    <div className="absolute right-0 z-20 mt-2 w-48 space-y-1 rounded-2xl border border-white/10 bg-[#111]/95 p-2 shadow-2xl">
                      <button
                        type="button"
                        onClick={() => handleBatchDownload('firstFrame')}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-white/80 transition hover:bg-white/5"
                      >
                        <ImageIcon className="h-4 w-4" />
                        {manualText?.downloadImages || '批量下载图片'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBatchDownload('lastFrame')}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-white/80 transition hover:bg-white/5"
                      >
                        <Clapperboard className="h-4 w-4" />
                        {manualText?.downloadVideos || '批量下载视频'}
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSubmitStoryboard}
                  disabled={isSubmitting || activeUploads}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/90 px-4 py-1.5 text-xs font-semibold text-gray-900 shadow-theme-glow transition hover:scale-[1.01] hover:bg-white',
                    (isSubmitting || activeUploads) && 'cursor-not-allowed opacity-60 hover:scale-100'
                  )}
                  aria-busy={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {manualText?.creating || '提交中...'}
                    </>
                  ) : (
                    <>
                      <Clapperboard className="h-3.5 w-3.5" />
                      {manualText?.create || manualText?.createTask || '提交手工分镜'}
                    </>
                  )}
                </button>
                {timelineLink && (
                  <Link
                    href={timelineLink.href}
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold text-white hover:border-white/60"
                  >
                    <Clock3 className="h-3.5 w-3.5" />
                    {timelineLink.label || timelineTabLabel}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8 -mt-1.5">
          {activeView === 'board' ? (
            selectedRow ? (
              <div className="flex flex-col gap-6 xl:flex-row">
                <aside className="w-full xl:w-64 flex flex-col rounded-[32px] border border-white/10 bg-white/5 p-4">
                  <div className="mb-4 flex items-center justify-between text-[11px] uppercase tracking-wide text-white/60">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {t.storyboard.selected || '已选中'}
                    </span>
                    <span>
                      {rows.length} {manualText?.segments || 'Shots'}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    <button
                      type="button"
                      onClick={addRow}
                      className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-black/20 px-4 py-6 text-sm text-white/70 transition hover:border-white/60 hover:text-white"
                    >
                      <Plus className="h-5 w-5" />
                      {manualText?.addRow || '新增行'}
                    </button>
                    {rows.map((row, index) => {
                      const thumbnailAsset =
                        row.firstFrame ||
                        row.firstGallery?.[0] ||
                        row.lastFrame ||
                        row.lastGallery?.[0] ||
                        null;
                      const thumbnailUrl = thumbnailAsset?.previewUrl || thumbnailAsset?.remoteUrl;
                      const isVideoThumb = thumbnailAsset?.type === 'video';
                      const isSelected = row.id === selectedRow?.id;
                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => handleSelectRow(row.id, { focus: false })}
                          className={clsx(
                            'w-full text-left rounded-[28px] border px-3 py-3 transition',
                            isSelected
                              ? 'border-white bg-white/15 shadow-theme-glow'
                              : 'border-white/10 bg-black/30 hover:border-white/40'
                          )}
                        >
                          <div className="relative mb-3 aspect-[3/4] overflow-hidden rounded-2xl bg-black/30">
                            {thumbnailUrl ? (
                              isVideoThumb ? (
                                <video src={thumbnailUrl} muted className="h-full w-full object-cover" />
                              ) : (
                                <img src={thumbnailUrl} alt={`shot-${index + 1}`} className="h-full w-full object-cover" />
                              )
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-white/50">
                                {manualText?.imagePlaceholder || '上传首帧图'}
                              </div>
                            )}
                            {thumbnailAsset?.uploading && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                <Loader2 className="h-4 w-4 animate-spin text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-white/60">
                            <span>{`${manualText?.rowTitle || '分镜'} ${index + 1}`}</span>
                            <span>{row.timeRange || '--:--'}</span>
                          </div>
                          <p className="mt-2 text-sm text-white/80 line-clamp-2">{summarizePrompt(row.prompt)}</p>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-[11px] text-white/50">
                    {manualText?.primaryHint || '第一张素材会作为分镜主图/视频'}
                  </p>
                </aside>

                <section className="flex-1 rounded-[32px] border border-white/10 bg-white/5 p-6 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-white/50">{selectedRowLabel}</p>
                      <p className="text-sm text-white/70">
                        {selectedRow?.timeRange || manualText?.timeRangeLabel || '时间段未设置'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {previewActions.map((action) => (
                        <button
                          key={action.key}
                          type="button"
                          onClick={() => handlePreviewAction(action.key)}
                          className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 transition hover:border-white/60 hover:text-white"
                        >
                          <action.icon className="h-3.5 w-3.5" />
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative flex-1 rounded-[32px] border border-white/10 bg-black/70 overflow-hidden">
                    {(() => {
                      const previewAsset = selectedFirstAsset || selectedLastAsset;
                      const previewUrl = previewAsset?.previewUrl || previewAsset?.remoteUrl;
                      if (!previewUrl) {
                        return (
                          <div className="flex h-full items-center justify-center text-white/60 text-sm">
                            {manualText?.imagePlaceholder || '点击左侧添加素材'}
                          </div>
                        );
                      }
                      if (previewAsset?.type === 'video') {
                        return <video src={previewUrl} controls className="h-full w-full object-cover" />;
                      }
                      return <AssetPreview src={previewUrl} alt={selectedRowLabel} />;
                    })()}
                    <div className="absolute left-4 top-4 flex flex-col gap-2 text-xs text-white/70">
                      <span className="rounded-full bg-white/10 px-3 py-1">{selectedRowLabel}</span>
                      <span className="rounded-full bg-white/10 px-3 py-1">
                        {selectedRow?.timeRange || '--:--'}
                      </span>
                    </div>
                    <div className="absolute right-4 top-1/2 flex -translate-y-1/2 flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => handleNavigateRow('prev')}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white hover:border-white/60"
                      >
                        <ChevronUp className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleNavigateRow('next')}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white hover:border-white/60"
                      >
                        <ChevronDown className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {renderFrameField(
                      selectedRow,
                      selectedRowIndex >= 0 ? selectedRowIndex : 0,
                      'firstFrame',
                      firstFrameHeading
                    )}
                    {renderFrameField(
                      selectedRow,
                      selectedRowIndex >= 0 ? selectedRowIndex : 0,
                      'lastFrame',
                      videoHeading
                    )}
                  </div>
                </section>

                <aside className="w-full xl:max-w-[420px] flex flex-col gap-4">
                  <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-white/50">{selectedRowLabel}</p>
                        <h3 className="text-2xl font-semibold text-white">{taskName || selectedRowLabel}</h3>
                      </div>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(selectedRow.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/70 hover:text-red-300"
                          title={manualText?.deleteRow || '删除'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wide text-white/50">
                        {manualText?.timeRangeLabel || '时间段'}
                      </label>
                      <input
                        type="text"
                        value={selectedRow?.timeRange || ''}
                        onChange={(event) => handleTimeRangeChange(selectedRow.id, event.target.value)}
                        className="w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
                        placeholder="00:00-00:05"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wide text-white/50">{promptHeading}</label>
                      <textarea
                        id={`storyboard-row-${selectedRow.id}-prompt`}
                        ref={(node) => registerPromptRef(selectedRow.id, node)}
                        className="w-full min-h-[180px] rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
                        placeholder={manualText?.promptPlaceholder || '输入想要描述的镜头、景别、动作…'}
                        value={selectedRow.prompt}
                        onChange={(e) => handlePromptChange(selectedRow.id, e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">{referenceHeading}</p>
                      <span className="text-xs text-white/60">
                        {(selectedRow.referenceGallery?.length || 0).toString().padStart(2, '0')}
                      </span>
                    </div>
                    {renderReferenceField(selectedRow, referencePlaceholder)}
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 text-xs text-white/60">
                    {submissionError ? (
                      <span className="text-red-300">{submissionError}</span>
                    ) : activeUploads ? (
                      manualText?.uploading || '图片上传中…'
                    ) : (
                      manualText?.footerHint || '填写内容会自动保存，无需额外操作。'
                    )}
                  </div>
                </aside>
              </div>
            ) : (
              <div className="rounded-[32px] border border-dashed border-white/20 bg-white/5 p-12 text-center text-white/70">
                {manualText?.needOneRow || '至少保留一行分镜。'}
              </div>
            )
          ) : (
            <section className="space-y-6">
              {timelinePreviewRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/20 bg-white/5 py-16 text-sm text-white/70">
                  <Clock3 className="h-10 w-10 text-white/40" />
                  <p className="mt-3 text-center">{timelinePreviewEmpty}</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {timelinePreviewRows.map((row, index) => {
                    const firstAssetUrl = row.firstAsset?.previewUrl || row.firstAsset?.remoteUrl;
                    const lastAssetUrl = row.lastAsset?.previewUrl || row.lastAsset?.remoteUrl;
                    const isLastVideo = row.lastAsset?.type === 'video';
                    return (
                      <div
                        key={row.id}
                        className="flex gap-4 rounded-3xl border border-white/10 bg-[#0c0c0f] p-5"
                      >
                        <div className="flex flex-col items-center">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-theme-glow">
                            {row.order}
                          </span>
                          {index < timelinePreviewRows.length - 1 && (
                            <span className="mt-2 w-px flex-1 bg-white/10" />
                          )}
                        </div>
                        <div className="flex-1 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-white/40">
                                {manualText?.timeRangeLabel || '时间段'}
                              </p>
                              <p className="font-mono text-sm text-white">
                                {row.timeRange || '--:--'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveView('board');
                                focusPromptField(row.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white hover:border-white/60"
                            >
                              {t.storyboard.viewOrEdit || '查看 / 编辑'}
                            </button>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-white/40">
                              {promptHeading}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-white/5 p-4 text-sm text-white/90">
                              {row.prompt || manualText?.promptPlaceholder || '暂无提示词'}
                            </p>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            {firstAssetUrl && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-white/40">
                                  {firstFrameHeading}
                                </p>
                                <div className="mt-2 aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                                  <AssetPreview
                                    src={firstAssetUrl}
                                    alt={`${firstFrameHeading} ${row.order}`}
                                  />
                                </div>
                              </div>
                            )}
                            {lastAssetUrl && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-white/40">
                                  {videoHeading}
                                </p>
                                <div className="mt-2 aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                                  {isLastVideo ? (
                                    <video
                                      src={lastAssetUrl}
                                      controls
                                      className="h-full w-full object-cover"
                                      poster={row.firstAsset?.previewUrl || row.firstAsset?.remoteUrl}
                                    />
                                  ) : (
                                    <AssetPreview
                                      src={lastAssetUrl}
                                      alt={`${videoHeading} ${row.order}`}
                                    />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </main>
        <input
          ref={excelInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleExcelImport}
        />
        <input
          ref={(node) => {
            if (node) {
              node.setAttribute('webkitdirectory', 'true');
              node.setAttribute('directory', 'true');
              firstFolderInputRef.current = node;
            }
          }}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => handleFolderFiles('firstFrame', event.target.files)}
        />
        {activeViewer && (
          <StoryboardAssetViewer
            isOpen={!!activeViewer}
            onClose={() => setActiveViewer(null)}
            items={activeViewer.items}
            initialIndex={0}
            segmentTitle={activeViewer.rowTitle}
            mode={activeViewer.type === 'firstFrame' ? 'image' : 'video'}
            originalPrompt={activeViewer.originalPrompt}
            referenceItems={activeViewer.referenceItems}
            onSave={(items) => {
              handleViewerSave(activeViewer.rowId, activeViewer.type, items);
              setActiveViewer(null);
            }}
            onUploadAsset={(file) => handleViewerUpload(file, activeViewer.type)}
          />
        )}
      </div>
    </>
  );
}
