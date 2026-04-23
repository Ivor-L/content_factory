"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
} from "react";
import { motion, AnimatePresence, easeOut } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";
import {
  ChevronDown,
  RefreshCcw,
  UploadCloud,
  FileText,
  Sparkles,
  Palette,
  Loader2,
  ExternalLink,
  Mic2,
  ListChecks,
  Layers,
  Trash2,
  Shuffle,
  Flag,
  ShieldCheck,
  Bookmark,
  Type,
  LayoutDashboard,
  SunMedium,
  Shapes,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ModeTabs } from "./ModeTabs";
import { getLocalizedStyleName } from "@/lib/styleLocalization";

type Tab = "history" | "stories" | "styles";

type HistoryDoc = {
  id: string;
  title: string;
  channel?: string | null;
  description?: string | null;
  status?: string | null;
  metadata?: Record<string, any> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type PreviewRenderType = "text" | "iframe" | "image";

type HistoryPreviewState = {
  status: "idle" | "loading" | "ready" | "error";
  renderType?: PreviewRenderType;
  content?: string;
  src?: string;
  error?: string;
  contentType?: string;
};

type HistoryDetailTab = "insights" | "original";

interface HistoryInsights {
  summary?: string;
  voice?: {
    name?: string;
    persona?: string;
    toneDescriptors?: string[];
    cadence?: string;
    sentencePatterns?: string[];
    hookAngles?: string[];
    closingMoves?: string[];
    signatureWords?: string[];
  };
  dosAndDonts?: {
    mustInclude?: string[];
    avoid?: string[];
  };
  structure?: {
    sections?: Array<{
      label?: string;
      goal?: string;
      summary?: string;
      keywords?: string[];
    }>;
  };
  reusableBlocks?: {
    hooks?: string[];
    transitions?: string[];
    closers?: string[];
    proofPoints?: string[];
  };
  openingPatterns?: Array<{
    label?: string;
    usage?: string;
    example?: string;
  }>;
  transitionPlaybook?: Array<{
    label?: string;
    pattern?: string;
    usage?: string;
  }>;
  styleRulesDraft?: Record<string, any> | null;
}

type HistoryDocDetail = HistoryDoc & {
  insights?: HistoryInsights | null;
  originalUrl?: string | null;
};

type StoryAsset = {
  id: string;
  title: string;
  summary?: string | null;
  channel?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, any> | null;
  createdAt?: string | null;
  status?: string | null;
};

type StylePreset = {
  id: string;
  name: string;
  type: string;
  userId?: string | null;
  description?: string | null;
  previewUrl?: string | null;
  metadata?: Record<string, any> | null;
  spec?: Record<string, any> | null;
  createdAt?: string | null;
  status?: string | null;
  styleSummary?: string | Record<string, any> | null;
};

const tabOrder: Tab[] = ["history", "stories", "styles"];
const tabIconMap = {
  history: FileText,
  stories: Sparkles,
  styles: Palette,
};

const DEFAULT_STYLE_TYPE = "xhs-visual";

const endpointMap: Record<Tab, string> = {
  history: "/api/assets/history",
  stories: "/api/assets/stories",
  styles: "/api/assets/styles",
};

const inputFieldClass =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/15 dark:focus:ring-white/20 transition";
const DOCUMENT_ACCEPT_TYPES = ".doc,.docx,.pdf,.md,.markdown,.txt";
const HISTORY_CHANNEL_STORAGE_KEY = "assetLibrary.history.lastChannel";
const OFFICE_VIEWER_BASE_URL = "https://view.officeapps.live.com/op/embed.aspx?src=";

const buildHistoryFilename = (title: string) => {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${normalized || "history-doc"}-${Date.now()}.md`;
};

const buildStoryFilename = (title: string) => {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${normalized || "story-asset"}-${Date.now()}.md`;
};

const replacePlaceholders = (
  template: string | undefined,
  values: Record<string, string>
) => {
  if (!template) return "";
  return Object.entries(values).reduce((acc, [key, value]) => {
    return acc.replace(new RegExp(`{${key}}`, "g"), value);
  }, template);
};

const panelMotionProps = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -16, scale: 0.98 },
  transition: { duration: 0.25, ease: easeOut },
};

const textLikeExtensions = new Set(["md", "markdown", "txt", "json", "srt", "ass", "vtt", "csv", "log"]);
const officeExtensions = new Set(["doc", "docx", "ppt", "pptx"]);
const pdfExtensions = new Set(["pdf"]);

const getMetaString = (meta: Record<string, any> | null | undefined, key: string) => {
  const value = meta?.[key];
  return typeof value === "string" && value ? value : undefined;
};

const getFileExtension = (filename?: string | null) => {
  if (!filename) return "";
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot + 1).toLowerCase();
};

const isOfficeDocument = (contentType?: string, filename?: string) => {
  const type = contentType?.toLowerCase() ?? "";
  if (type.includes("officedocument") || type === "application/msword") {
    return true;
  }
  const ext = getFileExtension(filename);
  return officeExtensions.has(ext);
};

const formatPlainTextContent = (input: string) => {
  const normalized = input.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  const withChineseSpacing = normalized.replace(/([。！？])/g, "$1\n");
  const withEnglishSpacing = withChineseSpacing.replace(/([.?!])(\s+)/g, "$1\n");
  const lines = withEnglishSpacing
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.join("\n\n");
};

const isPdfDocument = (contentType?: string, filename?: string) => {
  const type = contentType?.toLowerCase() ?? "";
  if (type === "application/pdf") return true;
  const ext = getFileExtension(filename);
  return pdfExtensions.has(ext);
};

const isImageFile = (contentType?: string) => {
  return Boolean(contentType && contentType.toLowerCase().startsWith("image/"));
};

const isTextLikeFile = (contentType?: string, filename?: string) => {
  const type = contentType?.toLowerCase() ?? "";
  if (type.startsWith("text/")) return true;
  if (
    type === "application/json" ||
    type === "application/xml" ||
    type === "application/x-yaml" ||
    type === "application/rtf"
  ) {
    return true;
  }
  const ext = getFileExtension(filename);
  return textLikeExtensions.has(ext);
};

const buildOfficeViewerUrl = (publicUrl: string) => {
  return `${OFFICE_VIEWER_BASE_URL}${encodeURIComponent(publicUrl)}`;
};

const statusToneClass = (status?: string | null) => {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "processing" || normalized === "pending") {
    return "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/15 dark:text-amber-100 dark:border-amber-500/30";
  }
  if (normalized === "ready" || normalized === "completed") {
    return "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-100 dark:border-emerald-500/30";
  }
  if (normalized === "failed") {
    return "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-500/15 dark:text-rose-100 dark:border-rose-500/30";
  }
  return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700/40 dark:text-gray-100 dark:border-gray-600";
};

const chipColorClasses = [
  "bg-primary-soft text-primary border-primary/30 dark:bg-primary/15 dark:text-primary-foreground dark:border-primary/30",
  "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-500/15 dark:text-rose-50 dark:border-rose-400/40",
  "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/15 dark:text-amber-50 dark:border-amber-400/40",
  "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-50 dark:border-emerald-400/40",
  "bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-500/15 dark:text-teal-50 dark:border-teal-400/40",
  "bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-500/15 dark:text-sky-50 dark:border-sky-400/40",
  "bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-50 dark:border-indigo-400/40",
  "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-500/15 dark:text-violet-50 dark:border-violet-400/40",
  "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100 dark:bg-fuchsia-500/15 dark:text-fuchsia-50 dark:border-fuchsia-400/40",
  "bg-primary-soft text-primary border-primary/30 dark:bg-primary/15 dark:text-primary-foreground dark:border-primary/30",
  "bg-cyan-50 text-cyan-700 border-cyan-100 dark:bg-cyan-500/15 dark:text-cyan-50 dark:border-cyan-400/40",
];

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};

const getChipColorClass = (value: string, index: number) => {
  if (!chipColorClasses.length) return "";
  if (!value) {
    return chipColorClasses[index % chipColorClasses.length];
  }
  const hash = Math.abs(hashString(value));
  return chipColorClasses[hash % chipColorClasses.length];
};

type AssetLibraryProps = {
  showHeader?: boolean;
  initialTab?: Tab;
  tabs?: Tab[];
};

export function AssetLibrary({
  showHeader = true,
  initialTab = "history",
  tabs,
}: AssetLibraryProps) {
  const { t, language } = useLanguage();
  const copy = t.assetLibrary;
  const enabledTabs = useMemo(() => {
    if (!tabs?.length) return tabOrder;
    const filtered = tabOrder.filter((tab) => tabs.includes(tab));
    return filtered.length > 0 ? filtered : tabOrder;
  }, [tabs]);
  const defaultActiveTab = enabledTabs.includes(initialTab)
    ? initialTab
    : enabledTabs[0];
  const channelOptions: { value: string; label: string }[] = useMemo(
    () => (Array.isArray(copy.channelOptions) ? copy.channelOptions : []),
    [copy.channelOptions]
  );

  const [activeTab, setActiveTab] = useState<Tab>(defaultActiveTab);
  const [historyDocs, setHistoryDocs] = useState<HistoryDoc[]>([]);
  const [stories, setStories] = useState<StoryAsset[]>([]);
  const [styles, setStyles] = useState<StylePreset[]>([]);

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);

  const [globalLoading, setGlobalLoading] = useState(false);
  const [tabLoading, setTabLoading] = useState<Record<Tab, boolean>>({
    history: false,
    stories: false,
    styles: false,
  });

  const [historyForm, setHistoryForm] = useState({
    title: "",
    channel: "",
    content: "",
  });
  const [lastHistoryChannel, setLastHistoryChannel] = useState("");
  const [storyForm, setStoryForm] = useState({
    title: "",
    summary: "",
    channel: "",
    content: "",
  });
  const [styleForm, setStyleForm] = useState({
    name: "",
    type: DEFAULT_STYLE_TYPE,
    file: null as File | null,
  });

  const [historyUploading, setHistoryUploading] = useState(false);
  const [historyMode, setHistoryMode] = useState<"manual" | "bulk">("manual");
  const [historyBulkFile, setHistoryBulkFile] = useState<File | null>(null);
  const [historyBulkUploading, setHistoryBulkUploading] = useState(false);
  const [storyMode, setStoryMode] = useState<"manual" | "bulk">("manual");
  const [storyBulkFile, setStoryBulkFile] = useState<File | null>(null);
  const [storyBulkUploading, setStoryBulkUploading] = useState(false);
  const [storyUploading, setStoryUploading] = useState(false);
  const [styleUploading, setStyleUploading] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [isMobileUploadOpen, setIsMobileUploadOpen] = useState(true);
  const [selectedStyle, setSelectedStyle] = useState<StylePreset | null>(null);
  const [selectedHistoryDoc, setSelectedHistoryDoc] = useState<HistoryDoc | null>(null);
  const [historyDetail, setHistoryDetail] = useState<HistoryDocDetail | null>(null);
  const [historyDetailTab, setHistoryDetailTab] = useState<HistoryDetailTab>("insights");
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [historyDetailError, setHistoryDetailError] = useState<string | null>(null);
  const [originalPreviewState, setOriginalPreviewState] = useState<HistoryPreviewState>({
    status: "idle",
  });
  const originalPreviewSourceRef = useRef<string | null>(null);
  const originalPreviewStatusRef = useRef<HistoryPreviewState["status"]>("idle");
  const [historyDeletingId, setHistoryDeletingId] = useState<string | null>(null);
  const [historyDeleteTarget, setHistoryDeleteTarget] = useState<HistoryDoc | null>(null);
  const [isHistoryDeleteModalOpen, setIsHistoryDeleteModalOpen] = useState(false);
  const [storyDeletingId, setStoryDeletingId] = useState<string | null>(null);
  const [styleDeletingId, setStyleDeletingId] = useState<string | null>(null);
  const [styleDeleteTarget, setStyleDeleteTarget] = useState<StylePreset | null>(null);
  const [isStyleDeleteModalOpen, setIsStyleDeleteModalOpen] = useState(false);
  const selectedHistoryDocId = selectedHistoryDoc?.id;
  const selectedStyleId = selectedStyle?.id;

  useEffect(() => {
    if (!selectedHistoryDocId) return;
    setHistoryDetailTab("insights");
  }, [selectedHistoryDocId]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const applyMatch = (matches: boolean) => {
      setIsDesktopViewport(matches);
      if (!matches) {
        setIsMobileUploadOpen(false);
      }
    };
    applyMatch(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      applyMatch(event.matches);
    };
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const openHistoryDeleteModal = useCallback((doc: HistoryDoc) => {
    setHistoryDeleteTarget(doc);
    setIsHistoryDeleteModalOpen(true);
  }, []);

  const closeHistoryDeleteModal = useCallback(() => {
    setIsHistoryDeleteModalOpen(false);
    setHistoryDeleteTarget(null);
  }, []);

  const handleStyleSelect = useCallback((style: StylePreset) => {
    setSelectedStyle(style);
  }, []);

  const closeStyleDetailModal = useCallback(() => {
    setSelectedStyle(null);
  }, []);

  const openStyleDeleteModal = useCallback((style: StylePreset) => {
    setStyleDeleteTarget(style);
    setIsStyleDeleteModalOpen(true);
  }, []);

  const closeStyleDeleteModal = useCallback(() => {
    setIsStyleDeleteModalOpen(false);
    setStyleDeleteTarget(null);
  }, []);

  const historyDeleteMessage = `${copy.history.deleteConfirm || t.common.confirmDelete}${
    historyDeleteTarget?.title ? ` (${historyDeleteTarget.title})` : ""
  }`;
  const styleDeleteMessage = `${copy.styles.deleteConfirm || t.common.confirmDelete || "Delete this style preset?"}${
    styleDeleteTarget?.name ? ` (${styleDeleteTarget.name})` : ""
  }`;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthToken(data.session?.access_token ?? null);
      setAuthChecked(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const formatBytes = useCallback((bytes?: number | null) => {
    if (typeof bytes !== "number" || Number.isNaN(bytes)) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  const formatDate = useCallback((value?: string | null) => {
    if (!value) return "-";
    return new Date(value).toLocaleString();
  }, []);

  useEffect(() => {
    originalPreviewStatusRef.current = originalPreviewState.status;
  }, [originalPreviewState.status]);

  const statusLabel = useCallback(
    (status?: string | null) => {
      const key = (status ?? "pending").toLowerCase();
      return (
        copy.statusText[key as keyof typeof copy.statusText] ??
        status ??
        "Pending"
      );
    },
    [copy]
  );

  const previewMessages = useMemo(
    () => ({
      title: copy.history.previewTitle || copy.common.view,
      loading: copy.history.previewLoading || "正在加载预览…",
      unsupported:
        copy.history.previewUnsupported ||
        "暂不支持在线预览，请下载原文件。",
      failed:
        copy.history.previewFailed ||
        "预览加载失败，请下载原文件。",
    }),
    [
      copy.common.view,
      copy.history.previewFailed,
      copy.history.previewLoading,
      copy.history.previewTitle,
      copy.history.previewUnsupported,
    ]
  );

  const historyDetailTabOptions = useMemo(
    () => [
      {
        value: "insights" as HistoryDetailTab,
        label: copy.history.detailTabs?.insights ?? "解析结果",
        icon: Sparkles,
      },
      {
        value: "original" as HistoryDetailTab,
        label: copy.history.detailTabs?.original ?? copy.common.view,
        icon: FileText,
      },
    ],
    [copy.common.view, copy.history.detailTabs]
  );

  const closeHistoryDetailModal = useCallback(() => {
    setSelectedHistoryDoc(null);
    setHistoryDetail(null);
    setHistoryDetailError(null);
    setHistoryDetailTab("insights");
    setHistoryDetailLoading(false);
    setOriginalPreviewState({ status: "idle" });
    originalPreviewSourceRef.current = null;
  }, []);

  const fetchHistoryDetail = useCallback(
    async (doc: HistoryDoc) => {
      if (!authToken) {
        setHistoryDetailError(copy.common.requiresAuth);
        return;
      }
      setHistoryDetailLoading(true);
      setHistoryDetailError(null);
      try {
        const res = await fetch(`/api/assets/history/${doc.id}`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          cache: "no-store",
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || "Failed to load history doc.");
        }
        setHistoryDetail(payload.data as HistoryDocDetail);
      } catch (error) {
        console.error("Failed to load history detail", error);
        setHistoryDetailError(error instanceof Error ? error.message : "Failed to load history doc.");
      } finally {
        setHistoryDetailLoading(false);
      }
    },
    [authToken, copy.common.requiresAuth]
  );

  const handleHistoryCardClick = useCallback(
    (doc: HistoryDoc) => {
      setSelectedHistoryDoc(doc);
      setHistoryDetailTab("insights");
      setHistoryDetail(null);
      setHistoryDetailError(null);
      setOriginalPreviewState({ status: "idle" });
      originalPreviewSourceRef.current = null;
      if ((doc.status ?? "").toUpperCase() === "READY") {
        void fetchHistoryDetail(doc);
      }
    },
    [fetchHistoryDetail]
  );

  const retryHistoryDetail = useCallback(() => {
    if (!selectedHistoryDoc) return;
    if ((selectedHistoryDoc.status ?? "").toUpperCase() !== "READY") return;
    void fetchHistoryDetail(selectedHistoryDoc);
  }, [fetchHistoryDetail, selectedHistoryDoc]);

  const loadOriginalPreview = useCallback(
    async (doc?: HistoryDocDetail | HistoryDoc | null) => {
      if (!doc) {
        setOriginalPreviewState({ status: "error", error: previewMessages.unsupported });
        return;
      }
      const meta = doc.metadata || {};
      const publicUrl =
        (doc as HistoryDocDetail)?.originalUrl ||
        getMetaString(meta as Record<string, any>, "publicUrl");
      if (!publicUrl) {
        setOriginalPreviewState({
          status: "error",
          error: copy.history.originalUnavailable || previewMessages.unsupported,
        });
        originalPreviewSourceRef.current = null;
        return;
      }
      if (
        originalPreviewSourceRef.current === publicUrl &&
        originalPreviewStatusRef.current === "ready"
      ) {
        return;
      }
      originalPreviewSourceRef.current = publicUrl;
      const filename = getMetaString(meta as Record<string, any>, "originalFilename") || doc.title;
      const contentType = getMetaString(meta as Record<string, any>, "contentType");

      if (isOfficeDocument(contentType, filename)) {
        setOriginalPreviewState({
          status: "ready",
          renderType: "iframe",
          src: buildOfficeViewerUrl(publicUrl),
          contentType,
        });
        return;
      }

      if (isPdfDocument(contentType, filename)) {
        setOriginalPreviewState({
          status: "ready",
          renderType: "iframe",
          src: publicUrl,
          contentType,
        });
        return;
      }

      if (isImageFile(contentType)) {
        setOriginalPreviewState({
          status: "ready",
          renderType: "image",
          src: publicUrl,
          contentType,
        });
        return;
      }

      if (isTextLikeFile(contentType, filename)) {
        setOriginalPreviewState({
          status: "loading",
          contentType,
        });
        try {
          const response = await fetch(publicUrl);
          if (!response.ok) {
            throw new Error(`Preview request failed (${response.status})`);
          }
          const text = await response.text();
          const formatted = formatPlainTextContent(text);
          setOriginalPreviewState({
            status: "ready",
            renderType: "text",
            content: formatted,
            contentType,
          });
        } catch (error) {
          console.error("History preview failed", error);
          setOriginalPreviewState({
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : previewMessages.failed,
            contentType,
          });
        }
        return;
      }

      setOriginalPreviewState({
        status: "error",
        error: previewMessages.unsupported,
        contentType,
      });
    },
    [
      copy.history.originalUnavailable,
      previewMessages.failed,
      previewMessages.unsupported,
    ]
  );

  useEffect(() => {
    if (!selectedHistoryDoc) return;
    if (historyDetailTab !== "original") return;
    const sourceDoc = historyDetail ?? selectedHistoryDoc;
    void loadOriginalPreview(sourceDoc);
  }, [historyDetail, historyDetailTab, loadOriginalPreview, selectedHistoryDoc]);

  useEffect(() => {
    if (!selectedHistoryDoc) return;
    const baseDoc = historyDetail ?? selectedHistoryDoc;
    const meta =
      baseDoc.metadata && typeof baseDoc.metadata === "object"
        ? (baseDoc.metadata as Record<string, any>)
        : {};
    const hasInsights =
      Boolean(historyDetail?.insights) &&
      (selectedHistoryDoc.status ?? "").toUpperCase() === "READY";
    const hasOriginal =
      Boolean(historyDetail?.originalUrl) ||
      Boolean(getMetaString(meta, "publicUrl"));
    const available: HistoryDetailTab[] = [];
    if (hasInsights) available.push("insights");
    if (hasOriginal) available.push("original");
    if (!available.length) {
      setHistoryDetailTab("insights");
      return;
    }
    if (!available.includes(historyDetailTab)) {
      setHistoryDetailTab(available[0]);
    }
  }, [historyDetail, historyDetailTab, selectedHistoryDoc]);

  const handleHistoryDelete = useCallback(
    async () => {
      const doc = historyDeleteTarget;
      if (!doc) return;
      if (!authToken) {
        toast.error(copy.common.requiresAuth);
        return;
      }
      setHistoryDeletingId(doc.id);
      try {
        const res = await fetch(`/api/assets/history/${doc.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || "Delete failed");
        }
        setHistoryDocs((prev) => prev.filter((item) => item.id !== doc.id));
        if (selectedHistoryDocId === doc.id) {
          closeHistoryDetailModal();
        }
        toast.success(copy.history.deleteSuccess || t.common.success);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Delete failed"
        );
      } finally {
        setHistoryDeletingId((current) =>
          current === doc.id ? null : current
        );
      }
    },
    [
      authToken,
      closeHistoryDetailModal,
      copy.common.requiresAuth,
      copy.history.deleteSuccess,
      historyDeleteTarget,
      selectedHistoryDocId,
      t.common.success,
    ]
  );

  const handleStoryDelete = useCallback(
    async (story: StoryAsset) => {
      if (!authToken) {
        toast.error(copy.common.requiresAuth);
        return;
      }
      const confirmText =
        copy.stories.deleteConfirm || "确定要删除该案例故事吗？";
      if (typeof window !== "undefined" && !window.confirm(confirmText)) {
        return;
      }
      setStoryDeletingId(story.id);
      try {
        const res = await fetch(`/api/assets/stories/${story.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || "Delete failed");
        }
        setStories((prev) => prev.filter((item) => item.id !== story.id));
        toast.success(copy.stories.deleteSuccess || t.common.success);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Delete failed"
        );
      } finally {
        setStoryDeletingId((current) =>
          current === story.id ? null : current
        );
      }
    },
    [
      authToken,
      copy.common.requiresAuth,
      copy.stories.deleteConfirm,
      copy.stories.deleteSuccess,
      t.common.success,
    ]
  );

  const handleStyleDelete = useCallback(async () => {
    const style = styleDeleteTarget;
    if (!style) return;
    if (!authToken) {
      toast.error(copy.common.requiresAuth);
      return;
    }
    if (!style.userId) {
      return;
    }
    const targetId = style.id;
    setStyleDeletingId(targetId);
    try {
      const res = await fetch(`/api/assets/styles/${style.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "Delete failed");
      }
      setStyles((prev) => prev.filter((item) => item.id !== style.id));
      if (selectedStyleId === style.id) {
        closeStyleDetailModal();
      }
      toast.success(copy.styles.deleteSuccess || t.common.success);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Delete failed"
      );
    } finally {
      setStyleDeletingId((current) =>
        current === targetId ? null : current
      );
    }
  }, [
    authToken,
    closeStyleDetailModal,
    copy.common.requiresAuth,
    copy.styles.deleteSuccess,
    selectedStyleId,
    styleDeleteTarget,
    t.common.success,
  ]);


  const fetchTab = useCallback(
    async (tab: Tab) => {
      if (!authToken) return;
      setTabLoading((prev) => ({ ...prev, [tab]: true }));
      try {
        const res = await fetch(endpointMap[tab], {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          cache: "no-store",
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || "Request failed");
        }
        const data = Array.isArray(payload.data) ? payload.data : [];
        if (tab === "history") {
          setHistoryDocs(data);
        } else if (tab === "stories") {
          setStories(data);
        } else {
          setStyles(data);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Request failed");
      } finally {
        setTabLoading((prev) => ({ ...prev, [tab]: false }));
      }
    },
    [authToken]
  );

  const refreshAll = useCallback(async () => {
    if (!authToken) return;
    setGlobalLoading(true);
    try {
      await Promise.all(enabledTabs.map((tab) => fetchTab(tab)));
    } finally {
      setGlobalLoading(false);
    }
  }, [authToken, enabledTabs, fetchTab]);

  useEffect(() => {
    if (!authChecked) return;
    if (!authToken) {
      setRequiresAuth(true);
      return;
    }
    setRequiresAuth(false);
    void refreshAll();
  }, [authChecked, authToken, refreshAll]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedChannel =
      window.localStorage.getItem(HISTORY_CHANNEL_STORAGE_KEY) ?? "";
    setLastHistoryChannel(savedChannel);
    if (savedChannel) {
      setHistoryForm((prev) => ({ ...prev, channel: savedChannel }));
    }
  }, []);

  useEffect(() => {
    if (!enabledTabs.includes(activeTab)) {
      setActiveTab(defaultActiveTab);
    }
  }, [activeTab, defaultActiveTab, enabledTabs]);

  const resolveChannelValue = useCallback(
    (input: string) => {
      if (!input) return "";
      const trimmed = input.trim();
      const valueMatch = channelOptions.find((option) => option.value === trimmed);
      if (valueMatch) return valueMatch.value;
      const lower = trimmed.toLowerCase();
      const labelMatch = channelOptions.find(
        (option) => option.label.toLowerCase() === lower
      );
      return labelMatch?.value ?? trimmed;
    },
    [channelOptions]
  );

  const handleHistoryChannelChange = useCallback((value: string) => {
    setHistoryForm((prev) => ({ ...prev, channel: value }));
    setLastHistoryChannel(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(HISTORY_CHANNEL_STORAGE_KEY, value);
    }
  }, []);

  const handleHistorySubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!authToken) {
      toast.error(copy.common.requiresAuth);
      return;
    }
    const trimmedContent = historyForm.content.trim();
    if (!trimmedContent) {
      toast.error(copy.history.contentRequired || copy.history.fileLabel);
      return;
    }
    setHistoryUploading(true);
    try {
      const formData = new FormData();
      const fileToUpload = new File(
        [trimmedContent],
        buildHistoryFilename(historyForm.title || ""),
        { type: "text/markdown" }
      );
      formData.append("file", fileToUpload);
      if (historyForm.title) formData.append("title", historyForm.title);
      if (historyForm.channel) formData.append("channel", historyForm.channel);
      formData.append("sourceType", "manual");

      const res = await fetch("/api/assets/history/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "Upload failed");
      }
      setHistoryDocs((prev) => [payload.data, ...prev]);
      setHistoryForm({
        title: "",
        channel: lastHistoryChannel,
        content: "",
      });
      toast.success(t.common.success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setHistoryUploading(false);
    }
  };

  const handleHistoryBulkSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!authToken) {
      toast.error(copy.common.requiresAuth);
      return;
    }
    if (!historyBulkFile) {
      toast.error(copy.history.bulkFileLabel || copy.history.fileLabel);
      return;
    }
    setHistoryBulkUploading(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await historyBulkFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error("Sheet not found");
      }
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
        blankrows: false,
      });
      const parsedRows = rows
        .map((row) => {
          const rawTitle =
            row["标题"] ??
            row["title"] ??
            row["Title"] ??
            row["文案标题"] ??
            "";
          const rawChannel =
            row["使用场景"] ??
            row["渠道"] ??
            row["channel"] ??
            row["Channel"] ??
            row["Scene"] ??
            "";
          const rawBody =
            row["正文"] ??
            row["内容"] ??
            row["body"] ??
            row["Body"] ??
            row["文案"] ??
            "";
          const title = String(rawTitle ?? "").trim();
          const body = String(rawBody ?? "").trim();
          if (!body) return null;
          const channel = resolveChannelValue(String(rawChannel ?? ""));
          return {
            title: title || copy.history.titlePlaceholder || "Untitled",
            channel,
            content: body,
          };
        })
        .filter(
          (
            row
          ): row is { title: string; channel: string; content: string } =>
            Boolean(row && row.content)
        );

      if (!parsedRows.length) {
        throw new Error("No valid rows detected in Excel file.");
      }

      const loadingToast = toast.loading(
        replacePlaceholders(copy.history.bulkProcessing, {
          count: String(parsedRows.length),
        }) || copy.history.bulkProcessing || "Importing..."
      );

      const createdDocs: HistoryDoc[] = [];
      let successCount = 0;

      for (const row of parsedRows) {
        try {
          const file = new File(
            [row.content],
            buildHistoryFilename(row.title),
            { type: "text/markdown" }
          );
          const formData = new FormData();
          formData.append("file", file);
          if (row.title) formData.append("title", row.title);
          if (row.channel) formData.append("channel", row.channel);
          formData.append("sourceType", "bulk");

          const res = await fetch("/api/assets/history/upload", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
            body: formData,
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(payload.error || "Upload failed");
          }
          createdDocs.push(payload.data);
          successCount += 1;
        } catch (error) {
          console.error("Failed to import row", error);
        }
      }

      toast.dismiss(loadingToast);

      if (successCount) {
        setHistoryDocs((prev) => [...createdDocs, ...prev]);
        toast.success(
          replacePlaceholders(copy.history.bulkSuccess, {
            success: String(successCount),
          }) || copy.history.bulkSuccess || "Import completed."
        );
        setHistoryBulkFile(null);
      } else {
        toast.error("Failed to import any rows.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk upload failed");
    } finally {
      setHistoryBulkUploading(false);
    }
  };

  const handleStorySubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!authToken) {
      toast.error(copy.common.requiresAuth);
      return;
    }
    const trimmedContent = storyForm.content.trim();
    if (!trimmedContent) {
      toast.error(copy.stories.contentRequired || copy.stories.summaryPlaceholder);
      return;
    }
    setStoryUploading(true);
    try {
      const formData = new FormData();
      const file = new File(
        [trimmedContent],
        buildStoryFilename(storyForm.title || ""),
        { type: "text/markdown" }
      );
      formData.append("file", file);
      if (storyForm.title) formData.append("title", storyForm.title);

      const res = await fetch("/api/assets/stories/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "Upload failed");
      }
      setStories((prev) => [payload.data, ...prev]);
      setStoryForm({ title: "", summary: "", channel: "", content: "" });
      toast.success(t.common.success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setStoryUploading(false);
    }
  };

  const handleStoryBulkSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!authToken) {
      toast.error(copy.common.requiresAuth);
      return;
    }
    if (!storyBulkFile) {
      toast.error(copy.stories.bulkFileLabel || copy.stories.fileLabel);
      return;
    }
    setStoryBulkUploading(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await storyBulkFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("Sheet not found");
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
        blankrows: false,
      });
      const parsedRows = rows
        .map((row) => {
          const rawTitle =
            row["案例标题"] ??
            row["标题"] ??
            row["title"] ??
            row["Title"] ??
            "";
          const rawSummary =
            row["摘要"] ??
            row["结果"] ??
            row["summary"] ??
            row["Summary"] ??
            row["结论"] ??
            "";
          const rawChannel =
            row["使用场景"] ??
            row["渠道"] ??
            row["channel"] ??
            row["Channel"] ??
            "";
          const rawBody =
            row["正文"] ??
            row["内容"] ??
            row["故事"] ??
            row["案例内容"] ??
            row["body"] ??
            row["Body"] ??
            "";
          const rawTags =
            row["标签"] ??
            row["tags"] ??
            row["Tags"] ??
            row["標籤"] ??
            "";

          const body = String(rawBody ?? "").trim();
          if (!body) return null;
          const title = String(rawTitle ?? "").trim();
          const summary = String(rawSummary ?? "").trim();
          const channel = resolveChannelValue(String(rawChannel ?? ""));
          const tags = String(rawTags ?? "")
            .split(/[，,]/)
            .map((tag) => tag.trim())
            .filter(Boolean)
            .join(", ");
          return {
            title: title || copy.stories.titlePlaceholder || "Untitled",
            summary,
            channel,
            tags,
            content: body,
          };
        })
        .filter(
          (
            row
          ): row is {
            title: string;
            summary: string;
            channel: string;
            tags: string;
            content: string;
          } => Boolean(row && row.content)
        );

      if (!parsedRows.length) {
        throw new Error("No valid rows detected in Excel file.");
      }

      const loadingToast = toast.loading(
        replacePlaceholders(copy.stories.bulkProcessing, {
          count: String(parsedRows.length),
        }) || copy.stories.bulkProcessing || "Importing..."
      );

      const createdStories: StoryAsset[] = [];
      let successCount = 0;

      for (const row of parsedRows) {
        try {
          const file = new File(
            [row.content],
            buildStoryFilename(row.title),
            { type: "text/markdown" }
          );
          const formData = new FormData();
          formData.append("file", file);
          if (row.title) formData.append("title", row.title);
          if (row.summary) formData.append("summary", row.summary);
          if (row.channel) formData.append("channel", row.channel);
          if (row.tags) formData.append("tags", row.tags);
          formData.append("sourceType", "bulk");

          const res = await fetch("/api/assets/stories/upload", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
            body: formData,
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(payload.error || "Upload failed");
          createdStories.push(payload.data);
          successCount += 1;
        } catch (error) {
          console.error("Failed to import story row", error);
        }
      }

      toast.dismiss(loadingToast);

      if (successCount) {
        setStories((prev) => [...createdStories, ...prev]);
        toast.success(
          replacePlaceholders(copy.stories.bulkSuccess, {
            success: String(successCount),
          }) || copy.stories.bulkSuccess || "Import completed."
        );
        setStoryBulkFile(null);
      } else {
        toast.error(copy.stories.bulkFailure || "Failed to import stories.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk upload failed");
    } finally {
      setStoryBulkUploading(false);
    }
  };

  const handleStyleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!authToken) {
      toast.error(copy.common.requiresAuth);
      return;
    }
    if (!styleForm.file) {
      toast.error(copy.styles.fileLabel);
      return;
    }
    setStyleUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", styleForm.file);
      formData.append("name", styleForm.name || copy.styles.uploadTitle);
      formData.append("type", styleForm.type || DEFAULT_STYLE_TYPE);
      const res = await fetch("/api/assets/styles/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "Upload failed");
      }
      setStyles((prev) => [payload.data, ...prev]);
      setStyleForm({
        name: "",
        type: DEFAULT_STYLE_TYPE,
        file: null,
      });
      toast.success(t.common.success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setStyleUploading(false);
    }
  };

  const renderHistoryList = () => {
    if (historyDocs.length === 0) {
      return <EmptyState icon={FileText} message={copy.history.empty} />;
    }
    return (
      <div className="space-y-4">
        {historyDocs.map((doc) => {
          const meta = doc.metadata || {};
          const statusValue =
            doc.status ||
            (typeof meta === "object" && meta
              ? (meta as Record<string, any>).processingStatus
              : undefined);
          return (
            <div
              key={doc.id}
              role="button"
              tabIndex={0}
              onClick={() => handleHistoryCardClick(doc)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleHistoryCardClick(doc);
                }
              }}
              className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-shadow duration-300 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-300 dark:focus-visible:outline-gray-600"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-gray-900 dark:text-white break-words">
                    {doc.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {doc.channel || copy.history.channelPlaceholder} · {formatDate(doc.updatedAt || doc.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={statusLabel(statusValue)} status={statusValue} />
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openHistoryDeleteModal(doc);
                    }}
                    disabled={historyDeletingId === doc.id}
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-900 transition-colors hover:text-red-500 disabled:opacity-60 disabled:cursor-not-allowed dark:text-gray-100 dark:hover:text-red-400",
                      "hover:bg-red-50/80 dark:hover:bg-red-500/10"
                    )}
                    aria-label={copy.history.deleteAction || "删除"}
                  >
                    {historyDeletingId === doc.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              {doc.description && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 line-clamp-2">
                  {doc.description}
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-4">
                <span>
                  {copy.common.size}: {formatBytes(meta.size)}
                </span>
                <span>
                  {copy.common.sourceFile}: {meta.contentType || "-"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderStoryList = () => {
    if (stories.length === 0) {
      return <EmptyState icon={Sparkles} message={copy.stories.empty} />;
    }
    return (
      <div className="space-y-4">
        {stories.map((story) => {
          const tags = Array.isArray(story.tags) ? story.tags : [];
          const meta = story.metadata || {};
          const statusValue =
            story.status ||
            (typeof meta === "object" && meta
              ? (meta as Record<string, any>).processingStatus
              : undefined);
          return (
            <div
              key={story.id}
              className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-shadow duration-300"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-gray-900 dark:text-white break-words">
                    {story.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {story.channel || copy.stories.channelPlaceholder} · {formatDate(story.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={statusLabel(statusValue)} status={statusValue} />
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleStoryDelete(story);
                    }}
                    disabled={storyDeletingId === story.id}
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-900 transition-colors hover:text-red-500 disabled:opacity-60 disabled:cursor-not-allowed dark:text-gray-100 dark:hover:text-red-400",
                      "hover:bg-red-50/80 dark:hover:bg-red-500/10"
                    )}
                    aria-label={copy.stories.deleteAction || "删除"}
                  >
                    {storyDeletingId === story.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              {story.summary && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 line-clamp-2">
                  {story.summary}
                </p>
              )}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-medium px-2 py-1 rounded-full bg-primary-soft text-primary dark:bg-primary/15 dark:text-primary-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              {meta.publicUrl && (
                <a
                  href={meta.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-hover mt-4"
                >
                  <ExternalLink size={14} />
                  {copy.common.view}
                </a>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderStyleList = () => {
    const hasStyles = styles.length > 0;
    return hasStyles ? (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {styles.map((style) => {
          const meta = parseMetadata(style.metadata);
          const hasAnalysisData =
            Boolean(meta.analysis) ||
            Boolean(meta.style_dna) ||
            (style.spec && Object.keys(style.spec).length > 0);
          const statusValue =
            style.status ||
            meta.processingStatus ||
            (hasAnalysisData ? "READY" : undefined);
          const typeLabel =
            copy.styles.typeOptions[style.type as keyof typeof copy.styles.typeOptions] ??
            style.type;
          const statusText = statusLabel(statusValue);
          const displayName = getLocalizedStyleName(style, language);
          const isCustomStyle = Boolean(style.userId);
          return (
            <StyleCard
              key={style.id}
              style={style}
              typeLabel={typeLabel}
              statusText={statusText}
              statusValue={statusValue}
              displayName={displayName}
              onSelect={handleStyleSelect}
              isDeletable={isCustomStyle}
              onDelete={openStyleDeleteModal}
              deleteLabel={copy.styles.deleteAction || t.common.delete || "Delete"}
              isDeleting={styleDeletingId === style.id}
            />
          );
        })}
      </div>
    ) : (
      <EmptyState icon={Palette} message={copy.styles.empty} />
    );
  };

  const renderList = () => {
    if (requiresAuth) {
      return (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
          {copy.common.requiresAuth}
        </div>
      );
    }

    if (activeTab === "history") return renderHistoryList();
    if (activeTab === "stories") return renderStoryList();
    return renderStyleList();
  };

  const renderHistoryDetailModal = () => {
    if (!selectedHistoryDoc) return null;
    const baseDoc = historyDetail ?? selectedHistoryDoc;
    const meta =
      baseDoc.metadata && typeof baseDoc.metadata === "object"
        ? (baseDoc.metadata as Record<string, any>)
        : {};
    const filename = getMetaString(meta, "originalFilename") || baseDoc.title;
    const size = typeof meta.size === "number" ? meta.size : undefined;
    const statusValue =
      baseDoc.status ||
      (typeof meta.processingStatus === "string"
        ? meta.processingStatus
        : undefined);
    const statusText = statusLabel(statusValue);
    const publicUrl =
      historyDetail?.originalUrl || getMetaString(meta, "publicUrl");

    const statusUpper = (selectedHistoryDoc.status ?? "").toUpperCase();
    const hasInsights =
      Boolean(historyDetail?.insights) && statusUpper === "READY";
    const hasOriginal = Boolean(publicUrl);
    const availableTabs: HistoryDetailTab[] = ["insights"];
    if (hasOriginal) availableTabs.push("original");
    const currentHistoryDetailTab =
      availableTabs.includes(historyDetailTab) && availableTabs.length
        ? historyDetailTab
        : availableTabs[0];

    return (
      <Modal
        isOpen={Boolean(selectedHistoryDoc)}
        onClose={closeHistoryDetailModal}
        title={
          <div className="flex flex-col gap-1">
            <span>{selectedHistoryDoc.title}</span>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>{selectedHistoryDoc.channel || copy.history.channelPlaceholder}</span>
              <StatusBadge label={statusText} status={statusValue} />
            </div>
          </div>
        }
        maxWidth="max-w-5xl"
      >
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-gray-500 dark:text-gray-400">
            <span>
              {copy.common.sourceFile}: {filename || "-"}
            </span>
            <span>
              {copy.common.size}: {formatBytes(size)}
            </span>
            <span>
              {copy.common.status}: {statusText}
            </span>
          </div>
          {availableTabs.length > 0 && (
            <ModeTabs
              value={(currentHistoryDetailTab || availableTabs[0]) as HistoryDetailTab}
              options={historyDetailTabOptions.filter((option) =>
                availableTabs.includes(option.value)
              )}
              onChange={(val) => setHistoryDetailTab(val as HistoryDetailTab)}
              layoutId="historyDetailTabIndicator"
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1 text-gray-600 shadow-sm dark:border-gray-700 dark:bg-gray-900"
              buttonClassName="px-4 py-1.5 text-sm font-semibold"
              activeClassName="text-white dark:text-gray-900"
              inactiveClassName="text-gray-500 dark:text-gray-400"
              indicatorClassName="bg-gray-900 dark:bg-white shadow"
              indicatorTransition={{ duration: 0.18, ease: "easeOut" }}
            />
          )}
          {historyDetailLoading && (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{copy.history.detailLoading || previewMessages.loading}</span>
            </div>
          )}
          {historyDetailError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 px-4 py-3 text-amber-800 dark:text-amber-100 flex flex-wrap items-center gap-3">
              <span>{historyDetailError}</span>
              <button
                type="button"
                onClick={retryHistoryDetail}
                className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 px-3 py-1 text-xs font-semibold"
              >
                {copy.history.detailRetry || copy.common.refresh}
              </button>
            </div>
          )}
          {currentHistoryDetailTab === "insights" && (
            <>
              {hasInsights && historyDetail?.insights ? (
                <HistoryInsightsSection insights={historyDetail.insights} copy={copy} />
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
                  {copy.history.insightsEmpty}
                </div>
              )}
            </>
          )}
          {currentHistoryDetailTab === "original" && (
            <>
              {originalPreviewState.status === "loading" && (
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{previewMessages.loading}</span>
                </div>
              )}
              {originalPreviewState.status === "error" && (
                <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10 px-4 py-3 text-red-600 dark:text-red-200">
                  {originalPreviewState.error ||
                    copy.history.originalUnavailable ||
                    previewMessages.failed}
                </div>
              )}
              {originalPreviewState.status === "ready" &&
                originalPreviewState.renderType === "text" && (
                  <pre className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-4 text-xs md:text-sm leading-relaxed whitespace-pre-wrap max-h-[65vh] overflow-y-auto font-mono">
                    {originalPreviewState.content}
                  </pre>
                )}
              {originalPreviewState.status === "ready" &&
                originalPreviewState.renderType === "iframe" && (
                  <iframe
                    src={originalPreviewState.src}
                    title={selectedHistoryDoc.title || "history doc preview"}
                    className="w-full h-[70vh] rounded-2xl border border-gray-100 dark:border-gray-800 bg-white"
                    allowFullScreen
                  />
                )}
              {originalPreviewState.status === "ready" &&
                originalPreviewState.renderType === "image" && (
                  <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Remote Supabase previews don't benefit from Next Image optimization */}
                    <img
                      src={originalPreviewState.src}
                      alt={selectedHistoryDoc.title || "history doc"}
                      className="max-h-[70vh] rounded-2xl border border-gray-100 dark:border-gray-800 object-contain"
                    />
                  </div>
                )}
              {!hasOriginal && (
                <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
                  {copy.history.originalUnavailable}
                </div>
              )}
            </>
          )}
          {!availableTabs.length && (
            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
              {copy.history.detailEmpty}
            </div>
          )}
        </div>
      </Modal>
    );
  };

  const renderStyleDetailModal = () => {
    if (!selectedStyle) return null;
    const spec = isPlainRecord(selectedStyle.spec)
      ? (selectedStyle.spec as Record<string, any>)
      : null;
    const meta = parseMetadata(selectedStyle.metadata);
    const typeLabel =
      copy.styles.typeOptions[selectedStyle.type as keyof typeof copy.styles.typeOptions] ??
      selectedStyle.type;
    const displayName = getLocalizedStyleName(selectedStyle, language) || selectedStyle.name;
    const dna = getStyleDnaFromMetadata(meta);
    const derivedStatus =
      selectedStyle.status ||
      meta.processingStatus ||
      (meta.analysis || dna || (spec && Object.keys(spec).length > 0) ? "READY" : undefined);
    const statusText = statusLabel(derivedStatus);
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    const palettePreview = extractPaletteColors(spec, dna).slice(0, 5);
    const summarySection = buildStyleSummarySection(selectedStyle);
    const detailSections = buildStyleDetailSections(selectedStyle);
    const combinedSections = summarySection ? [summarySection, ...detailSections] : detailSections;
    const detailEmptyMessage =
      language === "zh"
        ? "暂无可展示的风格要素。"
        : language === "zh-TW"
        ? "暫無可展示的風格要素。"
        : "No structured style attributes yet.";

    return (
      <Modal
        isOpen={Boolean(selectedStyle)}
        onClose={closeStyleDetailModal}
        title={
          <div className="flex flex-col gap-1">
            <span>{displayName}</span>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>{typeLabel}</span>
              <StatusBadge label={statusText} status={derivedStatus} />
            </div>
          </div>
        }
        maxWidth="max-w-5xl"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="space-y-4">
            <div className="relative w-full aspect-[4/5] rounded-3xl border border-gray-100 dark:border-gray-800 overflow-hidden bg-gray-100 dark:bg-gray-900">
              {selectedStyle.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedStyle.previewUrl}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <StylePreviewPlaceholder spec={spec ?? undefined} />
              )}
            </div>
            {selectedStyle.description && (
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {selectedStyle.description}
              </p>
            )}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span>
                {copy.common.status}: {statusText}
              </span>
              {selectedStyle.createdAt && (
                <span>{formatDate(selectedStyle.createdAt)}</span>
              )}
            </div>
            {palettePreview.length > 0 && (
              <div className="flex items-center gap-2">
                {palettePreview.map((color) => (
                  <span
                    key={color}
                    className="w-6 h-6 rounded-full border border-white shadow"
                    style={{ backgroundColor: color }}
                    aria-label={color}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="space-y-4">
            {detailSections.length ? (
              detailSections.map((section) => (
                <div
                  key={section.title}
                  className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    {section.icon && (
                      <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary-foreground">
                        <section.icon className="w-4 h-4" />
                      </span>
                    )}
                    <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                      {section.title}
                    </p>
                  </div>
                  {section.lines?.length ? (
                    <ul className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                      {section.lines.map((line, index) => (
                        <li key={`${section.title}-${index}`}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  {section.tags?.map((group, groupIndex) => (
                    <div key={`${section.title}-tags-${groupIndex}`} className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {group.label}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.items.map((item, itemIndex) => {
                          const tone = group.tone;
                          const baseClass =
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium";
                          const toneClass =
                            tone === "positive"
                              ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-200"
                              : tone === "negative"
                              ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-200"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-200";
                          return (
                            <span key={`${group.label}-${itemIndex}`} className={`${baseClass} ${toneClass}`}>
                              {item}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                {detailEmptyMessage}
              </div>
            )}
          </div>
        </div>
      </Modal>
    );
  };

  const disableUploads = requiresAuth || !authToken;

  const renderModeTabsSection = (className = "") => {
    if (activeTab !== "history" && activeTab !== "stories") return null;
    return (
      <div className={className}>
        {activeTab === "history" && (
          <ModeTabs
            value={historyMode}
            options={[
              {
                value: "manual",
                label: copy.history.modeTabs?.manual ?? "Manual",
              },
              {
                value: "bulk",
                label: copy.history.modeTabs?.bulk ?? "Bulk",
              },
            ]}
            onChange={(val) => setHistoryMode(val as "manual" | "bulk")}
            className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 p-1"
            buttonClassName="px-4 py-1.5 text-sm font-semibold"
            activeClassName="text-white"
            inactiveClassName="text-gray-600 dark:text-gray-400"
            indicatorClassName="bg-black dark:bg-white text-white shadow"
          />
        )}
        {activeTab === "stories" && (
          <ModeTabs
            value={storyMode}
            options={[
              {
                value: "manual",
                label: copy.stories.modeTabs?.manual ?? "Manual",
              },
              {
                value: "bulk",
                label: copy.stories.modeTabs?.bulk ?? "Bulk",
              },
            ]}
            onChange={(val) => setStoryMode(val as "manual" | "bulk")}
            className="inline-flex rounded-full bg-gray-100 dark:bg-gray-800 p-1"
            buttonClassName="px-4 py-1.5 text-sm font-semibold"
            activeClassName="text-white"
            inactiveClassName="text-gray-600 dark:text-gray-400"
            indicatorClassName="bg-black dark:bg-white text-white shadow"
          />
        )}
      </div>
    );
  };

  const showUploadPanel = isDesktopViewport || isMobileUploadOpen;
  const uploadPanelId = "asset-upload-panel";
  const shouldRenderMobileToggle = !isDesktopViewport;
  const shouldRenderTopTabs = enabledTabs.length > 1;

  const containerPadding = showHeader ? "py-10" : "pt-4 pb-8";

  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${containerPadding} font-sans`}>
      {showHeader && (
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white">
              {copy.title}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-2xl">
              {copy.subtitle}
            </p>
          </div>
          <button
            onClick={() => void refreshAll()}
            disabled={globalLoading || requiresAuth || !authToken}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {globalLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCcw className="w-4 h-4" />
            )}
            {copy.common.refresh}
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl overflow-hidden">
        {shouldRenderTopTabs && (
          <div className="px-6 pt-6 flex gap-3 overflow-x-auto">
            {enabledTabs.map((tab) => {
              const Icon = tabIconMap[tab];
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "relative inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold transition-all border overflow-hidden",
                    isActive
                      ? "btn-openclaw border-transparent shadow-none"
                      : "bg-gray-50 dark:bg-gray-800 border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  )}
                >
                  <span className="relative flex items-center gap-2">
                    <Icon className="hidden h-4 w-4 sm:block" aria-hidden="true" />
                    <span>{copy.tabs[tab]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {renderModeTabsSection("px-6 pt-4 hidden sm:block")}
        {shouldRenderMobileToggle && (
          <div className="px-6 pt-4 flex justify-end sm:hidden">
            <button
              type="button"
              aria-expanded={isMobileUploadOpen}
              aria-controls={uploadPanelId}
              onClick={() => setIsMobileUploadOpen((prev) => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              aria-label={isMobileUploadOpen ? "Collapse upload panel" : "Expand upload panel"}
            >
              <UploadCloud
                className={cn(
                  "h-5 w-5 transition-transform",
                  isMobileUploadOpen ? "text-blue-600 rotate-6" : undefined
                )}
                aria-hidden="true"
              />
            </button>
          </div>
        )}

        <div className="px-6 pb-8 pt-6 grid gap-6 lg:grid-cols-[360px,1fr]">
          <div
            id={uploadPanelId}
            className={cn(
              "space-y-6",
              showUploadPanel ? "block" : "hidden sm:block"
            )}
          >
            {renderModeTabsSection("mb-4 sm:hidden")}
            {activeTab === "history" && (
              <AnimatePresence mode="wait">
                {historyMode === "manual" ? (
                  <motion.div key="history-manual" {...panelMotionProps}>
                    <UploadPanel
                    title={copy.history.uploadTitle}
                    buttonLabel={copy.common.uploadButton}
                    uploadingLabel={copy.common.uploading}
                    disabled={disableUploads}
                    submitting={historyUploading}
                    onSubmit={handleHistorySubmit}
                  >
                    <input
                      type="text"
                      value={historyForm.title}
                      onChange={(e) =>
                        setHistoryForm((prev) => ({ ...prev, title: e.target.value }))
                      }
                      placeholder={copy.history.titlePlaceholder}
                      className={inputFieldClass}
                    />
                    <FancySelect
                      value={historyForm.channel}
                      onChange={handleHistoryChannelChange}
                      options={channelOptions}
                      placeholder={copy.history.channelPlaceholder}
                      disabled={disableUploads}
                    />
                    {copy.history.channelHelp && (
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        {copy.history.channelHelp}
                      </p>
                    )}
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {copy.history.manualInputLabel}
                      </label>
                      <textarea
                        value={historyForm.content}
                        onChange={(e) =>
                          setHistoryForm((prev) => ({
                            ...prev,
                            content: e.target.value,
                          }))
                        }
                        placeholder={copy.history.manualInputPlaceholder}
                        className={`${inputFieldClass} min-h-[140px] mt-2`}
                      />
                      <p className="text-[11px] text-gray-500 mt-2">
                        {copy.history.manualInputHint}
                      </p>
                    </div>
                    </UploadPanel>
                  </motion.div>
                ) : (
                  <motion.div key="history-bulk" {...panelMotionProps}>
                    <UploadPanel
                    title={copy.history.bulkTitle || copy.history.uploadTitle}
                    buttonLabel={copy.common.uploadButton}
                    uploadingLabel={copy.common.uploading}
                    disabled={disableUploads || !historyBulkFile}
                    submitting={historyBulkUploading}
                    onSubmit={handleHistoryBulkSubmit}
                  >
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                      {copy.history.bulkDescription}
                    </p>
                    <a
                      href="/samples/history-doc-batch-template.xlsx"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      download
                    >
                      <FileText className="w-4 h-4" />
                      {copy.history.bulkTemplateLabel}
                    </a>
                    <FileInput
                      file={historyBulkFile}
                      onChange={(file) => setHistoryBulkFile(file)}
                      label={copy.history.bulkFileLabel || copy.history.fileLabel}
                      hint={copy.uploadHints.file}
                      accept=".xlsx"
                      helper={<p>{copy.history.bulkHint}</p>}
                    />
                    </UploadPanel>
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {activeTab === "stories" && (
              <AnimatePresence mode="wait">
                {storyMode === "manual" ? (
                  <motion.div key="story-manual" {...panelMotionProps}>
                    <UploadPanel
                      title={copy.stories.uploadTitle}
                      buttonLabel={copy.common.uploadButton}
                      uploadingLabel={copy.common.uploading}
                      disabled={disableUploads}
                      submitting={storyUploading}
                      onSubmit={handleStorySubmit}
                    >
                      <input
                        type="text"
                        value={storyForm.title}
                        onChange={(e) =>
                          setStoryForm((prev) => ({ ...prev, title: e.target.value }))
                        }
                        placeholder={copy.stories.titlePlaceholder}
                        className={inputFieldClass}
                      />
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {copy.stories.bodyLabel}
                        </label>
                        <textarea
                          value={storyForm.content}
                          onChange={(e) =>
                            setStoryForm((prev) => ({
                              ...prev,
                              content: e.target.value,
                            }))
                          }
                          placeholder={copy.stories.bodyPlaceholder}
                          className={`${inputFieldClass} min-h-[140px] mt-2`}
                        />
                        {copy.stories.bodyHint && (
                          <p className="text-[11px] text-gray-500 mt-2">
                            {copy.stories.bodyHint}
                          </p>
                        )}
                      </div>
                    </UploadPanel>
                  </motion.div>
                ) : (
                  <motion.div key="story-bulk" {...panelMotionProps}>
                    <UploadPanel
                      title={copy.stories.bulkTitle || copy.stories.uploadTitle}
                      buttonLabel={copy.common.uploadButton}
                      uploadingLabel={copy.common.uploading}
                      disabled={disableUploads || !storyBulkFile}
                      submitting={storyBulkUploading}
                      onSubmit={handleStoryBulkSubmit}
                    >
                      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                        {copy.stories.bulkDescription}
                      </p>
                      <a
                        href="/samples/story-batch-template.xlsx"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        download
                      >
                        <FileText className="w-4 h-4" />
                        {copy.stories.bulkTemplateLabel}
                      </a>
                      <FileInput
                        file={storyBulkFile}
                        onChange={(file) => setStoryBulkFile(file)}
                        label={copy.stories.bulkFileLabel || copy.stories.fileLabel}
                        hint={copy.uploadHints.file}
                        accept=".xlsx"
                        helper={<p>{copy.stories.bulkHint}</p>}
                      />
                    </UploadPanel>
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {activeTab === "styles" && (
              <UploadPanel
                title={copy.styles.uploadTitle}
                buttonLabel={copy.common.uploadButton}
                uploadingLabel={copy.common.uploading}
                disabled={disableUploads}
                submitting={styleUploading}
                onSubmit={handleStyleSubmit}
              >
                <input
                  type="text"
                  value={styleForm.name}
                  onChange={(e) =>
                    setStyleForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder={copy.styles.namePlaceholder}
                  className={inputFieldClass}
                />
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  {copy.styles.autoAnalyzeNote}
                </p>
                <FileInput
                  file={styleForm.file}
                  onChange={(file) =>
                    setStyleForm((prev) => ({ ...prev, file }))
                  }
                  label={copy.styles.fileLabel}
                  hint={copy.uploadHints.image}
                  accept="image/*"
                />
              </UploadPanel>
            )}
          </div>

          <div className="min-h-[320px]">
            {tabLoading[activeTab] ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">{copy.statusText.pending}</span>
              </div>
            ) : (
              renderList()
            )}
          </div>
      </div>
    </div>
    <ConfirmModal
      isOpen={isHistoryDeleteModalOpen}
      onClose={closeHistoryDeleteModal}
      onConfirm={handleHistoryDelete}
      title={copy.history.deleteAction || t.common.delete}
      message={historyDeleteMessage}
    />
    <ConfirmModal
      isOpen={isStyleDeleteModalOpen}
      onClose={closeStyleDeleteModal}
      onConfirm={handleStyleDelete}
      title={copy.styles.deleteAction || t.common.delete}
      message={styleDeleteMessage}
    />
    {renderHistoryDetailModal()}
    {renderStyleDetailModal()}
  </div>
);
}

function UploadPanel({
  title,
  buttonLabel,
  uploadingLabel,
  children,
  onSubmit,
  disabled,
  submitting,
}: {
  title: string;
  buttonLabel: string;
  uploadingLabel: string;
  children: ReactNode;
  onSubmit: (event: FormEvent) => void;
  disabled: boolean;
  submitting: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 backdrop-blur"
    >
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {title}
      </h3>
      <div className="space-y-3">
        {children}
        <button
          type="submit"
          disabled={disabled || submitting}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold text-white bg-black hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UploadCloud className="w-4 h-4" />
          )}
          {submitting ? uploadingLabel : buttonLabel}
        </button>
      </div>
    </form>
  );
}

type SelectOption = { value: string; label: string };

function FancySelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: globalThis.MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );

  const renderOptions = [
    { value: "", label: placeholder },
    ...options.filter((option) => option.value !== ""),
  ];

  const handleSelect = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          inputFieldClass,
          "flex items-center justify-between gap-2 cursor-pointer",
          open && "ring-2 ring-gray-900/20 dark:ring-white/30",
          disabled && "opacity-60 cursor-not-allowed"
        )}
      >
        <span
          className={cn(
            "truncate text-left",
            !selected && "text-gray-400 dark:text-gray-500"
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-gray-500 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "absolute left-0 right-0 mt-2 origin-top rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl transition-all z-30",
          open
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none"
        )}
      >
        <div className="max-h-60 overflow-y-auto py-2">
          {renderOptions.map((option) => {
            const active = option.value === value;
            return (
              <button
                type="button"
                key={option.value || "placeholder"}
                role="option"
                aria-selected={active}
                onClick={() => handleSelect(option.value)}
                className={cn(
                  "w-full text-left px-4 py-2 text-sm transition-colors",
                  active
                    ? "text-white bg-gray-900 dark:bg-white dark:text-gray-900"
                    : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StyleCard({
  style,
  typeLabel,
  statusText,
  statusValue,
  displayName,
  onSelect,
  isDeletable,
  onDelete,
  deleteLabel,
  isDeleting,
}: {
  style: StylePreset;
  typeLabel: string;
  statusText: string;
  statusValue?: string | null;
  displayName: string;
  onSelect?: (style: StylePreset) => void;
  isDeletable?: boolean;
  onDelete?: (style: StylePreset) => void;
  deleteLabel?: string;
  isDeleting?: boolean;
}) {
  const normalizedStatus = (statusValue ?? "").toString().toUpperCase();
  const showStatus =
    normalizedStatus &&
    normalizedStatus !== "COMPLETED" &&
    normalizedStatus !== "READY";
  const summaryEntries = extractStyleSummaryEntries(style);
  const summaryPreview = summaryEntries.slice(0, 4);
  const hasMoreSummary = summaryEntries.length > summaryPreview.length;
  const handleClick = () => {
    onSelect?.(style);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(style);
    }
  };
  const handleDeleteClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    if (isDeleting) return;
    onDelete?.(style);
  };
  const deletable = Boolean(isDeletable && onDelete);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden flex flex-col transition-shadow hover:border-gray-300 dark:hover:border-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/60 dark:focus-visible:ring-white/60 text-left cursor-pointer"
    >
      <div className="relative w-full aspect-[4/5] bg-gray-100 dark:bg-gray-800 overflow-hidden">
        {style.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={style.previewUrl}
            alt={displayName || style.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <StylePreviewPlaceholder spec={style.spec} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent pointer-events-none" />
        <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-1 text-white">
          <span className="text-[11px] uppercase tracking-wide text-white/80">
            {typeLabel}
          </span>
          <p className="text-lg font-semibold leading-tight line-clamp-1">
            {displayName || style.name}
          </p>
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {showStatus && (
            <StatusBadge
              label={statusText}
              status={statusValue}
              className="shadow-lg"
            />
          )}
          {deletable && (
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDeleteClick}
              aria-label={deleteLabel || "Delete"}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60",
                isDeleting && "opacity-70 cursor-not-allowed"
              )}
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>
      {summaryPreview.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900">
          <dl className="space-y-2 text-sm text-gray-700 dark:text-gray-200">
            {summaryPreview.map((entry, index) => (
              <div key={`${entry.label ?? "summary"}-${index}`} className="flex gap-2">
                {entry.label && (
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {entry.label}
                  </dt>
                )}
                <dd className="flex-1 text-gray-800 dark:text-gray-100">
                  {entry.value}
                </dd>
              </div>
            ))}
            {hasMoreSummary && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                …
              </p>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

function FileInput({
  file,
  onChange,
  label,
  hint,
  accept,
  helper,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  label: string;
  hint: string;
  accept?: string;
  helper?: ReactNode;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);

  const resetInputValue = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleFileSelection = useCallback(
    (files?: FileList | null) => {
      const nextFile = files?.[0] ?? null;
      onChange(nextFile);
    },
    [onChange]
  );

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileSelection(event.target.files);
    resetInputValue();
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current += 1;
    if (!isDragActive) {
      setIsDragActive(true);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragActive(false);
    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles?.length) {
      handleFileSelection(droppedFiles);
      resetInputValue();
    }
  };

  return (
    <label className="block" htmlFor={inputId}>
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {label}
      </span>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={handleInputChange}
      />
      <div
        className={cn(
          "mt-2 relative border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-900 cursor-pointer transition-colors",
          isDragActive &&
            "border-gray-900/60 dark:border-white/50 bg-gray-50 dark:bg-gray-900/70"
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-3 px-4 py-3 text-sm text-gray-500 pointer-events-none">
          <UploadCloud className="w-4 h-4" />
          <span className="truncate">{file ? file.name : hint}</span>
        </div>
      </div>
      {helper && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-1">
          {helper}
        </div>
      )}
    </label>
  );
}

function StatusBadge({
  label,
  status,
  className,
}: {
  label: string;
  status?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border",
        statusToneClass(status),
        className
      )}
    >
      {label}
    </span>
  );
}

function StylePreviewPlaceholder({ spec }: { spec?: Record<string, any> | null }) {
  const colors = extractPaletteColors(spec);
  const gradient =
    colors.length <= 1
      ? colors[0]
      : `linear-gradient(135deg, ${colors
          .map((color, index) => {
            const stop = Math.round((index / (colors.length - 1)) * 100);
            return `${color} ${stop}%`;
          })
          .join(", ")})`;

  return (
    <div
      className="absolute inset-0"
      style={{ background: gradient }}
    >
      {/* TODO: replace placeholder with nano Banana 2 rendered preview when assets are ready */}
      <div className="absolute inset-6 rounded-2xl border border-white/30 bg-white/15 backdrop-blur-sm shadow-[0_25px_45px_rgba(15,23,42,0.35)]" />
      <div className="absolute bottom-3 left-3 flex gap-2">
        {colors.slice(0, 4).map((color) => (
          <span
            key={color}
            className="w-4 h-4 rounded-full border border-white/60 shadow"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}

function HistoryInsightsSection({
  insights,
  copy,
}: {
  insights: HistoryInsights;
  copy: Record<string, any>;
}) {
  const sections = Array.isArray(insights.structure?.sections)
    ? insights.structure?.sections ?? []
    : [];
  const reusable = insights.reusableBlocks || {};
  const hasReusable =
    Boolean(reusable.hooks?.length) ||
    Boolean(reusable.transitions?.length) ||
    Boolean(reusable.closers?.length) ||
    Boolean(reusable.proofPoints?.length);
  const openingPatterns = Array.isArray(insights.openingPatterns)
    ? insights.openingPatterns
    : [];
  const transitionPlaybook = Array.isArray(insights.transitionPlaybook)
    ? insights.transitionPlaybook
    : [];
  const styleRulesDraft =
    insights.styleRulesDraft &&
    typeof insights.styleRulesDraft === "object" &&
    !Array.isArray(insights.styleRulesDraft) &&
    Object.keys(insights.styleRulesDraft).length
      ? insights.styleRulesDraft
      : null;

  const renderChipList = (
    items?: string[],
    keyPrefix = "chip",
    options: { colorful?: boolean } = {}
  ) => {
    if (!items || !items.length) return null;
    const { colorful = false } = options;
    return (
      <div
        className={
          colorful
            ? "mt-3 flex w-full flex-wrap gap-2"
            : "mt-2 flex flex-wrap gap-2"
        }
      >
        {items.map((item, index) => (
          <span
            key={`${keyPrefix}-${index}-${item}`}
            className={cn(
              "inline-flex items-center text-xs font-medium rounded-full",
              colorful
                ? cn(
                    "min-h-[34px] justify-center border px-3 text-center leading-snug",
                    getChipColorClass(item, index)
                  )
                : "px-2 py-1 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
            )}
          >
            {colorful ? <span className="truncate">{item}</span> : item}
          </span>
        ))}
      </div>
    );
  };

  const renderList = (title: string, items?: string[], icon?: LucideIcon) => {
    if (!items || !items.length) return null;
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
        <SectionHeader icon={icon} title={title} />
        <ul className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderPatternCard = (
    title: string,
    items: Array<Record<string, any>>,
    icon?: LucideIcon,
    formatter?: (item: Record<string, any>, index: number) => {
      label: string;
      primary?: string;
      secondary?: string;
    }
  ) => {
    if (!items.length) return null;
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
        <SectionHeader icon={icon} title={title} />
        <div className="mt-3 space-y-3 text-sm text-gray-700 dark:text-gray-200">
          {items.slice(0, 4).map((item, index) => {
            const content = formatter
              ? formatter(item, index)
              : {
                  label: item.label || `Pattern ${index + 1}`,
                  primary: item.example || item.pattern || item.usage,
                  secondary: item.usage,
                };
            return (
              <div
                key={`${title}-${index}`}
                className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-3 space-y-1"
              >
                <p className="text-sm font-semibold">{content.label}</p>
                {content.primary && (
                  <p className="leading-relaxed">{content.primary}</p>
                )}
                {content.secondary && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {content.secondary}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {insights.summary && (
        <InsightCard icon={Sparkles} title={copy.analysisSummaryLabel || "AI 摘要"}>
          <p className="text-gray-700 dark:text-gray-200 leading-relaxed">
            {insights.summary}
          </p>
        </InsightCard>
      )}
      {insights.voice && (
        <InsightCard icon={Mic2} title={copy.voiceProfileLabel || "声音画像"}>
          <div className="space-y-4">
            {insights.voice.persona && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {copy.voicePersonaLabel || "Persona"}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  {insights.voice.persona}
                </p>
              </div>
            )}
            {insights.voice.cadence && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {copy.voiceCadenceLabel || "Cadence"}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  {insights.voice.cadence}
                </p>
              </div>
            )}
            {renderChipList(insights.voice.toneDescriptors, "toneDescriptors", {
              colorful: true,
            })}
            {renderChipList(
              insights.voice.sentencePatterns,
              "sentencePatterns",
              { colorful: true }
            )}
            {renderChipList(insights.voice.hookAngles, "hookAngles", {
              colorful: true,
            })}
            {renderChipList(insights.voice.closingMoves, "closingMoves", {
              colorful: true,
            })}
            {renderChipList(insights.voice.signatureWords, "signatureWords", {
              colorful: true,
            })}
          </div>
        </InsightCard>
      )}
      {(insights.dosAndDonts?.mustInclude?.length ||
        insights.dosAndDonts?.avoid?.length) && (
        <InsightCard icon={ListChecks} title={copy.rulesLabel || "写作规则"}>
          <div className="grid gap-4 md:grid-cols-2">
            {renderList(
              copy.mustIncludeLabel || "Must Include",
              insights.dosAndDonts?.mustInclude,
              ListChecks
            )}
            {renderList(
              copy.avoidLabel || "Avoid",
              insights.dosAndDonts?.avoid,
              ListChecks
            )}
          </div>
        </InsightCard>
      )}
      {(openingPatterns.length > 0 || transitionPlaybook.length > 0) && (
        <InsightCard icon={Flag} title={copy.openingPatternsLabel || "开场与转折套路"}>
          <div className="grid gap-4 md:grid-cols-2">
          {renderPatternCard(
            copy.openingPatternsLabel || "开场套路",
            openingPatterns,
            Flag,
            (item, index) => ({
              label: item.label || `开场 ${index + 1}`,
              primary: item.example,
              secondary: item.usage,
            })
          )}
          {renderPatternCard(
            copy.transitionPlaybookLabel || "转折 / 推进方法",
            transitionPlaybook,
            Shuffle,
            (item, index) => ({
              label: item.label || `转折 ${index + 1}`,
              primary: item.pattern || item.example,
              secondary: item.usage,
            })
          )}
          </div>
        </InsightCard>
      )}
      {sections.length > 0 && (
        <InsightCard icon={Layers} title={copy.structureLabel || "结构拆解"}>
          <div className="space-y-3">
            {sections.map((section, index) => {
              const title =
                section.label ||
                replacePlaceholders(copy.sectionLabelFallback, {
                  index: String(index + 1),
                }) ||
                `Section ${index + 1}`;
              const summary =
                section.summary || copy.structureSummaryFallback || "";
              return (
                <div
                  key={`${title}-${index}`}
                  className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-semibold text-gray-900 dark:text-white">
                      {title}
                    </p>
                    {section.goal && (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {section.goal}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                    {summary}
                  </p>
                  {section.keywords?.length && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {copy.structureKeywordsLabel || "关键词"}
                      </p>
                      {renderChipList(section.keywords, `section-${index}`)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </InsightCard>
      )}
      {styleRulesDraft && (
        <InsightCard icon={Bookmark} title={copy.styleRulesLabel || "Style Rules 草稿"}>
          <StyleRulesPreview draft={styleRulesDraft} copy={copy} />
        </InsightCard>
      )}
      {hasReusable && (
        <InsightCard icon={Shuffle} title={copy.reusableLabel || "可复用模块"}>
          <div className="grid gap-4 md:grid-cols-2">
            {renderList(copy.hooksLabel || "Hooks", reusable.hooks, Bookmark)}
            {renderList(
              copy.transitionsLabel || "Transitions",
              reusable.transitions,
              Shuffle
            )}
            {renderList(copy.closersLabel || "Closers", reusable.closers, Flag)}
            {renderList(
              copy.proofPointsLabel || "Proof Points",
              reusable.proofPoints,
              ShieldCheck
            )}
          </div>
        </InsightCard>
      )}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon?: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {Icon && (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-900/5 text-gray-900 dark:bg-white/10 dark:text-white">
          <Icon className="w-4 h-4" />
        </span>
      )}
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
        {title}
      </h4>
    </div>
  );
}

function InsightCard({
  icon,
  title,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm space-y-4">
      <SectionHeader icon={icon} title={title} />
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function StyleRulesPreview({
  draft,
  copy,
}: {
  draft: Record<string, any>;
  copy: Record<string, any>;
}) {
  const highlights: Array<{ label: string; value?: string }> = [];
  if (draft.style_type) {
    highlights.push({
      label: copy.styleRulesStyleType || "风格类型",
      value: draft.style_type,
    });
  }
  if (draft.voice?.persona) {
    highlights.push({
      label: copy.styleRulesPersona || "Persona",
      value: draft.voice.persona,
    });
  }
  if (draft.voice?.pov) {
    highlights.push({
      label: copy.styleRulesPOV || "视角",
      value: draft.voice.pov,
    });
  }
  if (draft.tone?.core?.length) {
    highlights.push({
      label: copy.styleRulesTone || "语气关键词",
      value: draft.tone.core.slice(0, 4).join(" / "),
    });
  }
  return (
    <div className="space-y-4">
      {highlights.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {highlights.map((item, index) => (
            <div
              key={`${item.label}-${index}`}
              className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-3"
            >
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {item.label}
              </p>
              <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}
      {Array.isArray(draft.structure) && draft.structure.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {copy.styleRulesStructure || "推荐结构"}
          </p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700 dark:text-gray-200">
            {draft.structure.slice(0, 4).map((item: string, index: number) => (
              <li key={`structure-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <details className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
        <summary className="cursor-pointer font-semibold text-gray-800 dark:text-gray-100">
          {copy.styleRulesFullJson || "查看完整 JSON"}
        </summary>
        <pre className="mt-2 whitespace-pre-wrap">
          {JSON.stringify(draft, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function extractPaletteColors(
  spec?: Record<string, any> | null,
  dna?: Record<string, any> | null
): string[] {
  const fromRecord = (record?: Record<string, any> | null): string[] => {
    if (!record) return [];
    const paletteSource = record.palette;
    if (Array.isArray(paletteSource)) {
      const normalized = paletteSource
        .map((entry) => {
          if (typeof entry === "string") return entry.trim();
          if (entry && typeof entry === "object") {
            if (typeof entry.hex === "string") return entry.hex.trim();
            if (typeof entry.color === "string") return entry.color.trim();
          }
          return "";
        })
        .filter((color): color is string => Boolean(color));
      if (normalized.length) return normalized;
    }
    const fallbackFields = ["primaryColor", "primary", "accent"];
    for (const field of fallbackFields) {
      if (typeof record[field] === "string" && record[field].trim()) {
        return [record[field].trim()];
      }
    }
    return [];
  };

  const fromDna = (styleDna?: Record<string, any> | null): string[] => {
    if (!styleDna || !isPlainRecord(styleDna.color_system)) return [];
    const colorSystem = styleDna.color_system as Record<string, any>;
    const candidates = [
      colorSystem.background,
      colorSystem.accent,
      colorSystem.primary_text,
      colorSystem.secondary_text,
      colorSystem.warning_or_highlight,
    ];
    return candidates
      .flatMap((value) => (Array.isArray(value) ? value : []))
      .filter((color): color is string => typeof color === "string" && color.trim().length > 0)
      .map((color) => color.trim());
  };

  const unique = (list: string[]) => Array.from(new Set(list));

  const specColors = unique(fromRecord(spec));
  if (specColors.length) return specColors;

  const dnaColors = unique(fromDna(dna));
  if (dnaColors.length) return dnaColors;

  if (isPlainRecord(spec?.analysis) && isPlainRecord(spec?.analysis?.style_dna)) {
    const analysisDnaColors = unique(fromDna(spec?.analysis?.style_dna as Record<string, any>));
    if (analysisDnaColors.length) return analysisDnaColors;
  }

  return ["#0f172a", "#6366f1", "#f472b6"];
}

type StyleDetailSectionTagGroup = {
  label: string;
  items: string[];
  tone?: "positive" | "negative";
};

type StyleDetailSection = {
  title: string;
  icon?: LucideIcon;
  lines?: string[];
  tags?: StyleDetailSectionTagGroup[];
};

function buildStyleDetailSections(style: StylePreset): StyleDetailSection[] {
  const spec = (style.spec || {}) as Record<string, any> | null;
  const meta = parseMetadata(style.metadata);
  const dna = getStyleDnaFromMetadata(meta);
  const generationPrompts = isPlainRecord(meta.generation_prompts)
    ? meta.generation_prompts
    : isPlainRecord(meta.analysis?.generation_prompts)
    ? (meta.analysis?.generation_prompts as Record<string, any>)
    : null;
  const hasSpec = !!(spec && Object.keys(spec).length);
  if (!hasSpec && dna) {
    return buildSectionsFromStyleDna(dna, generationPrompts);
  }
  if (!hasSpec) return [];
  const sections: StyleDetailSection[] = [];
  const isLayout = style.type.includes("layout");
  const analysis =
    (spec.analysis && typeof spec.analysis === "object" && !Array.isArray(spec.analysis)
      ? (spec.analysis as Record<string, any>)
      : null) ||
    (isPlainRecord(meta.analysis) ? meta.analysis : null);

  if (!isLayout) {
    const toneLines: string[] = [];
    if (typeof spec.tone === "string") {
      toneLines.push(`调性：${spec.tone}`);
    }
    const bestFor = toStringList(spec.bestFor);
    if (bestFor.length) {
      toneLines.push(`适用场景：${bestFor.join("、")}`);
    }
    const adjectives = toStringList(spec.promptKit?.adjectives);
    if (adjectives.length) {
      toneLines.push(`关键词：${adjectives.join(" / ")}`);
    }
    if (!toneLines.length && analysis) {
      const analysisAdjectives = toStringList(analysis.adjectives);
      if (analysisAdjectives.length) {
        toneLines.push(`关键词：${analysisAdjectives.join(" / ")}`);
      }
    }
    if (toneLines.length) {
      sections.push({
        title: "核心调性",
        icon: Sparkles,
        lines: toneLines,
      });
    }

    const colorLines: string[] = [];
    const palette = formatColorList(spec.palette);
    if (palette.length) {
      colorLines.push(`主色：${palette.join("、")}`);
    }
    const background = formatColorList(spec.background);
    if (background.length) {
      colorLines.push(`背景：${background.join("、")}`);
    }
    const accents = toStringList(spec.accents);
    if (accents.length) {
      colorLines.push(`强调色：${accents.join("、")}`);
    }
    if (!colorLines.length && analysis?.palette) {
      const analysisPalette = analysis.palette
        .map((entry: any) => {
          if (!entry) return "";
          if (typeof entry === "string") return entry;
          if (typeof entry.hex === "string" && typeof entry.usage === "string") {
            return `${entry.usage}：${entry.hex}`;
          }
          if (typeof entry.hex === "string") return entry.hex;
          return "";
        })
        .filter(Boolean) as string[];
      if (analysisPalette.length) {
        colorLines.push(...analysisPalette);
      }
    }
    if (colorLines.length) {
      sections.push({
        title: "色彩与背景",
        icon: Palette,
        lines: colorLines,
      });
    }

    const elementLines: string[] = [];
    const elements = Array.from(
      new Set([
        ...toStringList(spec.elements),
        ...toStringList((analysis as any)?.motifs),
      ])
    );
    if (elements.length) {
      elementLines.push(`视觉元素：${elements.join("、")}`);
    }
    const backgroundProps = toStringList(spec.backgroundProps);
    if (backgroundProps.length) {
      elementLines.push(`背景细节：${backgroundProps.join("、")}`);
    }
    if (elementLines.length) {
      sections.push({
        title: "视觉元素",
        icon: Shapes,
        lines: elementLines,
      });
    }

    const typographyLines: string[] = [];
    const primaryTypography = spec.typography;
    if (primaryTypography?.primary) {
      typographyLines.push(`字体：${primaryTypography.primary}`);
    }
    if (primaryTypography?.notes) {
      typographyLines.push(primaryTypography.notes);
    }
    if (typographyLines.length) {
      sections.push({
        title: "字体与排版",
        icon: Type,
        lines: typographyLines,
      });
    }

    const layoutRecord =
      spec.layout && typeof spec.layout === "object" && !Array.isArray(spec.layout)
        ? (spec.layout as Record<string, any>)
        : analysis?.layout && typeof analysis.layout === "object" && !Array.isArray(analysis.layout)
        ? (analysis.layout as Record<string, any>)
        : null;
    if (layoutRecord) {
      const layoutLines: string[] = [];
      if (layoutRecord.density) layoutLines.push(`信息密度：${layoutRecord.density}`);
      if (layoutRecord.composition) layoutLines.push(`构图：${layoutRecord.composition}`);
      if (layoutRecord.spacingNotes) layoutLines.push(`间距说明：${layoutRecord.spacingNotes}`);
      sections.push({
        title: "布局与间距",
        icon: LayoutDashboard,
        lines: layoutLines,
      });
    }

    const environmentLines: string[] = [];
    const lighting = spec.lighting || analysis?.lighting;
    if (typeof lighting === "string" && lighting.trim()) {
      environmentLines.push(`光照：${lighting.trim()}`);
    }
    const texture = spec.texture || analysis?.texture;
    if (typeof texture === "string" && texture.trim()) {
      environmentLines.push(`材质：${texture.trim()}`);
    }
    if (environmentLines.length) {
      sections.push({
        title: "光照与材质",
        icon: SunMedium,
        lines: environmentLines,
      });
    }

    const promptLines: string[] = [];
    if (typeof spec.promptKit?.instructions === "string") {
      promptLines.push(spec.promptKit.instructions);
    }
    if (
      typeof spec.instructions === "string" &&
      spec.instructions !== spec.promptKit?.instructions
    ) {
      promptLines.push(spec.instructions);
    }
    const positivePrompts = toStringList(spec.promptKit?.positive ?? analysis?.promptKit?.positive);
    const negativePrompts = toStringList(spec.promptKit?.negative ?? analysis?.promptKit?.negative);
    const tagGroups: StyleDetailSectionTagGroup[] = [];
    if (positivePrompts.length) {
      tagGroups.push({
        label: "正向提示",
        tone: "positive",
        items: positivePrompts.slice(0, 12),
      });
    }
    if (negativePrompts.length) {
      tagGroups.push({
        label: "负向提示",
        tone: "negative",
        items: negativePrompts.slice(0, 12),
      });
    }
    if (promptLines.length || tagGroups.length) {
      sections.push({
        title: "生成提示",
        icon: Sparkles,
        lines: promptLines,
        tags: tagGroups,
      });
    }
  } else {
    const structureLines: string[] = [];
    if (spec.density) structureLines.push(`信息密度：${spec.density}`);
    if (spec.whitespace) structureLines.push(`留白：${spec.whitespace}`);
    if (spec.structure) structureLines.push(`结构：${spec.structure}`);
    if (spec.visualBalance) structureLines.push(`视觉平衡：${spec.visualBalance}`);
    if (structureLines.length) {
      sections.push({
        title: "结构与密度",
        lines: structureLines,
      });
    }

    const textLines: string[] = [];
    if (spec.textElements) textLines.push(`文字模块：${spec.textElements}`);
    if (spec.arrangement) textLines.push(`布局：${spec.arrangement}`);
    if (spec.titlePlacement) textLines.push(`标题位置：${spec.titlePlacement}`);
    if (textLines.length) {
      sections.push({
        title: "文字布局",
        lines: textLines,
      });
    }

    const scenarioLines: string[] = [];
    const bestFor = toStringList(spec.bestFor);
    if (bestFor.length) scenarioLines.push(`适配：${bestFor.join("、")}`);
    const bestPairings = toStringList(spec.bestPairings);
    if (bestPairings.length) scenarioLines.push(`推荐搭配：${bestPairings.join("、")}`);
    if (scenarioLines.length) {
      sections.push({
        title: "应用场景",
        lines: scenarioLines,
      });
    }

    const instructionsLines: string[] = [];
    if (spec.arrangement && !textLines.includes(`布局：${spec.arrangement}`)) {
      instructionsLines.push(spec.arrangement);
    }
    if (spec.instructions) instructionsLines.push(spec.instructions);
    if (spec.notes) instructionsLines.push(spec.notes);
    if (instructionsLines.length) {
      sections.push({
        title: "排版指令",
        lines: instructionsLines,
      });
    }
  }

  if (!sections.length && dna) {
    return buildSectionsFromStyleDna(dna, generationPrompts);
  }
  return sections;
}

function buildSectionsFromStyleDna(
  dna: Record<string, any>,
  generation?: Record<string, any> | null
): StyleDetailSection[] {
  const sections: StyleDetailSection[] = [];
  if (typeof dna.one_sentence_definition === "string") {
    sections.push({
      title: "风格定义",
      icon: Sparkles,
      lines: [dna.one_sentence_definition],
    });
  }

  const colorLines: string[] = [];
  const colorSystem = dna.color_system || {};
  const toHexList = (list: unknown): string[] =>
    Array.isArray(list)
      ? (list.filter((item) => typeof item === "string") as string[])
      : [];
  const backgroundColors = toHexList(colorSystem.background);
  if (backgroundColors.length) {
    colorLines.push(`背景：${backgroundColors.join("、")}`);
  }
  const accentColors = toHexList(colorSystem.accent);
  if (accentColors.length) {
    colorLines.push(`强调色：${accentColors.join("、")}`);
  }
  const primaryTextColors = toHexList(colorSystem.primary_text);
  if (primaryTextColors.length) {
    colorLines.push(`正文字体颜色：${primaryTextColors.join("、")}`);
  }
  const usageRules = toStringList(colorSystem.color_usage_rules);
  if (usageRules.length) {
    colorLines.push(...usageRules);
  }
  if (colorLines.length) {
    sections.push({
      title: "色彩系统",
      icon: Palette,
      lines: colorLines,
    });
  }

  if (dna.typography) {
    const typoLines: string[] = [];
    if (dna.typography.title_font_vibe) {
      typoLines.push(`标题：${dna.typography.title_font_vibe}`);
    }
    if (dna.typography.body_font_vibe) {
      typoLines.push(`正文：${dna.typography.body_font_vibe}`);
    }
    const hierarchy = dna.typography.hierarchy;
    if (hierarchy && typeof hierarchy === "object") {
      Object.entries(hierarchy).forEach(([key, value]) => {
        if (value && typeof value === "object") {
          const entry = value as Record<string, unknown>;
          const line = [`${key.toUpperCase()}`];
          if (typeof entry.size_ratio === "string" || typeof entry.size_ratio === "number") {
            line.push(`比例 ${entry.size_ratio}`);
          }
          if (typeof entry.max_chars === "string" || typeof entry.max_chars === "number") {
            line.push(`字数<=${entry.max_chars}`);
          }
          typoLines.push(line.join(" · "));
        }
      });
    }
    if (Array.isArray(dna.typography.emphasis_methods)) {
      typoLines.push(...dna.typography.emphasis_methods);
    }
    if (typoLines.length) {
      sections.push({
        title: "字体系统",
        icon: Type,
        lines: typoLines,
      });
    }
  }

  if (dna.layout_system) {
    const layoutLines: string[] = [];
    if (dna.layout_system.grid) layoutLines.push(`网格：${dna.layout_system.grid}`);
    if (dna.layout_system.safe_margin)
      layoutLines.push(`安全边距：${dna.layout_system.safe_margin}`);
    if (dna.layout_system.module_spacing)
      layoutLines.push(`模块间距：${dna.layout_system.module_spacing}`);
    if (dna.layout_system.alignment)
      layoutLines.push(`对齐：${dna.layout_system.alignment}`);
    if (dna.layout_system.information_density)
      layoutLines.push(`信息密度：${dna.layout_system.information_density}`);
    if (Array.isArray(dna.layout_system.common_structures) && dna.layout_system.common_structures.length) {
      layoutLines.push(`常见结构：${dna.layout_system.common_structures.join(" / ")}`);
    }
    sections.push({
      title: "布局蓝图",
      icon: LayoutDashboard,
      lines: layoutLines.filter(Boolean),
    });
  }

  if (dna.illustration_iconography) {
    const illustrationLines: string[] = [];
    if (dna.illustration_iconography.icon_style) {
      illustrationLines.push(`图标风格：${dna.illustration_iconography.icon_style}`);
    }
    if (Array.isArray(dna.illustration_iconography.decorations)) {
      illustrationLines.push(
        `装饰：${dna.illustration_iconography.decorations.join("、")}`
      );
    }
    if (dna.illustration_iconography.chart_style) {
      illustrationLines.push(`图表：${dna.illustration_iconography.chart_style}`);
    }
    if (illustrationLines.length) {
      sections.push({
        title: "图形/插画",
        icon: Shapes,
        lines: illustrationLines,
      });
    }
  }

  if (dna.texture_and_background) {
    const textureLines: string[] = [];
    if (dna.texture_and_background.background_texture) {
      textureLines.push(`背景质感：${dna.texture_and_background.background_texture}`);
    }
    if (dna.texture_and_background.shadow_and_depth) {
      textureLines.push(`阴影与层次：${dna.texture_and_background.shadow_and_depth}`);
    }
    if (textureLines.length) {
      sections.push({
        title: "材质与光影",
        icon: SunMedium,
        lines: textureLines,
      });
    }
  }

  if (Array.isArray(dna.quality_bar) && dna.quality_bar.length) {
    sections.push({
      title: "质检要点",
      icon: ShieldCheck,
      lines: dna.quality_bar,
    });
  }

  if (generation) {
    const promptLines: string[] = [];
    if (typeof generation.prompt_text2img_universal === "string") {
      promptLines.push(generation.prompt_text2img_universal);
    }
    const tagGroups: StyleDetailSectionTagGroup[] = [];
    if (typeof generation.negative_prompt === "string") {
      const negativeItems = generation.negative_prompt
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (negativeItems.length) {
        tagGroups.push({
          label: "Negative Prompt",
          tone: "negative",
          items: negativeItems,
        });
      }
    }
    if (promptLines.length || tagGroups.length) {
      sections.push({
        title: "生成提示",
        icon: Sparkles,
        lines: promptLines,
        tags: tagGroups.length ? tagGroups : undefined,
      });
    }
  }

  return sections.filter((section) => section.lines?.length || section.tags?.length);
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const record = item as Record<string, any>;
          return (record.name || record.label || record.title || "").toString().trim();
        }
        return "";
      })
      .filter((item): item is string => Boolean(item));
  }
  if (typeof value === "string") {
    return value
      .split(/[、，,\/]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function formatColorList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(formatColorEntry)
      .filter((entry): entry is string => Boolean(entry));
  }
  if (typeof value === "string") return [value];
  if (typeof value === "object") {
    const single = formatColorEntry(value);
    return single ? [single] : [];
  }
  return [];
}

function formatColorEntry(entry: unknown): string | null {
  if (!entry) return null;
  if (typeof entry === "string") return entry.trim() || null;
  if (typeof entry === "object") {
    const record = entry as Record<string, any>;
    const name = typeof record.name === "string" ? record.name : record.color;
    const hex = typeof record.hex === "string" ? record.hex : undefined;
    if (name && hex) return `${name} (${hex})`;
    if (name) return name;
    if (hex) return hex;
  }
  return null;
}

function EmptyState({
  icon: Icon,
  message,
}: {
  icon: typeof FileText;
  message: string;
}) {
  return (
    <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400 border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
      <Icon className="w-6 h-6 mb-3 text-gray-400" />
      <p className="text-sm max-w-xs">{message}</p>
    </div>
  );
}
const isPlainRecord = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseMetadata = (value: unknown): Record<string, any> => {
  if (isPlainRecord(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (isPlainRecord(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
};

function getStyleDnaFromMetadata(meta: Record<string, any>): Record<string, any> | null {
  if (isPlainRecord(meta.style_dna)) {
    return meta.style_dna;
  }
  if (isPlainRecord(meta.analysis) && isPlainRecord(meta.analysis.style_dna)) {
    return meta.analysis.style_dna as Record<string, any>;
  }
  if (isPlainRecord(meta.style_json) && isPlainRecord(meta.style_json.style_dna)) {
    return meta.style_json.style_dna as Record<string, any>;
  }
  if (
    isPlainRecord(meta.style_profile_json) &&
    isPlainRecord(meta.style_profile_json.style_dna)
  ) {
    return meta.style_profile_json.style_dna as Record<string, any>;
  }
  return null;
}

type StyleSummaryEntry = {
  label?: string;
  value: string;
};

const normalizeSummaryText = (source: unknown): string | null => {
  if (typeof source === "string") {
    const trimmed = source.trim();
    return trimmed.length ? trimmed : null;
  }
  if (Array.isArray(source)) {
    const joined = source
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join("\n");
    return joined || null;
  }
  return null;
};

const extractStyleSummaryEntries = (style: StylePreset): StyleSummaryEntry[] => {
  const meta = parseMetadata(style.metadata);
  const candidates: Array<unknown> = [style.styleSummary, meta.styleSummary, meta.style_summary];
  const summaryText =
    candidates
      .map((candidate) => normalizeSummaryText(candidate))
      .find((text) => Boolean(text)) ?? null;
  if (!summaryText) return [];
  return summaryText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[:：]/);
      if (parts.length > 1) {
        const [label, ...rest] = parts;
        return {
          label: label.trim(),
          value: rest.join("：").trim(),
        };
      }
      return { value: line };
    });
};

const buildStyleSummarySection = (style: StylePreset): StyleDetailSection | null => {
  const entries = extractStyleSummaryEntries(style);
  if (!entries.length) return null;
  return {
    title: "风格概览",
    icon: FileText,
    lines: entries.map((entry) =>
      entry.label ? `${entry.label}：${entry.value}` : entry.value
    ),
  };
};
