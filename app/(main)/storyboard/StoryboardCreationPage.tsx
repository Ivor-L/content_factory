'use client';

/* eslint-disable @next/next/no-img-element -- Storyboard creation page renders direct previews */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { DragEvent } from 'react';
import Link from 'next/link';
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
  Image as ImageIcon,
  Clapperboard,
  Clock3,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTenant } from '@/hooks/useTenant';
import { StoryboardAssetViewer, ViewerItem } from './StoryboardAssetViewer';
import { useSidebarAutoCollapse } from '@/hooks/useSidebarAutoCollapse';

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
  const { t } = useLanguage();
  const { tenantSlug, isLoading: tenantLoading } = useTenant();
  useSidebarAutoCollapse(true, true);
  const [rows, setRows] = useState<StoryboardRow[]>(() => hydrateRowsFromPrefill(initialData));
  const [taskName, setTaskName] = useState(() => initialData?.taskName || '新的任务');
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
  const [hoveredGap, setHoveredGap] = useState<number | null>(null);
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
    setRows(hydrateRowsFromPrefill(initialData));
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

  const manualText = t.storyboard.manual;
  const storyboardTabLabel = manualText?.storyboardTab || '分镜板';
  const timelineTabLabel = manualText?.timelineTab || '时间轴';

  const renderViewTabs = () => (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {(['board', 'timeline'] as const).map((view) => {
        const isActive = activeView === view;
        const label = view === 'board' ? storyboardTabLabel : timelineTabLabel;
        const Icon = view === 'board' ? Clapperboard : Clock3;
        const activeTextClass = 'text-primary-foreground';
        return (
          <button
            key={view}
            type="button"
            onClick={() => setActiveView(view)}
            className={`relative inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors overflow-hidden ${
              isActive ? activeTextClass : 'text-white/80 bg-gray-900/70'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="storyboard-tab-highlight"
                className={`absolute inset-0 rounded-full ${
                  view === 'board'
                    ? 'bg-gradient-to-r from-primary-soft via-primary to-primary-active'
                    : 'bg-primary'
                }`}
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
            <span className="relative inline-flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {label}
            </span>
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
      const next = prev.filter((row) => row.id !== rowId);
      const removedRow = prev.find((row) => row.id === rowId);
      revokePreviewUrl(removedRow?.firstFrame?.previewUrl);
      revokePreviewUrl(removedRow?.lastFrame?.previewUrl);
      removedRow?.referenceGallery?.forEach((attachment) => revokePreviewUrl(attachment.previewUrl));
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
    (position: number, options: { focus?: boolean } = {}) => {
      let newRowId: string | null = null;
      setRows((prev) => {
        const next = [...prev];
        const clamped = Math.max(0, Math.min(position, next.length));
        const newRow = createEmptyRow();
        newRowId = newRow.id;
        next.splice(clamped, 0, newRow);
        return next;
      });
      setHoveredGap(null);
      if (options.focus !== false && newRowId && typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          focusPromptField(newRowId);
        });
      }
    },
    [focusPromptField]
  );

  const addRow = () => {
    insertRowAtPosition(rows.length);
  };

  const renderFrameField = (row: StoryboardRow, rowIndex: number, type: FrameType, label: string) => {
    const attachment = row[type];
    const inputId = `${type}-${row.id}`;
    const dropKey = getDropKey(row.id, type);
    const isActive = draggingTarget === dropKey;
    const mediaUrl = attachment?.previewUrl || attachment?.remoteUrl;
    const isVideoField = type === 'lastFrame';
    const hasAsset = Boolean(mediaUrl);
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-end min-h-[1.25rem]">
          {attachment && (
            <button
              type="button"
              onClick={() => removeFrame(row.id, type)}
              className="px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-500 hover:text-red-500 hover:border-red-200 transition"
            >
              {manualText?.remove || '清除'}
            </button>
          )}
        </div>
        {hasAsset ? (
          <button
            type="button"
            onClick={() => openViewerForRow(row, type, rowIndex)}
            className="group block relative rounded-2xl border border-gray-200 dark:border-gray-700 bg-black/80 overflow-hidden aspect-video"
            style={{ aspectRatio: '16 / 9' }}
          >
            {isVideoField ? (
              <video src={mediaUrl} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" muted />
            ) : (
              <img
                src={mediaUrl}
                alt={attachment?.filename || 'preview'}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
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
            className={`block relative rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 cursor-pointer transition ${
              isActive ? 'border-black/60 bg-white dark:border-white/60 dark:bg-gray-700/60' : ''
            }`}
            onDragOver={(event) => handleDragOverZone(event, row.id, type)}
            onDragEnter={(event) => handleDragOverZone(event, row.id, type)}
            onDragLeave={(event) => handleDragLeaveZone(event, row.id, type)}
            onDrop={(event) => handleDropOnZone(event, row.id, type)}
          >
            <div
              className="w-full aspect-video rounded-2xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 flex items-center justify-center"
              style={{ aspectRatio: '16 / 9' }}
            >
              <div className="text-xs text-gray-400 flex flex-col items-center text-center px-4">
                <UploadCloud className="h-5 w-5 mb-1" />
                {isVideoField
                  ? manualText?.videoPlaceholder || '点击或拖拽视频到此处'
                  : manualText?.imagePlaceholder || '点击或拖拽图片到此处'}
              </div>
            </div>
            {attachment?.uploading && (
              <div className="absolute inset-0 bg-white/70 dark:bg-black/40 flex items-center justify-center rounded-xl pointer-events-none">
                <Loader2 className="h-4 w-4 animate-spin text-gray-600 dark:text-gray-200" />
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
      <div className="space-y-2">
        <div
          className={`rounded-2xl border border-dashed ${
            isActive ? 'border-black/60 bg-white dark:border-white/60 dark:bg-gray-700/60' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
          } p-3 transition`}
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
                    className="group relative aspect-square rounded-xl overflow-hidden bg-white dark:bg-gray-900"
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
                      className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white text-xs opacity-0 transition group-hover:opacity-100 hover:bg-black/80"
                      aria-label={manualText?.remove || '清除'}
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {attachment.uploading && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    )}
                  </div>
                );
              })}
              <label
                htmlFor={inputId}
                className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-400 dark:hover:text-gray-200"
              >
                <Plus className="h-4 w-4 mb-1" />
                {manualText?.addReference || '添加参考'}
              </label>
            </div>
          ) : (
            <label
              htmlFor={inputId}
              className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center text-center text-xs text-gray-400 gap-2"
            >
              <UploadCloud className="h-5 w-5" />
              <span>{label}</span>
              <span className="text-[11px] text-gray-400">
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

  const formatInsertHint = (position: number) => {
    const rowLabel = (index: number) => `${manualText?.rowTitle || '分镜'} ${index + 1}`;
    const prevIndex = position - 1;
    const nextIndex = position;
    if (prevIndex >= 0 && nextIndex < rows.length) {
      const template =
        manualText?.insertBetween || '在{start}和{end}之间新增一个分镜';
      return template.replace('{start}', rowLabel(prevIndex)).replace('{end}', rowLabel(nextIndex));
    }
    if (nextIndex < rows.length) {
      const template = manualText?.insertBefore || '在{target}之前新增一个分镜';
      return template.replace('{target}', rowLabel(nextIndex));
    }
    if (prevIndex >= 0) {
      const template = manualText?.insertAfter || '在{target}之后新增一个分镜';
      return template.replace('{target}', rowLabel(prevIndex));
    }
    return manualText?.addRow || '新增行';
  };

  const renderInsertControl = (position: number) => {
    const label = formatInsertHint(position);
    const isActive = hoveredGap === position;
    const containerPadding = 'py-2';
    const baseLineTone = 'bg-gray-200 dark:bg-gray-700';
    const activeLineTone = 'bg-black/50 dark:bg-white/70';
    return (
      <div
        key={`insert-control-${position}`}
        className={`relative ${containerPadding}`}
        onMouseEnter={() => setHoveredGap(position)}
        onMouseLeave={() => setHoveredGap((prev) => (prev === position ? null : prev))}
      >
        <div className="relative h-[2px] w-full overflow-hidden rounded-full">
          <div className={`absolute inset-0 ${baseLineTone}`} />
          <div
            className={`absolute inset-0 ${activeLineTone} origin-center transition-transform duration-300 ${
              isActive ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
            }`}
          />
        </div>
        <div className="absolute inset-0">
          <div
            className={`absolute left-1/2 top-1/2 flex flex-col items-center gap-2 transition-all duration-200 ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              transform: `translate(-50%, ${isActive ? '-75%' : '-60%'})`,
            }}
          >
            {label && (
              <div className="pointer-events-none rounded-full bg-black px-3 py-1 text-xs text-white dark:bg-white dark:text-black whitespace-nowrap text-center shadow-sm">
                {label}
              </div>
            )}
            <button
              type="button"
              onClick={() => insertRowAtPosition(position)}
              aria-label={label}
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 shadow transition-colors hover:bg-black hover:text-white dark:border-gray-500 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white dark:hover:text-black"
              tabIndex={isActive ? 0 : -1}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="-m-8 min-h-screen bg-white dark:bg-[#050505]">
        <div className="sticky top-0 z-30 border-b border-gray-200/70 bg-white shadow-lg shadow-black/5 dark:border-gray-800/70 dark:bg-[#050505] dark:shadow-black/40">
          <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-8 md:py-7">
            <div className="flex justify-center">
              {renderViewTabs()}
            </div>
            <header className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-3 flex-1 min-w-[260px] -mt-4">
                  <input
                    type="text"
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                    className="w-full border-none bg-transparent text-4xl font-semibold text-gray-900 focus:outline-none focus:ring-0 dark:text-white"
                    placeholder={manualText?.taskNamePlaceholder || '新的任务'}
                  />
                </div>
                <div className="w-full lg:w-auto">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => excelInputRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700/80"
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                          {manualText?.importPrompts || '导入提示词'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => firstFolderInputRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700/80"
                        >
                          <FolderOpen className="h-4 w-4" />
                          {manualText?.importFirst || '导入首帧图'}
                        </button>
                        <div className="relative" ref={downloadMenuRef}>
                          <button
                            type="button"
                            onClick={() => setIsDownloadMenuOpen((prev) => !prev)}
                            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700/80"
                            aria-expanded={isDownloadMenuOpen}
                          >
                            <Download className="h-4 w-4" />
                            {manualText?.batchDownload || '批量下载'}
                            <ChevronDown
                              className={`h-3 w-3 transition-transform ${isDownloadMenuOpen ? 'rotate-180' : ''}`}
                            />
                          </button>
                          {isDownloadMenuOpen && (
                            <div className="absolute right-0 z-20 mt-2 w-48 space-y-1 rounded-2xl border border-gray-100 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                              <button
                                type="button"
                                onClick={() => handleBatchDownload('firstFrame')}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                              >
                                <ImageIcon className="h-4 w-4" />
                                {manualText?.downloadImages || '批量下载图片'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBatchDownload('lastFrame')}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                              >
                                <Clapperboard className="h-4 w-4" />
                                {manualText?.downloadVideos || '批量下载视频'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addRow}
                      className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-200"
                    >
                      <Plus className="h-4 w-4" />
                      {manualText?.addRow || '新增行'}
                    </button>
                  </div>
                </div>
              </div>
            </header>
            {activeView === 'board' && (
              <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
                <div className="grid grid-cols-1 gap-3 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid-cols-2 lg:grid-cols-5">
                  <span className="md:col-span-2 lg:col-span-2">{promptHeading}</span>
                  <span>{referenceHeading}</span>
                  <span>{firstFrameHeading}</span>
                  <span>{videoHeading}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-10 sm:px-8">
          {activeView === 'board' ? (
            <>
              <section className="space-y-0 pt-6">
                {renderInsertControl(0)}
                <AnimatePresence initial={false}>
                  {rows.map((row, index) => (
                    <motion.div
                      key={row.id}
                      layout
                      initial={{ opacity: 0, y: -16, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 16, scale: 0.98 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                    >
                      <div className="py-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-semibold flex items-center justify-center">
                              {index + 1}
                            </span>
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-200">
                              {manualText?.rowTitle || '分镜'}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                {manualText?.timeRangeLabel || '时间段'}
                              </span>
                              <input
                                type="text"
                                value={row.timeRange}
                                onChange={(e) => handleTimeRangeChange(row.id, e.target.value)}
                                placeholder={manualText?.timeRangePlaceholder || '00:00-00:08'}
                              className="h-8 w-28 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                            </div>
                            {rows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeRow(row.id)}
                                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
                              >
                                <Trash2 className="h-3 w-3" />
                                {manualText?.deleteRow || '删除'}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                          <div className="md:col-span-2 lg:col-span-2 space-y-2">
                            <label htmlFor={`storyboard-row-${row.id}-prompt`} className="sr-only">
                              {promptHeading}
                            </label>
                            <textarea
                              id={`storyboard-row-${row.id}-prompt`}
                              ref={(node) => registerPromptRef(row.id, node)}
                              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-3 text-sm min-h-[160px] focus:outline-none focus:ring-2 focus:ring-primary"
                              placeholder={manualText?.promptPlaceholder || '描述镜头、景别、动作…'}
                              value={row.prompt}
                              onChange={(e) => handlePromptChange(row.id, e.target.value)}
                            />
                          </div>
                          {renderReferenceField(row, referencePlaceholder)}
                          {renderFrameField(row, index, 'firstFrame', manualText?.firstFrame || '首帧图')}
                          {renderFrameField(
                            row,
                            index,
                            'lastFrame',
                            manualText?.lastFrameVideo || manualText?.lastFrame || t.storyboard.video || '视频'
                          )}
                        </div>
                      </div>
                      {renderInsertControl(index + 1)}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </section>

              <footer className="pt-8 border-t border-gray-100 dark:border-gray-800">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {activeUploads
                    ? manualText?.uploading || '图片上传中…'
                    : manualText?.footerHint || '填写内容会自动保存，无需额外操作。'}
                </div>
              </footer>
            </>
          ) : (
            <section className="space-y-6 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">
                    {timelinePreviewTitle}
                  </p>
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{taskName}</h2>
                </div>
                {timelineLink?.href && (
                  <Link
                    href={timelineLink.href}
                    className="inline-flex items-center gap-2 rounded-full border border-primary-border/50 bg-primary-soft/60 px-4 py-2 text-xs font-semibold text-primary dark:text-primary-foreground hover:bg-primary-soft transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Clock3 className="h-4 w-4 text-primary" />
                    {timelineLink.label || timelineTabLabel}
                  </Link>
                )}
              </div>
              {timelinePreviewRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 py-16 text-sm text-gray-500 dark:text-gray-300">
                  <Clock3 className="h-10 w-10 text-gray-300 dark:text-gray-600" />
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
                        className="flex gap-4 rounded-3xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/40 p-5"
                      >
                        <div className="flex flex-col items-center">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-theme-glow">
                            {row.order}
                          </span>
                          {index < timelinePreviewRows.length - 1 && (
                            <span className="mt-2 w-px flex-1 bg-gray-200 dark:bg-gray-700" />
                          )}
                        </div>
                        <div className="flex-1 space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                {manualText?.timeRangeLabel || '时间段'}
                              </p>
                              <p className="font-mono text-sm text-gray-900 dark:text-gray-100">
                                {row.timeRange || '--:--'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveView('board');
                                focusPromptField(row.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                            >
                              {t.storyboard.viewOrEdit || '查看 / 编辑'}
                            </button>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                              {promptHeading}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-gray-50 dark:bg-gray-800/60 p-4 text-sm text-gray-700 dark:text-gray-100">
                              {row.prompt || manualText?.promptPlaceholder || '暂无提示词'}
                            </p>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            {firstAssetUrl && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                  {firstFrameHeading}
                                </p>
                                <div className="mt-2 aspect-video w-full overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800 bg-black/5 dark:bg-white/5">
                                  <img
                                    src={firstAssetUrl}
                                    alt={`${firstFrameHeading} ${row.order}`}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              </div>
                            )}
                            {lastAssetUrl && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                  {videoHeading}
                                </p>
                                <div className="mt-2 aspect-video w-full overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800 bg-black/5 dark:bg-white/5">
                                  {isLastVideo ? (
                                    <video
                                      src={lastAssetUrl}
                                      controls
                                      className="h-full w-full object-cover"
                                      poster={row.firstAsset?.previewUrl || row.firstAsset?.remoteUrl}
                                    />
                                  ) : (
                                    <img
                                      src={lastAssetUrl}
                                      alt={`${videoHeading} ${row.order}`}
                                      className="h-full w-full object-cover"
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
        </div>
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
