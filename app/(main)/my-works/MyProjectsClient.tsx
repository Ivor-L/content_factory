"use client";

/* eslint-disable @next/next/no-img-element -- Project cards rely on remote thumbnails */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TaskType } from "@/lib/taskSummary";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTenant, useTenantPath } from "@/hooks/useTenant";
import { DigitalHumanCountdown } from "@/components/DigitalHumanCountdown";
import { DigitalHumanModal } from "@/components/DigitalHumanModal";
import { Modal } from "@/components/Modal";
import { QuickPosterForm } from "@/app/(main)/dashboard/components/QuickActionForms";
import { cn } from "@/lib/utils";
import { toForcedProxyUrl, toProxyImgUrl } from "@/lib/mediaProxy";
import { getStylePreviewImageUrl } from "@/lib/stylePreviewImage";
import {
  Loader2,
  RefreshCcw,
  RotateCcw,
  LayoutGrid,
  Sparkles,
  Image as ImageIcon,
  UserRound,
  Clapperboard,
  LayoutPanelTop,
  BookOpen,
  Camera,
  Clock,
  X,
  ExternalLink,
  Download,
  Trash2,
  MoreHorizontal,
  PencilLine,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Copy,
  Film,
} from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import type { CreativeTaskDetail, StylePresetLite } from "@/types/creative";

type LanguageCode = "en" | "zh" | "zh-TW";
type CopyMap = Record<LanguageCode, string>;

type TaskSummary = {
  id: string;
  userId: string;
  taskType: TaskType;
  taskId: string;
  title: string | null;
  status: string;
  preview: string | null;
  thumbnailUrl: string | null;
  progress: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type TaskCardProps = {
  task: TaskSummary;
  langKey: LanguageCode;
  locale: string;
  statusClass: string;
  statusLabel: string;
  typeLabel: string;
  deleting: boolean;
  onTaskClick: (task: TaskSummary) => void;
  onCardKeyDown: (event: KeyboardEvent<HTMLDivElement>, task: TaskSummary) => void;
  onDownload: (task: TaskSummary) => void;
  onRename: (task: TaskSummary) => void;
  onDelete: (task: TaskSummary) => void;
};

type CacheEntry<T> = {
  value: T;
  expireAt: number;
};

const replicationDetailCache = new Map<string, CacheEntry<ReplicationDetailPayload | null>>();
const storyboardDetailCache = new Map<string, CacheEntry<{ storyboardImageUrl?: string | null; status?: string | null; progress?: number | null } | null>>();
const creativeDetailCache = new Map<string, CacheEntry<CreativeTaskDetail | null>>();
const digitalHumanDetailCache = new Map<string, CacheEntry<DigitalHumanDetailPayload | null>>();
const posterImagesCache = new Map<string, CacheEntry<string[]>>();
let styleListCache: CacheEntry<(StylePresetLite & { metadata?: unknown })[]> | null = null;
const imagePrefetchCache = new Map<string, CacheEntry<string>>();

function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const cached = cache.get(key);
  if (!cached) return undefined;
  if (cached.expireAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return cached.value;
}

function setCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
  cache.set(key, {
    value,
    expireAt: Date.now() + ttlMs,
  });
}

function isProcessingStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toUpperCase();
  return PROCESSING_STATUSES.has(normalized) || normalized.endsWith("_PENDING") || normalized.endsWith("_PROCESSING");
}

type ReplicationDetailPayload = {
  id: string;
  status: string;
  type: string;
  updatedAt: string;
  result: Record<string, unknown> | null;
};

type DigitalHumanDetailPayload = {
  id: string;
  scriptContent: string | null;
  sourceTaskId: string | null;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseRecordLike(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return toRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return toRecord(value);
}

function readStringField(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!record) return null;
  const raw = record[key];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function normalizeHttpUrl(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function sanitizeFileBase(raw: string, fallback: string): string {
  const normalized = raw
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .trim();
  return normalized.length > 0 ? normalized : fallback;
}

function inferImageExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".png")) return "png";
    if (pathname.endsWith(".webp")) return "webp";
    if (pathname.endsWith(".gif")) return "gif";
    if (pathname.endsWith(".jpeg")) return "jpeg";
    if (pathname.endsWith(".jpg")) return "jpg";
  } catch {
    // fall through
  }
  return "jpg";
}

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isTouchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || isTouchMac;
}

function triggerBrowserDownload(
  downloadUrl: string,
  filename: string,
  options?: { forceAnchorOnMobile?: boolean },
) {
  if (typeof window !== "undefined" && isMobileBrowser() && !options?.forceAnchorOnMobile) {
    const opened = window.open(downloadUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.assign(downloadUrl);
    }
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
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

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item): item is string => Boolean(item));
}

// Routes relative to basePath (no leading slash except for the leading basePath)
const TASK_TYPE_ROUTE_PATHS: Record<TaskType, (taskId: string) => string> = {
  creative: (id) => `/my-works?taskId=${id}`,
  poster: (id) => `/xhs-poster?jobId=${id}`,
  digitalHuman: (id) => `/digital-human?videoId=${id}`,
  replication: (id) => `/replication?id=${id}`,
  storyboard: (id) => `/storyboard/${id}`,
  knowledgeVideo: (id) => `/knowledge-videos/${id}`,
  replicationShot: (id) => `/replication-shot/${id}`,
  grid: (id) => `/my-works?taskId=${id}`,
};

const isText2ImagePosterTask = (task: TaskSummary) =>
  task.taskType === "poster" &&
  task.metadata &&
  typeof task.metadata === "object" &&
  (task.metadata as Record<string, unknown>).posterMode === "text2image";

const LANGUAGE_LOCALES: Record<LanguageCode, string> = {
  en: "en-US",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
};

const TYPE_META: Record<
  TaskType,
  {
    label: CopyMap;
    description: CopyMap;
    accent: string;
    badge: string;
    icon: typeof Sparkles;
  }
> = {
  creative: {
    label: { en: "Creative workspace", zh: "智能创作", "zh-TW": "智能創作" },
    description: { en: "Briefs & idea mining", zh: "剧本与灵感任务", "zh-TW": "腳本與靈感任務" },
    accent: "from-amber-100/80 via-orange-50 to-white",
    badge: "bg-amber-50 text-amber-800 border-amber-100",
    icon: Sparkles,
  },
  poster: {
    label: { en: "Poster experiments", zh: "图文创意", "zh-TW": "圖文創意" },
    description: { en: "Xiaohongshu posts", zh: "小红书海报", "zh-TW": "小紅書海報" },
    accent: "from-pink-100/80 via-rose-50 to-white",
    badge: "bg-pink-50 text-pink-800 border-pink-100",
    icon: ImageIcon,
  },
  digitalHuman: {
    label: { en: "Digital human", zh: "数字人视频", "zh-TW": "數字人影片" },
    description: { en: "Lip-sync renders", zh: "口播成片与音色", "zh-TW": "口播成片與音色" },
    accent: "from-purple-100/80 via-indigo-50 to-white",
    badge: "bg-purple-50 text-purple-800 border-purple-100",
    icon: UserRound,
  },
  replication: {
    label: { en: "Viral replications", zh: "爆款复刻", "zh-TW": "爆款復刻" },
    description: { en: "Product-driven videos", zh: "产品复刻产出", "zh-TW": "產品復刻產出" },
    accent: "from-blue-100/80 via-sky-50 to-white",
    badge: "bg-blue-50 text-blue-800 border-blue-100",
    icon: Clapperboard,
  },
  grid: {
    label: { en: "Nine-grid tasks", zh: "九宫格任务", "zh-TW": "九宮格任務" },
    description: { en: "Grid drafts & splits", zh: "九宫格拆解", "zh-TW": "九宮格拆解" },
    accent: "from-teal-100/80 via-emerald-50 to-white",
    badge: "bg-teal-50 text-teal-800 border-teal-100",
    icon: LayoutGrid,
  },
  storyboard: {
    label: { en: "Storyboards", zh: "分镜任务", "zh-TW": "分鏡任務" },
    description: { en: "Nine-grid drafts", zh: "九宫格草稿", "zh-TW": "九宮格草稿" },
    accent: "from-teal-100/80 via-emerald-50 to-white",
    badge: "bg-teal-50 text-teal-800 border-teal-100",
    icon: LayoutPanelTop,
  },
  knowledgeVideo: {
    label: { en: "Knowledge videos", zh: "知识视频", "zh-TW": "知識影片" },
    description: { en: "Educational explainers", zh: "知识类成片", "zh-TW": "知識類成片" },
    accent: "from-cyan-100/80 via-sky-50 to-white",
    badge: "bg-cyan-50 text-cyan-800 border-cyan-100",
    icon: BookOpen,
  },
  replicationShot: {
    label: { en: "Scene clones", zh: "场景复刻", "zh-TW": "場景復刻" },
    description: { en: "Shot-by-shot runs", zh: "镜头级复刻", "zh-TW": "鏡頭級復刻" },
    accent: "from-gray-100/80 via-slate-50 to-white",
    badge: "bg-gray-100 text-gray-800 border-gray-200",
    icon: Camera,
  },
};

const TYPE_FILTERS = [
  {
    id: "all" as const,
    icon: LayoutGrid,
    label: { en: "All projects", zh: "全部项目", "zh-TW": "全部專案" },
    description: { en: "Every task you've generated", zh: "查看全部生成记录", "zh-TW": "檢視全部生成紀錄" },
    accent: "from-white via-gray-50 to-gray-100",
  },
  ...Object.entries(TYPE_META)
    .filter(([key]) => key !== "knowledgeVideo" && key !== "replicationShot" && key !== "storyboard")
    .map(([key, meta]) => ({
      id: key as TaskType,
      icon: meta.icon,
      label: meta.label,
      description: meta.description,
      accent: meta.accent,
    })),
];

const STATUS_FILTERS: Array<{ value: string; label: CopyMap }> = [
  { value: "all", label: { en: "All statuses", zh: "全部状态", "zh-TW": "全部狀態" } },
  { value: "COMPLETED", label: { en: "Completed", zh: "已完成", "zh-TW": "已完成" } },
  { value: "READY", label: { en: "Ready", zh: "可下载", "zh-TW": "可下載" } },
  { value: "PROCESSING", label: { en: "Processing", zh: "处理中", "zh-TW": "處理中" } },
  { value: "ANALYZING", label: { en: "Analyzing", zh: "分析中", "zh-TW": "分析中" } },
  { value: "pending", label: { en: "Queued", zh: "排队中", "zh-TW": "排隊中" } },
  { value: "FAILED", label: { en: "Failed", zh: "失败", "zh-TW": "失敗" } },
];

const STATUS_LABELS: Record<string, CopyMap> = {
  COMPLETED: { en: "Completed", zh: "已完成", "zh-TW": "已完成" },
  READY: { en: "Ready", zh: "可下载", "zh-TW": "可下載" },
  PROCESSING: { en: "Processing", zh: "处理中", "zh-TW": "處理中" },
  ANALYZING: { en: "Analyzing", zh: "分析中", "zh-TW": "分析中" },
  RUNNING: { en: "Running", zh: "运行中", "zh-TW": "執行中" },
  IN_PROGRESS: { en: "In progress", zh: "处理中", "zh-TW": "處理中" },
  ACTIVE: { en: "Active", zh: "进行中", "zh-TW": "進行中" },
  PENDING: { en: "Queued", zh: "排队中", "zh-TW": "排隊中" },
  QUEUED: { en: "Queued", zh: "排队中", "zh-TW": "排隊中" },
  GENERATING: { en: "Rendering", zh: "渲染中", "zh-TW": "渲染中" },
  FAILED: { en: "Failed", zh: "失败", "zh-TW": "失敗" },
  ERROR: { en: "Error", zh: "出错", "zh-TW": "錯誤" },
  PUBLISHED: { en: "Published", zh: "已发布", "zh-TW": "已發布" },
  DRAFT: { en: "Draft", zh: "草稿", "zh-TW": "草稿" },
  // Storyboard-specific statuses
  BREAKDOWN_PENDING: { en: "Queued", zh: "等待拆解", "zh-TW": "等待拆解" },
  BREAKDOWN_PROCESSING: { en: "Analyzing", zh: "拆解中", "zh-TW": "拆解中" },
  BREAKDOWN_COMPLETED: { en: "Analyzed", zh: "拆解完成", "zh-TW": "拆解完成" },
  BREAKDOWN_FAILED: { en: "Failed", zh: "拆解失败", "zh-TW": "拆解失敗" },
  SPLIT_PENDING: { en: "Queued", zh: "拆解排队", "zh-TW": "拆解排隊" },
  SPLIT_COMPLETED: { en: "Split ready", zh: "拆解完成", "zh-TW": "拆解完成" },
  IMAGE_GENERATING: { en: "Generating", zh: "生成首帧图", "zh-TW": "生成首幀圖" },
  IMAGE_GENERATION_COMPLETED: { en: "Images ready", zh: "首帧图就绪", "zh-TW": "首幀圖就緒" },
  VIDEO_GENERATING: { en: "Generating", zh: "生成视频", "zh-TW": "生成影片" },
  VIDEO_GENERATION_COMPLETED: { en: "Videos ready", zh: "视频就绪", "zh-TW": "影片就緒" },
  MERGING: { en: "Merging", zh: "拼接中", "zh-TW": "拼接中" },
  MERGE_FAILED: { en: "Failed", zh: "拼接失败", "zh-TW": "拼接失敗" },
  PENDING_IMAGE: { en: "Queued", zh: "待生成", "zh-TW": "待生成" },
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  READY: "bg-emerald-50 text-emerald-700 border-emerald-100",
  IMAGE_GENERATION_COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  VIDEO_GENERATION_COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  BREAKDOWN_COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  PROCESSING: "bg-blue-50 text-blue-700 border-blue-100",
  ANALYZING: "bg-blue-50 text-blue-700 border-blue-100",
  RUNNING: "bg-blue-50 text-blue-700 border-blue-100",
  GENERATING: "bg-blue-50 text-blue-700 border-blue-100",
  IMAGE_GENERATING: "bg-blue-50 text-blue-700 border-blue-100",
  VIDEO_GENERATING: "bg-blue-50 text-blue-700 border-blue-100",
  BREAKDOWN_PROCESSING: "bg-blue-50 text-blue-700 border-blue-100",
  MERGING: "bg-blue-50 text-blue-700 border-blue-100",
  PENDING: "bg-amber-50 text-amber-700 border-amber-100",
  BREAKDOWN_PENDING: "bg-amber-50 text-amber-700 border-amber-100",
  PENDING_IMAGE: "bg-amber-50 text-amber-700 border-amber-100",
  SPLIT_PENDING: "bg-amber-50 text-amber-700 border-amber-100",
  SPLIT_COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  FAILED: "bg-rose-50 text-rose-700 border-rose-100",
  ERROR: "bg-rose-50 text-rose-700 border-rose-100",
  BREAKDOWN_FAILED: "bg-rose-50 text-rose-700 border-rose-100",
  MERGE_FAILED: "bg-rose-50 text-rose-700 border-rose-100",
};

const HEADER_COPY: CopyMap = {
  en: "My Projects",
  zh: "我的项目",
  "zh-TW": "我的專案",
};

const SUBTITLE_COPY: CopyMap = {
  en: "Track every creative task, poster run, or video generation from a single hub.",
  zh: "统一查看所有创作、图文、数字人和复刻任务，进度一目了然。",
  "zh-TW": "統一檢視所有創作、圖文、數字人與復刻任務，掌握每一步進度。",
};

const REFRESH_COPY: CopyMap = {
  en: "Refresh",
  zh: "刷新",
  "zh-TW": "重新整理",
};

const LOAD_MORE_COPY: CopyMap = {
  en: "Load more",
  zh: "加载更多",
  "zh-TW": "載入更多",
};

const LOADING_MORE_COPY: CopyMap = {
  en: "Loading…",
  zh: "加载中…",
  "zh-TW": "載入中…",
};

const STATUS_LABEL_COPY: CopyMap = {
  en: "Status",
  zh: "状态",
  "zh-TW": "狀態",
};

const TYPE_LABEL_COPY: CopyMap = {
  en: "Project type",
  zh: "项目类型",
  "zh-TW": "專案類型",
};

const DATE_LABEL_COPY = {
  created: {
    en: "Created",
    zh: "创建时间",
    "zh-TW": "建立時間",
  },
};

const LOAD_ERROR_COPY: CopyMap = {
  en: "Failed to load projects. Please try again.",
  zh: "加载项目失败，请稍后重试。",
  "zh-TW": "載入專案失敗，請稍後再試。",
};

const EMPTY_STATE_COPY = {
  title: { en: "No projects yet", zh: "暂无项目", "zh-TW": "尚無專案" },
  description: {
    en: "Launch a creative task, poster experiment, or replication to see it listed here.",
    zh: "创建创作任务、图文实验或复刻任务后，进度会显示在这里。",
    "zh-TW": "建立創作、圖文或復刻任務後，進度就會出現在這裡。",
  },
  action: { en: "Start building", zh: "立即创建", "zh-TW": "立即建立" },
};

const RETRY_COPY: CopyMap = {
  en: "Retry",
  zh: "重试",
  "zh-TW": "重試",
};

const RETENTION_NOTICE_COPY: CopyMap = {
  en: "Generated images and videos are retained for 5 days. Please download promptly.",
  zh: "生成的图片和视频素材为您保留 5 天，请及时下载。",
  "zh-TW": "生成的圖片與影片素材為您保留 5 天，請及時下載。",
};

const COMPLETED_STATUSES = new Set(["COMPLETED", "READY", "SUCCESS", "DONE", "FINISHED"]);
const PROCESSING_STATUSES = new Set(["PROCESSING", "ANALYZING", "RUNNING", "PENDING", "QUEUED", "STARTED", "GENERATING"]);
const DIGITAL_HUMAN_COUNTDOWN_STATUSES = new Set(["GENERATING", "PROCESSING", "RUNNING", "ANALYZING", "PENDING", "QUEUED"]);
const FAILED_STATUSES = new Set(["FAILED", "ERROR", "CANCELED"]);

const DIGITAL_HUMAN_COUNTDOWN_PREFIX: CopyMap = {
  en: "ETA",
  zh: "预计剩余",
  "zh-TW": "預計剩餘",
};

const DIGITAL_HUMAN_COUNTDOWN_EXPIRED: CopyMap = {
  en: "Past ETA · waiting callback",
  zh: "超过预计时间，等待回调",
  "zh-TW": "超過預計時間，等待回調",
};

interface MyProjectsClientProps {
  initialTasks?: TaskSummary[];
  initialHasMore?: boolean;
  initialPageSize?: number;
}

function pickCopy(map: CopyMap, language: LanguageCode): string {
  return map[language] ?? map.en;
}

function normalizeLanguage(input: string): LanguageCode {
  if (input === "zh-TW") return "zh-TW";
  if (input === "zh") return "zh";
  return "en";
}

function isTaskType(value: string | null): value is TaskType {
  if (!value) return false;
  return Object.keys(TYPE_META).includes(value);
}

function parseTypeParam(params: URLSearchParams | ReturnType<typeof useSearchParams>): TaskType | "all" {
  const raw = params?.get?.("type") ?? null;
  if (isTaskType(raw)) {
    return raw;
  }
  return "all";
}

function parseStatusParam(params: URLSearchParams | ReturnType<typeof useSearchParams>): string {
  const raw = params?.get?.("status");
  return raw || "all";
}

function getMetadataString(metadata: Record<string, unknown> | null, key: string): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function shouldDisplayMetadataEntry(key: string, value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const normalizedKey = key.toLowerCase();
  if (normalizedKey.includes("url") || normalizedKey.includes("link")) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  return true;
}

function looksLikeVideoUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  const normalized = trimmed.split("?")[0].toLowerCase();
  return normalized.endsWith(".mp4") || normalized.endsWith(".mov") || normalized.endsWith(".webm");
}

function formatTimestamp(dateString: string, locale: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractTitleFromStageOutput(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  const candidate = record.title ?? record.headline ?? record.name;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

type FilterSelectOption<T extends string> = {
  value: T;
  label: string;
};

type FilterSelectProps<T extends string> = {
  label: string;
  value: T;
  options: FilterSelectOption<T>[];
  onChange: (value: T) => void;
};

type FetchMode = "reset" | "append";

type FetchOptions = {
  type: TaskType | "all";
  status: string;
  offset: number;
  mode: FetchMode;
  signal?: AbortSignal;
};

function FilterSelect<T extends string>({ label, value, options, onChange }: FilterSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: Event) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKeydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [open]);

  const handleSelect = (nextValue: T) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex items-center gap-2 rounded-full border border-gray-200/80 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition whitespace-nowrap",
          "hover:border-gray-300 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-200/80",
          "dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-100 dark:hover:border-gray-600 dark:focus-visible:ring-gray-700",
          open && "ring-2 ring-gray-200/80 dark:ring-gray-700"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{selectedOption?.label ?? "—"}</span>
        <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 min-w-[12rem] rounded-2xl border border-gray-100 bg-white/95 p-1.5 shadow-[0_20px_45px_rgba(15,23,42,0.1)] backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
          <ul className="max-h-60 overflow-y-auto py-1" role="listbox">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/70",
                      isSelected && "bg-gray-50 font-semibold text-gray-900 dark:bg-gray-800/70 dark:text-white"
                    )}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span>{option.label}</span>
                    {isSelected && <Check className="h-4 w-4 text-gray-900 dark:text-white" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

type CardActionMenuProps = {
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  disabled?: boolean;
};

function CardActionMenu({ onDownload, onRename, onDelete, disabled }: CardActionMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: Event) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKeydown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [open]);

  const toggleMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    if (disabled) return;
    setOpen((prev) => !prev);
  };

  const handleAction = (action: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setOpen(false);
    action();
  };

  return (
    <div className="absolute right-3 top-3 z-20" ref={containerRef}>
      <button
        type="button"
        onClick={toggleMenu}
        disabled={disabled}
        className={cn(
          "rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 dark:bg-white/15 dark:hover:bg-white/25",
          disabled && "cursor-not-allowed opacity-70",
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-36 rounded-2xl border border-black/10 bg-white/95 p-1 backdrop-blur dark:border-white/10 dark:bg-gray-900/95">
          <button
            type="button"
            onClick={handleAction(onDownload)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800/80"
          >
            <Download className="h-4 w-4" />
            下载
          </button>
          <button
            type="button"
            onClick={handleAction(onRename)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800/80"
          >
            <PencilLine className="h-4 w-4" />
            重命名
          </button>
          <button
            type="button"
            onClick={handleAction(onDelete)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/40"
          >
            <Trash2 className="h-4 w-4" />
            删除
          </button>
        </div>
      )}
    </div>
  );
}

const TaskCard = memo(function TaskCard({
  task,
  langKey,
  locale,
  statusClass,
  statusLabel,
  typeLabel,
  deleting,
  onTaskClick,
  onCardKeyDown,
  onDownload,
  onRename,
  onDelete,
}: TaskCardProps) {
  const statusKey = (task.status || "").toUpperCase();
  const showCountdown =
    task.taskType === "digitalHuman" && DIGITAL_HUMAN_COUNTDOWN_STATUSES.has(statusKey);
  const thumbnailIsVideo = looksLikeVideoUrl(task.thumbnailUrl);
  const isProcessing = PROCESSING_STATUSES.has(statusKey);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onTaskClick(task)}
      onKeyDown={(event) => onCardKeyDown(event, task)}
      className="group relative aspect-[3/4] w-full cursor-pointer overflow-hidden rounded-[24px] border border-black/10 bg-white/90 text-left transition-colors hover:border-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:border-white/10 dark:bg-gray-950/60 dark:hover:border-white/20"
    >
      <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 dark:from-gray-800 dark:via-gray-900 dark:to-black">
        {task.thumbnailUrl ? (
          thumbnailIsVideo ? (
            <video
              src={task.thumbnailUrl}
              className="pointer-events-none h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
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
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300 text-slate-500 dark:from-gray-800 dark:to-gray-900">
            <Clapperboard className="h-8 w-8" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 border border-white/20 dark:border-white/5" />
        <CardActionMenu
          onDownload={() => onDownload(task)}
          onRename={() => onRename(task)}
          onDelete={() => onDelete(task)}
          disabled={deleting}
        />
        <span
          className={cn(
            "pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm",
            statusClass,
          )}
        >
          {statusLabel}
        </span>
        {isProcessing && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="animate-shimmer-sweep absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.45] to-transparent dark:via-white/[0.30]" />
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        <div className="h-36 bg-gradient-to-t from-black/80 via-black/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-3 pb-3 pt-6 sm:px-3">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold leading-snug text-white truncate">
              {task.title || typeLabel}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-white/85">
              <Clock className="h-3.5 w-3.5" />
              {formatTimestamp(task.createdAt, locale)}
            </p>
            {showCountdown && (
              <div className="pt-1">
                <DigitalHumanCountdown
                  startTime={task.createdAt || task.updatedAt}
                  variant="light"
                  runningText={(formatted) =>
                    `${pickCopy(DIGITAL_HUMAN_COUNTDOWN_PREFIX, langKey)} ${formatted}`
                  }
                  expiredText={pickCopy(DIGITAL_HUMAN_COUNTDOWN_EXPIRED, langKey)}
                  className="!border-white/30 !text-white !bg-black/30"
                />
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Keep semantic text in DOM for keyboard/reader parity when overlays hide content */}
      <div className="sr-only">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-gray-700 dark:bg-white/10 dark:text-gray-200">
            {typeLabel}
          </span>
          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5", statusClass)}>
            {statusLabel}
          </span>
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-semibold leading-snug text-gray-900 line-clamp-2 dark:text-white">
            {task.title || typeLabel}
          </p>
          <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Clock className="h-4 w-4" />
            {formatTimestamp(task.createdAt, locale)}
          </p>
          {showCountdown && (
            <div className="pt-1">
              <DigitalHumanCountdown
                startTime={task.createdAt || task.updatedAt}
                variant="light"
                runningText={(formatted) =>
                  `${pickCopy(DIGITAL_HUMAN_COUNTDOWN_PREFIX, langKey)} ${formatted}`
                }
                expiredText={pickCopy(DIGITAL_HUMAN_COUNTDOWN_EXPIRED, langKey)}
                className="dark:bg-black/40 dark:text-white dark:border-white/20"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export function MyProjectsClient({
  initialTasks = [],
  initialHasMore = false,
  initialPageSize = 12,
}: MyProjectsClientProps) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const highlightTaskId = searchParams?.get("taskId");
  const { basePath } = useTenant();
  const dashboardPath = useTenantPath("/dashboard");
  const createPath = `${dashboardPath}#creative`;
  const langKey = normalizeLanguage(language);
  const locale = LANGUAGE_LOCALES[langKey];
  const initialType = useMemo(() => parseTypeParam(searchParams), [searchParams]);
  const initialStatus = useMemo(() => parseStatusParam(searchParams), [searchParams]);
  const [filterType, setFilterType] = useState<TaskType | "all">(initialType);
  const [filterStatus, setFilterStatus] = useState<string>(initialStatus);
  const [tasks, setTasks] = useState<TaskSummary[]>(() => initialTasks);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [pageSize] = useState(initialPageSize);
  const [offset, setOffset] = useState(initialTasks.length);
  const [loading, setLoading] = useState(initialTasks.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TaskSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showPosterWizard, setShowPosterWizard] = useState(false);
  const [showDigitalHumanWizard, setShowDigitalHumanWizard] = useState(false);
  const [wizardScript, setWizardScript] = useState("");
  const [wizardTitle, setWizardTitle] = useState("");
  const [wizardSourceTaskId, setWizardSourceTaskId] = useState("");
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<TaskSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const recentlyClosedTaskRef = useRef<{ taskId?: string | null; id?: string | null }>({});
  const skipInitialFetchRef = useRef(initialTasks.length > 0);
  const authHeadersRef = useRef<Record<string, string> | null>(null);
  const pendingRealtimeUpdatesRef = useRef<Map<string, Partial<TaskSummary>>>(new Map());
  const pendingRealtimeInsertsRef = useRef<TaskSummary[]>([]);
  const realtimeFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRealtimeFlush = useCallback(() => {
    if (realtimeFlushTimerRef.current) return;
    realtimeFlushTimerRef.current = setTimeout(() => {
      realtimeFlushTimerRef.current = null;
      const queuedUpdates = pendingRealtimeUpdatesRef.current;
      const queuedInserts = pendingRealtimeInsertsRef.current;
      if (queuedUpdates.size === 0 && queuedInserts.length === 0) return;
      pendingRealtimeUpdatesRef.current = new Map();
      pendingRealtimeInsertsRef.current = [];
      setTasks((prev) => {
        let next = prev;
        if (queuedUpdates.size > 0) {
          next = prev.map((task) => {
            const patch = queuedUpdates.get(task.id);
            return patch ? { ...task, ...patch } : task;
          });
        }
        if (queuedInserts.length > 0) {
          const existingIds = new Set(next.map((task) => task.id));
          const mergedInserts = queuedInserts.filter((task) => !existingIds.has(task.id));
          if (mergedInserts.length > 0) {
            next = [...mergedInserts, ...next];
          }
        }
        return next;
      });
    }, 120);
  }, []);
  const resolveAuthHeaders = useCallback(async () => {
    if (authHeadersRef.current) {
      return authHeadersRef.current;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    authHeadersRef.current = headers;
    return headers;
  }, []);
  const updateTaskIdParam = useCallback(
    (taskId: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (taskId) {
        params.set("taskId", taskId);
      } else {
        params.delete("taskId");
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const closeActiveTask = useCallback(() => {
    setActiveTask((current) => {
      if (current) {
        recentlyClosedTaskRef.current = { taskId: current.taskId, id: current.id };
      }
      return null;
    });
    updateTaskIdParam(null);
  }, [updateTaskIdParam]);

  const handlePosterLaunchFromModal = useCallback((script: string, title?: string) => {
    setWizardScript(script);
    setWizardTitle(title?.trim() || "");
    closeActiveTask();
    setShowPosterWizard(true);
  }, [closeActiveTask]);

  const handleDigitalHumanLaunchFromModal = useCallback((script: string, sourceTaskId: string) => {
    setWizardScript(script);
    setWizardSourceTaskId(sourceTaskId);
    closeActiveTask();
    setShowDigitalHumanWizard(true);
  }, [closeActiveTask]);

  const openRenameModal = useCallback((task: TaskSummary) => {
    setRenameTarget(task);
    setRenameValue(task.title || "");
    setRenameModalOpen(true);
  }, []);

  const closeRenameModal = useCallback(() => {
    if (renaming) return;
    setRenameModalOpen(false);
    setRenameTarget(null);
    setRenameValue("");
  }, [renaming]);

  const handleRenameSubmit = useCallback(async () => {
    if (!renameTarget) return;
    const nextTitle = renameValue.trim();
    if (!nextTitle) {
      toast.error("请输入项目名称");
      return;
    }
    if (nextTitle.length > 120) {
      toast.error("名称需少于 120 个字符");
      return;
    }
    setRenaming(true);
    try {
      const response = await fetch(`/api/tasks/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "重命名失败");
      }
      setTasks((prev) =>
        prev.map((task) => (task.id === renameTarget.id ? { ...task, title: nextTitle } : task)),
      );
      setActiveTask((prev) =>
        prev && prev.id === renameTarget.id ? { ...prev, title: nextTitle } : prev,
      );
      toast.success("项目名称已更新");
      setRenameModalOpen(false);
      setRenameTarget(null);
      setRenameValue("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重命名失败");
    } finally {
      setRenaming(false);
    }
  }, [renameTarget, renameValue]);

  const pageTitle = t.sidebar?.myVideos || pickCopy(HEADER_COPY, langKey);
  const retentionNotice = pickCopy(RETENTION_NOTICE_COPY, langKey);
  const loadErrorMessage = pickCopy(LOAD_ERROR_COPY, langKey);
  const statusOptions = useMemo<FilterSelectOption<string>[]>(() => {
    return STATUS_FILTERS.map((option) => ({
      value: option.value,
      label: pickCopy(option.label, langKey),
    }));
  }, [langKey]);
  const typeOptions = useMemo<FilterSelectOption<TaskType | "all">[]>(() => {
    return TYPE_FILTERS.map((option) => ({
      value: option.id as TaskType | "all",
      label: pickCopy(option.label, langKey),
    }));
  }, [langKey]);

  useEffect(() => {
    const nextType = parseTypeParam(searchParams);
    if (nextType !== filterType) {
      setFilterType(nextType);
    }
    const nextStatus = parseStatusParam(searchParams);
    if (nextStatus !== filterStatus) {
      setFilterStatus(nextStatus);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      authHeadersRef.current = null;
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (realtimeFlushTimerRef.current) {
        clearTimeout(realtimeFlushTimerRef.current);
        realtimeFlushTimerRef.current = null;
      }
    };
  }, []);

  // Realtime: listen for task_summaries changes so cards update without manual refresh
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user?.id;
      if (!userId) return;

      channel = supabase
        .channel(`my-works-tasks-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'task_summaries',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            const taskId = typeof row.id === "string" ? row.id : null;
            if (!taskId) return;
            const patch: Partial<TaskSummary> = {};
            if (typeof row.status === "string") patch.status = row.status;
            if (typeof row.progress === "number" || row.progress === null) patch.progress = row.progress as number | null;
            if (typeof row.thumbnail_url === "string" || row.thumbnail_url === null) patch.thumbnailUrl = row.thumbnail_url as string | null;
            if (typeof row.title === "string" || row.title === null) patch.title = row.title as string | null;
            if (typeof row.updated_at === "string") patch.updatedAt = row.updated_at;
            if (typeof row.preview === "string" || row.preview === null) patch.preview = row.preview as string | null;
            if (row.metadata === null) {
              patch.metadata = null;
            } else if (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)) {
              patch.metadata = row.metadata as Record<string, unknown>;
            }
            if (Object.keys(patch).length === 0) return;
            const existingPatch = pendingRealtimeUpdatesRef.current.get(taskId);
            pendingRealtimeUpdatesRef.current.set(taskId, existingPatch ? { ...existingPatch, ...patch } : patch);
            scheduleRealtimeFlush();
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'task_summaries',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            const taskId = typeof row.id === "string" ? row.id : null;
            const taskType = typeof row.task_type === "string" ? (row.task_type as TaskType) : null;
            const userIdValue = typeof row.user_id === "string" ? row.user_id : null;
            const linkedTaskId = typeof row.task_id === "string" ? row.task_id : null;
            if (!taskId || !taskType || !userIdValue || !linkedTaskId) return;
            const inserted: TaskSummary = {
              id: taskId,
              userId: userIdValue,
              taskType,
              taskId: linkedTaskId,
              title: (row.title as string | null) ?? null,
              status: typeof row.status === "string" ? row.status : "PENDING",
              preview: (row.preview as string | null) ?? null,
              thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
              progress: row.progress != null ? (row.progress as number) : null,
              metadata: row.metadata != null ? (row.metadata as Record<string, unknown>) : null,
              createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
              updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
            };
            if (!pendingRealtimeInsertsRef.current.some((task) => task.id === inserted.id)) {
              pendingRealtimeInsertsRef.current.push(inserted);
            }
            scheduleRealtimeFlush();
          },
        )
        .subscribe();
    });

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [scheduleRealtimeFlush]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (filterType === "all") {
      params.delete("type");
    } else {
      params.set("type", filterType);
    }
    if (filterStatus === "all") {
      params.delete("status");
    } else {
      params.set("status", filterStatus);
    }
    const nextQuery = params.toString();
    const currentQuery = searchParams?.toString() ?? "";
    if (nextQuery === currentQuery) return;
    router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ""}`, { scroll: false });
  }, [filterStatus, filterType, pathname, router, searchParams]);

  const fetchTasks = useCallback(
    async ({ type, status, offset: fetchOffset, mode, signal }: FetchOptions) => {
      const isAppend = mode === "append";
      if (isAppend) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      const params = new URLSearchParams();
      if (type !== "all") params.set("taskType", type);
      if (status !== "all") params.set("status", status);
      params.set("limit", pageSize.toString());
      params.set("offset", fetchOffset.toString());

      try {
        const headers = await resolveAuthHeaders();
        const response = await fetch(`/api/tasks?${params.toString()}`, {
          signal,
          cache: "no-store",
          headers: { ...headers },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401) {
            authHeadersRef.current = null;
          }
          throw new Error(payload?.error || loadErrorMessage);
        }
        if (signal?.aborted) return;

        const items = Array.isArray(payload?.data) ? (payload.data as TaskSummary[]) : [];
        const pagination = (payload?.pagination ?? {}) as { hasMore?: boolean } | undefined;

        setHasMore(Boolean(pagination?.hasMore));
        setOffset(fetchOffset + items.length);

        if (isAppend) {
          setTasks((prev) => {
            if (items.length === 0) return prev;
            const existingIds = new Set(prev.map((task) => task.id));
            const merged = [...prev];
            items.forEach((item) => {
              if (!existingIds.has(item.id)) {
                merged.push(item);
              }
            });
            return merged;
          });
        } else {
          setTasks(items);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const message = (err as Error).message || loadErrorMessage;
        setError(message);
        if (!isAppend) {
          setTasks([]);
          setHasMore(false);
          setOffset(0);
        }
      } finally {
        if (!signal?.aborted) {
          if (isAppend) {
            setLoadingMore(false);
          } else {
            setLoading(false);
          }
        }
      }
    },
    [loadErrorMessage, pageSize, resolveAuthHeaders]
  );

  useEffect(() => {
    const controller = new AbortController();
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return () => controller.abort();
    }
    setOffset(0);
    void fetchTasks({
      type: filterType,
      status: filterStatus,
      offset: 0,
      mode: "reset",
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [fetchTasks, filterStatus, filterType]);

  useEffect(() => {
    if (!highlightTaskId) {
      recentlyClosedTaskRef.current = {};
      return;
    }
    if (tasks.length === 0) return;
    if (
      recentlyClosedTaskRef.current.taskId === highlightTaskId ||
      recentlyClosedTaskRef.current.id === highlightTaskId
    ) {
      return;
    }
    const target = tasks.find(
      (task) => task.taskId === highlightTaskId || task.id === highlightTaskId,
    );
    if (target && target.id !== activeTask?.id) {
      setActiveTask(target);
    }
  }, [activeTask?.id, highlightTaskId, tasks]);

  const handleRefresh = () => {
    skipInitialFetchRef.current = false;
    setOffset(0);
    void fetchTasks({ type: filterType, status: filterStatus, offset: 0, mode: "reset" });
  };

  const handleTaskClick = useCallback((task: TaskSummary) => {
    if (task.taskType === "storyboard") {
      router.push(`${basePath}/storyboard/${task.taskId}`);
      return;
    }
    setActiveTask(task);
    updateTaskIdParam(task.taskId);
  }, [basePath, router, updateTaskIdParam]);

  const handleCardKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>, task: TaskSummary) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleTaskClick(task);
    }
  }, [handleTaskClick]);

  const handleOpenTask = (task: TaskSummary | null) => {
    if (!task) return;
    const isText2ImagePoster = isText2ImagePosterTask(task);
    if (isText2ImagePoster) {
      router.push(`${basePath}/xhs-poster?taskId=${task.taskId}`);
      return;
    }
    if (task.taskType === "grid") {
      const splitId = (() => {
        const meta = toRecord(task.metadata);
        const value = meta?.splitStoryboardId;
        return typeof value === "string" && value.trim() ? value.trim() : null;
      })();
      if (splitId) {
        router.push(`${basePath}/storyboard/${splitId}`);
        return;
      }
    }
    const relativePath = TASK_TYPE_ROUTE_PATHS[task.taskType]?.(task.taskId);
    if (relativePath) {
      // relativePath starts with '/', basePath has no trailing slash
      // Do NOT call closeActiveTask() here — its router.replace() would cancel this push navigation
      router.push(`${basePath}${relativePath}`);
    }
  };

  const resolveTaskImageUrls = useCallback(async (task: TaskSummary): Promise<string[]> => {
    const collectFallbackImages = () => {
      const metadataRecord = toRecord(task.metadata);
      const metadataImages = [
        getMetadataString(task.metadata, "imageUrl"),
        getMetadataString(task.metadata, "gridImageUrl"),
        getMetadataString(task.metadata, "storyboardImageUrl"),
      ].filter((url): url is string => Boolean(url && url.startsWith("http")));
      const storyboardImages = getStringArray(metadataRecord?.storyboardImages).filter((url) =>
        /^https?:\/\//i.test(url),
      );
      const thumbnailFallback =
        task.thumbnailUrl && !looksLikeVideoUrl(task.thumbnailUrl) ? [task.thumbnailUrl] : [];
      return Array.from(new Set([...metadataImages, ...storyboardImages, ...thumbnailFallback]));
    };

    const taskLooksLikeText2Image = task.taskType === "creative" || isText2ImagePosterTask(task);

    if (taskLooksLikeText2Image) {
      const cachedDetail = getCachedValue(creativeDetailCache, task.taskId);
      if (cachedDetail) {
        const cachedImages = (cachedDetail.generatedImages || [])
          .map((img) => img?.url)
          .filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url));
        if (cachedImages.length > 0) {
          return Array.from(new Set(cachedImages));
        }
      }

      try {
        const headers = await resolveAuthHeaders();
        const response = await fetch(`/api/creative-tasks/${task.taskId}`, {
          cache: "no-store",
          headers: { ...headers },
        });
        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          const detail = (payload?.data ?? null) as CreativeTaskDetail | null;
          if (detail) {
            setCachedValue(creativeDetailCache, task.taskId, detail, 60_000);
            const detailImages = (detail.generatedImages || [])
              .map((img) => img?.url)
              .filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url));
            if (detailImages.length > 0) {
              return Array.from(new Set(detailImages));
            }
          }
        }
      } catch {
        // ignore and continue fallback
      }
    }

    if (task.taskType === "poster" && !isText2ImagePosterTask(task)) {
      const cachedImages = getCachedValue(posterImagesCache, task.taskId);
      if (cachedImages && cachedImages.length > 0) {
        return Array.from(new Set(cachedImages));
      }

      try {
        const headers = await resolveAuthHeaders();
        const response = await fetch(`/api/xhs-images/jobs/${task.taskId}`, {
          cache: "no-store",
          headers: { ...headers },
        });
        if (response.ok) {
          const payload = await response.json().catch(() => ({}));
          const posterImages = Array.isArray(payload?.data?.images)
            ? payload.data.images
                .map((img: { imageUrl?: unknown }) =>
                  typeof img?.imageUrl === "string" ? img.imageUrl : "",
                )
                .filter((url: string) => /^https?:\/\//i.test(url))
            : [];
          if (posterImages.length > 0) {
            setCachedValue(posterImagesCache, task.taskId, posterImages, 60_000);
            return Array.from(new Set(posterImages));
          }
        }
      } catch {
        // ignore and continue fallback
      }
    }

    return collectFallbackImages();
  }, [resolveAuthHeaders]);

  const handleDownloadTask = useCallback(async (task: TaskSummary | null, images?: string[]) => {
    if (!task) return;

    const behavesLikeText2Image = task.taskType === "creative" || isText2ImagePosterTask(task);
    const imageTaskType = behavesLikeText2Image || task.taskType === "poster" || task.taskType === "grid";
    const resolvedImages =
      Array.isArray(images) && images.length > 0
        ? images
        : imageTaskType
          ? await resolveTaskImageUrls(task)
          : [];
    const hasBatchImages = resolvedImages.length > 0;

    // 图文任务：下载全部图片
    if (hasBatchImages && imageTaskType) {
      const uniqueImages = Array.from(new Set(resolvedImages.filter((item) => typeof item === "string" && item.trim().length > 0)));
      const baseName = sanitizeFileBase(task.title || "image", "image");

      // Mobile Safari/WebView often blocks async-queued multi-downloads.
      // Keep all trigger calls in the same direct user-gesture tick.
      if (typeof window !== "undefined" && isMobileBrowser()) {
        uniqueImages.forEach((imageUrl, index) => {
          const ext = inferImageExtension(imageUrl);
          const filename = `${baseName}_${index + 1}.${ext}`;
          const downloadUrl = toDownloadUrl(imageUrl, filename);
          triggerBrowserDownload(downloadUrl, filename, { forceAnchorOnMobile: true });
        });
        toast.success(`已开始下载 ${uniqueImages.length} 张图片`);
        return;
      }

      const concurrency = 3;
      const pending = [...uniqueImages];
      const failures: string[] = [];
      let nextIndex = 0;
      const downloadOne = async (imageUrl: string, index: number) => {
        const ext = inferImageExtension(imageUrl);
        const filename = `${baseName}_${index + 1}.${ext}`;
        const downloadUrl = toDownloadUrl(imageUrl, filename);
        triggerBrowserDownload(downloadUrl, filename, { forceAnchorOnMobile: true });
      };

      const workers = Array.from({ length: Math.min(concurrency, pending.length) }).map(async () => {
        while (pending.length > 0) {
          const url = pending.shift();
          if (!url) continue;
          const currentIndex = nextIndex++;
          try {
            await downloadOne(url, currentIndex);
            await new Promise((resolve) => setTimeout(resolve, 120));
          } catch {
            failures.push(url);
          }
        }
      });

      await Promise.all(workers);
      if (failures.length > 0) {
        toast.error(`已下载部分图片，${failures.length} 张失败`);
      } else {
        toast.success(`已开始下载 ${uniqueImages.length} 张图片`);
      }
      return;
    }

    // 数字人/视频：直接下载
    const metadataVideo =
      getMetadataString(task.metadata, "videoUrl") ||
      getMetadataString(task.metadata, "resultUrl") ||
      null;
    const videoUrl =
      (metadataVideo && metadataVideo.startsWith("http") ? metadataVideo : null) ||
      (looksLikeVideoUrl(task.thumbnailUrl) ? task.thumbnailUrl : null);
    if (!videoUrl) {
      toast.error("暂无可下载内容");
      return;
    }
    const safeName = sanitizeFileBase(task.title || task.taskType, task.taskType || "video");
    triggerBrowserDownload(toDownloadUrl(videoUrl, `${safeName}.mp4`), `${safeName}.mp4`);
  }, [resolveTaskImageUrls]);

  const handleDeleteTask = useCallback(
    async (task: TaskSummary | null) => {
      if (!task) return;
      setDeletingId(task.id);
      try {
        const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || "删除失败");
        }
        toast.success("任务已删除");
        // Set guard ref before closing to prevent useEffect from re-opening the modal
        // while fetchTasks is still in-flight (old tasks still in state)
        recentlyClosedTaskRef.current = { taskId: task.taskId, id: task.id };
        if (highlightTaskId && (task.taskId === highlightTaskId || task.id === highlightTaskId)) {
          updateTaskIdParam(null);
        }
        setActiveTask((prev) => (prev?.id === task.id ? null : prev));
        await fetchTasks({ type: filterType, status: filterStatus, offset: 0, mode: "reset" });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "删除失败");
      } finally {
        setDeletingId(null);
      }
    },
    [fetchTasks, filterStatus, filterType, highlightTaskId, updateTaskIdParam]
  );

  const retryLoad = () => {
    setOffset(0);
    skipInitialFetchRef.current = false;
    void fetchTasks({ type: filterType, status: filterStatus, offset: 0, mode: "reset" });
  };

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    void fetchTasks({ type: filterType, status: filterStatus, offset, mode: "append" });
  };

  return (
    <div className="max-w-screen-2xl mx-auto space-y-8">
      <div className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{pageTitle}</h1>
            <div className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-xs font-medium text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-300" />
              <span className="leading-tight">{retentionNotice}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading || loadingMore}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                "border-gray-200 bg-white/90 text-gray-700 shadow-sm hover:bg-white disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100 dark:hover:bg-gray-800"
              )}
            >
              <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
              {pickCopy(REFRESH_COPY, langKey)}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <FilterSelect
            label={pickCopy(STATUS_LABEL_COPY, langKey)}
            value={filterStatus}
            options={statusOptions}
            onChange={(next) => setFilterStatus(next)}
          />
          <FilterSelect
            label={pickCopy(TYPE_LABEL_COPY, langKey)}
            value={filterType}
            options={typeOptions}
            onChange={(next) => setFilterType(next)}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 flex items-center justify-between gap-4 dark:border-rose-900/40 dark:bg-rose-900/20">
          <p className="text-sm text-rose-800 dark:text-rose-200">{error}</p>
          <button
            type="button"
            onClick={retryLoad}
            className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/40"
          >
            {pickCopy(RETRY_COPY, langKey)}
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="w-full aspect-[3/4] animate-pulse rounded-[24px] border border-black/10 bg-white/75 dark:border-white/10 dark:bg-gray-900/60"
            />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-white/70 p-12 text-center dark:border-gray-700 dark:bg-gray-900/40">
          <h3 className="text-2xl font-semibold text-gray-900 dark:text-white">{pickCopy(EMPTY_STATE_COPY.title, langKey)}</h3>
          <p className="mt-2 max-w-xl text-gray-600 dark:text-gray-300">{pickCopy(EMPTY_STATE_COPY.description, langKey)}</p>
          <button
            type="button"
            onClick={() => router.push(createPath)}
            className="mt-6 inline-flex items-center rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow dark:bg-white dark:text-gray-900"
          >
            {pickCopy(EMPTY_STATE_COPY.action, langKey)}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {tasks.map((task) => {
              const typeMeta = TYPE_META[task.taskType];
              const typeLabel = pickCopy(typeMeta?.label || HEADER_COPY, langKey);
              const statusKey = (task.status || "").toUpperCase();
              const statusLabel = pickCopy(
                STATUS_LABELS[statusKey] || {
                  en: task.status || "Unknown",
                  zh: task.status || "未识别",
                  "zh-TW": task.status || "未識別",
                },
                langKey,
              );
              const statusClass = STATUS_BADGE_CLASS[statusKey] || "bg-white/20 text-white border-white/30";
              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  langKey={langKey}
                  locale={locale}
                  statusClass={statusClass}
                  statusLabel={statusLabel}
                  typeLabel={typeLabel}
                  deleting={deletingId === task.id}
                  onTaskClick={handleTaskClick}
                  onCardKeyDown={handleCardKeyDown}
                  onDownload={handleDownloadTask}
                  onRename={openRenameModal}
                  onDelete={handleDeleteTask}
                />
              );
            })}
          </div>
          {(hasMore || loadingMore) && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore || !hasMore}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                {loadingMore ? pickCopy(LOADING_MORE_COPY, langKey) : pickCopy(LOAD_MORE_COPY, langKey)}
              </button>
            </div>
          )}
        </div>
      )}
      {activeTask && (
        <TaskDetailModal
          task={activeTask}
          langKey={langKey}
          basePath={basePath}
          onClose={closeActiveTask}
          onOpen={() => handleOpenTask(activeTask)}
          onDownload={(images) => handleDownloadTask(activeTask, images)}
          onDelete={() => handleDeleteTask(activeTask)}
          deleting={deletingId === activeTask.id}
          onPosterLaunch={handlePosterLaunchFromModal}
          onDigitalHumanLaunch={handleDigitalHumanLaunchFromModal}
        />
      )}
      {renameModalOpen && renameTarget && (
        <Modal
          isOpen={renameModalOpen}
          onClose={closeRenameModal}
          title="重命名项目"
          maxWidth="max-w-md"
          zIndex="z-[10000]"
        >
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">项目名称</label>
              <input
                type="text"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                maxLength={120}
                autoFocus
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900/60 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:border-white dark:focus:ring-white/20"
                placeholder="请输入项目名称"
              />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {renameValue.trim().length}/120
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeRenameModal}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleRenameSubmit}
                disabled={renaming}
                className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                {renaming ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showPosterWizard && (
        <Modal
          isOpen={showPosterWizard}
          onClose={() => setShowPosterWizard(false)}
          title="生成图文"
          maxWidth="max-w-2xl"
          zIndex="z-[10000]"
        >
          <QuickPosterForm
            onClose={() => setShowPosterWizard(false)}
            initialIdeaText={wizardScript}
            initialTitle={wizardTitle}
            onSubmitted={(taskId) => {
              setShowPosterWizard(false);
              setWizardScript("");
              setWizardTitle("");
              setFilterType("all");
              setFilterStatus("all");
              toast.success("新的图文任务卡片已创建");
              if (taskId) {
                updateTaskIdParam(taskId);
              }
              void fetchTasks({ type: "all", status: "all", offset: 0, mode: "reset" });
            }}
          />
        </Modal>
      )}
      {showDigitalHumanWizard && (
        <Modal isOpen={showDigitalHumanWizard} onClose={() => setShowDigitalHumanWizard(false)} title="生成数字人" maxWidth="max-w-6xl" zIndex="z-[10000]">
          <DigitalHumanModal onClose={() => setShowDigitalHumanWizard(false)} defaultScript={wizardScript} sourceTaskId={wizardSourceTaskId} hideInternalTitle showAssistant={false} />
        </Modal>
      )}
    </div>
  );
}

interface TaskDetailModalProps {
  task: TaskSummary;
  langKey: LanguageCode;
  basePath: string;
  onClose: () => void;
  onOpen: () => void;
  onDownload: (images?: string[]) => void;
  onDelete: () => void;
  deleting: boolean;
  onPosterLaunch?: (script: string, title?: string) => void;
  onDigitalHumanLaunch?: (script: string, taskId: string) => void;
}

function TaskDetailModal({ task, langKey, basePath, onClose, onOpen, onDownload, onDelete, deleting, onPosterLaunch, onDigitalHumanLaunch }: TaskDetailModalProps) {
  const router = useRouter();
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      setPortalRoot(document.body);
    }
  }, []);

  const typeMeta = TYPE_META[task.taskType];
  const typeLabel = pickCopy(typeMeta?.label || HEADER_COPY, langKey);
  const statusKey = (task.status || "").toUpperCase();
  const statusLabel = pickCopy(STATUS_LABELS[statusKey] || { en: task.status || "Unknown", zh: task.status || "未识别", "zh-TW": task.status || "未識別" }, langKey);
  const metadataVideoUrl = getMetadataString(task.metadata, "videoUrl") || getMetadataString(task.metadata, "resultUrl") || null;
  const fallbackVideoUrlFromThumbnail = looksLikeVideoUrl(task.thumbnailUrl) ? task.thumbnailUrl : null;
  const metadataRecord = toRecord(task.metadata);
  const metadataReplicationResult = parseRecordLike(metadataRecord?.replicationResult);

  const isReplication = task.taskType === "replication";
  const isCreative = task.taskType === "creative";
  const isPoster = task.taskType === "poster";
  const isDigitalHuman = task.taskType === "digitalHuman";
  const isGrid = task.taskType === "grid";
  const isStoryboard = task.taskType === "storyboard";
  const isText2ImagePoster = isText2ImagePosterTask(task);
  const behavesLikeCreative = isCreative || isText2ImagePoster;
  const gridMetadata = isGrid ? metadataRecord : null;

  const shouldFetchReplicationDetail = isReplication;
  const [replicationDetail, setReplicationDetail] = useState<ReplicationDetailPayload | null>(null);
  const [replicationDetailLoading, setReplicationDetailLoading] = useState(false);
  const [replicationDetailError, setReplicationDetailError] = useState<string | null>(null);
  const [downloadingOverride, setDownloadingOverride] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [t2vStatus, setT2vStatus] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [t2vStoryboardId, setT2vStoryboardId] = useState<string | null>(null);
  const [t2vError, setT2vError] = useState<string | null>(null);
  const [t2vStyleModalOpen, setT2vStyleModalOpen] = useState(false);
  const [t2vStyles, setT2vStyles] = useState<(StylePresetLite & { metadata?: unknown })[]>([]);
  const [t2vStylesLoading, setT2vStylesLoading] = useState(false);
  const [t2vSelectedStyleId, setT2vSelectedStyleId] = useState<string | null>(null);
  const [t2vAllowText, setT2vAllowText] = useState(false);
  const gridStoryboardImages = isGrid ? getStringArray(gridMetadata?.storyboardImages as unknown) : [];
  const gridSplitStoryboardIdFromMeta =
    isGrid && typeof (gridMetadata?.splitStoryboardId as unknown) === "string"
      ? (gridMetadata?.splitStoryboardId as string)
      : null;
  const [gridSplitStoryboardId, setGridSplitStoryboardId] = useState<string | null>(gridSplitStoryboardIdFromMeta);
  const [gridSplitLoading, setGridSplitLoading] = useState(false);
  const [gridSplitError, setGridSplitError] = useState<string | null>(null);
  const [storyboardDetail, setStoryboardDetail] = useState<{
    storyboardImageUrl?: string | null;
    status?: string | null;
    progress?: number | null;
  } | null>(null);
  const [storyboardLoading, setStoryboardLoading] = useState(false);
  const [storyboardError, setStoryboardError] = useState<string | null>(null);
  const storyboardRequestIdRef = useRef(0);
  const [splittingStoryboard, setSplittingStoryboard] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [creativeDetail, setCreativeDetail] = useState<CreativeTaskDetail | null>(null);
  const [creativeDetailLoading, setCreativeDetailLoading] = useState(false);
  const [creativeDetailError, setCreativeDetailError] = useState<string | null>(null);
  const [digitalHumanDetail, setDigitalHumanDetail] = useState<DigitalHumanDetailPayload | null>(null);

  useEffect(() => {
    if (!shouldFetchReplicationDetail) {
      setReplicationDetail(null);
      setReplicationDetailError(null);
      setReplicationDetailLoading(false);
      return;
    }
    const cachedDetail = getCachedValue(replicationDetailCache, task.taskId);
    if (cachedDetail !== undefined) {
      setReplicationDetail(cachedDetail);
      setReplicationDetailError(null);
      setReplicationDetailLoading(false);
      return;
    }
    let cancelled = false;
    setReplicationDetailLoading(true);
    setReplicationDetailError(null);
    supabase.auth
      .getSession()
      .then(({ data: sessionData }) => sessionData.session?.access_token)
      .then(async (token) => {
        const response = await fetch(`/api/replication/${task.taskId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "加载复刻结果失败");
        }
        if (cancelled) return;
        const data = payload?.data as ReplicationDetailPayload | undefined;
        setReplicationDetail(
          data
            ? {
                ...data,
                result: parseRecordLike(data.result) ?? null,
              }
            : null,
        );
        setCachedValue(replicationDetailCache, task.taskId, data
          ? {
              ...data,
              result: parseRecordLike(data.result) ?? null,
            }
          : null, 60_000);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setReplicationDetail(null);
        setReplicationDetailError(error instanceof Error ? error.message : "加载复刻结果失败");
      })
      .finally(() => {
        if (!cancelled) {
          setReplicationDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [shouldFetchReplicationDetail, task.taskId]);

  useEffect(() => {
    if (!isDigitalHuman) {
      setDigitalHumanDetail(null);
      return;
    }

    const existingScript = (getMetadataString(task.metadata, "scriptContent") || "").trim();
    if (existingScript) {
      setDigitalHumanDetail(null);
      return;
    }

    const cached = getCachedValue(digitalHumanDetailCache, task.taskId);
    if (cached !== undefined) {
      setDigitalHumanDetail(cached);
      return;
    }

    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data: sessionData }) => sessionData.session?.access_token)
      .then(async (token) => {
        const response = await fetch(`/api/digital-human/videos/${task.taskId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error((payload as { error?: string }).error || "加载数字人任务详情失败");
        }
        if (cancelled) return;
        const data = (payload as { data?: DigitalHumanDetailPayload }).data ?? null;
        setDigitalHumanDetail(data);
        setCachedValue(digitalHumanDetailCache, task.taskId, data, 60_000);
      })
      .catch(() => {
        if (cancelled) return;
        setDigitalHumanDetail(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isDigitalHuman, task.metadata, task.taskId]);

  const fetchedResultRecord = shouldFetchReplicationDetail
    ? toRecord(replicationDetail?.result)
    : null;
  const fetchedFinalResult = shouldFetchReplicationDetail
    ? parseRecordLike(fetchedResultRecord?.finalResult)
    : null;

  const replicationResultRecord = fetchedResultRecord || metadataReplicationResult;
  const replicationFinalResult =
    fetchedFinalResult || parseRecordLike(replicationResultRecord?.finalResult);

  const replicationVideoUrl =
    normalizeHttpUrl(
      readStringField(replicationResultRecord, "videoUrl") ||
        readStringField(replicationResultRecord, "resultUrl") ||
        readStringField(replicationResultRecord, "result_url"),
    ) || normalizeHttpUrl(readStringField(replicationFinalResult, "videoUrl"));

  const replicationThumbnailUrl =
    normalizeHttpUrl(
      readStringField(replicationResultRecord, "thumbnailUrl") ||
        readStringField(replicationResultRecord, "coverUrl"),
    ) || normalizeHttpUrl(readStringField(replicationFinalResult, "thumbnailUrl"));

  const replicationGeneratedScript =
    readStringField(replicationFinalResult, "generatedScript") ||
    readStringField(replicationResultRecord, "generatedScript");
  const replicationPromptText =
    readStringField(replicationFinalResult, "videoPrompt") ||
    readStringField(replicationResultRecord, "videoPrompt") ||
    readStringField(replicationResultRecord, "prompt");
  const replicationPromptReady = Boolean(replicationGeneratedScript || replicationPromptText);

  const normalizedMetadataVideo = metadataVideoUrl && metadataVideoUrl.startsWith("http") ? metadataVideoUrl : null;
  const fetchStoryboardDetail = useCallback(async () => {
    if (!isStoryboard) {
      setStoryboardDetail(null);
      setStoryboardError(null);
      setStoryboardLoading(false);
      return;
    }
    const shouldBypassCache = isProcessingStatus(task.status);
    if (!shouldBypassCache) {
      const cachedStoryboard = getCachedValue(storyboardDetailCache, task.taskId);
      if (cachedStoryboard !== undefined) {
        setStoryboardDetail(cachedStoryboard);
        setStoryboardError(null);
        setStoryboardLoading(false);
        return;
      }
    }
    const requestId = ++storyboardRequestIdRef.current;
    setStoryboardLoading(true);
    setStoryboardError(null);
    try {
      const response = await fetch(`/api/canvas/grid?taskId=${task.taskId}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (response.status === 404) {
        if (storyboardRequestIdRef.current === requestId) {
          setStoryboardDetail(null);
        }
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error || "加载九宫格失败");
      }
      if (storyboardRequestIdRef.current !== requestId) return;
      const nextDetail = {
        storyboardImageUrl: typeof payload?.storyboard_image_url === "string" ? payload.storyboard_image_url : null,
        status: payload?.status ? String(payload.status).toUpperCase() : null,
        progress: typeof payload?.progress === "number" ? payload.progress : null,
      };
      setStoryboardDetail(nextDetail);
      setCachedValue(storyboardDetailCache, task.taskId, nextDetail, shouldBypassCache ? 10_000 : 60_000);
    } catch (error) {
      if (storyboardRequestIdRef.current !== requestId) return;
      setStoryboardError(error instanceof Error ? error.message : "加载九宫格失败");
      setStoryboardDetail(null);
    } finally {
      if (storyboardRequestIdRef.current === requestId) {
        setStoryboardLoading(false);
      }
    }
  }, [isStoryboard, task.status, task.taskId]);

  useEffect(() => {
    void fetchStoryboardDetail();
  }, [fetchStoryboardDetail]);

  const primaryVideoUrl = normalizedMetadataVideo || replicationVideoUrl || fallbackVideoUrlFromThumbnail;
  const storyboardImageUrl = isStoryboard
    ? storyboardDetail?.storyboardImageUrl || task.thumbnailUrl || null
    : null;
  const gridMetadataImage =
    isGrid && typeof gridMetadata?.gridImageUrl === "string" && gridMetadata.gridImageUrl.trim()
      ? gridMetadata.gridImageUrl
      : null;
  const hasVideo = Boolean(primaryVideoUrl);

  const previewImageUrl = isStoryboard
    ? storyboardImageUrl
    : isGrid
      ? gridMetadataImage || task.thumbnailUrl || null
      : replicationThumbnailUrl || task.thumbnailUrl || null;
  const showImageGallery = (behavesLikeCreative || (isPoster && !isText2ImagePoster)) && !hasVideo;

  // Load images for creative (text2image) tasks
  const [images, setImages] = useState<string[]>(() =>
    (previewImageUrl ? [previewImageUrl] : (task.thumbnailUrl ? [task.thumbnailUrl] : []))
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  const creativeRequestRef = useRef(0);
  const posterRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // For creative/text2image tasks: fetch generatedImagesJson via the task detail API
    if (behavesLikeCreative) {
      const cachedDetail = getCachedValue(creativeDetailCache, task.taskId);
      if (cachedDetail !== undefined) {
        setCreativeDetail(cachedDetail);
        const imgs: string[] = (cachedDetail?.generatedImages || [])
          .map((img: { url?: string }) => img.url)
          .filter((u: string | undefined): u is string => Boolean(u));
        setImages(imgs.length ? imgs : task.thumbnailUrl ? [task.thumbnailUrl] : []);
        setImageIndex(0);
        setImageLoading(false);
        setCreativeDetailLoading(false);
        setCreativeDetailError(null);
        return () => { cancelled = true; };
      }
      const requestId = ++creativeRequestRef.current;
      const controller = new AbortController();
      setImages(previewImageUrl ? [previewImageUrl] : task.thumbnailUrl ? [task.thumbnailUrl] : []);
      setImageIndex(0);
      setImageLoading(true);
      setCreativeDetailLoading(true);
      setCreativeDetailError(null);
      supabase.auth.getSession().then(({ data: sessionData }) => {
        const token = sessionData.session?.access_token;
        return fetch(`/api/creative-tasks/${task.taskId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
          cache: "no-store",
        });
      }).then((res) => {
          if (!res.ok) {
            return res.json().catch(() => ({})).then((payload) => {
              const message = payload?.error || "加载创作任务失败";
              throw new Error(message);
            });
          }
          return res.json();
        })
        .then((payload) => {
          if (cancelled || creativeRequestRef.current !== requestId) return;
          const detail = payload?.data as CreativeTaskDetail | undefined;
          setCreativeDetail(detail ?? null);
          setCachedValue(creativeDetailCache, task.taskId, detail ?? null, 60_000);
          const imgs: string[] = (detail?.generatedImages || [])
            .map((img: { url?: string }) => img.url)
            .filter((u: string | undefined): u is string => Boolean(u));
          setImages(imgs.length ? imgs : task.thumbnailUrl ? [task.thumbnailUrl] : []);
          setImageIndex(0);
          setCreativeDetailError(null);
          // 恢复 t2v 状态（关闭弹窗后重新打开仍能显示生成中或结果）
          const customMeta = (detail?.metadata?.custom as Record<string, unknown> | null | undefined);
          if (customMeta?.t2v_status === 'done' && typeof customMeta?.t2v_storyboard_id === 'string') {
            setT2vStoryboardId(customMeta.t2v_storyboard_id);
            setT2vStatus('done');
          } else if (customMeta?.t2v_status === 'processing') {
            setT2vStatus('pending');
          }
        })
        .catch((error: unknown) => {
          if (cancelled || (error instanceof Error && error.name === "AbortError")) return;
          setCreativeDetail(null);
          setCreativeDetailError(error instanceof Error ? error.message : "创作任务数据获取失败");
          setImages(previewImageUrl ? [previewImageUrl] : task.thumbnailUrl ? [task.thumbnailUrl] : []);
        })
        .finally(() => {
          if (!cancelled && creativeRequestRef.current === requestId) {
            setImageLoading(false);
            setCreativeDetailLoading(false);
          }
        });
      return () => {
        cancelled = true;
        controller.abort();
      };
    }
    // For regular poster tasks: fetch from xhs-images API
    if (isPoster && !isText2ImagePoster) {
      const cachedImages = getCachedValue(posterImagesCache, task.taskId);
      if (cachedImages !== undefined) {
        setImages(cachedImages.length ? cachedImages : task.thumbnailUrl ? [task.thumbnailUrl] : []);
        setImageIndex(0);
        setImageLoading(false);
        return () => { cancelled = true; };
      }
      const requestId = ++posterRequestRef.current;
      const controller = new AbortController();
      setImages(previewImageUrl ? [previewImageUrl] : task.thumbnailUrl ? [task.thumbnailUrl] : []);
      setImageIndex(0);
      setImageLoading(true);
      fetch(`/api/xhs-images/jobs/${task.taskId}`, { signal: controller.signal })
        .then((res) => (res && res.ok ? res.json() : null))
        .then((payload) => {
          if (cancelled || posterRequestRef.current !== requestId) return;
          const imgs: string[] = (payload?.data?.images || [])
            .map((img: { imageUrl?: string }) => img.imageUrl)
            .filter((u: string | undefined): u is string => Boolean(u));
          setCachedValue(posterImagesCache, task.taskId, imgs, 60_000);
          setImages(imgs.length ? imgs : task.thumbnailUrl ? [task.thumbnailUrl] : []);
          setImageIndex(0);
        })
        .catch((error) => {
          if (cancelled || (error instanceof Error && error.name === "AbortError")) return;
          if (posterRequestRef.current !== requestId) return;
          setImages(previewImageUrl ? [previewImageUrl] : task.thumbnailUrl ? [task.thumbnailUrl] : []);
        })
        .finally(() => {
          if (!cancelled && posterRequestRef.current === requestId) setImageLoading(false);
        });
      return () => {
        cancelled = true;
        controller.abort();
      };
    }
    setImages(previewImageUrl ? [previewImageUrl] : task.thumbnailUrl ? [task.thumbnailUrl] : []);
    setImageIndex(0);
    setImageLoading(false);
    setCreativeDetail(null);
    setCreativeDetailError(null);
    setCreativeDetailLoading(false);
  }, [behavesLikeCreative, isPoster, isText2ImagePoster, task, previewImageUrl]);

  // Subscribe to creative_tasks changes to detect t2v completion
  useEffect(() => {
    if (!isCreative || t2vStatus !== 'pending') return;

    const channel = supabase
      .channel(`t2v-${task.taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'creative_tasks',
          filter: `id=eq.${task.taskId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const meta = row.metadata as Record<string, unknown> | null;
          const custom = meta?.custom as Record<string, unknown> | null | undefined;
          if (custom?.t2v_status === 'done' && typeof custom?.t2v_storyboard_id === 'string') {
            setT2vStoryboardId(custom.t2v_storyboard_id);
            setT2vStatus('done');
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isCreative, t2vStatus, task.taskId]);

  useEffect(() => {
    if (!isGrid) return;
    setGridSplitStoryboardId(gridSplitStoryboardIdFromMeta);
  }, [isGrid, gridSplitStoryboardIdFromMeta]);

  useEffect(() => {
    if (!showImageGallery || images.length <= 1) return;
    const nextIndex = (imageIndex + 1) % images.length;
    const nextUrl = images[nextIndex];
    if (!nextUrl) return;
    const cached = getCachedValue(imagePrefetchCache, nextUrl);
    if (cached) return;
    const proxied = toProxyImgUrl(nextUrl);
    const img = new Image();
    img.src = proxied;
    const markCached = () => setCachedValue(imagePrefetchCache, nextUrl, proxied, 5 * 60_000);
    img.onload = markCached;
    img.onerror = markCached;
  }, [imageIndex, images, showImageGallery]);

  const primaryActionLabel = showImageGallery && images.length > 1
    ? `下载全部 (${images.length})`
    : isGrid && gridSplitStoryboardId
      ? "查看分镜任务"
    : isReplication && replicationVideoUrl
      ? "下载视频"
      : "下载";

  const storyboardStatusKey = isStoryboard
    ? (storyboardDetail?.status || statusKey || task.status || "").toUpperCase()
    : statusKey;
  const storyboardProgress = isStoryboard ? storyboardDetail?.progress ?? task.progress ?? null : null;
  const storyboardHasImage = Boolean(isStoryboard && storyboardImageUrl);
  const splitInProgressStatusKeys = ["SPLIT_PENDING", "BREAKDOWN_PENDING", "BREAKDOWN_PROCESSING"];
  const storyboardSplitInProgress = Boolean(
    isStoryboard && (splittingStoryboard || splitInProgressStatusKeys.includes(storyboardStatusKey))
  );
  const storyboardSplitCompleted = Boolean(isStoryboard && storyboardStatusKey === "SPLIT_COMPLETED");
  const canSplitStoryboard = Boolean(
    isStoryboard && storyboardHasImage && !storyboardSplitCompleted && !storyboardSplitInProgress && !storyboardLoading
  );
  const storyboardProgressLabel = typeof storyboardProgress === "number" ? `${Math.round(storyboardProgress)}%` : null;
  const storyboardStatusHelper = storyboardSplitCompleted
    ? "拆解完成，可查看分镜结果。"
    : storyboardSplitInProgress
      ? "拆解任务执行中，请稍后刷新状态。"
      : storyboardHasImage
        ? "九宫格已生成，可立即触发拆解。"
        : "九宫格生成完成后才能继续拆解。";
  const storyboardSplitHelper = storyboardSplitCompleted
    ? "拆解完成，可直接打开分镜板查看 9 张分镜。"
    : storyboardSplitInProgress
      ? "AI 正在拆解九宫格，预计 2-3 分钟完成。"
      : "系统会读取九宫格并生成逐帧分镜。";
  const gridMainImageUrl = isGrid ? (gridMetadataImage || previewImageUrl || task.thumbnailUrl || null) : null;
  const gridSplitInProgress = Boolean(
    isGrid && (gridSplitLoading || splitInProgressStatusKeys.includes(statusKey)),
  );
  const gridSplitCompleted = Boolean(
    isGrid && (statusKey === "SPLIT_COMPLETED" || gridSplitStoryboardId),
  );
  const gridStatusHelper = gridSplitCompleted
    ? "拆解完成，可查看分镜任务。"
    : gridSplitInProgress
      ? "拆解任务执行中，请稍后刷新状态。"
      : gridMainImageUrl
        ? "九宫格已生成，可立即触发拆解。"
        : "九宫格生成完成后才能继续拆解。";
  const gridSplitHelper = gridSplitCompleted
    ? "拆解完成，可直接打开分镜板查看 9 张分镜。"
    : gridSplitInProgress
      ? "AI 正在拆解九宫格，预计 2-3 分钟完成。"
      : "系统会读取九宫格并生成逐帧分镜。";

  const detailStatusClass = (() => {
    const key = isStoryboard ? storyboardStatusKey : statusKey;
    if (["COMPLETED", "READY", "ACTIVE", "PUBLISHED", "SPLIT_COMPLETED", "BREAKDOWN_COMPLETED"].includes(key)) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800";
    }
    if (["PROCESSING", "ANALYZING", "RUNNING", "IN_PROGRESS", "BREAKDOWN_PROCESSING"].includes(key)) {
      return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800";
    }
    if (["PENDING", "QUEUED", "SPLIT_PENDING", "BREAKDOWN_PENDING"].includes(key)) {
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800";
    }
    if (["FAILED", "ERROR"].includes(key)) {
      return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800";
    }
    return "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
  })();

  // Video player state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const handleVideoPlayToggle = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  // Digital human: drive type from metadata
  const digitalHumanType = isDigitalHuman
    ? (getMetadataString(task.metadata, "type") || "默认")
    : null;

  const draftStage = creativeDetail?.metadata?.stages?.draft;
  const topicStage = creativeDetail?.metadata?.stages?.topic;
  const scriptText =
    typeof draftStage?.rawText === "string" ? draftStage.rawText.trim() : "";
  const scriptReady = scriptText.length > 0;
  const digitalHumanScriptText = isDigitalHuman
    ? (
      getMetadataString(task.metadata, "scriptContent")
      || digitalHumanDetail?.scriptContent
      || task.preview
      || ""
    ).trim()
    : "";

  // 解析 n8n 回传的结构化输出（标题 / 正文 / 标签）
  const draftAiOutput = draftStage?.aiOutput as Record<string, unknown> | null | undefined;
  const titleLines: string[] = (() => {
    const raw = draftAiOutput?.["标题"];
    if (typeof raw === "string") {
      return raw
        .split("\n")
        .map((l) => l.replace(/^\d+[、.。,，]\s*/, "").trim())
        .filter(Boolean);
    }
    return [];
  })();
  const titleMain = titleLines[0] ?? "";
  const titleAlts = titleLines.slice(1, 5);
  const draftHashtags: string[] = (() => {
    const tags = draftAiOutput?.["标签"];
    if (Array.isArray(tags)) return tags.filter((t): t is string => typeof t === "string");
    return [];
  })();
  // 正文优先取结构化 aiOutput["正文"]，回退到 rawText
  const bodyText = (() => {
    const raw = draftAiOutput?.["正文"];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    return scriptText;
  })();
  const scriptTitle =
    extractTitleFromStageOutput(draftStage?.aiOutput) ||
    extractTitleFromStageOutput(topicStage?.aiOutput) ||
    (typeof creativeDetail?.title === "string" && creativeDetail.title.trim()
      ? creativeDetail.title.trim()
      : task.title || "智能创作图文");
  const handlePosterLaunch = () => {
    if (!scriptReady) {
      toast.error("文案仍在生成，稍后再试");
      return;
    }
    onPosterLaunch?.(scriptText, scriptTitle);
  };

  const handleDigitalHumanLaunch = () => {
    if (!scriptReady) {
      toast.error("文案仍在生成，稍后再试");
      return;
    }
    onDigitalHumanLaunch?.(scriptText, task.taskId);
  };


  const handleT2VLaunch = async () => {
    if (!scriptReady) {
      toast.error("文案仍在生成，稍后再试");
      return;
    }
    if (t2vStatus === 'pending') return;

    // 先加载风格列表，再弹出选择弹窗
    setT2vStyleModalOpen(true);
    setT2vStylesLoading(true);
    setT2vSelectedStyleId(null);
    setT2vAllowText(false);

    if (styleListCache && styleListCache.expireAt > Date.now()) {
      setT2vStyles(styleListCache.value);
      setT2vStylesLoading(false);
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch('/api/assets/styles?limit=50', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const payload = await res.json();
        const list = Array.isArray(payload?.data) ? payload.data : [];
        setT2vStyles(list);
        styleListCache = {
          value: list,
          expireAt: Date.now() + 60_000,
        };
      }
    } catch {
      // 静默失败，允许继续
    } finally {
      setT2vStylesLoading(false);
    }
  };

  const handleT2VConfirm = async () => {
    const selectedStyle = t2vStyles.find((s) => s.id === t2vSelectedStyleId) ?? null;
    setT2vStyleModalOpen(false);
    setT2vStatus('pending');
    setT2vError(null);
    setT2vStoryboardId(null);

    const styleRaw = selectedStyle?.name ?? '';
    const styleNorm = (selectedStyle?.spec as Record<string, unknown> | null | undefined)?.['styleNorm'] as string | undefined
      ?? selectedStyle?.name
      ?? '写实';

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const response = await fetch('/api/my-works/t2v', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          taskId: task.taskId,
          title: scriptTitle,
          scriptText,
          styleId: selectedStyle?.id ?? undefined,
          creativeStyleRaw: styleRaw,
          creativeStyleNorm: styleNorm,
          allowText: t2vAllowText,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(err?.error || '触发失败');
      }

      toast.success("分镜生成中，大约需要2-3分钟");
    } catch (error) {
      setT2vStatus('error');
      setT2vError(error instanceof Error ? error.message : '生成失败，请重试');
      toast.error("分镜生成失败");
    }
  };

  const handleCopyText = async (text?: string | null) => {
    if (!text) return;
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(text);
      toast.success("已复制");
    } catch (error) {
      console.error(error);
      toast.error("复制失败");
    }
  };

  const saveVideoToDisk = async (url: string, filename: string) => {
    triggerBrowserDownload(toDownloadUrl(url, filename), filename);
  };

  const handleDownloadCurrentImage = () => {
    if (!showImageGallery || images.length === 0) return;
    const currentUrl = images[imageIndex];
    if (!currentUrl) return;
    const ext = inferImageExtension(currentUrl);
    const baseName = sanitizeFileBase(task.title || "image", "image");
    const filename = `${baseName}_${imageIndex + 1}.${ext}`;
    triggerBrowserDownload(toDownloadUrl(currentUrl, filename), filename, { forceAnchorOnMobile: true });
  };

  const handlePrimaryButtonClick = async () => {
    if (isStoryboard) {
      onOpen();
      return;
    }
    if (isGrid) {
      if (gridSplitStoryboardId) {
        handleOpenGridStoryboard();
        return;
      }
      if (gridMainImageUrl) {
        onDownload([gridMainImageUrl]);
        return;
      }
    }
    if (showImageGallery) {
      onDownload(images);
      return;
    }
    if (isReplication && replicationVideoUrl) {
      setDownloadingOverride(true);
      try {
        const safeName = (task.title || "replication").replace(/\s+/g, "_");
        await saveVideoToDisk(replicationVideoUrl, `${safeName}.mp4`);
      } catch {
        toast.error("下载失败，请稍后再试");
      } finally {
        setDownloadingOverride(false);
      }
      return;
    }
    onDownload();
  };

  const handleStoryboardStatusRefresh = useCallback(() => {
    if (!isStoryboard) return;
    setSplitError(null);
    void fetchStoryboardDetail();
  }, [fetchStoryboardDetail, isStoryboard]);

  const handleStoryboardSplit = useCallback(async () => {
    if (!isStoryboard || splittingStoryboard) return;
    if (!storyboardImageUrl) {
      const message = "九宫格尚未生成，暂时无法拆解";
      setSplitError(message);
      toast.error(message);
      return;
    }
    setSplitError(null);
    setSplittingStoryboard(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        throw new Error("登录已过期，请重新登录后再试");
      }
      const response = await fetch("/api/storyboard-gen/split", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          taskId: task.taskId,
          storyboardImageUrl,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error((payload as { error?: string }).error || "请先绑定 API Key 后再拆解");
        }
        if (response.status === 401) {
          throw new Error("登录已过期，请重新登录后再试");
        }
        throw new Error((payload as { error?: string }).error || "拆解失败，请稍后重试");
      }
      toast.success("拆解任务已提交");
      await fetchStoryboardDetail();
    } catch (error) {
      const message = error instanceof Error ? error.message : "触发拆解失败";
      setSplitError(message);
      toast.error(message);
    } finally {
      setSplittingStoryboard(false);
    }
  }, [fetchStoryboardDetail, isStoryboard, splittingStoryboard, storyboardImageUrl, task.taskId]);

  const handleGridSplit = useCallback(async () => {
    if (!isGrid || gridSplitLoading) return;
    if (!gridMainImageUrl) {
      const message = "九宫格尚未生成，暂时无法拆解";
      setGridSplitError(message);
      toast.error(message);
      return;
    }
    setGridSplitError(null);
    setGridSplitLoading(true);
    try {
      const response = await fetch(`/api/grid-tasks/${task.taskId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error || "拆解失败，请稍后重试");
      }
      const storyboardId =
        typeof (payload as { data?: { storyboardId?: string } }).data?.storyboardId === "string"
          ? (payload as { data?: { storyboardId?: string } }).data!.storyboardId!
          : null;
      if (storyboardId) {
        setGridSplitStoryboardId(storyboardId);
        toast.success("拆解完成，可查看分镜任务");
      } else {
        toast.success("拆解任务已提交");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "触发拆解失败";
      setGridSplitError(message);
      toast.error(message);
    } finally {
      setGridSplitLoading(false);
    }
  }, [gridMainImageUrl, gridSplitLoading, isGrid, task.taskId]);

  const handleOpenGridStoryboard = useCallback(() => {
    if (!gridSplitStoryboardId) return;
    router.push(`${basePath}/storyboard/${gridSplitStoryboardId}`);
    onClose();
  }, [basePath, gridSplitStoryboardId, onClose, router]);

  const handleRetryDigitalHuman = async () => {
    if (!isDigitalHuman) return;
    setRetrying(true);
    try {
      const response = await fetch(`/api/digital-human/videos/${task.taskId}/retry`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error ?? "重试失败");
      }
      toast.success("重试任务已发起，请稍候");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重试失败");
    } finally {
      setRetrying(false);
    }
  };

  const mainPortal = portalRoot ? createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-stretch justify-center overflow-y-auto bg-black/75 backdrop-blur-sm p-3 sm:p-6"
      onClick={handleBackdropClick}
    >
      <div className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-gray-950 lg:flex-row lg:max-h-[90vh]">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full border border-gray-200 bg-white/80 p-2 text-gray-500 backdrop-blur transition hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Left: Media preview — hidden for text-only creative tasks */}
        {!(isCreative && !hasVideo && images.length === 0 && !imageLoading) && (
        <div className="flex w-full flex-shrink-0 items-center justify-center bg-black min-h-[240px] sm:min-h-[320px] lg:min-h-0 lg:w-[45%]">
          {showImageGallery ? (
            <div className="relative h-full w-full overflow-hidden">
              {imageLoading ? (
                <div className="flex flex-col items-center gap-2 text-white/60">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">加载中...</p>
                </div>
              ) : images.length > 0 ? (
                <>
                  <img
                    src={toProxyImgUrl(images[imageIndex])}
                    alt={`image-${imageIndex + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={handleDownloadCurrentImage}
                    className="absolute right-3 top-14 sm:top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75"
                    aria-label="下载当前图片"
                    title="下载当前图片"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setImageIndex((imageIndex - 1 + images.length) % images.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur hover:bg-black/70"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageIndex((imageIndex + 1) % images.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur hover:bg-black/70"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur">
                        {imageIndex + 1} / {images.length}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-white/40">
                  <Clapperboard className="h-10 w-10" />
                  <p className="text-sm">暂无素材</p>
                </div>
              )}
            </div>
          ) : hasVideo ? (
            <div
              className="relative flex h-full w-full items-center justify-center"
            >
              <video
                ref={videoRef}
                className="pointer-events-none max-h-full max-w-full object-contain"
                style={{ maxHeight: "90vh" }}
                src={primaryVideoUrl!}
                muted
                playsInline
                // iOS Safari: keep playback inline and avoid system fullscreen takeover.
                webkit-playsinline="true"
                preload="auto"
                onLoadedMetadata={() => {
                  const video = videoRef.current;
                  if (video && !isPlaying) {
                    video.currentTime = 0.001;
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
              {/* Play/pause overlay */}
              {!isPlaying && (
                <button
                  type="button"
                  onClick={handleVideoPlayToggle}
                  className="absolute inset-0 flex items-center justify-center"
                  aria-label="Play video"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
                    <Play className="h-7 w-7 translate-x-0.5" fill="white" />
                  </span>
                </button>
              )}
              {/* Mute toggle bottom-right */}
              <button
                type="button"
                onClick={handleToggleMute}
                className="absolute bottom-4 right-4 rounded-full bg-black/60 p-2.5 text-white backdrop-blur-sm hover:bg-black/80"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          ) : previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt="thumbnail"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/40">
              <Clapperboard className="h-10 w-10" />
              <p className="text-sm">暂无预览</p>
            </div>
          )}
        </div>
        )}

        {/* Right: Info + actions */}
        {isStoryboard ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 pb-2 space-y-5">
              <div className="flex flex-wrap items-center gap-2 pr-10">
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {typeLabel}
                </span>
                <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold", detailStatusClass)}>
                  {statusLabel}
                </span>
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{task.title || typeLabel}</h2>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{formatTimestamp(task.createdAt, LANGUAGE_LOCALES[langKey])}</p>
                {task.preview && (
                  <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                    {task.preview}
                  </p>
                )}
              </div>

              <div className="rounded-3xl border border-gray-100 bg-white/80 p-4 space-y-3 dark:border-gray-800 dark:bg-gray-900/30">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">九宫格状态</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {storyboardLoading ? "同步中..." : statusLabel}
                    </p>
                  </div>
                  {storyboardLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  ) : storyboardProgressLabel ? (
                    <span className="rounded-full bg-gray-900/5 px-3 py-1 text-xs font-semibold text-gray-700 dark:bg-white/10 dark:text-white">
                      {storyboardProgressLabel}
                    </span>
                  ) : null}
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    storyboardError
                      ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-200"
                      : "bg-gray-50 text-gray-700 dark:bg-gray-950/50 dark:text-gray-300",
                  )}
                >
                  {storyboardError || storyboardStatusHelper}
                </div>
              </div>

              <div className="rounded-3xl border border-[var(--tenant-primary,#16a34a)]/20 bg-white/90 p-4 shadow-sm dark:border-[var(--tenant-primary,#16a34a)]/30 dark:bg-gray-900/40 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">分镜拆解</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{storyboardSplitHelper}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {storyboardSplitCompleted ? (
                    <button
                      type="button"
                      onClick={onOpen}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--tenant-primary,#16a34a)] px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-[var(--tenant-primary,#16a34a)]/90 dark:text-gray-900 dark:bg-[var(--tenant-primary-foreground,#fefce8)] dark:hover:bg-[var(--tenant-primary-foreground,#fefce8)]/80"
                    >
                      <ExternalLink className="h-4 w-4" />
                      查看拆解结果
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStoryboardSplit}
                      disabled={!canSplitStoryboard}
                      className={cn(
                        "flex-1 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow transition disabled:cursor-not-allowed disabled:bg-gray-300",
                        canSplitStoryboard
                          ? "bg-[var(--tenant-primary,#16a34a)] hover:bg-[var(--tenant-primary,#16a34a)]/90"
                          : "bg-gray-300",
                      )}
                    >
                      {storyboardSplitInProgress ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {storyboardSplitInProgress ? "拆解中..." : "一键拆解"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleStoryboardStatusRefresh}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <RefreshCcw
                      className={cn(
                        "h-4 w-4",
                        storyboardLoading && !storyboardSplitInProgress ? "animate-spin" : undefined,
                      )}
                    />
                    刷新状态
                  </button>
                </div>
                {!storyboardHasImage && !storyboardLoading && (
                  <p className="text-xs text-amber-500 dark:text-amber-400">九宫格完成后才能触发拆解。</p>
                )}
                {splitError && (
                  <p className="text-xs text-rose-500 dark:text-rose-400">{splitError}</p>
                )}
              </div>
            </div>
            <div className="border-t border-gray-100 p-6 dark:border-gray-900">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={onOpen}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--tenant-primary,#16a34a)] px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-[var(--tenant-primary,#16a34a)]/90 dark:text-gray-900 dark:bg-[var(--tenant-primary-foreground,#fefce8)] dark:hover:bg-[var(--tenant-primary-foreground,#fefce8)]/80"
                >
                  <ExternalLink className="h-4 w-4" />
                  {storyboardSplitCompleted ? "查看拆解结果" : "打开分镜任务"}
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 px-5 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-900/20"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "删除中..." : "删除"}
                </button>
              </div>
            </div>
          </div>
        ) : isGrid ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 pb-2 space-y-5">
              <div className="flex flex-wrap items-center gap-2 pr-10">
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {typeLabel}
                </span>
                <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold", detailStatusClass)}>
                  {statusLabel}
                </span>
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{task.title || typeLabel}</h2>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{formatTimestamp(task.createdAt, LANGUAGE_LOCALES[langKey])}</p>
                {task.preview && (
                  <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                    {task.preview}
                  </p>
                )}
              </div>

              <div className="rounded-3xl border border-gray-100 bg-white/80 p-4 space-y-3 dark:border-gray-800 dark:bg-gray-900/30">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">九宫格状态</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{statusLabel}</p>
                  </div>
                  {gridSplitInProgress && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    gridSplitError
                      ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-200"
                      : "bg-gray-50 text-gray-700 dark:bg-gray-950/50 dark:text-gray-300",
                  )}
                >
                  {gridSplitError || gridStatusHelper}
                </div>
              </div>

              <div className="rounded-3xl border border-[var(--tenant-primary,#16a34a)]/20 bg-white/90 p-4 shadow-sm dark:border-[var(--tenant-primary,#16a34a)]/30 dark:bg-gray-900/40 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">分镜拆解</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{gridSplitHelper}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {gridSplitCompleted ? (
                    <button
                      type="button"
                      onClick={handleOpenGridStoryboard}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--tenant-primary,#16a34a)] px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-[var(--tenant-primary,#16a34a)]/90 dark:text-gray-900 dark:bg-[var(--tenant-primary-foreground,#fefce8)] dark:hover:bg-[var(--tenant-primary-foreground,#fefce8)]/80"
                    >
                      <ExternalLink className="h-4 w-4" />
                      查看分镜任务
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleGridSplit}
                      disabled={gridSplitLoading || !gridMainImageUrl}
                      className={cn(
                        "flex-1 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow transition disabled:cursor-not-allowed disabled:bg-gray-300",
                        gridMainImageUrl ? "bg-[var(--tenant-primary,#16a34a)] hover:bg-[var(--tenant-primary,#16a34a)]/90" : "bg-gray-300",
                      )}
                    >
                      {gridSplitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {gridSplitLoading ? "拆解中..." : "一键拆解"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setGridSplitError(null);
                      toast.success("已记录，请稍后刷新列表查看最新状态");
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    刷新提示
                  </button>
                </div>
                {!gridMainImageUrl && (
                  <p className="text-xs text-amber-500 dark:text-amber-400">九宫格完成后才能触发拆解。</p>
                )}
                {gridSplitError && (
                  <p className="text-xs text-rose-500 dark:text-rose-400">{gridSplitError}</p>
                )}
              </div>

              {gridStoryboardImages.length > 0 && (
                <div className="rounded-3xl border border-gray-100 bg-white/80 p-4 space-y-3 dark:border-gray-800 dark:bg-gray-900/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">拆解预览</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">最新 9 张拆解图</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {gridStoryboardImages.slice(0, 9).map((url, index) => (
                      <img
                        key={`${url}-${index}`}
                        src={url}
                        alt={`grid-${index + 1}`}
                        className="h-20 w-full rounded-xl object-cover"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 p-6 dark:border-gray-900">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={
                    gridSplitStoryboardId
                      ? handleOpenGridStoryboard
                      : () => (gridMainImageUrl ? onDownload([gridMainImageUrl]) : onDownload())
                  }
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--tenant-primary,#16a34a)] px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-[var(--tenant-primary,#16a34a)]/90 dark:text-gray-900 dark:bg-[var(--tenant-primary-foreground,#fefce8)] dark:hover:bg-[var(--tenant-primary-foreground,#fefce8)]/80"
                >
                  <ExternalLink className="h-4 w-4" />
                  {gridSplitStoryboardId ? "查看分镜任务" : "下载九宫格"}
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 px-5 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-900/20"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "删除中..." : "删除"}
                </button>
              </div>
            </div>
          </div>
        ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Scrollable info area */}
          <div className="flex-1 overflow-y-auto p-6 pb-2 space-y-5">
            {/* Type + status badges */}
            <div className="flex flex-wrap items-center gap-2 pr-10">
              <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {typeLabel}
              </span>
              <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold", detailStatusClass)}>
                {statusLabel}
              </span>
            </div>

            {/* Title */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{task.title || typeLabel}</h2>
              {isCreative && (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{formatTimestamp(task.createdAt, LANGUAGE_LOCALES[langKey])}</p>
              )}
              {((isDigitalHuman ? digitalHumanScriptText : "") || creativeDetail?.ideaText || task.preview) && (
                <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                  {(isDigitalHuman ? digitalHumanScriptText : "") || creativeDetail?.ideaText || task.preview}
                </p>
              )}
            </div>

            {/* Key info: created date (+ type-specific) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!isCreative && (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60 sm:col-span-2">
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500">{pickCopy(DATE_LABEL_COPY.created, langKey)}</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">{formatTimestamp(task.createdAt, LANGUAGE_LOCALES[langKey])}</p>
              </div>
              )}

              {/* Digital human: show drive type */}
              {isDigitalHuman && digitalHumanType && (
                <div className="sm:col-span-2 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">驱动形式</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">{digitalHumanType}</p>
                </div>
              )}

              {/* Image count for creative/poster */}
              {showImageGallery && images.length > 0 && (
                <div className="sm:col-span-2 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">图片数量</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">共 {images.length} 张</p>
                </div>
              )}
            </div>

            {isDigitalHuman && (
              <div className="rounded-3xl border border-gray-100 bg-gray-50/80 p-4 space-y-2 dark:border-gray-800 dark:bg-gray-900/40">
                <p className="text-xs text-gray-500 dark:text-gray-400">数字人口播文案</p>
                <div className="rounded-2xl bg-white/80 px-4 py-3 dark:bg-gray-900/80">
                  <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                    {digitalHumanScriptText || "暂无可展示的文案"}
                  </p>
                </div>
              </div>
            )}

            {isReplication && (
              <div className="rounded-3xl border border-gray-100 bg-gray-50/80 p-4 space-y-4 dark:border-gray-800 dark:bg-gray-900/40">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">生成提示词</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {replicationDetailLoading
                        ? "从 Supabase 获取中..."
                        : replicationPromptReady
                          ? "可复制视频提示词与改写脚本"
                          : replicationDetailError
                            ? ""
                            : "提示词尚未写回，请稍后刷新"}
                    </p>
                  </div>
                  {replicationPromptReady && (
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          [replicationGeneratedScript, replicationPromptText].filter(Boolean).join("\n\n")
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 transition hover:bg-white dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      复制全部
                    </button>
                  )}
                </div>
                {replicationDetailLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在载入提示词...
                  </div>
                ) : replicationDetailError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200">
                    {replicationDetailError}
                  </div>
                ) : replicationPromptReady ? (
                  <>
                    {replicationGeneratedScript && (
                      <div className="rounded-2xl bg-white/80 px-4 py-3 dark:bg-gray-900/80">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">脚本</p>
                          <button
                            type="button"
                            onClick={() => handleCopyText(replicationGeneratedScript)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            复制
                          </button>
                        </div>
                        <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                          {replicationGeneratedScript}
                        </p>
                      </div>
                    )}
                    {replicationPromptText && (
                      <div className="rounded-2xl bg-white/80 px-4 py-3 dark:bg-gray-900/80">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">视频提示词</p>
                          <button
                            type="button"
                            onClick={() => handleCopyText(replicationPromptText)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            复制
                          </button>
                        </div>
                        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-100 custom-scrollbar">
                          {replicationPromptText}
                        </pre>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">提示词尚未写回，请稍后刷新。</p>
                )}
              </div>
            )}

            {isCreative && (
              <div className="rounded-3xl border border-gray-100 bg-gray-50/80 p-4 space-y-3 dark:border-gray-800 dark:bg-gray-900/40">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {creativeDetailLoading
                    ? "AI 正在生成，请稍候…"
                    : scriptReady
                      ? "创作文案"
                      : creativeDetailError || "稍后刷新以获取完整文案"}
                </p>

                {scriptReady ? (
                  <>
                    {/* 标题区 */}
                    {titleMain && (
                      <div className="rounded-2xl bg-white/80 px-4 py-3 dark:bg-gray-900/80 space-y-2">
                        <p className="text-xs font-medium text-gray-400 dark:text-gray-500">推荐标题</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{titleMain}</p>
                        {titleAlts.length > 0 && (
                          <div className="space-y-1 pt-1 border-t border-gray-100 dark:border-gray-800">
                            <p className="text-xs text-gray-400 dark:text-gray-500">备选标题</p>
                            {titleAlts.map((t, i) => (
                              <p key={i} className="text-xs text-gray-600 dark:text-gray-300 leading-snug">
                                {i + 2}. {t}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 正文区 */}
                    <div className="rounded-2xl bg-white/80 px-4 py-3 dark:bg-gray-900/80">
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1.5">正文</p>
                      <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">{bodyText}</p>
                    </div>

                    {/* 标签区 */}
                    {draftHashtags.length > 0 && (
                      <div className="rounded-2xl bg-white/80 px-4 py-3 dark:bg-gray-900/80">
                        <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2">标签</p>
                        <div className="flex flex-wrap gap-1.5">
                          {draftHashtags.map((tag, i) => (
                            <span
                              key={i}
                              className="inline-block rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700 border border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm dark:bg-gray-900/80">
                    <p className="text-gray-500 dark:text-gray-400">
                      {creativeDetailLoading
                        ? "AI 正在输出文案..."
                        : creativeDetailError || "暂无可展示的内容"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fixed bottom actions */}
          <div className="border-t border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            {isCreative ? (
              <div className="space-y-2">
                {/* Row 1: 生成图文 + 生成数字人 */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handlePosterLaunch}
                    disabled={!scriptReady}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <ImageIcon className="h-4 w-4" />
                    生成图文
                  </button>
                  <button
                    type="button"
                    onClick={handleDigitalHumanLaunch}
                    disabled={!scriptReady}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <UserRound className="h-4 w-4" />
                    生成数字人
                  </button>
                </div>
                {/* Row 2: 分镜视频 + 删除 */}
                <div className="flex gap-2 items-center">
                  {t2vStatus === 'done' && t2vStoryboardId ? (
                    <a
                      href={`${basePath}/storyboard/${t2vStoryboardId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                    >
                      <Film className="h-4 w-4" />
                      在分镜板中打开
                    </a>
                  ) : t2vStatus === 'pending' ? (
                    <div className="flex-1 inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2.5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                      分镜生成中…可关闭弹窗稍后查看
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleT2VLaunch}
                      disabled={!scriptReady}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <Film className="h-4 w-4" />
                      {t2vStatus === 'error' ? '重试分镜视频' : '生成分镜视频'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={deleting}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleting ? "删除中..." : "删除"}
                  </button>
                </div>
                {/* T2V 错误提示 */}
                {t2vStatus === 'error' && t2vError && (
                  <p className="text-xs text-rose-500 dark:text-rose-400 pl-1">{t2vError}</p>
                )}
              </div>
            ) : (
              <div className="flex gap-3">
                {isStoryboard ? (
                  <button
                    type="button"
                    onClick={onOpen}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                  >
                    <ExternalLink className="h-4 w-4" />
                    打开任务
                  </button>
                ) : isDigitalHuman && statusKey === "FAILED" ? (
                  <button
                    type="button"
                    onClick={handleRetryDigitalHuman}
                    disabled={retrying}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                  >
                    <RotateCcw className={cn("h-4 w-4", retrying && "animate-spin")} />
                    {retrying ? "重试中..." : "重新生成"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePrimaryButtonClick}
                    disabled={downloadingOverride}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                  >
                    <Download className={cn("h-4 w-4", downloadingOverride && "animate-spin")} />
                    {downloadingOverride ? "准备中..." : primaryActionLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 px-5 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-900/20"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "删除中..." : "删除"}
                </button>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>,
    portalRoot
  ) : null;

  // 风格选择弹窗（第二个 portal，浮在详情弹窗上方）
  const stylePickerPortal = portalRoot && t2vStyleModalOpen ? createPortal(
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setT2vStyleModalOpen(false); }}
    >
      <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl dark:bg-gray-950 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">选择视觉风格</h3>
          <button
            type="button"
            onClick={() => setT2vStyleModalOpen(false)}
            className="rounded-full border border-gray-200 bg-white/80 p-1.5 text-gray-500 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Style grid */}
        <div className="px-6 pt-4 pb-2 max-h-72 overflow-y-auto">
          {t2vStylesLoading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : t2vStyles.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">暂无可用风格，可在风格库中添加</p>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {t2vStyles.map((style) => {
                const isActive = style.id === t2vSelectedStyleId;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setT2vSelectedStyleId(isActive ? null : style.id)}
                    className={cn(
                      "relative flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-left transition",
                      isActive
                        ? "border-gray-900 bg-gray-50 dark:border-white dark:bg-gray-800"
                        : "border-gray-100 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
                    )}
                  >
                    {getStylePreviewImageUrl(style) ? (
                      <img
                        src={getStylePreviewImageUrl(style) ?? ""}
                        alt={style.name}
                        className="h-16 w-full rounded-xl object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-16 w-full items-center justify-center rounded-xl bg-gray-100 text-sm font-semibold text-gray-500 dark:bg-gray-800">
                        {(style.name || '').slice(0, 2)}
                      </div>
                    )}
                    <p className="w-full truncate text-center text-xs font-medium text-gray-700 dark:text-gray-300">
                      {style.name}
                    </p>
                    {isActive && (
                      <div className="absolute right-1.5 top-1.5 rounded-full bg-gray-900 p-0.5 dark:bg-white">
                        <Check className="h-3 w-3 text-white dark:text-gray-900" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Allow text toggle */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              role="checkbox"
              aria-checked={t2vAllowText}
              tabIndex={0}
              onClick={() => setT2vAllowText((v) => !v)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setT2vAllowText((v) => !v); } }}
              className={cn(
                "relative h-5 w-9 flex-shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
                t2vAllowText ? "bg-gray-900 border-gray-900 dark:bg-white dark:border-white" : "bg-gray-200 border-gray-200 dark:bg-gray-700 dark:border-gray-700"
              )}
            >
              <span className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform dark:bg-gray-900",
                t2vAllowText ? "translate-x-4" : "translate-x-0.5"
              )} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">允许文字出现在视频中</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">开启后视频可包含字幕/标题文字叠加</p>
            </div>
          </label>
        </div>

        {/* Footer buttons */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setT2vStyleModalOpen(false)}
            className="rounded-full border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleT2VConfirm}
            className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            开始生成
          </button>
        </div>
      </div>
    </div>,
    portalRoot
  ) : null;

  return (
    <>
      {mainPortal}
      {stylePickerPortal}
    </>
  );
}
