"use client";

/* eslint-disable @next/next/no-img-element -- Project cards rely on remote thumbnails */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TaskType } from "@/lib/taskSummary";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTenant, useTenantPath } from "@/hooks/useTenant";
import { DigitalHumanCountdown } from "@/components/DigitalHumanCountdown";
import { DigitalHumanModal } from "@/components/DigitalHumanModal";
import { Modal } from "@/components/Modal";
import { QuickPosterForm } from "@/app/(main)/dashboard/components/QuickActionForms";
import { AddButton } from "@/components/AddButton";
import { cn } from "@/lib/utils";
import {
  Loader2,
  RefreshCcw,
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
} from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import type { CreativeTaskDetail } from "@/types/creative";

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

// Routes relative to basePath (no leading slash except for the leading basePath)
const TASK_TYPE_ROUTE_PATHS: Record<TaskType, (taskId: string) => string> = {
  creative: (id) => `/my-works?taskId=${id}`,
  poster: (id) => `/xhs-poster?jobId=${id}`,
  digitalHuman: (id) => `/digital-human?videoId=${id}`,
  replication: (id) => `/replication?id=${id}`,
  storyboard: (id) => `/storyboard/${id}`,
  knowledgeVideo: (id) => `/knowledge-videos/${id}`,
  replicationShot: (id) => `/replication-shot/${id}`,
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

const CTA_COPY: CopyMap = {
  en: "Create project",
  zh: "创建新项目",
  "zh-TW": "建立新專案",
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
  updated: {
    en: "Updated",
    zh: "更新时间",
    "zh-TW": "更新時間",
  },
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
  onRename: () => void;
  onDelete: () => void;
  disabled?: boolean;
};

function CardActionMenu({ onRename, onDelete, disabled }: CardActionMenuProps) {
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
          "rounded-full bg-black/40 p-2 text-white shadow-lg transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 dark:bg-white/15 dark:hover:bg-white/25",
          disabled && "cursor-not-allowed opacity-70",
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-36 rounded-2xl border border-black/5 bg-white/95 p-1 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-gray-900/95">
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

export function MyProjectsClient() {
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
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<TaskSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showPosterWizard, setShowPosterWizard] = useState(false);
  const [showDigitalHumanWizard, setShowDigitalHumanWizard] = useState(false);
  const [wizardScript, setWizardScript] = useState("");
  const [wizardSourceTaskId, setWizardSourceTaskId] = useState("");
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<TaskSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const recentlyClosedTaskRef = useRef<{ taskId?: string | null; id?: string | null }>({});
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

  const handlePosterLaunchFromModal = useCallback((script: string) => {
    setWizardScript(script);
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
  const subtitle = pickCopy(SUBTITLE_COPY, langKey);
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
    async (type: TaskType | "all", status: string, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (type !== "all") params.set("taskType", type);
      if (status !== "all") params.set("status", status);
      params.set("limit", "50");

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const response = await fetch(`/api/tasks?${params.toString()}`, {
          signal,
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || loadErrorMessage);
        }
        if (signal?.aborted) return;
        const items = Array.isArray(payload?.data) ? (payload.data as TaskSummary[]) : [];
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setTasks(items);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setTasks([]);
        setError((err as Error).message || loadErrorMessage);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [loadErrorMessage]
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchTasks(filterType, filterStatus, controller.signal);
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
    void fetchTasks(filterType, filterStatus);
  };

  const handleTaskClick = (task: TaskSummary) => {
    setActiveTask(task);
    updateTaskIdParam(task.taskId);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, task: TaskSummary) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleTaskClick(task);
    }
  };

  const handleOpenTask = (task: TaskSummary | null) => {
    if (!task) return;
    const isText2ImagePoster = isText2ImagePosterTask(task);
    if (isText2ImagePoster) {
      router.push(`${basePath}/xhs-poster?taskId=${task.taskId}`);
      return;
    }
    const relativePath = TASK_TYPE_ROUTE_PATHS[task.taskType]?.(task.taskId);
    if (relativePath) {
      // relativePath starts with '/', basePath has no trailing slash
      // Do NOT call closeActiveTask() here — its router.replace() would cancel this push navigation
      router.push(`${basePath}${relativePath}`);
    }
  };

  const handleDownloadTask = useCallback(async (task: TaskSummary | null, images?: string[]) => {
    if (!task) return;

    const behavesLikeText2Image = task.taskType === "creative" || isText2ImagePosterTask(task);

    // 图文任务：下载全部图片
    if (behavesLikeText2Image && images && images.length > 0) {
      const baseName = (task.title || "image").replace(/\s+/g, "_");
      for (let i = 0; i < images.length; i++) {
        try {
          const res = await fetch(images[i]);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `${baseName}_${i + 1}.jpg`;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        } catch {
          const anchor = document.createElement("a");
          anchor.href = images[i];
          anchor.download = `${baseName}_${i + 1}.jpg`;
          anchor.target = "_blank";
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        }
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
    try {
      const res = await fetch(videoUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(task.title || task.taskType).replace(/\s+/g, "_")}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      const anchor = document.createElement("a");
      anchor.href = videoUrl;
      anchor.download = `${(task.title || task.taskType).replace(/\s+/g, "_")}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
  }, []);

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
        await fetchTasks(filterType, filterStatus);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "删除失败");
      } finally {
        setDeletingId(null);
      }
    },
    [fetchTasks, filterStatus, filterType, highlightTaskId, updateTaskIdParam]
  );

  const retryLoad = () => {
    void fetchTasks(filterType, filterStatus);
  };

  return (
    <div className="max-w-screen-2xl mx-auto space-y-8">
      <div className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{pageTitle}</h1>
            <p className="text-base text-gray-600 dark:text-gray-300 mt-2 max-w-2xl">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                "border-gray-200 bg-white/90 text-gray-700 shadow-sm hover:bg-white disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100 dark:hover:bg-gray-800"
              )}
            >
              <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
              {pickCopy(REFRESH_COPY, langKey)}
            </button>
            <AddButton label={pickCopy(CTA_COPY, langKey)} href={createPath} />
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-300" />
          <p className="leading-relaxed">{pickCopy(RETENTION_NOTICE_COPY, langKey)}</p>
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
              className="w-full aspect-[3/4] animate-pulse rounded-[28px] border border-black/5 bg-white/75 p-4 shadow-[0_18px_35px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-gray-900/60"
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {tasks.map((task) => {
            const typeMeta = TYPE_META[task.taskType];
            const typeLabel = pickCopy(typeMeta?.label || HEADER_COPY, langKey);
            const statusKey = (task.status || "").toUpperCase();
            const statusLabel = pickCopy(
              STATUS_LABELS[statusKey] || { en: task.status || "Unknown", zh: task.status || "未识别", "zh-TW": task.status || "未識別" },
              langKey,
            );
            const statusClass = STATUS_BADGE_CLASS[statusKey] || "bg-white/20 text-white border-white/30";
            const showCountdown =
              task.taskType === "digitalHuman" && DIGITAL_HUMAN_COUNTDOWN_STATUSES.has(statusKey);
            const thumbnailIsVideo = looksLikeVideoUrl(task.thumbnailUrl);
            const isProcessing = PROCESSING_STATUSES.has(statusKey);
            return (
              <div
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => handleTaskClick(task)}
                onKeyDown={(event) => handleCardKeyDown(event, task)}
                className="group relative flex h-full w-full cursor-pointer flex-col rounded-[28px] border border-black/5 bg-white/90 p-3 text-left shadow-[0_18px_35px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_30px_60px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:border-white/10 dark:bg-gray-950/60 dark:shadow-[0_20px_40px_rgba(0,0,0,0.45)]"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[20px] bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 dark:from-gray-800 dark:via-gray-900 dark:to-black">
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
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300 text-slate-500 dark:from-gray-800 dark:to-gray-900">
                      <Clapperboard className="h-8 w-8" />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 rounded-[20px] border border-white/20 dark:border-white/5" />
                  <div className="pointer-events-none absolute inset-0 rounded-[20px] bg-gradient-to-br from-white/40 via-transparent to-black/40 opacity-70 mix-blend-screen dark:from-white/10 dark:to-black/60" />
                  <CardActionMenu
                    onRename={() => openRenameModal(task)}
                    onDelete={() => handleDeleteTask(task)}
                    disabled={deletingId === task.id}
                  />
                  {isProcessing && (
                    <div className="pointer-events-none absolute inset-0 rounded-[20px] overflow-hidden">
                      <div className="animate-shimmer-sweep absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.45] to-transparent dark:via-white/[0.30]" />
                      <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-black/40 px-3 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm">
                        生成中
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 px-1 pb-1 pt-4 sm:px-2">
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
          })}
        </div>
      )}
      {activeTask && (
        <TaskDetailModal
          task={activeTask}
          langKey={langKey}
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
        <Modal isOpen={showPosterWizard} onClose={() => setShowPosterWizard(false)} title="生成图文" maxWidth="max-w-2xl" zIndex="z-[10000]">
          <QuickPosterForm onClose={() => setShowPosterWizard(false)} initialIdeaText={wizardScript} />
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
  onClose: () => void;
  onOpen: () => void;
  onDownload: (images?: string[]) => void;
  onDelete: () => void;
  deleting: boolean;
  onPosterLaunch?: (script: string) => void;
  onDigitalHumanLaunch?: (script: string, taskId: string) => void;
}

function TaskDetailModal({ task, langKey, onClose, onOpen, onDownload, onDelete, deleting, onPosterLaunch, onDigitalHumanLaunch }: TaskDetailModalProps) {
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const typeMeta = TYPE_META[task.taskType];
  const typeLabel = pickCopy(typeMeta?.label || HEADER_COPY, langKey);
  const statusKey = (task.status || "").toUpperCase();
  const statusLabel = pickCopy(STATUS_LABELS[statusKey] || { en: task.status || "Unknown", zh: task.status || "未识别", "zh-TW": task.status || "未識別" }, langKey);
  const metadataVideoUrl = getMetadataString(task.metadata, "videoUrl") || getMetadataString(task.metadata, "resultUrl") || null;
  const fallbackVideoUrl = looksLikeVideoUrl(task.thumbnailUrl) ? task.thumbnailUrl : null;
  const primaryVideoUrl =
    metadataVideoUrl && metadataVideoUrl.startsWith("http") ? metadataVideoUrl : fallbackVideoUrl;
  const hasVideo = Boolean(primaryVideoUrl && primaryVideoUrl.startsWith("http"));

  const isCreative = task.taskType === "creative";
  const isPoster = task.taskType === "poster";
  const isDigitalHuman = task.taskType === "digitalHuman";
  const isText2ImagePoster = isText2ImagePosterTask(task);
  const behavesLikeCreative = isCreative || isText2ImagePoster;

  // Load images for creative (text2image) tasks
  const [images, setImages] = useState<string[]>(() =>
    task.thumbnailUrl ? [task.thumbnailUrl] : []
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // For creative/text2image tasks: fetch generatedImagesJson via the task detail API
    if (behavesLikeCreative) {
      setImageLoading(true);
      setCreativeDetailLoading(true);
      setCreativeDetailError(null);
      supabase.auth.getSession().then(({ data: sessionData }) => {
        const token = sessionData.session?.access_token;
        return fetch(`/api/creative-tasks/${task.taskId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
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
          if (cancelled) return;
          const detail = payload?.data as CreativeTaskDetail | undefined;
          setCreativeDetail(detail ?? null);
          const imgs: string[] = (detail?.generatedImages || [])
            .map((img: { url?: string }) => img.url)
            .filter((u: string | undefined): u is string => Boolean(u));
          setImages(imgs.length ? imgs : task.thumbnailUrl ? [task.thumbnailUrl] : []);
          setImageIndex(0);
          setCreativeDetailError(null);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setCreativeDetail(null);
          setCreativeDetailError(error instanceof Error ? error.message : "创作任务数据获取失败");
          setImages(task.thumbnailUrl ? [task.thumbnailUrl] : []);
        })
        .finally(() => {
          if (!cancelled) {
            setImageLoading(false);
            setCreativeDetailLoading(false);
          }
        });
      return () => { cancelled = true; };
    }
    // For regular poster tasks: fetch from xhs-images API
    if (isPoster && !isText2ImagePoster) {
      setImageLoading(true);
      fetch(`/api/xhs-images/jobs/${task.taskId}`)
        .then((res) => res.ok ? res.json() : null)
        .then((payload) => {
          if (cancelled) return;
          const imgs: string[] = (payload?.data?.images || [])
            .map((img: { imageUrl?: string }) => img.imageUrl)
            .filter((u: string | undefined): u is string => Boolean(u));
          setImages(imgs.length ? imgs : task.thumbnailUrl ? [task.thumbnailUrl] : []);
          setImageIndex(0);
        })
        .catch(() => {
          if (!cancelled) setImages(task.thumbnailUrl ? [task.thumbnailUrl] : []);
        })
        .finally(() => { if (!cancelled) setImageLoading(false); });
      return () => { cancelled = true; };
    }
    setImages(task.thumbnailUrl ? [task.thumbnailUrl] : []);
    setImageIndex(0);
    setImageLoading(false);
    setCreativeDetail(null);
    setCreativeDetailError(null);
    setCreativeDetailLoading(false);
  }, [behavesLikeCreative, isPoster, isText2ImagePoster, task]);

  const showImageGallery = (behavesLikeCreative || (isPoster && !isText2ImagePoster)) && !hasVideo;

  const detailStatusClass = (() => {
    if (["COMPLETED", "READY", "ACTIVE", "PUBLISHED"].includes(statusKey)) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800";
    }
    if (["PROCESSING", "ANALYZING", "RUNNING", "IN_PROGRESS"].includes(statusKey)) {
      return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800";
    }
    if (["PENDING", "QUEUED"].includes(statusKey)) {
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800";
    }
    if (["FAILED", "ERROR"].includes(statusKey)) {
      return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800";
    }
    return "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
  })();

  // Video player state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const handleVideoClick = () => {
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

  const isStoryboard = task.taskType === "storyboard";
  const [creativeDetail, setCreativeDetail] = useState<CreativeTaskDetail | null>(null);
  const [creativeDetailLoading, setCreativeDetailLoading] = useState(false);
  const [creativeDetailError, setCreativeDetailError] = useState<string | null>(null);
  const draftStage = creativeDetail?.metadata?.stages?.draft;
  const topicStage = creativeDetail?.metadata?.stages?.topic;
  const scriptText =
    typeof draftStage?.rawText === "string" ? draftStage.rawText.trim() : "";
  const scriptReady = scriptText.length > 0;

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
    onPosterLaunch?.(scriptText);
  };

  const handleDigitalHumanLaunch = () => {
    if (!scriptReady) {
      toast.error("文案仍在生成，稍后再试");
      return;
    }
    onDigitalHumanLaunch?.(scriptText, task.taskId);
  };

  return (
    <>
      {createPortal(
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

        {/* Left: Media preview */}
        <div className="flex w-full flex-shrink-0 items-center justify-center bg-black min-h-[240px] sm:min-h-[320px] lg:min-h-0 lg:w-[45%]">
          {showImageGallery ? (
            <div className="relative flex h-full w-full items-center justify-center">
              {imageLoading ? (
                <div className="flex flex-col items-center gap-2 text-white/60">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">加载中...</p>
                </div>
              ) : images.length > 0 ? (
                <>
                  <img
                    src={images[imageIndex]}
                    alt={`image-${imageIndex + 1}`}
                    className="max-h-full max-w-full object-contain"
                    style={{ maxHeight: "90vh" }}
                  />
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
              className="relative flex h-full w-full cursor-pointer items-center justify-center"
              onClick={handleVideoClick}
            >
              <video
                ref={videoRef}
                className="max-h-full max-w-full object-contain"
                style={{ maxHeight: "90vh" }}
                src={primaryVideoUrl!}
                muted
                playsInline
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
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
                    <Play className="h-7 w-7 translate-x-0.5" fill="white" />
                  </div>
                </div>
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
          ) : task.thumbnailUrl ? (
            <img
              src={task.thumbnailUrl}
              alt="thumbnail"
              className="max-h-full max-w-full object-contain"
              style={{ maxHeight: "90vh" }}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/40">
              <Clapperboard className="h-10 w-10" />
              <p className="text-sm">暂无预览</p>
            </div>
          )}
        </div>

        {/* Right: Info + actions */}
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
              {(creativeDetail?.ideaText ?? task.preview) && (
                <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                  {creativeDetail?.ideaText ?? task.preview}
                </p>
              )}
            </div>

            {/* Key info: only title, status, created, updated (+ type-specific) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60">
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500">{pickCopy(DATE_LABEL_COPY.created, langKey)}</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">{formatTimestamp(task.createdAt, LANGUAGE_LOCALES[langKey])}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60">
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500">{pickCopy(DATE_LABEL_COPY.updated, langKey)}</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">{formatTimestamp(task.updatedAt, LANGUAGE_LOCALES[langKey])}</p>
              </div>

              {/* Digital human: show drive type */}
              {isDigitalHuman && digitalHumanType && (
                <div className="col-span-2 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">驱动形式</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">{digitalHumanType}</p>
                </div>
              )}

              {/* Image count for creative/poster */}
              {showImageGallery && images.length > 0 && (
                <div className="col-span-2 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">图片数量</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white">共 {images.length} 张</p>
                </div>
              )}
            </div>

            {isCreative && (
              <div className="rounded-3xl border border-gray-100 bg-gray-50/80 p-4 space-y-3 dark:border-gray-800 dark:bg-gray-900/40">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">创作文案</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {creativeDetailLoading
                        ? "AI 正在生成，请稍候…"
                        : scriptReady
                          ? "可直接用于生成图文或数字人口播"
                          : creativeDetailError || "稍后刷新以获取完整文案"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handlePosterLaunch}
                      disabled={!scriptReady || creativeDetailLoading}
                      className={cn(
                        "inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-semibold transition",
                        scriptReady && !creativeDetailLoading
                          ? "border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white dark:border-white dark:text-white dark:hover:bg-white dark:hover:text-gray-900"
                          : "border-gray-200 text-gray-400 dark:border-gray-700 dark:text-gray-600 cursor-not-allowed"
                      )}
                    >
                      生成图文
                    </button>
                    <button
                      type="button"
                      onClick={handleDigitalHumanLaunch}
                      disabled={!scriptReady || creativeDetailLoading}
                      className={cn(
                        "inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-semibold transition",
                        scriptReady && !creativeDetailLoading
                          ? "border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white dark:border-white dark:text-white dark:hover:bg-white dark:hover:text-gray-900"
                          : "border-gray-200 text-gray-400 dark:border-gray-700 dark:text-gray-600 cursor-not-allowed"
                      )}
                    >
                      生成数字人
                    </button>
                  </div>
                </div>

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
              ) : (
                <button
                  type="button"
                  onClick={() => onDownload(showImageGallery ? images : undefined)}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                >
                  <Download className="h-4 w-4" />
                  下载{showImageGallery && images.length > 1 ? `全部 (${images.length})` : ""}
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
          </div>
        </div>
      </div>
        </div>,
        document.body
      )}
    </>
  );
}
