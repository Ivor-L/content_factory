"use client";

/* eslint-disable @next/next/no-img-element -- Style preview thumbnails live on user-uploaded hosts */

import type { JSX } from "react";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedStyleName } from "@/lib/styleLocalization";
import { toast } from "react-hot-toast";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { Transition } from "framer-motion";
import {
  creativeStageOrder,
  creativeStages,
  getNextStage,
} from "@/lib/creativeStages";
import type { CreativeStageKey } from "@/lib/creativeStages";
import {
  buildTopicItemKey,
  cleanTopicSelections,
  deriveDefaultTopicSelections,
  normalizeTopicSelectionKey,
} from "@/lib/topicSelections";
import type {
  CreativeTaskSummary,
  CreativeTaskDetail,
  StageMetaEntry,
  CreativeStageStatus,
  HistoryDocLite,
  StoryAssetLite,
  StylePresetLite,
  TopicUserSelections,
  TopicSelectionAngle,
  TopicSelectionItem,
  CreativeTaskMetadata,
} from "@/types/creative";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  CheckCircle2,
  Clapperboard,
  Copy,
  Download,
  FileAudio,
  Image,
  Lightbulb,
  Link2,
  Loader2,
  Mic,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  Sparkles,
  Unlink,
  Zap,
  Circle,
  User,
  Film,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { DigitalHumanModal } from "@/components/DigitalHumanModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { AddButton } from "@/components/AddButton";
import { EmptyState } from "@/components/EmptyState";
import { formatDistanceToNow } from "date-fns";
import { enUS, zhCN, zhTW } from "date-fns/locale";
import { getStageMeta, getTaskActionStatus } from "@/lib/creativeTaskUtils";
import {
  DEFAULT_POSTER_COUNT,
  POSTER_COUNT_MAX,
  POSTER_COUNT_MIN,
  clampPosterCount,
} from "@/lib/posterConfig";
import { createDigitalHumanVideo } from "@/app/actions/digital-human";
import type { DigitalHumanMode } from "@/lib/digitalHumanJob";
import { CharacterForm } from "@/components/CharacterForm";

const inputClass =
  "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/70 dark:focus-visible:ring-white/70 placeholder:text-gray-400";

const stagePanelEase: [number, number, number, number] = [0.32, 0.72, 0, 1];
const stageFlowEase: [number, number, number, number] = [0.25, 0.8, 0.25, 1];

const stagePanelMotion = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, ease: stagePanelEase },
  },
  exit: {
    opacity: 0,
    y: -16,
    scale: 0.98,
    transition: { duration: 0.2, ease: stagePanelEase },
  },
};

const stageHighlightTransition: Transition = { type: "spring", stiffness: 240, damping: 30, mass: 0.6 };
const stagePanelLayoutTransition: Transition = { duration: 0.35, ease: stagePanelEase };
const stageFlowLayoutTransition: Transition = { duration: 0.45, ease: stageFlowEase };

type DiagnosisSupplementDraft = {
  audience: string;
  coreIdea: string;
  example: string;
};

type AssetPool = {
  history: HistoryDocLite[];
  stories: StoryAssetLite[];
  styles: StylePresetLite[];
};

type DirectPosterResult = {
  id: string;
  imageUrl: string;
  prompt?: string;
};

type PosterJob = {
  id: string;
  title?: string;
  copyText: string;
  style: {
    id: string;
    name: string | null;
  } | null;
  status: "pending" | "ready" | "error";
  createdAt: string;
  images: DirectPosterResult[];
  error?: string;
  sourceTaskId?: string | null;
  variationCount?: number | null;
};

type CharacterOption = {
  id: string;
  name: string;
  avatar: string;
  voiceId?: string | null;
};

type DigitalHumanFormState = {
  mode: DigitalHumanMode;
  script: string;
  selectedCharacterId: string;
  imageUrl: string;
  audioUrl: string;
  audioName: string;
  audioDuration: number;
};

const stageLoaderInit = creativeStageOrder.reduce<Record<CreativeStageKey, boolean>>(
  (acc, key) => {
    acc[key] = false;
    return acc;
  },
  {} as Record<CreativeStageKey, boolean>
);

const DEFAULT_WORD_COUNT = "300";
const WORD_COUNT_STORAGE_KEY = "creative-workspace-word-count";
const DIRECT_STYLE_PREF_KEY = "creative-workspace-direct-style";

const readStoredWordCount = () => {
  if (typeof window === "undefined") return DEFAULT_WORD_COUNT;
  const saved = localStorage.getItem(WORD_COUNT_STORAGE_KEY)?.trim();
  return saved && saved.length > 0 ? saved : DEFAULT_WORD_COUNT;
};

const persistWordCount = (value: string) => {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  if (trimmed) {
    localStorage.setItem(WORD_COUNT_STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(WORD_COUNT_STORAGE_KEY);
  }
};

const readStoredDirectStyleId = () => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(DIRECT_STYLE_PREF_KEY) ?? "";
};

const DEFAULT_CHANNEL_VALUE = "short-video";
const DEFAULT_CREATIVE_TYPE = "adlib";
const DEFAULT_DIGITAL_MODE: DigitalHumanMode = "VOICE_CLONE";

const createDefaultSmartFormState = (creativeType?: string) => ({
  ideaText: "",
  channel: DEFAULT_CHANNEL_VALUE,
  targetOutput: readStoredWordCount(),
  creativeType: creativeType ?? DEFAULT_CREATIVE_TYPE,
});

const createDefaultDirectFormState = (options?: { styleId?: string; posterCount?: number }) => ({
  ideaText: "",
  styleId: options?.styleId ?? readStoredDirectStyleId(),
  posterCount: clampPosterCount(options?.posterCount),
});

const createDefaultDigitalFormState = (): DigitalHumanFormState => ({
  mode: DEFAULT_DIGITAL_MODE,
  script: "",
  selectedCharacterId: "",
  imageUrl: "",
  audioUrl: "",
  audioName: "",
  audioDuration: 0,
});

const getAudioDuration = (file: File) =>
  new Promise<number>((resolve) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });

export function CreativeWorkspace() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const copy = t.contentCreation;
  const channelOptions = useMemo(
    () =>
      Array.isArray(copy.newTask.channelOptions)
        ? copy.newTask.channelOptions
        : [],
    [copy.newTask.channelOptions]
  );
  const relativeTimeLocale = useMemo(() => {
    switch (language) {
      case "zh":
        return zhCN;
      case "zh-TW":
        return zhTW;
      default:
        return enUS;
    }
  }, [language]);

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [tasks, setTasks] = useState<CreativeTaskSummary[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<CreativeTaskDetail | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [taskIdPendingDelete, setTaskIdPendingDelete] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assetPool, setAssetPool] = useState<AssetPool>({
    history: [],
    stories: [],
    styles: [],
  });
  const [assetLoading, setAssetLoading] = useState(false);
  const [stageGenerating, setStageGenerating] = useState(stageLoaderInit);
  const [formState, setFormState] = useState(() => createDefaultSmartFormState());
  const [creatingTask, setCreatingTask] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"smart" | "direct" | "digitalHuman">("smart");
  const [directForm, setDirectForm] = useState(() => createDefaultDirectFormState());
  const [directGenerating, setDirectGenerating] = useState(false);
  const [directSourceTaskId, setDirectSourceTaskId] = useState<string | null>(null);
  const [digitalForm, setDigitalForm] = useState<DigitalHumanFormState>(() =>
    createDefaultDigitalFormState()
  );
  const [digitalGenerating, setDigitalGenerating] = useState(false);
  const [digitalCharacters, setDigitalCharacters] = useState<CharacterOption[]>([]);
  const [digitalCharactersLoading, setDigitalCharactersLoading] = useState(false);
  const [digitalAudioUploading, setDigitalAudioUploading] = useState(false);
  const [digitalSourceTaskId, setDigitalSourceTaskId] = useState<string | null>(null);
  const [isCharacterModalOpen, setIsCharacterModalOpen] = useState(false);
  const [posterPreviewJob, setPosterPreviewJob] = useState<PosterJob | null>(null);
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);
  const [isDigitalHumanModalOpen, setIsDigitalHumanModalOpen] = useState(false);
  const [digitalHumanScript, setDigitalHumanScript] = useState("");
  const [digitalHumanSourceTaskId, setDigitalHumanSourceTaskId] = useState<string | null>(null);
  const [showAllStyles, setShowAllStyles] = useState(false);
  const [showAssetsPanel, setShowAssetsPanel] = useState(false);
  const searchParams = useSearchParams();
  const [preferredTaskId, setPreferredTaskId] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [, setNoteSyncState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [draftEditorValue, setDraftEditorValue] = useState("");
  const [isDraftEditing, setIsDraftEditing] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [supplementDraft, setSupplementDraft] = useState<DiagnosisSupplementDraft>(() => ({
    audience: "",
    coreIdea: "",
    example: "",
  }));
  const [supplementSaving, setSupplementSaving] = useState(false);
  const audioUploadInputRef = useRef<HTMLInputElement | null>(null);
  const noteSnapshotRef = useRef("");
  const noteTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [topicSelectionsDraft, setTopicSelectionsDraft] = useState<TopicUserSelections | null>(null);
  const [topicSelectionSyncState, setTopicSelectionSyncState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const topicSelectionSnapshotRef = useRef("");
  const topicSelectionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const topicAutoSelectSignatureRef = useRef<string | null>(null);
  const [viewStageKey, setViewStageKey] = useState<CreativeStageKey | null>(null);
  const stageRefs = useRef<Partial<Record<CreativeStageKey, HTMLDivElement | null>>>({});
  const audioUploadInputId = useId();
  const smartTaskCounterRef = useRef(1);
  const directTaskCounterRef = useRef(1);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const skipTitleBlurCommitRef = useRef(false);

  const resetSmartForm = useCallback(
    (nextType?: string) => {
      setFormState(createDefaultSmartFormState(nextType ?? formState.creativeType));
    },
    [formState.creativeType]
  );

  const resetDirectForm = useCallback(() => {
    const storedStyle = readStoredDirectStyleId();
    setDirectForm(
      createDefaultDirectFormState({
        styleId: storedStyle || directForm.styleId,
      })
    );
  }, [directForm.styleId]);

  const resetDigitalForm = useCallback(() => {
    setDigitalForm(createDefaultDigitalFormState());
    setDigitalSourceTaskId(null);
  }, []);

  const applyUpdatedTask = useCallback(
    (updatedTask: CreativeTaskDetail) => {
      setActiveTask(updatedTask);
      setTasks((prev) =>
        prev.map((task) =>
          task.id === updatedTask.id
            ? {
                ...task,
                title: updatedTask.title,
                ideaText: updatedTask.ideaText,
                stage: updatedTask.stage,
                metadata: updatedTask.metadata,
                updatedAt: updatedTask.updatedAt,
              }
            : task
        )
      );
    },
    []
  );

  const refreshAllRef = useRef<((tokenOverride?: string) => Promise<void>) | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token ?? null;
      setAuthToken(token);
      setRequiresAuth(!token);
      setCurrentUserId(data.session?.user?.id ?? null);
      // second effect handles initial refresh when authToken changes
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token ?? null;
      setAuthToken(token);
      setRequiresAuth(!token);
      setCurrentUserId(session?.user?.id ?? null);
      if (token) {
        void refreshAllRef.current?.(token);
      } else {
        setTasks([]);
        setActiveTask(null);
        setIsPosterModalOpen(false);
        setPosterPreviewJob(null);
        setIsDigitalHumanModalOpen(false);
        setDigitalHumanScript("");
        setDigitalHumanSourceTaskId(null);
        setDirectSourceTaskId(null);
        resetDigitalForm();
        setDigitalCharacters([]);
        setDigitalCharactersLoading(false);
        setDigitalAudioUploading(false);
        setDigitalGenerating(false);
        setIsCharacterModalOpen(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [resetDigitalForm]);

  useEffect(() => {
    const taskId = searchParams.get("taskId");
    if (taskId) {
      setPreferredTaskId(taskId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (digitalCharacters.length === 0) return;
    setDigitalForm((prev) => {
      if (prev.selectedCharacterId) {
        return prev;
      }
      const first = digitalCharacters[0];
      return {
        ...prev,
        selectedCharacterId: first.id,
        imageUrl: first.avatar ?? prev.imageUrl,
        audioUrl: prev.mode === "VOICE_CLONE" ? first.voiceId ?? "" : prev.audioUrl,
        audioName: prev.mode === "VOICE_CLONE" ? "" : prev.audioName,
        audioDuration: prev.mode === "VOICE_CLONE" ? 0 : prev.audioDuration,
      };
    });
  }, [digitalCharacters]);

  useEffect(() => {
    if (!isCreateModalOpen) {
      setIsCharacterModalOpen(false);
    }
  }, [isCreateModalOpen]);

  const authorizedFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      if (!authToken) throw new Error("AUTH_REQUIRED");
      const res = await fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${authToken}`,
          ...(options.headers as Record<string, string>)?.["Content-Type"]
            ? {}
            : options.body
            ? { "Content-Type": "application/json" }
            : {},
        },
      });
      const raw = await res.text();
      if (!res.ok) {
        let errorMessage = "Request failed";
        if (raw) {
          try {
            const payload = JSON.parse(raw);
            if (payload?.error) {
              errorMessage = payload.error;
            }
          } catch {
            errorMessage = raw;
          }
        }
        throw new Error(errorMessage);
      }
      if (!raw) return {};
      try {
        return JSON.parse(raw);
      } catch (err) {
        throw new Error(`响应 JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [authToken]
  );

  const fetchTaskDetail = useCallback(
    async (taskId: string, options?: { tokenOverride?: string; silent?: boolean }) => {
      const token = options?.tokenOverride ?? authToken;
      if (!token || !taskId) return;
      if (!options?.silent) {
        setDetailLoading(true);
      }
      try {
        const res = await fetch(`/api/creative-tasks/${taskId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load task");
        const payload = await res.json();
        setActiveTask(payload.data);
      } catch (error) {
        console.error(error);
        toast.error(copy.errors.loadDetail);
      } finally {
        if (!options?.silent) {
          setDetailLoading(false);
        }
      }
    },
    [authToken, copy.errors.loadDetail]
  );

  const fetchTasks = useCallback(
    async (tokenOverride?: string) => {
      const token = tokenOverride ?? authToken;
      if (!token) return;
      setTasksLoading(true);
      try {
        const res = await fetch("/api/creative-tasks", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load tasks");
        const payload = await res.json();
        setTasks(payload.data || []);
        if (isTaskModalOpen && selectedTaskId) {
          void fetchTaskDetail(selectedTaskId, { tokenOverride: token });
        }
      } catch (error) {
        console.error(error);
        toast.error(copy.errors.loadTasks);
      } finally {
        setTasksLoading(false);
      }
    },
    [authToken, copy.errors.loadTasks, fetchTaskDetail, isTaskModalOpen, selectedTaskId]
  );

  const fetchAssets = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride ?? authToken;
    if (!token) return;
    setAssetLoading(true);
    try {
      const safeJson = async (res: Response, label: string) => {
        const raw = await res.text();
        if (!res.ok) {
          throw new Error(`${label} (${res.status}): ${raw || res.statusText}`);
        }
        if (!raw) return {};
        try {
          return JSON.parse(raw);
        } catch (err) {
          throw new Error(`${label} JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      const [historyRes, storyRes, styleRes] = await Promise.all([
        fetch("/api/assets/history?limit=20", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/assets/stories?limit=20", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/assets/styles?limit=20", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const [historyData, storyData, styleData] = await Promise.all([
        safeJson(historyRes, "历史文案资产"),
        safeJson(storyRes, "故事资产"),
        safeJson(styleRes, "风格资产"),
      ]);
      setAssetPool({
        history: historyData.data || [],
        stories: storyData.data || [],
        styles: styleData.data || [],
      });
    } catch (error) {
      console.error(error);
      toast.error(copy.errors.loadAssets);
    } finally {
      setAssetLoading(false);
    }
  }, [authToken, copy.errors.loadAssets]);

  const fetchDigitalCharacters = useCallback(async () => {
    setDigitalCharactersLoading(true);
    try {
      const res = await fetch("/api/characters");
      if (!res.ok) throw new Error("Failed to load characters");
      const data = (await res.json()) as CharacterOption[];
      setDigitalCharacters(data);
      return data;
    } catch (error) {
      console.error(error);
      toast.error(t.characters.fetchError);
      return [];
    } finally {
      setDigitalCharactersLoading(false);
    }
  }, [t.characters.fetchError]);

  useEffect(() => {
    if (!isCreateModalOpen || createMode !== "digitalHuman") return;
    if (digitalCharacters.length > 0 || digitalCharactersLoading) return;
    void fetchDigitalCharacters();
  }, [
    createMode,
    digitalCharacters.length,
    digitalCharactersLoading,
    fetchDigitalCharacters,
    isCreateModalOpen,
  ]);

  const handleCharacterModalSuccess = useCallback(async () => {
    setIsCharacterModalOpen(false);
    const data = await fetchDigitalCharacters();
    if (data.length > 0) {
      const first = data[0];
      setDigitalForm((prev) => ({
        ...prev,
        selectedCharacterId: first.id,
        imageUrl: first.avatar ?? "",
        audioUrl: prev.mode === "VOICE_CLONE" ? first.voiceId ?? "" : prev.audioUrl,
        audioName: prev.mode === "VOICE_CLONE" ? "" : prev.audioName,
        audioDuration: prev.mode === "VOICE_CLONE" ? 0 : prev.audioDuration,
      }));
    }
  }, [fetchDigitalCharacters]);

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      setDeletingTaskId(taskId);
      try {
        await authorizedFetch(`/api/creative-tasks/${taskId}`, { method: "DELETE" });
        setTasks((prev) => prev.filter((task) => task.id !== taskId));
        let shouldCloseModal = false;
        setActiveTask((prev) => {
          if (prev?.id === taskId) {
            shouldCloseModal = true;
            return null;
          }
          return prev;
        });
        setSelectedTaskId((prev) => {
          if (prev === taskId) {
            shouldCloseModal = true;
            return null;
          }
          return prev;
        });
        if (shouldCloseModal) {
          setIsTaskModalOpen(false);
          setViewStageKey(null);
        }
        toast.success(copy.taskList.deleteSuccess ?? copy.common.success);
      } catch (error) {
        console.error(error);
        toast.error(copy.errors.deleteFailed ?? copy.errors.loadTasks);
      } finally {
        setDeletingTaskId((prev) => (prev === taskId ? null : prev));
      }
    },
    [
      authorizedFetch,
      copy.taskList.deleteSuccess,
      copy.common.success,
      copy.errors.deleteFailed,
      copy.errors.loadTasks,
    ]
  );

  const refreshAll = useCallback(
    async (tokenOverride?: string) => {
      const token = tokenOverride ?? authToken;
      if (!token) return;
      await Promise.all([fetchTasks(token), fetchAssets(token)]);
    },
    [authToken, fetchAssets, fetchTasks]
  );

  const openTaskModal = useCallback(
    (taskId: string) => {
      setSelectedTaskId(taskId);
      setIsTaskModalOpen(true);
      setActiveTask(null);
      setDetailLoading(true);
      void fetchTaskDetail(taskId);
    },
    [fetchTaskDetail]
  );

  useEffect(() => {
    refreshAllRef.current = refreshAll;
  }, [refreshAll]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedCount = readStoredWordCount();
    setFormState((prev) =>
      prev.targetOutput === savedCount ? prev : { ...prev, targetOutput: savedCount }
    );
    const savedStyle = localStorage.getItem(DIRECT_STYLE_PREF_KEY);
    if (savedStyle) {
      setDirectForm((prev) => ({ ...prev, styleId: savedStyle }));
    }
  }, []);

  useEffect(() => {
    if (!authToken) return;
    void refreshAll(authToken);
  }, [authToken, refreshAll]);

  useEffect(() => {
    if (!preferredTaskId) return;
    const target = tasks.find((task) => task.id === preferredTaskId);
    if (target) {
      openTaskModal(target.id);
      setPreferredTaskId(null);
    }
  }, [preferredTaskId, tasks, openTaskModal]);

  const currentStageKey = activeTask?.stage as CreativeStageKey | undefined;
  const currentStageMeta = currentStageKey
    ? getStageMeta(activeTask?.metadata, currentStageKey)
    : undefined;
  const activeTaskId = activeTask?.id ?? null;
  const activeTaskTitle = activeTask?.title ?? "";
  const activeTaskIdea = activeTask?.ideaText ?? "";
  const activeTaskGoal = (activeTask?.goal as Record<string, any> | null) ?? null;
  const displayTaskTitle =
    activeTaskTitle.trim() || activeTaskIdea.trim() || copy.taskList.untitled;

  const normalizeSupplementValue = useCallback((value: unknown) => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
        .join("；");
    }
    if (value && typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return value != null ? String(value) : "";
  }, []);

  const supplementBaseline = useMemo<DiagnosisSupplementDraft>(() => {
    return {
      audience: normalizeSupplementValue(activeTaskGoal?.audience ?? activeTaskGoal?.targetAudience ?? ""),
      coreIdea: normalizeSupplementValue(activeTaskGoal?.coreIdea ?? activeTaskGoal?.core_topic ?? ""),
      example: normalizeSupplementValue(activeTaskGoal?.example ?? activeTaskGoal?.storyExample ?? ""),
    };
  }, [activeTaskGoal, normalizeSupplementValue]);

  useEffect(() => {
    if (!isTaskModalOpen) return;
    setSupplementDraft(supplementBaseline);
  }, [isTaskModalOpen, supplementBaseline]);

  const supplementDirty = useMemo(() => {
    return (["audience", "coreIdea", "example"] as Array<keyof DiagnosisSupplementDraft>).some(
      (field) =>
        (supplementDraft[field] ?? "").trim() !== (supplementBaseline[field] ?? "").trim(),
    );
  }, [supplementDraft, supplementBaseline]);

  useEffect(() => {
    if (!activeTaskId) {
      setTitleDraft("");
      setIsTitleEditing(false);
      setTitleSaving(false);
      return;
    }
    setTitleDraft(activeTaskTitle || activeTaskIdea || "");
    setIsTitleEditing(false);
    setTitleSaving(false);
  }, [activeTaskId, activeTaskIdea, activeTaskTitle]);

  const resolvedViewStageKey = (viewStageKey ?? currentStageKey) ?? null;
  const viewStageMeta = resolvedViewStageKey
    ? getStageMeta(activeTask?.metadata, resolvedViewStageKey)
    : undefined;
  const viewStageConfig = resolvedViewStageKey ? creativeStages[resolvedViewStageKey] : null;
  const isViewingCurrentStage = resolvedViewStageKey === currentStageKey;
  const isDraftStage = resolvedViewStageKey === "draft";
  const latestCompletedStageKey = useMemo(() => {
    const stages = activeTask?.metadata?.stages;
    if (!stages) return null;
    for (let i = creativeStageOrder.length - 1; i >= 0; i -= 1) {
      const key = creativeStageOrder[i];
      const entry = stages[key];
      if (entry?.aiOutput) {
        return key;
      }
    }
    return null;
  }, [activeTask?.metadata?.stages]);
  const guideStageKey = latestCompletedStageKey ?? currentStageKey ?? null;
  const isViewingGuideStage = Boolean(
    guideStageKey && resolvedViewStageKey === guideStageKey
  );
  const stageNeedsGeneration = useMemo(() => {
    if (!currentStageKey) return false;
    const meta = activeTask?.metadata?.stages?.[currentStageKey];
    return !meta || meta.status !== "completed";
  }, [activeTask?.metadata?.stages, currentStageKey]);
  const nextStageKey = currentStageKey ? getNextStage(currentStageKey) : null;
  const nextStageConfig = nextStageKey ? creativeStages[nextStageKey] : null;
  const showAdvanceControls = Boolean(currentStageKey && stageNeedsGeneration && isViewingGuideStage);
  const advanceButtonLabel = copy.stagePanel.next ?? copy.stagePanel.generate;
  const isAdvancingStage = Boolean(currentStageKey && stageGenerating[currentStageKey]);
  const guidanceItems = useMemo(
    () =>
      isViewingGuideStage ? extractGuidanceItems(guideStageKey, viewStageMeta?.aiOutput) : [],
    [guideStageKey, isViewingGuideStage, viewStageMeta?.aiOutput]
  );
  const isTopicGuidance = guideStageKey === "topic" && resolvedViewStageKey === "topic";
  const guidanceTitleText = isTopicGuidance
    ? copy.stagePanel.topicGuidanceTitle ?? copy.stagePanel.guidanceTitle ?? "AI 建议"
    : copy.stagePanel.guidanceTitle ?? "AI 建议";
  const guidanceDescriptionText = isTopicGuidance
    ? copy.stagePanel.topicGuidanceDescription ?? copy.stagePanel.guidanceDescription
    : copy.stagePanel.guidanceDescription;
  const shouldShowGuidanceBlock =
    isViewingGuideStage && Boolean(guideStageKey) && Boolean(viewStageMeta?.aiOutput);

  const stageGuidanceBlock = (
    <AnimatePresence mode="wait">
      {shouldShowGuidanceBlock ? (
        <motion.div
          key={`guidance-${guideStageKey}`}
          layout
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          className="rounded-2xl border border-amber-200 bg-amber-50/70 dark:border-amber-400/40 dark:bg-amber-400/10 p-4 text-amber-900 dark:text-amber-50"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">
                {guidanceTitleText}
              </p>
              <p className="text-xs text-amber-900/80 dark:text-amber-100/80">
                {guidanceDescriptionText ??
                  "先根据上一步的建议补充提醒或素材，再继续下一步。"}
              </p>
            </div>
            {nextStageConfig && stageNeedsGeneration && (
              <p className="text-xs font-semibold">
                {(copy.stagePanel.nextStageLabel ?? "下一阶段")}: {nextStageConfig.title}
              </p>
            )}
          </div>
          {!isTopicGuidance &&
            (guidanceItems.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm leading-5">
                {guidanceItems.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 mt-0.5" />
                    <span className="flex-1">{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-amber-900/80 dark:text-amber-100/80">
                {copy.stagePanel.guidanceEmpty ?? "将重点补充在下方备注中。"}
              </p>
            ))}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
  const draftSourceContent = viewStageMeta?.manualContent ?? viewStageMeta?.aiOutput;
  const draftOutput = useMemo(
    () => cleanDraftOutput(draftSourceContent),
    [draftSourceContent]
  );
  const isDraftWriting = isDraftStage && stageGenerating.draft;
  const showDraftRegenerate = isDraftStage && !draftOutput;
  const canEditDraft = isDraftStage;
  const { titles: draftTitles, blocks: draftBodyBlocks, bodyText: draftBodyText } = useMemo(
    () => buildDraftStructure(draftOutput),
    [draftOutput]
  );
  const draftCompositeText = useMemo(() => {
    const parts: string[] = [];
    if (draftTitles[0]) parts.push(draftTitles[0]);
    const body = isDraftEditing ? draftEditorValue : draftBodyText;
    if (body.trim()) {
      parts.push(body.trim());
    }
    return parts.join("\n\n");
  }, [draftTitles, draftBodyText, draftEditorValue, isDraftEditing]);

  const syncTopicSelections = useCallback(
    async (selections: TopicUserSelections | null) => {
      if (!activeTaskId) return;
      try {
        const topicStatus =
          getStageMeta(activeTask?.metadata, "topic")?.status ?? "completed";
        const payload = await authorizedFetch(`/api/creative-tasks/${activeTaskId}/stage`, {
          method: "POST",
          body: JSON.stringify({
            stage: "topic",
            userSelections: selections,
            status: topicStatus,
          }),
        });
        if (payload?.data) {
          applyUpdatedTask(payload.data);
          const nextSelections =
            (payload.data.metadata?.stages?.topic?.userSelections as TopicUserSelections | null) ??
            null;
          topicSelectionSnapshotRef.current = JSON.stringify(nextSelections ?? {});
          setTopicSelectionSyncState("saved");
        } else {
          setTopicSelectionSyncState("error");
        }
      } catch (error) {
        console.error(error);
        setTopicSelectionSyncState("error");
      }
    },
    [activeTask?.metadata, activeTaskId, applyUpdatedTask, authorizedFetch]
  );

  useEffect(() => {
    if (!isTaskModalOpen) {
      setViewStageKey(null);
      setNotesExpanded(false);
      setShowAssetsPanel(false);
      return;
    }
    if (latestCompletedStageKey) {
      setViewStageKey((prev) => {
        if (!prev) return latestCompletedStageKey;
        const prevIndex = creativeStageOrder.indexOf(prev);
        const latestIndex = creativeStageOrder.indexOf(latestCompletedStageKey);
        if (latestIndex > prevIndex) {
          return latestCompletedStageKey;
        }
        return prev;
      });
      return;
    }
    if (currentStageKey) {
      setViewStageKey((prev) => prev ?? currentStageKey);
    }
  }, [isTaskModalOpen, latestCompletedStageKey, currentStageKey]);

  useEffect(() => {
    setNotesExpanded(false);
  }, [resolvedViewStageKey]);

  useEffect(() => {
    if (!isTaskModalOpen || resolvedViewStageKey !== "topic") {
      setTopicSelectionsDraft(null);
      topicSelectionSnapshotRef.current = JSON.stringify({});
      setTopicSelectionSyncState("idle");
      topicAutoSelectSignatureRef.current = null;
      return;
    }
    const selections = (viewStageMeta?.userSelections ?? null) as TopicUserSelections | null;
    setTopicSelectionsDraft(selections);
    topicSelectionSnapshotRef.current = JSON.stringify(selections ?? {});
    setTopicSelectionSyncState("saved");
  }, [isTaskModalOpen, resolvedViewStageKey, viewStageMeta?.userSelections, viewStageMeta?.updatedAt]);

  useEffect(() => {
    if (!isTaskModalOpen || resolvedViewStageKey !== "topic") return;
    const aiOutput = viewStageMeta?.aiOutput;
    if (!aiOutput) return;
    const serverSelections = (viewStageMeta?.userSelections ?? null) as TopicUserSelections | null;
    const hasServerSelections =
      (serverSelections?.coreTopic && serverSelections.coreTopic.length > 0) ||
      (serverSelections?.promise && serverSelections.promise.length > 0) ||
      (serverSelections?.heroSentence && serverSelections.heroSentence.length > 0) ||
      (serverSelections?.angles && serverSelections.angles.length > 0) ||
      (serverSelections?.titles && serverSelections.titles.length > 0) ||
      (serverSelections?.outline && serverSelections.outline.length > 0);
    if (hasServerSelections) {
      topicAutoSelectSignatureRef.current = JSON.stringify(aiOutput);
      return;
    }
    const fingerprint = JSON.stringify(aiOutput);
    if (!fingerprint || topicAutoSelectSignatureRef.current === fingerprint) return;
    const defaults = deriveDefaultTopicSelections(aiOutput, { titleMode: "single" });
    if (!defaults) return;
    topicAutoSelectSignatureRef.current = fingerprint;
    setTopicSelectionsDraft(defaults);
    topicSelectionSnapshotRef.current = JSON.stringify(defaults);
    setTopicSelectionSyncState("saving");
    void syncTopicSelections(defaults);
  }, [
    isTaskModalOpen,
    resolvedViewStageKey,
    viewStageMeta?.aiOutput,
    viewStageMeta?.userSelections,
    syncTopicSelections,
  ]);

  useEffect(() => {
    if (!isTaskModalOpen || resolvedViewStageKey !== "topic" || !activeTaskId) return;
    const fingerprint = JSON.stringify(topicSelectionsDraft ?? {});
    if (fingerprint === topicSelectionSnapshotRef.current) return;
    setTopicSelectionSyncState("saving");
    if (topicSelectionTimerRef.current) {
      clearTimeout(topicSelectionTimerRef.current);
    }
    topicSelectionTimerRef.current = setTimeout(() => {
      void syncTopicSelections(topicSelectionsDraft);
    }, 800);
    return () => {
      if (topicSelectionTimerRef.current) {
        clearTimeout(topicSelectionTimerRef.current);
      }
    };
  }, [
    topicSelectionsDraft,
    isTaskModalOpen,
    resolvedViewStageKey,
    syncTopicSelections,
    activeTaskId,
  ]);

  useEffect(() => {
    if (isDraftStage) {
      setDraftEditorValue(draftBodyText);
      setIsDraftEditing(false);
    }
  }, [draftBodyText, isDraftStage, resolvedViewStageKey]);

  useEffect(() => {
    if (!isTaskModalOpen || !resolvedViewStageKey) return;
    const stageIndex = creativeStageOrder.indexOf(resolvedViewStageKey);
    if (stageIndex < 2) return;
    const target = stageRefs.current[resolvedViewStageKey];
    target?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: stageIndex >= creativeStageOrder.length - 1 ? "end" : "center",
    });
  }, [isTaskModalOpen, resolvedViewStageKey]);

  const beginTitleEditing = useCallback(() => {
    if (!activeTaskId || titleSaving) return;
    skipTitleBlurCommitRef.current = false;
    setIsTitleEditing(true);
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
  }, [activeTaskId, titleSaving]);

  const cancelTitleEditing = useCallback(() => {
    setIsTitleEditing(false);
    setTitleDraft(activeTaskTitle || activeTaskIdea || "");
    skipTitleBlurCommitRef.current = true;
    titleInputRef.current?.blur();
  }, [activeTaskIdea, activeTaskTitle]);

  const commitTitleEdit = useCallback(async () => {
    if (!activeTaskId || titleSaving) return;
    const nextTitle = titleDraft.trim();
    const currentTitle = activeTaskTitle.trim();
    if (!nextTitle) {
      toast.error(copy.errors.titleRequired ?? copy.errors.ideaRequired ?? "标题不能为空");
      titleInputRef.current?.focus();
      return;
    }
    if (nextTitle === currentTitle) {
      cancelTitleEditing();
      return;
    }
    setTitleSaving(true);
    try {
      const payload = await authorizedFetch(`/api/creative-tasks/${activeTaskId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: nextTitle }),
      });
      if (payload?.data) {
        applyUpdatedTask(payload.data);
        setIsTitleEditing(false);
        toast.success(copy.stagePanel.saved ?? copy.common.success ?? "已保存");
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : copy.errors.saveFailed);
    } finally {
      setTitleSaving(false);
    }
  }, [
    activeTaskId,
    activeTaskTitle,
    authorizedFetch,
    applyUpdatedTask,
    cancelTitleEditing,
    copy.common.success,
    copy.errors.ideaRequired,
    copy.errors.saveFailed,
    copy.errors.titleRequired,
    copy.stagePanel.saved,
    titleDraft,
    titleSaving,
  ]);

  const handleTitleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void commitTitleEdit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelTitleEditing();
      }
    },
    [cancelTitleEditing, commitTitleEdit]
  );

  const handleTitleBlur = useCallback(() => {
    if (skipTitleBlurCommitRef.current) {
      skipTitleBlurCommitRef.current = false;
      return;
    }
    void commitTitleEdit();
  }, [commitTitleEdit]);

  const handleWordCountChange = useCallback((value: string) => {
    setFormState((prev) => ({ ...prev, targetOutput: value }));
    persistWordCount(value);
  }, []);

  const handleNotesFocus = useCallback(() => {
    setNotesExpanded(true);
  }, []);

  const handleNotesBlur = useCallback(() => {
    if (!notesDraft.trim()) {
      setNotesExpanded(false);
    }
  }, [notesDraft]);

  const handleTopicSelectionsChange = useCallback((next: TopicUserSelections | null) => {
    setTopicSelectionsDraft(next);
  }, []);

  const closePosterModal = useCallback(() => {
    setIsPosterModalOpen(false);
    setPosterPreviewJob(null);
  }, []);

  const closeDigitalHumanModal = useCallback(() => {
    setIsDigitalHumanModalOpen(false);
    setDigitalHumanScript("");
    setDigitalHumanSourceTaskId(null);
  }, []);

  const handleCopyDraft = useCallback(async () => {
    const text = draftCompositeText.trim();
    if (!text) {
      toast.error(copy.stagePanel.draftEmpty);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error(copy.stagePanel.copyFailed);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(copy.stagePanel.copied);
    } catch (error) {
      console.error(error);
      toast.error(copy.stagePanel.copyFailed);
    }
  }, [copy.stagePanel, draftCompositeText]);

  const handleCopyTitle = useCallback(
    async (title: string) => {
      const payload = title?.trim();
      if (!payload) return;
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        toast.error(copy.stagePanel.copyFailed);
        return;
      }
      try {
        await navigator.clipboard.writeText(payload);
        toast.success(copy.stagePanel.copied);
      } catch (error) {
        console.error(error);
        toast.error(copy.stagePanel.copyFailed);
      }
    },
    [copy.stagePanel]
  );

  const persistDraftEdits = useCallback(async () => {
    if (!activeTaskId) {
      setIsDraftEditing(false);
      return;
    }
    setDraftSaving(true);
    try {
      const payload = await authorizedFetch(`/api/creative-tasks/${activeTaskId}/stage`, {
        method: "POST",
        body: JSON.stringify({
          stage: "draft",
          manualContent: draftEditorValue,
          status: "completed",
        }),
      });
      if (payload?.data) {
        applyUpdatedTask(payload.data);
      }
      toast.success(copy.stagePanel.saved ?? copy.common.success ?? "已保存");
      setIsDraftEditing(false);
    } catch (error) {
      console.error(error);
      toast.error(copy.errors.saveFailed);
    } finally {
      setDraftSaving(false);
    }
  }, [
    activeTaskId,
    applyUpdatedTask,
    authorizedFetch,
    copy.common.success,
    copy.errors.saveFailed,
    copy.stagePanel.saved,
    draftEditorValue,
  ]);

  const handleDraftEditToggle = useCallback(() => {
    if (!isDraftStage) return;
    if (!isDraftEditing) {
      if (!draftEditorValue) {
        setDraftEditorValue(draftBodyText);
      }
      setIsDraftEditing(true);
      return;
    }
    void persistDraftEdits();
  }, [draftBodyText, draftEditorValue, isDraftEditing, isDraftStage, persistDraftEdits]);

  const handleDraftAction = useCallback(
    (action: "xhs" | "digitalHuman" | "storyboard") => {
      if (action === "xhs") {
        setCreateMode("direct");
        setIsCreateModalOpen(true);
        setDirectSourceTaskId(activeTaskId ?? null);
        if (draftCompositeText) {
          setDirectForm((prev) => ({
            ...prev,
            ideaText: draftCompositeText,
          }));
        }
        if (copy.stagePanel.actionXhsLaunching) {
          toast.success(copy.stagePanel.actionXhsLaunching);
        }
        return;
      }
      if (action === "digitalHuman") {
        setDigitalHumanScript(draftCompositeText);
        setDigitalHumanSourceTaskId(activeTaskId);
        setIsDigitalHumanModalOpen(true);
        if (copy.stagePanel.actionDigitalHumanLaunching) {
          toast.success(copy.stagePanel.actionDigitalHumanLaunching);
        }
        return;
      }
      router.push("/storyboard");
      if (copy.stagePanel.actionStoryboardLaunching) {
        toast.success(copy.stagePanel.actionStoryboardLaunching);
      }
    },
    [
      router,
      copy.stagePanel.actionDigitalHumanLaunching,
      copy.stagePanel.actionXhsLaunching,
      copy.stagePanel.actionStoryboardLaunching,
      draftCompositeText,
      draftTitles,
      activeTaskId,
      setDigitalHumanScript,
      setDigitalHumanSourceTaskId,
      setDirectForm,
    ]
  );

  const syncStageNotes = useCallback(
    async (notes: string, stage: CreativeStageKey, status: CreativeStageStatus) => {
      if (!activeTaskId) return;
      try {
        const payload = await authorizedFetch(`/api/creative-tasks/${activeTaskId}/stage`, {
          method: "POST",
          body: JSON.stringify({
            stage,
            userNotes: notes,
            status,
          }),
        });
        if (payload?.data) {
          applyUpdatedTask(payload.data);
          noteSnapshotRef.current = notes;
          setNoteSyncState("saved");
        } else {
          setNoteSyncState("error");
        }
      } catch (error) {
        console.error(error);
        setNoteSyncState("error");
      }
    },
    [activeTaskId, authorizedFetch, applyUpdatedTask]
  );

  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!authToken) {
      toast.error(copy.common.authRequired);
      return;
    }
    if (!formState.ideaText.trim()) {
      toast.error(copy.errors.ideaRequired);
      return;
    }
    const smartTitlePrefix =
      copy.newTask.autoTitleSmart ?? copy.newTask.title ?? copy.taskList.untitled ?? "新智能任务";
    const smartSeparator = /[0-9a-zA-Z]$/.test(smartTitlePrefix) ? " " : "";
    const generatedTitle = `${smartTitlePrefix}${smartSeparator}${smartTaskCounterRef.current}`;
    smartTaskCounterRef.current += 1;
    setCreatingTask(true);
    try {
      const payload = {
        title: generatedTitle,
        ideaText: formState.ideaText,
        channel: formState.channel || undefined,
        targetOutput: formState.targetOutput || undefined,
        goal: { creativeType: formState.creativeType },
      };
      const response = (await authorizedFetch("/api/creative-tasks", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as { data: CreativeTaskDetail | null };
      const createdTask = response?.data ?? null;
      toast.success(copy.common.created);
      resetSmartForm(formState.creativeType);
      if (createdTask?.id) {
        setActiveTask(createdTask);
        setSelectedTaskId(createdTask.id);
        setIsTaskModalOpen(true);
        setViewStageKey("diagnosis");
        setDetailLoading(false);
        void runStageGeneration("diagnosis", {
          taskId: createdTask.id,
          skipSuccessToast: true,
        });
      }
      setIsCreateModalOpen(false);
      setCreateMode("smart");
      await fetchTasks();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : copy.errors.createFailed);
    } finally {
      setCreatingTask(false);
    }
  };

  const handleDirectGenerate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!authToken) {
      toast.error(copy.common.authRequired);
      return;
    }
    if (!directForm.ideaText.trim()) {
      toast.error(copy.errors.ideaRequired);
      return;
    }
    if (!directForm.styleId) {
      toast.error(copy.errors.styleRequired ?? copy.errors.ideaRequired);
      return;
    }
    const directTitlePrefix =
      copy.newTask.autoTitleDirect ??
      copy.newTask.direct?.title ??
      copy.taskList.untitled ??
      "新图文任务";
    const directSeparator = /[0-9a-zA-Z]$/.test(directTitlePrefix) ? " " : "";
    const generatedDirectTitle = `${directTitlePrefix}${directSeparator}${directTaskCounterRef.current}`;
    directTaskCounterRef.current += 1;
    setIsCreateModalOpen(false);
    setDirectGenerating(true);
    try {
      const payload = {
        title: generatedDirectTitle,
        copyText: directForm.ideaText,
        styleId: directForm.styleId,
        variations: clampPosterCount(directForm.posterCount),
        sourceTaskId: directSourceTaskId ?? undefined,
      };
      toast.success(copy.newTask.direct?.queued ?? "图文生成中，预计 30 秒完成");
      const response = await fetch("/api/xhs-images/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const payloadJson = await response.json().catch(() => ({}));
      const createdJob = payloadJson?.data as PosterJob | undefined;
      if (createdJob) {
        setPosterPreviewJob(createdJob);
        setIsPosterModalOpen(true);
      }
      if (!response.ok) {
        throw new Error(
          (payloadJson?.error as string | undefined) ??
            copy.errors.directFailed ??
            copy.errors.createFailed ??
            "生成失败"
        );
      }
      toast.success(copy.newTask.direct?.success ?? copy.common.success);
      resetDirectForm();
      await fetchTasks();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : copy.errors.directFailed ?? copy.errors.createFailed
      );
    } finally {
      setDirectGenerating(false);
      setDirectSourceTaskId(null);
    }
  };

  const handleDigitalCharacterSelect = useCallback(
    (characterId: string) => {
      const target = digitalCharacters.find((item) => item.id === characterId);
      setDigitalForm((prev) => {
        const next = {
          ...prev,
          selectedCharacterId: characterId,
          imageUrl: target?.avatar ?? "",
        };
        if (prev.mode === "VOICE_CLONE") {
          if (target?.voiceId) {
            next.audioUrl = target.voiceId;
            next.audioName = "";
            next.audioDuration = 0;
          } else if (!prev.audioName) {
            next.audioUrl = "";
            next.audioDuration = 0;
          }
        }
        return next;
      });
    },
    [digitalCharacters]
  );

  const handleDigitalModeChange = useCallback(
    (mode: DigitalHumanMode) => {
      setDigitalForm((prev) => {
        if (prev.mode === mode) return prev;
        const selected = digitalCharacters.find((item) => item.id === prev.selectedCharacterId);
        const next = { ...prev, mode };
        if (mode === "VOICE_CLONE" && selected?.voiceId) {
          next.audioUrl = selected.voiceId;
          next.audioName = "";
          next.audioDuration = 0;
        }
        if (mode === "LIP_SYNC" && !prev.audioName) {
          next.audioUrl = "";
          next.audioDuration = 0;
        }
        return next;
      });
    },
    [digitalCharacters]
  );

  const handleDigitalAudioUpload = useCallback(
    async (file: File) => {
      setDigitalAudioUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error("UPLOAD_FAILED");
        const data = await res.json();
        const duration = await getAudioDuration(file);
        setDigitalForm((prev) => ({
          ...prev,
          audioUrl: data.url,
          audioName: file.name,
          audioDuration: duration,
        }));
      } catch (error) {
        console.error(error);
        toast.error(copy.errors.assetFailed ?? "上传失败");
      } finally {
        setDigitalAudioUploading(false);
      }
    },
    [copy.errors.assetFailed]
  );

  const handleDigitalAudioRemove = useCallback(() => {
    setDigitalForm((prev) => ({
      ...prev,
      audioUrl: "",
      audioName: "",
      audioDuration: 0,
    }));
  }, []);

  const handleDigitalAudioInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void handleDigitalAudioUpload(file);
      }
      // allow re-uploading same file
      // eslint-disable-next-line no-param-reassign
      event.target.value = "";
    },
    [handleDigitalAudioUpload]
  );

  const handleUseDefaultVoice = useCallback(() => {
    setDigitalForm((prev) => {
      const selected = digitalCharacters.find((item) => item.id === prev.selectedCharacterId);
      if (!selected?.voiceId) {
        return prev;
      }
      return {
        ...prev,
        audioUrl: selected.voiceId ?? "",
        audioName: "",
        audioDuration: 0,
      };
    });
  }, [digitalCharacters]);

  const runStageGeneration = useCallback(
    async (
      stage: CreativeStageKey,
      options?: { taskId?: string; skipSuccessToast?: boolean }
    ) => {
      const targetTaskId = options?.taskId ?? activeTaskId;
      if (!targetTaskId) return;
      setStageGenerating((prev) => ({ ...prev, [stage]: true }));
      try {
        await authorizedFetch(`/api/creative-tasks/${targetTaskId}/generate`, {
          method: "POST",
          body: JSON.stringify({ stage }),
        });
        if (!options?.skipSuccessToast) {
          toast.success(copy.stagePanel.generated);
        }
        await fetchTaskDetail(targetTaskId);
        await fetchTasks();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : copy.errors.generateFailed);
      } finally {
        setStageGenerating((prev) => ({ ...prev, [stage]: false }));
      }
    },
    [
      activeTaskId,
      authorizedFetch,
      copy.errors.generateFailed,
      copy.stagePanel.generated,
      fetchTaskDetail,
      fetchTasks,
    ]
  );

  const handleGenerate = useCallback(
    async (stage: CreativeStageKey) => {
      await runStageGeneration(stage);
    },
    [runStageGeneration]
  );

  const handleSupplementChange = useCallback(
    (field: keyof DiagnosisSupplementDraft, value: string) => {
      setSupplementDraft((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    [],
  );

  const handleSupplementSubmit = useCallback(async () => {
    if (!activeTaskId) return;
    setSupplementSaving(true);
    try {
      const currentGoal: Record<string, any> =
        activeTaskGoal && typeof activeTaskGoal === "object" ? { ...activeTaskGoal } : {};
      const fields: Array<keyof DiagnosisSupplementDraft> = ["audience", "coreIdea", "example"];
      for (const field of fields) {
        const draftValue = supplementDraft[field]?.trim() ?? "";
        if (draftValue) {
          currentGoal[field] = draftValue;
        } else {
          delete currentGoal[field];
        }
      }
      const payload = await authorizedFetch(`/api/creative-tasks/${activeTaskId}`, {
        method: "PATCH",
        body: JSON.stringify({ goal: currentGoal }),
      });
      if (payload?.data) {
        applyUpdatedTask(payload.data);
        toast.success(copy.stagePanel?.supplementSaved ?? "补充信息已保存，正在重新诊断…");
        await runStageGeneration("diagnosis", { taskId: activeTaskId, skipSuccessToast: true });
      } else {
        toast.error(copy.errors.saveFailed);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : copy.errors.saveFailed);
    } finally {
      setSupplementSaving(false);
    }
  }, [
    activeTaskGoal,
    activeTaskId,
    applyUpdatedTask,
    authorizedFetch,
    copy.errors.saveFailed,
    copy.stagePanel?.supplementSaved,
    runStageGeneration,
    supplementDraft,
  ]);

  const handleDigitalHumanSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const selectedCharacter =
      digitalCharacters.find((item) => item.id === digitalForm.selectedCharacterId) ?? null;
    if (!selectedCharacter) {
      toast.error(copy.newTask.digitalHuman?.characterRequired ?? copy.errors.createFailed);
      return;
    }
    const scriptPayload = digitalForm.mode === "VOICE_CLONE" ? digitalForm.script.trim() : "";
    if (digitalForm.mode === "VOICE_CLONE" && !scriptPayload) {
      toast.error(copy.newTask.digitalHuman?.scriptRequired ?? copy.errors.createFailed);
      return;
    }
    let audioUrl = digitalForm.audioUrl;
    if (digitalForm.mode === "VOICE_CLONE" && !audioUrl && selectedCharacter.voiceId) {
      audioUrl = selectedCharacter.voiceId;
    }
    if (!audioUrl) {
      toast.error(copy.newTask.digitalHuman?.audioRequired ?? copy.errors.createFailed);
      return;
    }
    const imageUrl = digitalForm.imageUrl || selectedCharacter.avatar;
    if (!imageUrl) {
      toast.error(copy.errors.assetFailed);
      return;
    }
    setDigitalGenerating(true);
    try {
      const formData = new FormData();
      formData.append("type", digitalForm.mode);
      formData.append("imageUrl", imageUrl);
      formData.append("audioUrl", audioUrl);
      if (digitalForm.mode === "VOICE_CLONE" && scriptPayload) {
        formData.append("script", scriptPayload);
      }
      const roundedDuration =
        digitalForm.audioDuration > 0 ? Math.round(digitalForm.audioDuration) : undefined;
      if (roundedDuration) {
        formData.append("duration", roundedDuration.toString());
      }
      if (currentUserId) {
        formData.append("userId", currentUserId);
      }
      if (digitalSourceTaskId) {
        formData.append("sourceTaskId", digitalSourceTaskId);
      }
      await createDigitalHumanVideo(formData);
      toast.success(
        copy.newTask.digitalHuman?.queued ??
          copy.stagePanel.actionDigitalHumanLaunching ??
          copy.common.success
      );
      resetDigitalForm();
      setIsCreateModalOpen(false);
      await fetchTasks();
    } catch (error) {
      console.error(error);
      toast.error(copy.errors.createFailed);
    } finally {
      setDigitalGenerating(false);
    }
  };

  const handleDirectResultDownload = useCallback((url: string, filename: string) => {
    if (typeof window === "undefined") return;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleResultPromptCopy = useCallback(
    async (prompt: string) => {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        toast.error(copy.stagePanel.copyFailed);
        return;
      }
      try {
        await navigator.clipboard.writeText(prompt);
        toast.success(copy.stagePanel.copied);
      } catch (error) {
        console.error(error);
        toast.error(copy.stagePanel.copyFailed);
      }
    },
    [copy.stagePanel.copyFailed, copy.stagePanel.copied]
  );





  useEffect(() => {
    if (!isTaskModalOpen || !resolvedViewStageKey) return;
    const nextNotes = viewStageMeta?.userNotes ?? "";
    setNotesDraft(nextNotes);
    noteSnapshotRef.current = nextNotes;
    setNoteSyncState("saved");
  }, [isTaskModalOpen, resolvedViewStageKey, viewStageMeta?.userNotes, activeTaskId]);

  useEffect(() => {
    if (!isTaskModalOpen || !resolvedViewStageKey || !activeTaskId) return;
    if (notesDraft === noteSnapshotRef.current) return;
    setNoteSyncState("saving");
    if (noteTimerRef.current) {
      clearTimeout(noteTimerRef.current);
    }
    const status: CreativeStageStatus =
      viewStageMeta?.status ?? (isViewingCurrentStage ? "in_progress" : "completed");
    noteTimerRef.current = setTimeout(() => {
      void syncStageNotes(notesDraft, resolvedViewStageKey, status);
    }, 800);
    return () => {
      if (noteTimerRef.current) {
        clearTimeout(noteTimerRef.current);
      }
    };
  }, [
    notesDraft,
    isTaskModalOpen,
    resolvedViewStageKey,
    activeTaskId,
    viewStageMeta?.status,
    syncStageNotes,
    isViewingCurrentStage,
  ]);

  useEffect(() => {
    return () => {
      if (noteTimerRef.current) {
        clearTimeout(noteTimerRef.current);
      }
      if (topicSelectionTimerRef.current) {
        clearTimeout(topicSelectionTimerRef.current);
      }
    };
  }, []);

  const closeCreateModal = () => {
    if (creatingTask || directGenerating || digitalGenerating) return;
    setIsCreateModalOpen(false);
    resetSmartForm();
    resetDirectForm();
    resetDigitalForm();
    setDirectSourceTaskId(null);
  };

  const closeTaskModal = () => {
    setIsTaskModalOpen(false);
  };

  const attachmentCountKey = (type: "history" | "story") =>
    type === "history" ? "historyDocs" : "stories";

  const handleAttachAsset = async (type: "history" | "story", id: string) => {
    if (!activeTask) return;
    const currentTaskId = activeTask.id;
    try {
      await authorizedFetch(`/api/creative-tasks/${currentTaskId}/assets`, {
        method: "POST",
        body: JSON.stringify({ type, id }),
      });
      setActiveTask((prev) => {
        if (!prev) return prev;
        switch (type) {
          case "history": {
            const doc = assetPool.history.find((item) => item.id === id);
            if (!doc) return prev;
            if (prev.historyDocs.some((item) => item.id === id)) return prev;
            return { ...prev, historyDocs: [...prev.historyDocs, doc] };
          }
          case "story": {
            const story = assetPool.stories.find((item) => item.id === id);
            if (!story) return prev;
            if (prev.stories.some((item) => item.id === id)) return prev;
            return { ...prev, stories: [...prev.stories, story] };
          }
          default:
            return prev;
        }
      });
      setTasks((prev) =>
        prev.map((task) => {
          if (task.id !== currentTaskId) return task;
          const attachments: NonNullable<CreativeTaskSummary["attachments"]> = {
            historyDocs: task.attachments?.historyDocs ?? 0,
            stories: task.attachments?.stories ?? 0,
            styles: task.attachments?.styles ?? 0,
          };
          const key = attachmentCountKey(type);
          attachments[key] = Math.max(0, attachments[key] + 1);
          return {
            ...task,
            attachments,
            updatedAt: new Date().toISOString(),
          };
        })
      );
      toast.success(copy.assets.attached);
      void fetchTaskDetail(currentTaskId, { silent: true });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : copy.errors.assetFailed);
    }
  };

  const handleDetachAsset = async (type: "history" | "story", id: string) => {
    if (!activeTask) return;
    const currentTaskId = activeTask.id;
    try {
      await authorizedFetch(
        `/api/creative-tasks/${currentTaskId}/assets?type=${type}&id=${id}`,
        {
          method: "DELETE",
        }
      );
      setActiveTask((prev) => {
        if (!prev) return prev;
        switch (type) {
          case "history":
            return { ...prev, historyDocs: prev.historyDocs.filter((doc) => doc.id !== id) };
          case "story":
            return { ...prev, stories: prev.stories.filter((story) => story.id !== id) };
          default:
            return prev;
        }
      });
      setTasks((prev) =>
        prev.map((task) => {
          if (task.id !== currentTaskId) return task;
          const attachments: NonNullable<CreativeTaskSummary["attachments"]> = {
            historyDocs: task.attachments?.historyDocs ?? 0,
            stories: task.attachments?.stories ?? 0,
            styles: task.attachments?.styles ?? 0,
          };
          const key = attachmentCountKey(type);
          attachments[key] = Math.max(0, attachments[key] - 1);
          return {
            ...task,
            attachments,
            updatedAt: new Date().toISOString(),
          };
        })
      );
      toast.success(copy.assets.detached);
      void fetchTaskDetail(currentTaskId, { silent: true });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : copy.errors.assetFailed);
    }
  };

  const renderStageOutput = (stage: CreativeStageKey, meta?: StageMetaEntry) => {
    if (!meta?.aiOutput) {
      if (stageGenerating[stage]) {
        const diagnosingLabel =
          stage === "diagnosis"
            ? copy.stagePanel.diagnosing ?? copy.stagePanel.generating
            : copy.stagePanel.generating;
        return (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            {diagnosingLabel}
          </div>
        );
      }
      return <p className="text-sm text-gray-400">{copy.stagePanel.noOutput}</p>;
    }
    if (typeof meta.aiOutput === "string") {
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
          {meta.aiOutput}
        </div>
      );
    }

    switch (stage) {
      case "diagnosis":
        return (
          <DiagnosisOutputView
            data={meta.aiOutput}
            labels={copy.stageOutput?.diagnosis}
          />
        );
      case "mining":
        return (
          <MiningOutputView
            data={meta.aiOutput}
            labels={copy.stageOutput?.mining}
          />
        );
      case "topic": {
        const currentSelections =
          resolvedViewStageKey === "topic"
            ? topicSelectionsDraft
            : ((meta.userSelections ?? null) as TopicUserSelections | null);
        return (
          <TopicOutputView
            data={meta.aiOutput}
            labels={copy.stageOutput?.topic}
            selections={currentSelections}
            editable={resolvedViewStageKey === "topic"}
            onSelectionsChange={handleTopicSelectionsChange}
            selectionState={resolvedViewStageKey === "topic" ? topicSelectionSyncState : "idle"}
            selectionStateLabels={{
              idle: copy.stagePanel.topicSelectionIdle ?? "",
              saving: copy.stagePanel.topicSelectionSaving ?? copy.stagePanel.saving ?? "",
              saved: copy.stagePanel.topicSelectionSaved ?? copy.stagePanel.saved ?? "",
              error:
                copy.stagePanel.topicSelectionError ??
                copy.errors.saveFailed ??
                copy.stagePanel.copyFailed ??
                "保存失败",
            }}
          />
        );
      }
      case "framework":
        return (
          <FrameworkOutputView
            data={meta.aiOutput}
            labels={copy.stageOutput?.framework}
          />
        );
      default:
        return <JsonPreview value={meta.aiOutput} />;
    }
  };

  const attachedHistoryIds = useMemo(
    () => new Set((activeTask?.historyDocs ?? []).map((doc) => doc.id)),
    [activeTask?.historyDocs]
  );
  const attachedStoryIds = useMemo(
    () => new Set((activeTask?.stories ?? []).map((story) => story.id)),
    [activeTask?.stories]
  );
  const availableHistory = useMemo(
    () => assetPool.history.filter((doc) => !attachedHistoryIds.has(doc.id)),
    [assetPool.history, attachedHistoryIds]
  );
  const availableStories = useMemo(
    () => assetPool.stories.filter((story) => !attachedStoryIds.has(story.id)),
    [assetPool.stories, attachedStoryIds]
  );
  const hasAvailableAssets = availableHistory.length > 0 || availableStories.length > 0;
  const directStyleOptions = assetPool.styles;
  const displayedDirectStyles = showAllStyles ? directStyleOptions : directStyleOptions.slice(0, 6);
  const selectedDirectStyle = useMemo(
    () => directStyleOptions.find((style) => style.id === directForm.styleId) ?? null,
    [directForm.styleId, directStyleOptions]
  );
  const selectedDigitalCharacter = useMemo(
    () =>
      digitalCharacters.find((character) => character.id === digitalForm.selectedCharacterId) ??
      null,
    [digitalCharacters, digitalForm.selectedCharacterId]
  );
  const usingDefaultVoice = useMemo(() => {
    if (digitalForm.mode !== "VOICE_CLONE") return false;
    if (!selectedDigitalCharacter?.voiceId) return false;
    return (
      !digitalForm.audioName &&
      !!digitalForm.audioUrl &&
      digitalForm.audioUrl === selectedDigitalCharacter.voiceId
    );
  }, [digitalForm.audioName, digitalForm.audioUrl, digitalForm.mode, selectedDigitalCharacter]);
  const showAudioUpload = digitalForm.mode === "LIP_SYNC" || !usingDefaultVoice;
  const digitalModeOptions: Array<{
    key: DigitalHumanMode;
    label: string;
    description?: string;
  }> = [
    {
      key: "VOICE_CLONE",
      label:
        copy.newTask.digitalHuman?.modes?.voice?.label ??
        t.storyboard.voiceClone ??
        "Voice clone",
      description:
        copy.newTask.digitalHuman?.modes?.voice?.description ??
        t.storyboard.voiceCloneDesc,
    },
    {
      key: "LIP_SYNC",
      label:
        copy.newTask.digitalHuman?.modes?.lip?.label ??
        t.storyboard.lipSync ??
        "Lip sync",
      description:
        copy.newTask.digitalHuman?.modes?.lip?.description ??
        t.storyboard.lipSyncDesc,
    },
  ];
  const needsDigitalScript = digitalForm.mode === "VOICE_CLONE";
  const digitalScriptReady = !needsDigitalScript || digitalForm.script.trim().length > 0;
  const digitalAudioReady =
    digitalForm.mode === "VOICE_CLONE"
      ? Boolean(digitalForm.audioUrl || selectedDigitalCharacter?.voiceId)
      : Boolean(digitalForm.audioUrl);
  const canSubmitDigital =
    Boolean(selectedDigitalCharacter) &&
    digitalScriptReady &&
    digitalAudioReady &&
    !digitalAudioUploading;
  const audioInputDomId = `digital-audio-${audioUploadInputId}`;
  const modeIconMap: Record<"smart" | "direct" | "digitalHuman", JSX.Element> = {
    smart: <Lightbulb className="w-4 h-4" />,
    direct: <Zap className="w-4 h-4" />,
    digitalHuman: <Clapperboard className="w-4 h-4" />,
  };
  const createModeOptions = ["smart", "direct", "digitalHuman"] as const;
  const taskCards = useMemo(
    () =>
      [...tasks]
        .map((task) => ({
          id: task.id,
          sortKey: new Date(task.updatedAt).getTime(),
          task,
        }))
        .sort((a, b) => b.sortKey - a.sortKey),
    [tasks]
  );
  const hasTaskCards = taskCards.length > 0;
  const actionStatusCopy = copy.taskList.actionStatus ?? {};
  const posterStatusLabels = actionStatusCopy.poster ?? {};
  const digitalStatusLabels = actionStatusCopy.digitalHuman ?? {};
  const actionStatusTones: Record<"pending" | "ready" | "error", string> = {
    pending: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-100",
    ready: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-100",
    error: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-100",
  };
  const getPosterStatusMeta = useCallback(
    (status: PosterJob["status"]) => {
      if (status === "ready") {
        return {
          label: copy.newTask.direct?.readyStatus ?? "已完成",
          tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-100",
        };
      }
      if (status === "error") {
        return {
          label: copy.newTask.direct?.errorStatus ?? "生成失败",
          tone: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-100",
        };
      }
      return {
        label: copy.newTask.direct?.pendingStatus ?? "生成中",
        tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-100",
      };
    },
    [
      copy.newTask.direct?.errorStatus,
      copy.newTask.direct?.pendingStatus,
      copy.newTask.direct?.readyStatus,
    ]
  );

  const pageTitle = t.sidebar?.contentCreation ?? "内容创作";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 font-sans">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white">{pageTitle}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-2xl">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <AddButton
            label={copy.newTask.title}
            onClick={() => {
              setCreateMode("smart");
              setIsCreateModalOpen(true);
              setDirectSourceTaskId(null);
              resetDigitalForm();
            }}
          />
          <button
            onClick={() => authToken && refreshAll(authToken)}
            disabled={!authToken || tasksLoading}
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
          >
            {tasksLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            {copy.common.refresh}
          </button>
        </div>
      </div>

      {requiresAuth ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
          {copy.common.authRequired}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-4">
            {tasksLoading && (
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {copy.common.loading}
              </div>
            )}
            {!hasTaskCards ? (
              <EmptyState
                icon={<Clapperboard className="h-6 w-6" />}
                title={copy.taskList.empty}
                description={copy.subtitle}
                action={{
                  label: copy.newTask.title,
                  onClick: () => {
                    setCreateMode("smart");
                    setIsCreateModalOpen(true);
                  },
                }}
                fullHeight
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {taskCards.map((card) => {
                    const { task } = card;
                    const stageConfig = creativeStages[task.stage];
                    const isDeletingTask = deletingTaskId === task.id;
                    const relativeUpdate = formatDistanceToNow(new Date(task.updatedAt), {
                      addSuffix: true,
                      locale: relativeTimeLocale,
                    });
                    const posterAction = getTaskActionStatus(task.metadata, "poster");
                    const digitalAction = getTaskActionStatus(task.metadata, "digitalHuman");
                    const actionIndicators = [
                      posterAction?.status
                        ? {
                            key: "poster",
                            status: posterAction.status,
                            label:
                              posterStatusLabels[posterAction.status] ??
                              (posterAction.status === "ready"
                                ? copy.newTask.direct?.readyStatus ?? "已完成"
                                : posterAction.status === "pending"
                                  ? copy.newTask.direct?.pendingStatus ?? "生成中"
                                  : copy.newTask.direct?.errorStatus ?? "生成失败"),
                            Icon: Image,
                          }
                        : null,
                      digitalAction?.status
                        ? {
                            key: "digitalHuman",
                            status: digitalAction.status,
                            label:
                              digitalStatusLabels[digitalAction.status] ??
                              (digitalAction.status === "ready"
                                ? copy.taskList.actionStatus?.digitalHuman?.ready ?? "数字人已生成"
                                : digitalAction.status === "pending"
                                  ? copy.taskList.actionStatus?.digitalHuman?.pending ?? "数字人生成中"
                                  : copy.taskList.actionStatus?.digitalHuman?.error ?? "数字人生成失败"),
                            Icon: Clapperboard,
                          }
                        : null,
                    ].filter(Boolean) as Array<{
                      key: string;
                      status: "pending" | "ready" | "error";
                      label: string;
                      Icon: typeof Image;
                    }>;
                    return (
                      <div key={card.id} className="relative group">
                        <button
                          type="button"
                          onClick={() => openTaskModal(task.id)}
                          className="relative w-full text-left rounded-2xl border border-gray-100 dark:border-gray-800 px-5 py-4 bg-white dark:bg-gray-900 transition-all duration-200 shadow-sm hover:-translate-y-1 hover:shadow-xl hover:border-black/80 hover:bg-gray-50 dark:hover:border-white/80 dark:hover:bg-gray-800/80"
                        >
                          <div className="absolute top-4 right-4 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>{relativeUpdate}</span>
                            <span
                              role="button"
                              tabIndex={isDeletingTask ? -1 : 0}
                              aria-label={copy.taskList.deleteAction ?? "Delete task"}
                              aria-disabled={isDeletingTask}
                              title={copy.taskList.deleteAction ?? "Delete task"}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (isDeletingTask) return;
                                setTaskIdPendingDelete(task.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                event.stopPropagation();
                                if (isDeletingTask) return;
                                setTaskIdPendingDelete(task.id);
                              }}
                              className={cn(
                                "inline-flex items-center justify-center p-1 text-gray-400 dark:text-gray-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400",
                                isDeletingTask
                                  ? "cursor-wait text-rose-400"
                                  : "cursor-pointer hover:text-rose-500 dark:hover:text-rose-300"
                              )}
                            >
                              {isDeletingTask ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </span>
                          </div>
                          <p className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-2 pr-16">
                            {task.title || task.ideaText || copy.taskList.untitled}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                            {copy.stagePanel.stageLabel}: {stageConfig.title}
                          </p>
                          {task.metadata?.route && (
                            <span className="mt-3 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
                              <Sparkles className="w-3 h-3" />
                              {task.metadata.route === "clear"
                                ? copy.taskList.route.clear
                                : copy.taskList.route.fuzzy}
                            </span>
                          )}
                          <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span>{copy.assets.history} {task.attachments?.historyDocs ?? 0}</span>
                            <span>{copy.assets.stories} {task.attachments?.stories ?? 0}</span>
                          </div>
                          {actionIndicators.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {actionIndicators.map(({ key, status, label, Icon }) => (
                                <span
                                  key={key}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                                    actionStatusTones[status]
                                  )}
                                >
                                  <Icon className="w-3.5 h-3.5" />
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      </div>
                    );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        isOpen={isCreateModalOpen}
        onClose={closeCreateModal}
        title={copy.newTask.modalTitle ?? copy.newTask.title}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-6 text-sm text-gray-600 dark:text-gray-300">
          <p>{copy.newTask.modalIntro ?? copy.subtitle}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {createModeOptions.map((mode) => {
              const modeCopy = copy.newTask.modes?.[mode];
              const isActive = createMode === mode;
              return (
                <motion.button
                  key={mode}
                  type="button"
                  onClick={() => setCreateMode(mode)}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition focus:outline-none",
                    isActive
                      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500"
                  )}
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ scale: isActive ? 1 : 1.02 }}
                  layout
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm",
                        isActive
                          ? "border-white/50 bg-white/20 text-white dark:border-black/20 dark:bg-black/5 dark:text-black"
                          : "border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400"
                      )}
                    >
                      {modeIconMap[mode]}
                    </span>
                    <p className="text-base font-semibold">
                      {modeCopy?.label ?? (mode === "smart" ? copy.newTask.title : copy.newTask.direct?.title)}
                    </p>
                  </div>
                  {modeCopy?.description && (
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        isActive ? "text-white/90 dark:text-black/70" : "text-gray-500 dark:text-gray-400"
                      )}
                    >
                      {modeCopy.description}
                    </p>
                  )}
                </motion.button>
              );
            })}
          </div>
          <AnimatePresence mode="wait">
            {createMode === "smart" && (
              <motion.form
                key="smart-form"
                onSubmit={handleCreateTask}
                className="space-y-4"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {copy.newTask.ideaLabel}
                </label>
                <textarea
                  placeholder={copy.newTask.ideaPlaceholder}
                  className={`${inputClass} min-h-[140px] mt-2`}
                  value={formState.ideaText}
                  onChange={(e) => setFormState((prev) => ({ ...prev, ideaText: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {copy.newTask.channelLabel}
                </label>
                <ChannelSelect
                  placeholder={copy.newTask.channelPlaceholder}
                  options={channelOptions}
                  value={formState.channel}
                  onChange={(value) => setFormState((prev) => ({ ...prev, channel: value }))}
                  disabled={channelOptions.length === 0}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {copy.newTask.wordCountLabel}
                  </label>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    placeholder={copy.newTask.targetPlaceholder}
                    className={`${inputClass} mt-2`}
                    value={formState.targetOutput}
                    onChange={(e) => handleWordCountChange(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {copy.newTask.creativeTypeLabel}
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.keys(copy.newTask.types).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFormState((prev) => ({ ...prev, creativeType: type }))}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-semibold border transition",
                          formState.creativeType === type
                            ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                            : "border-gray-200 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500"
                        )}
                      >
                        {copy.newTask.types[type as keyof typeof copy.newTask.types]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button
                type="submit"
                disabled={creatingTask}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold text-white bg-black hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100 disabled:opacity-60"
              >
                {creatingTask ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {copy.newTask.creating}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    {copy.newTask.submit}
                  </>
                )}
              </button>
              </motion.form>
            )}
            {createMode === "direct" && (
              <motion.form
                key="direct-form"
                onSubmit={handleDirectGenerate}
                className="space-y-4"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {copy.newTask.ideaLabel}
                </label>
                <textarea
                  placeholder={copy.newTask.ideaPlaceholder}
                  className={`${inputClass} min-h-[140px] mt-2`}
                  value={directForm.ideaText}
                  onChange={(e) => setDirectForm((prev) => ({ ...prev, ideaText: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                  {copy.newTask.direct?.styleLabel}
                  {assetLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                </label>
                {directStyleOptions.length === 0 && !assetLoading ? (
                  <p className="text-xs text-gray-500 mt-2">{copy.newTask.direct?.styleEmpty}</p>
                ) : (
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {displayedDirectStyles.map((style) => {
                      const isSelected = directForm.styleId === style.id;
                      const displayName = getLocalizedStyleName(style, language);
                      return (
                        <button
                          type="button"
                          key={style.id}
                          onClick={() => {
                            setDirectForm((prev) => ({ ...prev, styleId: style.id }));
                            if (typeof window !== "undefined") {
                              localStorage.setItem(DIRECT_STYLE_PREF_KEY, style.id);
                            }
                          }}
                          className={cn(
                            "rounded-2xl border px-3 py-3 text-left transition flex gap-3 items-center",
                            isSelected
                              ? "border-black shadow-lg dark:border-white"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500"
                          )}
                        >
                          {style.previewUrl ? (
                            <img
                              src={style.previewUrl}
                              alt={displayName || style.name}
                              className="h-12 w-12 rounded-xl object-cover"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-semibold text-gray-500 dark:text-gray-400">
                              {(displayName || style.name || "").slice(0, 2)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {displayName || style.name}
                            </p>
                            {style.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {style.description}
                              </p>
                            )}
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
                {directStyleOptions.length > 6 && (
                  <button
                    type="button"
                    onClick={() => setShowAllStyles((prev) => !prev)}
                    className="mt-3 w-full rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500"
                  >
                    {showAllStyles
                      ? copy.newTask.direct?.collapseStyles ?? "收起风格"
                      : copy.newTask.direct?.expandStyles ?? "展开全部风格"}
                  </button>
                )}
              </div>
              {selectedDirectStyle && (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                  {copy.newTask.direct?.selectedLabel ?? "已选择风格"}：
                  {getLocalizedStyleName(selectedDirectStyle, language) || selectedDirectStyle.name}
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                  {copy.newTask.direct?.posterCountLabel ?? "海报张数"}
                </label>
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <input
                    type="number"
                    min={POSTER_COUNT_MIN}
                    max={POSTER_COUNT_MAX}
                    step={1}
                    className={`${inputClass}`}
                    value={directForm.posterCount}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      setDirectForm((prev) => ({ ...prev, posterCount: clampPosterCount(parsed) }));
                    }}
                  />
                  <div className="flex gap-2">
                    {[1, 3, 4, 6].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          setDirectForm((prev) => ({ ...prev, posterCount: clampPosterCount(option) }))
                        }
                        className={cn(
                          "px-3 py-2 text-xs font-semibold rounded-full border transition",
                          directForm.posterCount === option
                            ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                            : "border-gray-200 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500"
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {copy.newTask.direct?.posterCountDescription ??
                    `默认 ${DEFAULT_POSTER_COUNT} 张，最多 ${POSTER_COUNT_MAX} 张，将文案均匀拆分到每张海报。`}
                </p>
              </div>
              <div className="sticky bottom-0 left-0 right-0 pt-4 pb-1 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-900 dark:via-gray-900/95 flex justify-center">
                <button
                  type="submit"
                  disabled={
                    directGenerating ||
                    !directForm.ideaText.trim() ||
                    !directForm.styleId ||
                    directStyleOptions.length === 0
                  }
                  className="min-w-[220px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold text-white bg-black hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100 disabled:opacity-60 shadow-lg"
                >
                  {directGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {copy.newTask.direct?.generating ?? copy.stagePanel.generating}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {copy.newTask.direct?.submit ?? copy.stagePanel.generate}
                    </>
                  )}
                </button>
              </div>
              </motion.form>
            )}
            {createMode === "digitalHuman" && (
              <motion.form
                key="digital-form"
                onSubmit={handleDigitalHumanSubmit}
                className="space-y-4"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
                      {copy.newTask.digitalHuman?.characterLabel ?? t.storyboard.digitalHuman}
                      {digitalCharactersLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCharacterModalOpen(true)}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-900 text-gray-900 px-3 py-1.5 text-xs font-semibold dark:border-gray-100 dark:text-gray-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {copy.newTask.digitalHuman?.characterCreate ?? t.characters.newCharacter}
                      </button>
                    </div>
                  </div>
                  {digitalCharacters.length === 0 && !digitalCharactersLoading ? (
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                      {copy.newTask.digitalHuman?.characterEmpty ?? t.characters.noCharacters}
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {digitalCharacters.map((character) => {
                        const isSelected = digitalForm.selectedCharacterId === character.id;
                        return (
                          <button
                            type="button"
                            key={character.id}
                            onClick={() => handleDigitalCharacterSelect(character.id)}
                            className={cn(
                              "rounded-2xl border px-3 py-3 text-left transition flex gap-3 items-center",
                              isSelected
                                ? "border-black shadow-lg dark:border-white"
                                : "border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500"
                            )}
                          >
                            {character.avatar ? (
                              <img
                                src={character.avatar}
                                alt={character.name}
                                className="h-12 w-12 rounded-2xl object-cover"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-semibold text-gray-500 dark:text-gray-300">
                                {character.name.slice(0, 2)}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {character.name}
                              </p>
                              {digitalForm.mode === "VOICE_CLONE" && !character.voiceId && (
                                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                  {copy.newTask.digitalHuman?.characterMissingVoice}
                                </p>
                              )}
                            </div>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {copy.newTask.digitalHuman?.modeLabel ?? t.storyboard.voiceClone}
                  </label>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {digitalModeOptions.map((option) => {
                      const active = digitalForm.mode === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => handleDigitalModeChange(option.key)}
                          className={cn(
                            "rounded-2xl border px-4 py-3 text-left transition",
                            active
                              ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 text-gray-700 dark:text-gray-200"
                          )}
                        >
                          <p className="text-sm font-semibold">{option.label}</p>
                          {option.description && (
                            <p
                              className={cn(
                                "mt-1 text-xs",
                                active ? "text-white/80 dark:text-black/70" : "text-gray-500 dark:text-gray-400"
                              )}
                            >
                              {option.description}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {needsDigitalScript && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {copy.newTask.digitalHuman?.scriptLabel ?? t.storyboard.voiceoverScript}
                    </label>
                    <textarea
                      value={digitalForm.script}
                      onChange={(event) =>
                        setDigitalForm((prev) => ({ ...prev, script: event.target.value }))
                      }
                      placeholder={
                        copy.newTask.digitalHuman?.scriptPlaceholder ?? copy.newTask.ideaPlaceholder
                      }
                      className={`${inputClass} min-h-[160px] mt-2`}
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-2">
                    {copy.newTask.digitalHuman?.audioLabel}
                    {digitalAudioUploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  </label>
                  {!showAudioUpload && selectedDigitalCharacter?.voiceId ? (
                    <div className="mt-2 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 bg-white dark:bg-gray-900/40 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {selectedDigitalCharacter.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {copy.newTask.digitalHuman?.defaultVoiceLabel ?? "使用角色默认音色"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDigitalAudioRemove}
                        className="text-xs font-semibold text-gray-600 dark:text-gray-200 underline"
                      >
                        {copy.newTask.digitalHuman?.customAudioCta ?? "改用自定义音频"}
                      </button>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "mt-2 rounded-2xl border border-dashed px-4 py-4",
                        digitalForm.audioUrl
                          ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40"
                          : "border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-900/30"
                      )}
                    >
                      {digitalForm.audioUrl ? (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/10 text-black dark:text-white">
                              <FileAudio className="w-5 h-5" />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                {digitalForm.audioName ||
                                  copy.newTask.digitalHuman?.audioPlaceholder}
                              </p>
                              {digitalForm.audioDuration > 0 && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {copy.newTask.digitalHuman?.audioDurationLabel}:{" "}
                                  {Math.round(digitalForm.audioDuration)}s
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => audioUploadInputRef.current?.click()}
                              disabled={digitalAudioUploading}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200",
                                digitalAudioUploading && "opacity-60 cursor-not-allowed"
                              )}
                            >
                              <Mic className="w-3.5 h-3.5" />
                              {copy.newTask.digitalHuman?.replaceAudio ?? copy.common.refresh}
                            </button>
                            <button
                              type="button"
                              onClick={handleDigitalAudioRemove}
                              disabled={digitalAudioUploading}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200",
                                digitalAudioUploading && "opacity-60 cursor-not-allowed"
                              )}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {copy.newTask.digitalHuman?.removeAudio ?? copy.common.delete}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label
                          htmlFor={audioInputDomId}
                          className="flex flex-col items-center justify-center gap-2 text-center cursor-pointer text-gray-600 dark:text-gray-300"
                        >
                          {digitalAudioUploading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                          ) : (
                            <Mic className="w-6 h-6" />
                          )}
                          <span className="text-sm font-semibold">
                            {copy.newTask.digitalHuman?.uploadHint}
                          </span>
                          <span className="text-xs">
                            {copy.newTask.digitalHuman?.audioPlaceholder}
                          </span>
                        </label>
                      )}
                      <input
                        id={audioInputDomId}
                        ref={audioUploadInputRef}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={handleDigitalAudioInputChange}
                        disabled={digitalAudioUploading}
                      />
                    </div>
                  )}
                  {digitalForm.mode === "VOICE_CLONE" &&
                    selectedDigitalCharacter?.voiceId &&
                    showAudioUpload &&
                    !usingDefaultVoice && (
                      <button
                        type="button"
                        onClick={handleUseDefaultVoice}
                        className="mt-2 text-xs font-semibold text-gray-600 dark:text-gray-200 underline"
                      >
                        {copy.newTask.digitalHuman?.useDefaultAudio ?? "使用角色默认音色"}
                      </button>
                    )}
                  {digitalForm.mode === "VOICE_CLONE" && !selectedDigitalCharacter?.voiceId && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                      {copy.newTask.digitalHuman?.characterMissingVoice}
                    </p>
                  )}
                </div>

                {copy.newTask.digitalHuman?.stickyNote && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {copy.newTask.digitalHuman.stickyNote}
                  </p>
                )}

                <div className="sticky bottom-0 left-0 right-0 pt-4 pb-1 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-900 dark:via-gray-900/95 flex justify-center">
                  <button
                    type="submit"
                    disabled={!canSubmitDigital || digitalGenerating}
                    className="min-w-[220px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold text-white bg-black hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100 disabled:opacity-60 shadow-lg"
                  >
                    {digitalGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {copy.newTask.digitalHuman?.generating ?? copy.stagePanel.generating}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        {copy.newTask.digitalHuman?.submit ??
                          copy.stagePanel.actionDigitalHuman}
                      </>
                    )}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </Modal>

      <Modal
        isOpen={isPosterModalOpen}
        onClose={closePosterModal}
        title={
          posterPreviewJob ? (
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-2">
                {posterPreviewJob.title || copy.newTask.direct?.untitledPoster || "图文任务"}
              </p>
              <p className="text-sm text-gray-400">
                {formatDistanceToNow(new Date(posterPreviewJob.createdAt), {
                  addSuffix: true,
                  locale: relativeTimeLocale,
                })}
              </p>
            </div>
          ) : (
            <span className="text-sm text-gray-500">{copy.stagePanel.loading}</span>
          )
        }
        maxWidth="max-w-4xl"
      >
        {!posterPreviewJob ? (
          <div className="py-12 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            {copy.stagePanel.loading}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "text-xs font-semibold px-3 py-1 rounded-full",
                  getPosterStatusMeta(posterPreviewJob.status).tone
                )}
              >
                {getPosterStatusMeta(posterPreviewJob.status).label}
              </span>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {(posterPreviewJob.style?.name ?? copy.newTask.direct?.styleLabel) || ""}
              </p>
            </div>
            {posterPreviewJob.status === "pending" && (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                {copy.newTask.direct?.etaHint ?? "预计 30 秒内完成，请稍候..."}
              </div>
            )}
            {posterPreviewJob.status === "error" && (
              <p className="text-sm text-rose-500">
                {posterPreviewJob.error ?? copy.errors.directFailed ?? "生成失败"}
              </p>
            )}
            {posterPreviewJob.images.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2">
                {posterPreviewJob.images.map((result, index) => {
                  const imageUrl =
                    typeof result.imageUrl === "string" && result.imageUrl.trim().length > 0
                      ? result.imageUrl
                      : null;
                  if (!imageUrl) {
                    return null;
                  }
                  const downloadName = `${posterPreviewJob.title || "poster"}-${index + 1}.png`;
                  const promptText =
                    typeof result.prompt === "string" && result.prompt.trim().length > 0
                      ? result.prompt
                      : null;
                  return (
                    <div
                      key={result.id ?? `${downloadName}-${index}`}
                      className="space-y-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3"
                    >
                      <div className="relative w-full overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
                        <img
                          src={imageUrl}
                          alt={`poster-${index + 1}`}
                          className="w-full object-cover"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <button
                          type="button"
                          onClick={() => handleDirectResultDownload(imageUrl, downloadName)}
                          className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 font-semibold text-gray-700 hover:border-gray-400 dark:text-gray-200"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {copy.newTask.direct?.download ?? "下载"}
                        </button>
                        {promptText && (
                          <button
                            type="button"
                            onClick={() => handleResultPromptCopy(promptText)}
                            className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 font-semibold text-gray-700 hover:border-gray-400 dark:text-gray-200"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            {copy.newTask.direct?.copyPrompt ?? "复制提示词"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              posterPreviewJob.status === "ready" && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {copy.newTask.direct?.emptyResults ?? "暂无图片，请稍后重试。"}
                </p>
              )
            )}
            {posterPreviewJob.status === "ready" && (
              <div className="space-y-3">
                <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                  {posterPreviewJob.copyText}
                </p>
                <button
                  type="button"
                  onClick={() => handleResultPromptCopy(posterPreviewJob.copyText)}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200"
                >
                  <Copy className="w-4 h-4" />
                  {copy.stagePanel.copyDraft}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isDigitalHumanModalOpen}
        onClose={closeDigitalHumanModal}
        title={
          <span className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <User className="w-5 h-5" />
            {t.storyboard.digitalHuman}
          </span>
        }
        maxWidth="max-w-6xl"
      >
        <DigitalHumanModal
          onClose={closeDigitalHumanModal}
          defaultScript={digitalHumanScript}
          sourceTaskId={digitalHumanSourceTaskId ?? undefined}
          disableAutoRedirect
          hideInternalTitle
          onSuccess={async () => {
            await fetchTasks();
            closeDigitalHumanModal();
          }}
        />
      </Modal>
      <Modal
        isOpen={isCharacterModalOpen}
        onClose={() => setIsCharacterModalOpen(false)}
        title={t.characters.formTitle}
        maxWidth="max-w-xl"
      >
        <CharacterForm onSuccess={handleCharacterModalSuccess} />
      </Modal>

      <Modal
        isOpen={isTaskModalOpen}
        onClose={closeTaskModal}
        title={
          activeTask ? (
            <div className="w-full flex flex-col gap-1">
              {isTitleEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={handleTitleInputKeyDown}
                    onBlur={handleTitleBlur}
                    placeholder={copy.taskList.untitled}
                    disabled={titleSaving}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-1.5 text-base font-semibold text-gray-900 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60 dark:focus-visible:ring-white/60 disabled:opacity-70"
                  />
                  {titleSaving && (
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400 dark:text-gray-500" />
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={beginTitleEditing}
                  disabled={!activeTaskId || titleSaving}
                  className="group flex items-center gap-2 text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60 dark:focus-visible:ring-white/60 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-1 group-hover:text-gray-900/80 dark:group-hover:text-white/80">
                    {displayTaskTitle}
                  </span>
                  <Pencil className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                </button>
              )}
            </div>
          ) : (
            <span className="text-sm text-gray-500">{copy.stagePanel.loading}</span>
          )
        }
        maxWidth="max-w-5xl"
      >
        {!activeTask || detailLoading ? (
          <div className="py-12 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            {copy.stagePanel.loading}
          </div>
        ) : !currentStageKey ? (
          <div className="py-8 text-sm text-gray-500 dark:text-gray-400 text-center">
            {copy.stagePanel.selectTask}
          </div>
        ) : (
          <div className="relative">
            {isDraftWriting && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/90 dark:bg-gray-900/80 backdrop-blur">
                <Loader2 className="w-6 h-6 animate-spin text-gray-700 dark:text-gray-200" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {copy.stagePanel.writing}
                </p>
              </div>
            )}
            <div
              className={cn(
                "flex flex-col gap-6 min-h-full pb-32",
                isDraftWriting && "opacity-40 pointer-events-none select-none"
              )}
            >
      <LayoutGroup id="creative-stage-flow">
        <motion.div
          layout
          className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"
          transition={{ layout: stageFlowLayoutTransition }}
        >
          <motion.div
            layout
            className="-mx-2 flex items-stretch gap-4 overflow-x-auto pb-2 px-2"
            transition={{ layout: stageFlowLayoutTransition }}
          >
                {creativeStageOrder.map((stageKey, index) => {
                  const stageMeta = getStageMeta(activeTask?.metadata, stageKey);
                  const isCompleted = stageMeta?.status === "completed";
                  const isActive = stageKey === currentStageKey;
                  const isViewing = resolvedViewStageKey === stageKey;
                  const isAccessible = isCompleted || isActive;
                  const circleClass = cn(
                    "w-8 h-8 rounded-full border flex items-center justify-center text-sm font-semibold transition-colors",
                    isCompleted
                      ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
                      : isActive
                      ? "border-black text-black dark:border-white dark:text-white"
                      : "border-gray-300 text-gray-400 dark:border-gray-700 dark:text-gray-500"
                  );
                  return (
                    <motion.div
                      key={stageKey}
                      layout
                      className="flex items-center gap-4"
                      ref={(el) => {
                        stageRefs.current[stageKey] = el;
                      }}
                      transition={{ layout: stageFlowLayoutTransition }}
                    >
                      <motion.button
                        type="button"
                        layout
                        onClick={() => isAccessible && setViewStageKey(stageKey)}
                        disabled={!isAccessible}
                        className={cn(
                          "relative flex items-center gap-3 rounded-2xl px-3 py-2 border transition-colors text-left overflow-hidden min-w-[200px]",
                          isViewing
                            ? "border-black dark:border-white"
                            : "border-transparent hover:border-gray-200 dark:hover:border-gray-700",
                          !isAccessible && "cursor-default opacity-60"
                        )}
                        transition={{ layout: stageFlowLayoutTransition }}
                      >
                        {isViewing && (
                          <motion.span
                            layoutId="stage-pill-highlight"
                            transition={stageHighlightTransition}
                            className="absolute inset-0 rounded-2xl bg-black/5 dark:bg-white/10"
                            aria-hidden="true"
                          />
                        )}
                        <div className="relative z-10 flex items-center gap-3">
                          <div className={circleClass}>
                            {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : index + 1}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              {creativeStages[stageKey].title}
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                              {creativeStages[stageKey].subtitle}
                            </p>
                          </div>
                        </div>
                      </motion.button>
                      {index < creativeStageOrder.length - 1 && (
                        <motion.span
                          layout
                          className={cn(
                            "h-[2px] w-10 sm:w-14 rounded-full",
                            isCompleted ? "bg-black dark:bg-white" : "bg-gray-200 dark:bg-gray-700"
                          )}
                          transition={{ layout: stageFlowLayoutTransition }}
                        />
                      )}
                    </motion.div>
                  );
                })}
          </motion.div>
        </motion.div>

        <AnimatePresence mode="wait" initial={false}>
              {resolvedViewStageKey &&
                (resolvedViewStageKey === "draft" ? (
                  <motion.div
                    key="stage-panel-draft"
                    layout
                    initial={stagePanelMotion.initial}
                    animate={stagePanelMotion.animate}
                    exit={stagePanelMotion.exit}
                    className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-4"
                    transition={{ layout: stagePanelLayoutTransition }}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-gray-900 dark:text-white">
                          {viewStageConfig?.title ?? copy.stagePanel.stageLabel}
                        </p>
                        {viewStageConfig?.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {viewStageConfig.description}
                          </p>
                        )}
                      </div>
                      {viewStageMeta?.updatedAt && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {copy.stagePanel.updatedAt}: {new Date(viewStageMeta.updatedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    {stageGuidanceBlock}
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30 p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                {copy.stagePanel.draftPreviewTitle}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {copy.stagePanel.draftPreviewSubtitle}
                              </p>
                            </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleCopyDraft}
                              className="inline-flex items-center gap-1 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-white"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              {copy.stagePanel.copyDraft}
                            </button>
                            <button
                              type="button"
                              onClick={handleDraftEditToggle}
                              disabled={!canEditDraft || draftSaving}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold",
                                canEditDraft && !draftSaving
                                  ? "border-gray-200 text-gray-700 hover:bg-white dark:border-gray-700 dark:text-gray-200"
                                  : "border-gray-200 text-gray-400 cursor-not-allowed dark:border-gray-700 dark:text-gray-600"
                              )}
                            >
                              {isDraftEditing && draftSaving ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  {copy.stagePanel.saving ?? copy.common.loading ?? "保存中..."}
                                </>
                              ) : (
                                <>
                                  <Pencil className="w-3.5 h-3.5" />
                                  {isDraftEditing ? copy.stagePanel.doneEditing : copy.stagePanel.editDraft}
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                        {draftTitles.length > 0 && (
                          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/80 p-3">
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                              {copy.stagePanel.draftTitlesLabel}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {draftTitles.map((title, index) => (
                                <TitleChip
                                  key={`${title}-${index}`}
                                  label={title}
                                  tooltip={copy.stagePanel.copyTitleTooltip}
                                  onCopy={() => handleCopyTitle(title)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/80 p-4 min-h-[240px]">
                          {isDraftEditing ? (
                            <textarea
                              value={draftEditorValue}
                              onChange={(e) => setDraftEditorValue(e.target.value)}
                              className="w-full h-60 min-h-[200px] bg-transparent text-sm text-gray-800 dark:text-gray-50 focus:outline-none resize-none"
                            />
                          ) : (
                            <DraftPreview
                              blocks={draftBodyBlocks}
                              placeholder={copy.stagePanel.draftEmpty}
                            />
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {copy.stagePanel.draftActionsTitle}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {copy.stagePanel.draftActionsDescription}
                          </p>
                        </div>
                        {showDraftRegenerate && (
                          <button
                            type="button"
                            onClick={() => currentStageKey && handleGenerate(currentStageKey)}
                            disabled={
                              !currentStageKey ||
                              !isViewingCurrentStage ||
                              stageGenerating[currentStageKey]
                            }
                            className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-black text-white dark:bg-white dark:text-black disabled:opacity-60"
                          >
                            {currentStageKey && stageGenerating[currentStageKey] ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {copy.stagePanel.generating}
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                {advanceButtonLabel}
                              </>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDraftAction("xhs")}
                          className="group relative w-full overflow-hidden rounded-2xl border border-transparent bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-5 py-4 text-left text-white shadow-[0_12px_30px_rgba(15,23,42,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_35px_rgba(15,23,42,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:from-white dark:via-slate-100 dark:to-white dark:text-gray-900 dark:shadow-[0_10px_30px_rgba(15,23,42,0.15)] dark:hover:shadow-[0_14px_30px_rgba(15,23,42,0.18)] dark:focus-visible:ring-white dark:focus-visible:ring-offset-gray-900"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <p className="text-base font-semibold">{copy.stagePanel.actionXhs}</p>
                            </div>
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white transition-colors group-hover:bg-white/25 dark:bg-gray-900/10 dark:text-gray-900 dark:group-hover:bg-gray-900/20">
                              <Image className="w-5 h-5" />
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDraftAction("digitalHuman")}
                          className="group relative w-full overflow-hidden rounded-2xl border border-transparent bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 px-5 py-4 text-left text-white shadow-[0_12px_30px_rgba(15,23,42,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_35px_rgba(15,23,42,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:from-white dark:via-slate-100 dark:to-white dark:text-gray-900 dark:shadow-[0_10px_30px_rgba(15,23,42,0.15)] dark:hover:shadow-[0_14px_30px_rgba(15,23,42,0.18)] dark:focus-visible:ring-white dark:focus-visible:ring-offset-gray-900"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <p className="text-base font-semibold">
                                {copy.stagePanel.actionDigitalHuman}
                              </p>
                            </div>
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white transition-colors group-hover:bg-white/25 dark:bg-gray-900/10 dark:text-gray-900 dark:group-hover:bg-gray-900/20">
                              <Clapperboard className="w-5 h-5" />
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDraftAction("storyboard")}
                          className="group relative w-full overflow-hidden rounded-2xl border border-transparent bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 px-5 py-4 text-left text-white shadow-[0_12px_30px_rgba(15,23,42,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_35px_rgba(15,23,42,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:from-white dark:via-slate-100 dark:to-white dark:text-gray-900 dark:shadow-[0_10px_30px_rgba(15,23,42,0.15)] dark:hover:shadow-[0_14px_30px_rgba(15,23,42,0.18)] dark:focus-visible:ring-white dark:focus-visible:ring-offset-gray-900"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <p className="text-base font-semibold">
                                {copy.stagePanel.actionStoryboard}
                              </p>
                            </div>
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white transition-colors group-hover:bg-white/25 dark:bg-gray-900/10 dark:text-gray-900 dark:group-hover:bg-gray-900/20">
                              <Film className="w-5 h-5" />
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`stage-panel-${resolvedViewStageKey}`}
                    layout
                    initial={stagePanelMotion.initial}
                    animate={stagePanelMotion.animate}
                    exit={stagePanelMotion.exit}
                    className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-4"
                    transition={{ layout: stagePanelLayoutTransition }}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-gray-900 dark:text-white">
                          {viewStageConfig?.title ?? copy.stagePanel.stageLabel}
                        </p>
                        {viewStageConfig?.description && (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {viewStageConfig.description}
                          </p>
                        )}
                      </div>
                      {viewStageMeta?.updatedAt && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {copy.stagePanel.updatedAt}: {new Date(viewStageMeta.updatedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    {stageGuidanceBlock}
                    <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-4">
                      {resolvedViewStageKey ? (
                        renderStageOutput(resolvedViewStageKey, viewStageMeta)
                      ) : (
                        <p className="text-sm text-gray-400">{copy.stagePanel.noOutput}</p>
                      )}
                    </div>
                    {resolvedViewStageKey === "diagnosis" && activeTaskId && (
                      <DiagnosisSupplementPanel
                        clarity={
                          typeof viewStageMeta?.aiOutput?.clarity === "string"
                            ? viewStageMeta.aiOutput.clarity.toLowerCase()
                            : ""
                        }
                        draft={supplementDraft}
                        onChange={handleSupplementChange}
                        onSubmit={handleSupplementSubmit}
                        saving={supplementSaving}
                        isGenerating={stageGenerating.diagnosis}
                        dirty={supplementDirty}
                        copy={copy}
                      />
                    )}
                  </motion.div>
                ))}
        </AnimatePresence>
      </LayoutGroup>

            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-4">
              <button
                type="button"
                onClick={() => setShowAssetsPanel((prev) => !prev)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {copy.assets.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {copy.assets.autoHint}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {assetLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-gray-500 transition-transform",
                      showAssetsPanel ? "rotate-180" : "rotate-0"
                    )}
                  />
                </div>
              </button>
              {showAssetsPanel && (
                <div className="mt-4 space-y-4 text-sm text-gray-600 dark:text-gray-300">
                  <AttachmentList
                    title={copy.assets.history}
                    items={activeTask.historyDocs}
                    renderItem={(doc) => doc.title}
                    emptyText={copy.assets.emptyHistory}
                    onDetach={(id) => handleDetachAsset("history", id)}
                    removeLabel={copy.assets.detach}
                  />
                  <AttachmentList
                    title={copy.assets.stories}
                    items={activeTask.stories}
                    renderItem={(story) => story.title}
                    emptyText={copy.assets.emptyStories}
                    onDetach={(id) => handleDetachAsset("story", id)}
                    removeLabel={copy.assets.detach}
                  />
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      {copy.assets.availableTitle}
                    </p>
                    <div className="grid gap-2">
                      {availableHistory.slice(0, 3).map((doc) => (
                        <AttachButton
                          key={doc.id}
                          label={`H · ${doc.title}`}
                          onClick={() => handleAttachAsset("history", doc.id)}
                        />
                      ))}
                      {availableStories.slice(0, 3).map((story) => (
                        <AttachButton
                          key={story.id}
                          label={`S · ${story.title}`}
                          onClick={() => handleAttachAsset("story", story.id)}
                        />
                      ))}
                      {!hasAvailableAssets && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {copy.assets.emptyPool}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {resolvedViewStageKey && !isDraftStage && (
              <div className="sticky bottom-4 z-30 pointer-events-none">
                <div
                  className={cn(
                    "mx-auto w-full max-w-3xl rounded-2xl border border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 px-4 py-3 shadow-lg pointer-events-auto transition",
                    notesExpanded ? "ring-1 ring-black/10 dark:ring-white/20" : ""
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      onFocus={handleNotesFocus}
                      onBlur={handleNotesBlur}
                      rows={notesExpanded ? 5 : 1}
                      placeholder={copy.stagePanel.notesPlaceholder}
                      className={cn(
                        "flex-1 resize-none rounded-2xl border border-gray-200 dark:border-gray-700 bg-transparent px-4 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-[min-height] duration-200",
                        notesExpanded ? "min-h-[120px]" : "min-h-[42px]"
                      )}
                    />
                    <button
                      onClick={() => currentStageKey && handleGenerate(currentStageKey)}
                      disabled={
                        !currentStageKey || !showAdvanceControls || isAdvancingStage
                      }
                      className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-5 py-3 rounded-2xl bg-black text-white dark:bg-white dark:text-black disabled:opacity-60 shadow w-full sm:w-auto"
                    >
                      {isAdvancingStage ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {copy.stagePanel.generating}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          {advanceButtonLabel}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={Boolean(taskIdPendingDelete)}
        onClose={() => setTaskIdPendingDelete(null)}
      onConfirm={async () => {
        if (taskIdPendingDelete) {
          await handleDeleteTask(taskIdPendingDelete);
        }
      }}
      title={copy.taskList.deleteAction ?? copy.common.delete}
      message={copy.taskList.deleteConfirm ?? copy.common.confirmDelete}
    />
    </div>
  );
}

type ChannelOption = { value: string; label: string };

function extractGuidanceItems(stage: CreativeStageKey | null, data: any) {
  if (!stage || !data) return [];
  const items: string[] = [];
  const pushStrings = (payload?: unknown[]) => {
    if (!Array.isArray(payload)) return;
    for (const entry of payload) {
      if (typeof entry === "string" && entry.trim()) {
        items.push(entry.trim());
      }
    }
  };

  switch (stage) {
    case "diagnosis": {
      pushStrings(data.keyQuestions);
      pushStrings(data.nextActions);
      break;
    }
    case "mining": {
      pushStrings(data.gaps);
      if (Array.isArray(data.insights)) {
        data.insights.forEach((insight: any) => {
          const label =
            (typeof insight?.label === "string" && insight.label.trim()) ||
            (typeof insight?.detail === "string" && insight.detail.trim());
          if (label) {
            items.push(label);
          }
        });
      }
      break;
    }
    case "topic": {
      pushStrings(data.outlineBullets);
      if (Array.isArray(data.angles)) {
        data.angles.forEach((angle: any) => {
          const labelParts = [
            typeof angle?.name === "string" ? angle.name : "",
            typeof angle?.hook === "string" ? angle.hook : "",
          ]
            .map((part) => part.trim())
            .filter(Boolean);
          if (labelParts.length > 0) {
            items.push(labelParts.join(" · "));
          }
        });
      }
      break;
    }
    case "framework": {
      if (Array.isArray(data.sections)) {
        data.sections.forEach((section: any, index: number) => {
          const heading =
            (typeof section?.heading === "string" && section.heading.trim()) ||
            `${copySectionOrder(index + 1)}`;
          const detail =
            (typeof section?.goal === "string" && section.goal.trim()) ||
            (Array.isArray(section?.keyPoints) && section.keyPoints[0]);
          if (heading && detail) {
            items.push(`${heading}: ${detail}`);
          }
        });
      }
      pushStrings(data.transitions);
      break;
    }
    default:
      break;
  }

  return Array.from(new Set(items.filter(Boolean))).slice(0, 6);
}

function copySectionOrder(order: number) {
  return `Section ${order}`;
}

function ChannelSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ChannelOption[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
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

  const renderOptions = useMemo(
    () => [{ value: "", label: placeholder }, ...options],
    [options, placeholder]
  );

  const handleSelect = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="relative mt-2" ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          inputClass,
          "flex items-center justify-between gap-2 cursor-pointer",
          open && "ring-2 ring-black/20 dark:ring-white/40",
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
                    ? "text-white bg-black dark:bg-white dark:text-black"
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

function AttachmentList<T extends { id: string }>({
  title,
  items,
  renderItem,
  emptyText,
  onDetach,
  removeLabel,
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => string;
  emptyText: string;
  onDetach: (id: string) => void;
  removeLabel: string;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between text-sm px-3 py-2 rounded-xl border border-gray-100 dark:border-gray-800"
            >
              <span className="text-gray-700 dark:text-gray-200 line-clamp-1">
                {renderItem(item)}
              </span>
              <button
                className="text-xs text-red-500 hover:text-red-600 inline-flex items-center gap-1"
                onClick={() => onDetach(item.id)}
              >
                <Unlink className="w-3 h-3" />
                {removeLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AttachButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-gray-500"
    >
      <Link2 className="w-3 h-3" />
      {label}
    </button>
  );
}

function JsonPreview({ value }: { value: any }) {
  const serialized = JSON.stringify(value ?? null, null, 2);
  return (
    <pre className="text-xs bg-gray-900/5 dark:bg-gray-100/5 rounded-xl p-3 overflow-auto">
      {serialized}
    </pre>
  );
}

type DiagnosisSupplementPanelProps = {
  clarity: string;
  draft: DiagnosisSupplementDraft;
  onChange: (field: keyof DiagnosisSupplementDraft, value: string) => void;
  onSubmit: () => void;
  saving: boolean;
  isGenerating: boolean;
  dirty: boolean;
  copy: Record<string, any>;
};

function DiagnosisSupplementPanel({
  clarity,
  draft,
  onChange,
  onSubmit,
  saving,
  isGenerating,
  dirty,
  copy,
}: DiagnosisSupplementPanelProps) {
  const disabled = saving || isGenerating || !dirty;
  const buttonLabel =
    copy.stagePanel?.supplementSubmit ?? "保存并重新诊断 Stage 00";
  const title = copy.stagePanel?.supplementTitle ?? "补充关键信息";
  const description =
    clarity === "fuzzy"
      ? copy.stagePanel?.supplementDescription ??
        "诊断结果提示仍有信息缺口，补齐后将自动重新运行 Stage 00。"
      : copy.stagePanel?.supplementDescriptionFallback ??
        "可随时更新关键信息以优化后续阶段。";

  const fields: Array<{
    key: keyof DiagnosisSupplementDraft;
    label: string;
    placeholder: string;
    minHeight: string;
  }> = [
    {
      key: "audience",
      label: copy.stagePanel?.supplementAudienceLabel ?? "目标受众",
      placeholder:
        copy.stagePanel?.supplementAudiencePlaceholder ?? "示例：关注家庭教育的 30-40 岁妈妈",
      minHeight: "min-h-[72px]",
    },
    {
      key: "coreIdea",
      label: copy.stagePanel?.supplementCoreIdeaLabel ?? "核心观点",
      placeholder:
        copy.stagePanel?.supplementCoreIdeaPlaceholder ?? "示例：孩子的自律由父母的情绪稳定奠定",
      minHeight: "min-h-[72px]",
    },
    {
      key: "example",
      label: copy.stagePanel?.supplementExampleLabel ?? "故事 / 案例",
      placeholder:
        copy.stagePanel?.supplementExamplePlaceholder ?? "示例：真实客户故事、数据或个人经历",
      minHeight: "min-h-[96px]",
    },
  ];

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 dark:border-amber-400/30 dark:bg-amber-500/10 p-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{title}</p>
          <p className="text-xs text-amber-900/80 dark:text-amber-100/80">{description}</p>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition",
            disabled
              ? "bg-amber-200/60 text-amber-700/60 dark:bg-amber-400/10 dark:text-amber-200/50 cursor-not-allowed"
              : "bg-black text-white hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100 shadow",
          )}
        >
          {saving || isGenerating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {saving
                ? copy.stagePanel?.supplementSaving ?? "正在保存…"
                : copy.stagePanel?.supplementRechecking ?? "重新诊断中…"}
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              {buttonLabel}
            </>
          )}
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((field, index) => (
          <div
            key={field.key}
            className={cn(
              "md:col-span-1 space-y-2",
              index === fields.length - 1 && "md:col-span-2",
            )}
          >
            <label className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
              {field.label}
            </label>
            <textarea
              className={cn(
                inputClass,
                "bg-white/80 dark:bg-gray-900/60 focus-visible:ring-amber-400 dark:focus-visible:ring-amber-300",
                field.minHeight,
              )}
              value={draft[field.key]}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder}
            />
          </div>
        ))}
      </div>
      {!dirty && (
        <p className="text-[11px] text-amber-900/70 dark:text-amber-100/80">
          {copy.stagePanel?.supplementHint ??
            "填写后点击“保存并重新诊断 Stage 00”，缺口补齐后会解锁下一阶段。"}
        </p>
      )}
    </div>
  );
}

type DraftBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

type HeadingDraftBlock = Extract<DraftBlock, { type: "heading" }>;

const isHeadingBlock = (block: DraftBlock): block is HeadingDraftBlock => block.type === "heading";
const isLevelOneHeadingBlock = (block: DraftBlock): block is HeadingDraftBlock =>
  block.type === "heading" && block.level === 1;

type DraftStructure = {
  titles: string[];
  blocks: DraftBlock[];
  bodyText: string;
};

function cleanDraftOutput(value: unknown): string {
  let result = "";
  if (!value) return result;
  if (typeof value === "string") {
    result = value;
  } else if (typeof value === "object") {
    const candidateKeys = ["markdown", "content", "text", "body"];
    for (const key of candidateKeys) {
      const maybe = (value as Record<string, unknown>)[key];
      if (typeof maybe === "string") {
        result = maybe;
        break;
      }
    }
  }
  let trimmed = result.trim();
  if (trimmed.startsWith("```")) {
    const firstLineEnd = trimmed.indexOf("\n");
    const closingIndex = trimmed.lastIndexOf("```");
    if (firstLineEnd !== -1 && closingIndex > firstLineEnd) {
      trimmed = trimmed.slice(firstLineEnd + 1, closingIndex).trim();
    }
  }
  trimmed = trimmed.replace(/```/g, "").replace(/^markdown\s*/i, "").trim();
  const filtered = trimmed
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = line.trim();
      if (!normalized) return true;
      if (/^(?:AI|系统|提示|Output|Result)(?:提示|输出)?[:：]/i.test(normalized)) {
        return false;
      }
      if (/^#{1,3}\s*(?:AI|系统|注意)/i.test(normalized)) {
        return false;
      }
      return true;
    })
    .join("\n");
  return filtered.replace(/\n{3,}/g, "\n\n").trim();
}

function parseDraftBlocks(input: string): DraftBlock[] {
  if (!input) return [];
  const lines = input.split(/\r?\n/);
  const blocks: DraftBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ type: "list", items: [...list] });
      list = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const headingMatch = line.match(/^#{1,3}\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: headingMatch[0].split(" ")[0].length,
        text: headingMatch[1].trim(),
      });
      continue;
    }
    const listMatch = line.match(/^[-*+]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      list.push(listMatch[1].trim());
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}

function buildDraftStructure(content: string): DraftStructure {
  const text = content.trim();
  if (!text) {
    return { titles: [], blocks: [], bodyText: "" };
  }
  const blocks = parseDraftBlocks(text);
  const titles = Array.from(
    new Set(
      blocks
        .filter((block): block is HeadingDraftBlock => {
          if (!isLevelOneHeadingBlock(block)) return false;
          return block.text.trim().length > 0;
        })
        .flatMap((block) => {
          const trimmed = block.text.trim();
          if (!trimmed) return [];
          return splitTitleVariants(trimmed);
        })
        .filter(Boolean)
    )
  );
  const bodyBlocks = blocks
    .filter((block) => !(block.type === "heading" && block.level === 1))
    .map((block) => {
      if (isHeadingBlock(block)) {
        return { type: "paragraph", text: block.text } as DraftBlock;
      }
      return block;
    });
  const bodyText = bodyBlocks
    .map((block) => {
      if (block.type === "paragraph") return block.text;
      if (block.type === "list") return block.items.map((item) => `- ${item}`).join("\n");
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
  return { titles, blocks: bodyBlocks, bodyText };
}

function splitTitleVariants(input: string): string[] {
  const cleaned = input.trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/[|｜／\/、;；]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [cleaned];
}

function DraftPreview({ blocks, placeholder }: { blocks: DraftBlock[]; placeholder: string }) {
  if (blocks.length === 0) {
    return <p className="text-sm text-gray-400">{placeholder}</p>;
  }
  return (
    <div className="space-y-4 text-sm leading-relaxed text-gray-900 dark:text-gray-50">
      {blocks.map((block, index) => {
        if (block.type === "list") {
          return (
            <ul key={`list-${index}`} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`list-${index}-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`paragraph-${index}`} className="text-gray-900 dark:text-gray-100">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

function TitleChip({
  label,
  tooltip,
  onCopy,
}: {
  label: string;
  tooltip: string;
  onCopy: () => void;
}) {
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold bg-black/5 text-gray-900 dark:bg-white/10 dark:text-gray-50 hover:bg-black/10 dark:hover:bg-white/20"
      >
        <Copy className="w-3.5 h-3.5" />
        {label}
      </button>
      <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 text-white text-[10px] px-2 py-0.5 opacity-0 transition group-hover:opacity-100 dark:bg-white dark:text-gray-900">
        {tooltip}
      </span>
    </div>
  );
}

function StageSubsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const toNonEmptyStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isNonEmptyString);
};

function DiagnosisOutputView({
  data,
  labels,
}: {
  data: any;
  labels?: Record<string, any>;
}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return <JsonPreview value={data} />;
  }

  const clarityRaw = typeof data.clarity === "string" ? data.clarity : "";
  const clarityKey = clarityRaw.toLowerCase();
  const clarityText =
    (labels?.clarity?.[clarityKey] as string | undefined) || clarityRaw;
  const routeKey =
    typeof data.recommendedRoute === "string" ? data.recommendedRoute : "";
  const routeText =
    (labels?.route?.[routeKey] as string | undefined) ||
    (typeof data.recommendedRoute === "string" ? data.recommendedRoute : "");
  const summary = typeof data.summary === "string" ? data.summary : "";
  const notes = typeof data.notes === "string" ? data.notes : "";
  const nextActions = toNonEmptyStringList(data.nextActions);
  const keyQuestions = toNonEmptyStringList(data.keyQuestions);

  return (
    <div className="space-y-4 text-sm text-gray-700 dark:text-gray-200">
      {(clarityText || routeText) && (
        <div className="flex flex-wrap gap-2">
          {clarityText && (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold",
                clarityKey === "clear"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100"
                  : clarityKey === "fuzzy"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100"
                  : "bg-gray-200 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200"
              )}
            >
              {(labels?.clarityLabel ?? "Clarity") + " · " + clarityText}
            </span>
          )}
          {routeText && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-primary-soft text-primary dark:bg-primary/15 dark:text-primary-foreground">
              {(labels?.routeLabel ?? "Route") + " · " + routeText}
            </span>
          )}
        </div>
      )}
      {summary && (
        <StageSubsection title={labels?.summaryLabel ?? "Summary"}>
          <p>{summary}</p>
        </StageSubsection>
      )}
      {nextActions.length > 0 && (
        <StageSubsection title={labels?.nextActionsLabel ?? "Next steps"}>
          <ol className="list-decimal list-inside space-y-1">
            {nextActions.map((action, index) => (
              <li key={`${action}-${index}`}>{action}</li>
            ))}
          </ol>
        </StageSubsection>
      )}
      {keyQuestions.length > 0 && (
        <StageSubsection title={labels?.keyQuestionsLabel ?? "Key questions"}>
          <ul className="list-disc list-inside space-y-1">
            {keyQuestions.map((question, index) => (
              <li key={`${question}-${index}`}>{question}</li>
            ))}
          </ul>
        </StageSubsection>
      )}
      {notes && (
        <StageSubsection title={labels?.notesLabel ?? "Notes"}>
          <p>{notes}</p>
        </StageSubsection>
      )}
    </div>
  );
}

function MiningOutputView({
  data,
  labels,
}: {
  data: any;
  labels?: Record<string, any>;
}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return <JsonPreview value={data} />;
  }

  const insights = Array.isArray(data.insights)
    ? data.insights.filter(Boolean)
    : [];
  const stories = Array.isArray(data.stories)
    ? data.stories.filter(Boolean)
    : [];
  const dataPoints = Array.isArray(data.dataPoints)
    ? data.dataPoints.filter(Boolean)
    : [];
  const gaps = Array.isArray(data.gaps)
    ? data.gaps.filter(
        (item: unknown) => typeof item === "string" && item.trim().length > 0
      )
    : [];

  return (
    <div className="space-y-5 text-sm text-gray-700 dark:text-gray-200">
      {insights.length > 0 && (
        <StageSubsection title={labels?.insightsLabel ?? "Insights"}>
          <div className="grid gap-3 md:grid-cols-2">
            {insights.map((insight: Record<string, any>, idx: number) => (
              <div
                key={`insight-${idx}`}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-3 space-y-2"
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {insight?.label ||
                    `${labels?.insightFallback ?? "Insight"} ${idx + 1}`}
                </p>
                {insight?.detail && (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {insight.detail}
                  </p>
                )}
                {Array.isArray(insight?.potentialAngles) &&
                  insight.potentialAngles.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {labels?.anglesLabel ?? "Angles"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {insight.potentialAngles.map(
                          (angle: string, index: number) => (
                            <span
                              key={`${angle}-${index}`}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-200"
                            >
                              {angle}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  )}
                {Array.isArray(insight?.evidence) &&
                  insight.evidence.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {labels?.evidenceLabel ?? "Evidence"}
                      </p>
                      <ul className="list-disc list-outside pl-4 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
                        {insight.evidence.map(
                          (item: string, index: number) => (
                            <li key={`${item}-${index}`}>{item}</li>
                          )
                        )}
                      </ul>
                    </div>
                  )}
              </div>
            ))}
          </div>
        </StageSubsection>
      )}

      {stories.length > 0 && (
        <StageSubsection title={labels?.storiesLabel ?? "Stories"}>
          <div className="space-y-2">
            {stories.map((story: Record<string, any>, idx: number) => (
              <div
                key={`story-${idx}`}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-3 space-y-1.5"
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {story?.title ||
                    `${labels?.storiesLabel ?? "Story"} ${idx + 1}`}
                </p>
                {story?.summary && (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {story.summary}
                  </p>
                )}
                {story?.usage && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {(labels?.usageLabel ?? "Placement") + ": " + story.usage}
                  </p>
                )}
              </div>
            ))}
          </div>
        </StageSubsection>
      )}

      {dataPoints.length > 0 && (
        <StageSubsection title={labels?.dataPointsLabel ?? "Data"}>
          <div className="space-y-2">
            {dataPoints.map((point: Record<string, any>, idx: number) => (
              <div
                key={`data-${idx}`}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-3 space-y-1"
              >
                {point?.fact && (
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {point.fact}
                  </p>
                )}
                {point?.implication && (
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    {(labels?.implicationLabel ?? "Implication") +
                      ": " +
                      point.implication}
                  </p>
                )}
                {point?.source && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {(labels?.sourceLabel ?? "Source") + ": " + point.source}
                  </p>
                )}
              </div>
            ))}
          </div>
        </StageSubsection>
      )}

      {gaps.length > 0 && (
        <StageSubsection title={labels?.gapsLabel ?? "Gaps"}>
          <ul className="list-disc list-inside space-y-1">
            {gaps.map((gap: string, idx: number) => (
              <li key={`${gap}-${idx}`}>{gap}</li>
            ))}
          </ul>
        </StageSubsection>
      )}
    </div>
  );
}

function TopicOutputView({
  data,
  labels,
  selections,
  onSelectionsChange,
  editable,
  selectionState = "idle",
  selectionStateLabels,
}: {
  data: any;
  labels?: Record<string, any>;
  selections?: TopicUserSelections | null;
  onSelectionsChange?: (next: TopicUserSelections | null) => void;
  editable?: boolean;
  selectionState?: "idle" | "saving" | "saved" | "error";
  selectionStateLabels?: Partial<Record<"idle" | "saving" | "saved" | "error", string>>;
}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return <JsonPreview value={data} />;
  }

  const normalizedAngles: (TopicSelectionAngle & { key: string })[] = Array.isArray(data.angles)
    ? data.angles.filter(Boolean).map((angle: TopicSelectionAngle, idx: number) => ({
        ...angle,
        key: angle?.key ?? buildTopicItemKey("angle", idx, angle?.name || angle?.hook || ""),
      }))
    : [];
  const normalizedTitles: TopicSelectionItem[] = Array.isArray(data.titles)
    ? data.titles
        .filter((item: unknown) => typeof item === "string" && item.trim().length > 0)
        .map((title: string, idx: number) => ({
          key: buildTopicItemKey("title", idx, title),
          value: title,
        }))
    : [];
  const normalizedOutline: TopicSelectionItem[] = Array.isArray(data.outlineBullets)
    ? data.outlineBullets
        .filter((item: unknown) => typeof item === "string" && item.trim().length > 0)
        .map((item: string, idx: number) => ({
          key: buildTopicItemKey("outline", idx, item),
          value: item,
        }))
    : [];

  const currentSelections = selections ?? null;
  const selectedAngles = currentSelections?.angles ?? [];
  const selectedTitles = currentSelections?.titles ?? [];
  const selectedOutline = currentSelections?.outline ?? [];
  const isEditable = Boolean(editable && onSelectionsChange);

  const updateSelections = (updater: (prev: TopicUserSelections | null) => TopicUserSelections | null) => {
    if (!isEditable || !onSelectionsChange) return;
    const next = cleanTopicSelections(updater(currentSelections ?? null));
    onSelectionsChange(next);
  };

  const toggleSingleField = (field: "coreTopic" | "promise" | "heroSentence", value: string) => {
    updateSelections((prev) => {
      if (!value) return prev;
      if (prev?.[field] && prev[field] === value) {
        const next = { ...(prev ?? {}) };
        delete next[field];
        return next;
      }
      return { ...(prev ?? {}), [field]: value };
    });
  };

  const toggleAngle = (angle: TopicSelectionAngle & { key: string }) => {
    updateSelections((prev) => {
      const list = prev?.angles ?? [];
      const exists = list.some(
        (item) => normalizeTopicSelectionKey(item) === normalizeTopicSelectionKey(angle)
      );
      const baseAngle: TopicSelectionAngle = {
        key: angle.key,
        name: angle.name ?? undefined,
        hook: angle.hook ?? undefined,
        audience: angle.audience ?? undefined,
        proofPoint: angle.proofPoint ?? undefined,
      };
      const nextAngles = exists
        ? list.filter(
            (item) => normalizeTopicSelectionKey(item) !== normalizeTopicSelectionKey(angle)
          )
        : [...list, baseAngle];
      return { ...(prev ?? {}), angles: nextAngles };
    });
  };

  const toggleListItem = (
    field: "titles" | "outline",
    entry: TopicSelectionItem
  ) => {
    updateSelections((prev) => {
      const list = (prev?.[field] as TopicSelectionItem[] | undefined) ?? [];
      const exists = list.some(
        (item) => normalizeTopicSelectionKey(item) === normalizeTopicSelectionKey(entry)
      );
      const nextList = exists
        ? list.filter(
            (item) => normalizeTopicSelectionKey(item) !== normalizeTopicSelectionKey(entry)
          )
        : [...list, entry];
      return { ...(prev ?? {}), [field]: nextList };
    });
  };

  const summaryParts: string[] = [];
  if (currentSelections?.coreTopic) {
    summaryParts.push(
      `${labels?.coreTopicLabel ?? "Core topic"} · ${currentSelections.coreTopic}`
    );
  }
  if (currentSelections?.promise) {
    summaryParts.push(
      `${labels?.promiseLabel ?? "Promise"} · ${currentSelections.promise}`
    );
  }
  if (currentSelections?.heroSentence) {
    summaryParts.push(
      `${labels?.heroSentenceLabel ?? "Hero sentence"} · ${currentSelections.heroSentence}`
    );
  }
  if (selectedAngles.length > 0) {
    summaryParts.push(
      `${selectedAngles.length} ${(labels?.anglesLabel ?? "Angles")}`
    );
  }
  if (selectedTitles.length > 0) {
    summaryParts.push(
      `${selectedTitles.length} ${(labels?.titlesLabel ?? "Titles")}`
    );
  }
  if (selectedOutline.length > 0) {
    summaryParts.push(
      `${selectedOutline.length} ${(labels?.outlineLabel ?? "Outline")}`
    );
  }
  const selectionSummaryText =
    summaryParts.length > 0
      ? summaryParts.join(" / ")
      : labels?.selectionEmptyLabel ?? "还没有锁定任何命题";
  const selectionStatusText = selectionStateLabels?.[selectionState]?.trim();

  return (
    <div className="space-y-6 text-sm text-gray-700 dark:text-gray-200">
      {selectionStatusText && (
        <div className="text-[11px] text-gray-500 dark:text-gray-400">
          {selectionStatusText}
        </div>
      )}
      {data.coreTopic && (
        <StageSubsection title={labels?.coreTopicLabel ?? "Core topic"}>
          <SelectionCard
            value={data.coreTopic}
            helper={labels?.coreTopicHelper}
            selected={currentSelections?.coreTopic === data.coreTopic}
            onToggle={
              isEditable ? () => toggleSingleField("coreTopic", data.coreTopic) : undefined
            }
            labels={labels}
          />
        </StageSubsection>
      )}

      {data.promise && (
        <StageSubsection title={labels?.promiseLabel ?? "Promise"}>
          <SelectionCard
            value={data.promise}
            helper={labels?.promiseHelper}
            selected={currentSelections?.promise === data.promise}
            onToggle={
              isEditable ? () => toggleSingleField("promise", data.promise) : undefined
            }
            labels={labels}
          />
        </StageSubsection>
      )}

      {data.heroSentence && (
        <StageSubsection title={labels?.heroSentenceLabel ?? "Hero sentence"}>
          <SelectionCard
            value={data.heroSentence}
            helper={labels?.heroSentenceHelper}
            selected={currentSelections?.heroSentence === data.heroSentence}
            onToggle={
              isEditable ? () => toggleSingleField("heroSentence", data.heroSentence) : undefined
            }
            labels={labels}
          />
        </StageSubsection>
      )}

      {normalizedAngles.length > 0 && (
        <StageSubsection title={labels?.anglesLabel ?? "Angles"}>
          {labels?.anglesHelper && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{labels.anglesHelper}</p>
          )}
          <div className="space-y-3">
            {normalizedAngles.map((angle, idx) => {
              const isSelected = selectedAngles.some(
                (item) => normalizeTopicSelectionKey(item) === normalizeTopicSelectionKey(angle)
              );
              return (
                <button
                  key={angle.key ?? `angle-${idx}`}
                  type="button"
                  onClick={isEditable ? () => toggleAngle(angle) : undefined}
                  disabled={!isEditable}
                  className={cn(
                    "w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-4 text-left transition",
                    isSelected
                      ? "border-emerald-400 bg-emerald-50/70 dark:border-emerald-400/40 dark:bg-emerald-400/10"
                      : "hover:border-emerald-300/60 dark:hover:border-emerald-400/30",
                    !isEditable &&
                      "cursor-default opacity-95 hover:border-gray-200 dark:hover:border-gray-800"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {angle?.name ||
                          `${labels?.angleFallback ?? "Angle"} ${idx + 1}`}
                      </p>
                      {angle?.hook && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                          {(labels?.hookLabel ?? "Hook") + ": " + angle.hook}
                        </p>
                      )}
                    </div>
                    <SelectionIndicator
                      selected={isSelected}
                      labels={labels}
                      interactive={isEditable}
                    />
                  </div>
                  {angle?.audience && (
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {(labels?.audienceLabel ?? "Audience") + ": " + angle.audience}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </StageSubsection>
      )}

      {normalizedTitles.length > 0 && (
        <StageSubsection title={labels?.titlesLabel ?? "Titles"}>
          {labels?.titlesHelper && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{labels.titlesHelper}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {normalizedTitles.map((title, idx) => {
              const isSelected = selectedTitles.some(
                (item) => normalizeTopicSelectionKey(item) === normalizeTopicSelectionKey(title)
              );
              return (
                <SelectionChip
                  key={title.key ?? `title-${idx}`}
                  label={title.value}
                  selected={isSelected}
                  onToggle={isEditable ? () => toggleListItem("titles", title) : undefined}
                />
              );
            })}
          </div>
        </StageSubsection>
      )}

      {normalizedOutline.length > 0 && (
        <StageSubsection title={labels?.outlineLabel ?? "Outline"}>
          {labels?.outlineHelper && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{labels.outlineHelper}</p>
          )}
          <div className="space-y-2">
            {normalizedOutline.map((item, idx) => {
              const isSelected = selectedOutline.some(
                (entry) => normalizeTopicSelectionKey(entry) === normalizeTopicSelectionKey(item)
              );
              return (
                <button
                  key={item.key ?? `outline-${idx}`}
                  type="button"
                  onClick={isEditable ? () => toggleListItem("outline", item) : undefined}
                  disabled={!isEditable}
                  className={cn(
                    "w-full flex items-start gap-2 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 px-3 py-2 text-left transition",
                    isSelected
                      ? "border-emerald-400 bg-emerald-50/70 dark:border-emerald-400/40 dark:bg-emerald-400/10"
                      : "hover:border-emerald-300/60 dark:hover:border-emerald-400/30",
                    !isEditable &&
                      "cursor-default opacity-95 hover:border-gray-200 dark:hover:border-gray-800"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs",
                      isSelected
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200"
                        : "border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500"
                    )}
                  >
                    {isSelected ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-3 h-3" />}
                  </span>
                  <span className="flex-1 text-sm text-gray-800 dark:text-gray-100">{item.value}</span>
                </button>
              );
            })}
          </div>
        </StageSubsection>
      )}
    </div>
  );
}

function SelectionCard({
  value,
  helper,
  selected,
  onToggle,
  labels,
}: {
  value: string;
  helper?: string;
  selected: boolean;
  onToggle?: () => void;
  labels?: Record<string, any>;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!onToggle}
      className={cn(
        "w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-4 text-left transition",
        selected
          ? "border-emerald-400 bg-emerald-50/70 dark:border-emerald-400/40 dark:bg-emerald-400/10"
          : "hover:border-emerald-300/60 dark:hover:border-emerald-400/30",
        !onToggle && "cursor-default opacity-95 hover:border-gray-200 dark:hover:border-gray-800"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-gray-900 dark:text-white">{value}</p>
        <SelectionIndicator selected={selected} labels={labels} interactive={Boolean(onToggle)} />
      </div>
      {helper && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{helper}</p>
      )}
    </button>
  );
}

function SelectionChip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!onToggle}
      className={cn(
        "px-3 py-1.5 rounded-full border text-xs font-semibold transition",
        selected
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-gray-300 text-gray-700 hover:border-emerald-400 hover:text-emerald-600",
        !onToggle && "cursor-default opacity-90 hover:border-gray-300 hover:text-gray-700"
      )}
    >
      {label}
    </button>
  );
}

function SelectionIndicator({
  selected,
  labels,
  interactive = true,
}: {
  selected: boolean;
  labels?: Record<string, any>;
  interactive?: boolean;
}) {
  const activeLabel = labels?.selectedAction ?? "已锁定";
  const inactiveLabel = labels?.selectAction ?? "锁定";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold",
        selected ? "text-emerald-600 dark:text-emerald-200" : "text-gray-500 dark:text-gray-400",
        !interactive && "opacity-75"
      )}
    >
      {selected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
      {selected ? activeLabel : inactiveLabel}
    </span>
  );
}

function FrameworkOutputView({
  data,
  labels,
}: {
  data: any;
  labels?: Record<string, any>;
}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return <JsonPreview value={data} />;
  }

  const sections = Array.isArray(data.sections)
    ? data.sections.filter(Boolean)
    : [];
  const transitions = Array.isArray(data.transitions)
    ? data.transitions.filter(
        (item: unknown) => typeof item === "string" && item.trim().length > 0
      )
    : [];

  return (
    <div className="space-y-5 text-sm text-gray-700 dark:text-gray-200">
      {data.headline && (
        <StageSubsection title={labels?.headlineLabel ?? "Headline"}>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {data.headline}
          </p>
        </StageSubsection>
      )}

      {sections.length > 0 && (
        <StageSubsection title={labels?.sectionsLabel ?? "Sections"}>
          <div className="space-y-3">
            {sections.map((section: Record<string, any>, idx: number) => (
              <div
                key={`section-${section?.order ?? idx}`}
                className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {(labels?.sectionOrderLabel ?? "Section") +
                      " " +
                      (section?.order ?? idx + 1)}
                  </span>
                  {section?.heading && (
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {section.heading}
                    </p>
                  )}
                </div>
                {section?.goal && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {(labels?.goalLabel ?? "Goal") + ": " + section.goal}
                  </p>
                )}
                {Array.isArray(section?.keyPoints) &&
                  section.keyPoints.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {labels?.keyPointsLabel ?? "Key points"}
                      </p>
                      <ul className="list-disc list-outside pl-5 space-y-0.5">
                        {section.keyPoints.map(
                          (point: string, index: number) => (
                            <li key={`${point}-${index}`}>{point}</li>
                          )
                        )}
                      </ul>
                    </div>
                  )}
                {Array.isArray(section?.evidence) &&
                  section.evidence.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {labels?.evidenceLabel ?? "Evidence"}
                      </p>
                      <ul className="list-disc list-outside pl-5 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
                        {section.evidence.map(
                          (item: string, index: number) => (
                            <li key={`${item}-${index}`}>{item}</li>
                          )
                        )}
                      </ul>
                    </div>
                  )}
                {(section?.tone || section?.cta) && (
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-300">
                    {section?.tone && (
                      <span>
                        {(labels?.toneLabel ?? "Tone") + ": " + section.tone}
                      </span>
                    )}
                    {section?.cta && (
                      <span>
                        {(labels?.ctaLabel ?? "CTA") + ": " + section.cta}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </StageSubsection>
      )}

      {transitions.length > 0 && (
        <StageSubsection title={labels?.transitionsLabel ?? "Transitions"}>
          <ol className="list-decimal list-inside space-y-1">
            {transitions.map((transition: string, idx: number) => (
              <li key={`${transition}-${idx}`}>{transition}</li>
            ))}
          </ol>
        </StageSubsection>
      )}
    </div>
  );
}
