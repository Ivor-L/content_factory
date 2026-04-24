'use client';

/* eslint-disable @next/next/no-img-element -- Script previews show remote assets and generated frames */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  PlayCircle,
  Eye,
  ShoppingBag,
  Zap,
  Layers,
  FileJson,
  ScrollText,
  User,
  AlertTriangle,
  Search,
  RefreshCcw,
  Loader2,
  Square,
  CheckSquare,
  Trash2,
  LayoutGrid,
  List as ListIcon,
  ExternalLink,
  Upload,
} from "lucide-react";
import { Modal, useModalHeader } from "@/components/Modal";
import { ConfirmModal } from '@/components/ConfirmModal';
import { ScriptForm } from "@/components/ScriptForm";
import { EmptyState } from "@/components/EmptyState";
import { AddButton } from "@/components/AddButton";
import ReplicationForm from "@/app/(main)/replication/ReplicationForm";
import { CopyRemixPanel } from "@/app/(main)/replication/CopyRemixPanel";
import { ViralReferenceModal } from "./ViralReferenceModal";
import { useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { deleteScript } from "./actions";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

import { ScriptStatusBadge } from "./ScriptStatusBadge";
import ScriptStatusPoller from "./[id]/ScriptStatusPoller";
import { deriveCopyInsights } from "@/lib/copyInsights";
import { toProxyUrl, toProxyImgUrl, toProxyMediaUrl } from "@/lib/mediaProxy";
import { chooseBestMediaUrl } from "@/lib/viralReferenceMedia";
import { supabase } from "@/lib/supabaseClient";

interface Script {
  id: string;
  title: string;
  videoUrl: string | null;
  breakdown?: string | null;
  createdAt: string;
  status?: string;
  progress?: number;
  error?: string | null;
  blueprint?: string | null;
}

type ScriptFormSuccessPayload = {
  id: string;
  title: string;
  videoUrl: string | null;
  breakdown?: string | null;
  createdAt?: string | Date;
  status?: string;
  progress?: number;
  error?: string | null;
  blueprint?: string | null;
};

interface Character {
  id: string;
  name: string;
  avatar: string;
}

interface ScriptListProps {
  initialScripts: Script[];
  products: { id: string; name: string; images?: string }[];
  characters: Character[];
}

const REFERENCE_PLACEHOLDER_IMAGE = "/logo/logo-icon.svg";
const VIDEO_URL_PATTERN = /\.(mp4|mov|m3u8)(\?|$)/i;

const VIRAL_PLATFORMS = [
  { id: "xiaohongshu", badge: "XHS" },
  { id: "tiktok", badge: "TT" },
  { id: "facebook", badge: "FB" },
  { id: "instagram", badge: "IG" },
];

type ReferenceContentType = "all" | "video" | "image";
const REFERENCE_CONTENT_FILTERS: ReferenceContentType[] = ["all", "video", "image"];
type ReferenceViewMode = "grid" | "list";

type CollectorMode = "keyword" | "creator" | "video";

const PLATFORM_COLLECTOR_MODES: Record<string, CollectorMode[]> = {
  xiaohongshu: [],
  tiktok: ["keyword", "creator", "video"],
  facebook: ["creator", "video"],
  instagram: ["video"],
};

type StatPayload = Record<string, number | string | null>;

type ViralReferenceItemData = {
  id: string;
  platform: string;
  sourceType: string;
  sourceId: string;
  scriptText?: string | null;
  title?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  videoUrl?: string | null;
  mediaUrls?: (string | null)[] | null;
  sourceUrl?: string | null;
  stats?: StatPayload | null;
  category?: string | null;
  rankLabel?: string | null;
  benchmarkScore?: number | null;
  publishedAt?: string | null;
  creator?: ViralCreatorData | null;
  rawPayload?: unknown;
};

type ViralCreatorData = {
  id: string;
  platform: string;
  creatorHandle?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  stats?: StatPayload | null;
  referenceCount?: number;
  recentReference?: ViralReferenceItemData | null;
};

type ScriptTab = 'my-templates' | 'viral-content' | 'creators';

function isScriptTab(value: string | null | undefined): value is ScriptTab {
  return value === 'my-templates' || value === 'viral-content' || value === 'creators';
}

const REPLICATION_MODE_STORAGE_KEY = 'replication_mode_preference';
const REPLICATION_MODES: Array<'one-click' | 'storyboard' | 'digital-human'> = [
  'one-click',
  'storyboard',
  'digital-human',
];
const REPLICATION_COMING_SOON = process.env.NEXT_PUBLIC_REPLICATION_COMING_SOON === "true";

function formatCount(value?: number | string | null) {
  if (value == null) return "-";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "-";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return `${Math.round(num)}`;
}

function formatDateLabel(value?: string | null, locale = "zh-CN") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function getPlatformLabel(id: string, language: "zh" | "zh-TW" | "en" = "zh") {
  const byLocale: Record<"zh" | "zh-TW" | "en", Record<string, string>> = {
    zh: {
      xiaohongshu: "小红书",
      tiktok: "TikTok",
      facebook: "Facebook",
      instagram: "Instagram",
    },
    "zh-TW": {
      xiaohongshu: "小紅書",
      tiktok: "TikTok",
      facebook: "Facebook",
      instagram: "Instagram",
    },
    en: {
      xiaohongshu: "Xiaohongshu",
      tiktok: "TikTok",
      facebook: "Facebook",
      instagram: "Instagram",
    },
  };
  return byLocale[language]?.[id] ?? id;
}

function getReferenceContentLabel(
  ref?: Pick<
    ViralReferenceItemData,
    "sourceType" | "videoUrl" | "rawPayload" | "mediaUrls"
  > | null,
  language: "zh" | "zh-TW" | "en" = "zh",
) {
  if (isVideoReference(ref)) {
    if (language === "en") return "Video";
    if (language === "zh-TW") return "影片";
    return "视频";
  }
  if (language === "en") return "Graphic";
  if (language === "zh-TW") return "圖文";
  return "图文";
}

function getStatNumber(item: ViralReferenceItemData, key: keyof StatPayload): number {
  const val = item.stats?.[key];
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

function sortReferenceItems(items: ViralReferenceItemData[], sortKey: string): ViralReferenceItemData[] {
  if (sortKey === "recent") return items;
  const sorted = [...items];
  const keyMap: Record<string, keyof StatPayload> = {
    likes: "likes",
    collects: "collects",
    comments: "comments",
  };
  const statKey = keyMap[sortKey];
  if (!statKey) return items;
  sorted.sort((a, b) => getStatNumber(b, statKey) - getStatNumber(a, statKey));
  return sorted;
}

function parseRawPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return null;
}

function getStringFromPath(obj: Record<string, unknown> | null, path: string[]): string | null {
  if (!obj) return null;
  let current: unknown = obj;
  for (const key of path) {
    if (typeof current !== "object" || current === null) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

function isVideoReference(
  ref?: Pick<
    ViralReferenceItemData,
    "sourceType" | "videoUrl" | "rawPayload" | "mediaUrls" | "coverUrl"
  > | null,
) {
  if (!ref) return false;

  // 优先检查 rawPayload.type，XHS图文 type="normal"，视频 type="video"
  const payload = parseRawPayload(ref.rawPayload);
  const payloadType =
    getStringFromPath(payload, ["type"]) ??
    getStringFromPath(payload, ["note", "type"]) ??
    getStringFromPath(payload, ["data", "type"]);
  if (typeof payloadType === "string") {
    const t = payloadType.toLowerCase();
    if (t === "normal" || t === "image") return false;
    if (t.includes("video")) return true;
  }

  // rawPayload 无 type 时，再看 videoUrl（但要排除纯封面图场景）
  if (typeof ref.videoUrl === "string" && ref.videoUrl.trim()) return true;

  const payloadVideoUrl =
    getStringFromPath(payload, ["videoUrl"]) ??
    getStringFromPath(payload, ["video", "url"]) ??
    getStringFromPath(payload, ["note", "video", "url"]);
  if (typeof payloadVideoUrl === "string" && payloadVideoUrl.trim()) {
    return true;
  }

  if (Array.isArray(ref.mediaUrls)) {
    const hasVideoLikeUrl = ref.mediaUrls.some(
      (url) => typeof url === "string" && /\.(mp4|mov|m3u8)(\?|$)/i.test(url.trim()),
    );
    if (hasVideoLikeUrl) {
      return true;
    }
  }

  // XHS CDN heuristic: file IDs starting with "1040g0k0" are video note covers;
  // "1040g34o" (and others) are image note covers.
  if (typeof ref.coverUrl === "string" && /\/spectrum\/1040g0k0/i.test(ref.coverUrl)) {
    return true;
  }

  const sourceType = ref.sourceType?.toLowerCase() ?? "";
  return (
    sourceType.includes("video") ||
    sourceType.includes("short") ||
    sourceType.includes("media")
  );
}

function normalizeMediaList(media?: (string | null)[] | null): string[] {
  if (!Array.isArray(media)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of media) {
    if (typeof url !== "string") continue;
    const normalized = url.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function getReferenceCoverImage(ref: Pick<ViralReferenceItemData, "coverUrl" | "mediaUrls" | "videoUrl">): string | null {
  const mediaList = normalizeMediaList(ref.mediaUrls);
  return (
    chooseBestMediaUrl(ref.coverUrl, mediaList) ??
    ref.videoUrl ??
    mediaList[0] ??
    null
  );
}

function getReferenceVideoUrl(ref: Pick<ViralReferenceItemData, "videoUrl" | "mediaUrls">): string | null {
  if (typeof ref.videoUrl === "string" && ref.videoUrl.trim()) {
    return ref.videoUrl.trim();
  }
  const mediaList = normalizeMediaList(ref.mediaUrls);
  const candidate = mediaList.find((url) => typeof url === "string" && VIDEO_URL_PATTERN.test(url));
  return candidate ?? null;
}

function extractReferenceScriptText(
  ref?: Pick<ViralReferenceItemData, "description" | "rawPayload"> | null,
): string | null {
  if (!ref) return null;
  const payload = parseRawPayload(ref.rawPayload);
  const scriptText =
    getStringFromPath(payload, ["scriptText"]) ??
    getStringFromPath(payload, ["script_text"]) ??
    getStringFromPath(payload, ["data", "scriptText"]) ??
    getStringFromPath(payload, ["data", "script_text"]) ??
    getStringFromPath(payload, ["raw", "script_text"]);
  if (scriptText) return scriptText.trim();
  return null;
}

async function parseJsonSafely<T = unknown>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Failed to parse JSON response", error);
    throw new Error("Invalid response payload");
  }
}

type ParsedStoryboardScene = {
  id: string;
  order: number;
  timeRange: string;
  duration: number | null;
  imagePrompt: string;
  videoPrompt: string;
  visualDescription: string;
  cameraNotes: string;
  lightingNotes: string;
  narrativeRole: string;
  universalInstruction: string;
  subjectAction: string;
  referenceFrameUrl: string;
  hasPerson: boolean | null;
  hasProduct: boolean | null;
  originalScript: string;
  rewrittenScript: string;
  raw: Record<string, unknown>;
};

type ParsedScriptAnalysis = {
  status: string;
  source: "legacy_blueprint" | "segments_payload" | "workflow_data" | "unknown";
  meta: Record<string, unknown>;
  scenes: ParsedStoryboardScene[];
  workflowData: Record<string, unknown> | null;
  raw: Record<string, unknown> | null;
  parseError: string | null;
};

function parseScriptAnalysisPayload(blueprintRaw?: string | null): ParsedScriptAnalysis {
  const empty: ParsedScriptAnalysis = {
    status: "",
    source: "unknown",
    meta: {},
    scenes: [],
    workflowData: null,
    raw: null,
    parseError: null,
  };
  if (!blueprintRaw) return empty;

  const toText = (value: unknown): string =>
    typeof value === "string" ? value.trim() : "";
  const toNumber = (value: unknown): number | null => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const toBoolOrNull = (value: unknown): boolean | null => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "y", "有", "是"].includes(normalized)) return true;
      if (["false", "0", "no", "n", "无", "否"].includes(normalized)) return false;
    }
    return null;
  };
  const compactText = (values: unknown[], separator = " / "): string =>
    values
      .map((value) => toText(value))
      .filter(Boolean)
      .join(separator);
  const buildTimeRange = (scene: Record<string, unknown>): string => {
    const direct =
      toText(scene.time_range) ||
      toText(scene.timeRange) ||
      toText(scene.range);
    if (direct) return direct;
    const startSec = toNumber(scene.start_sec ?? scene.startSec);
    const endSec = toNumber(scene.end_sec ?? scene.endSec);
    if (startSec !== null && endSec !== null) {
      return `${startSec}-${endSec}s`;
    }
    return "";
  };

  try {
    const parsed = JSON.parse(blueprintRaw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...empty, parseError: "Blueprint is not an object" };
    }

    const mapScene = (
      scene: Record<string, unknown>,
      index: number
    ): ParsedStoryboardScene => {
      const startSec = toNumber(scene.start_sec ?? scene.startSec);
      const endSec = toNumber(scene.end_sec ?? scene.endSec);
      const rangeDuration =
        startSec !== null && endSec !== null && endSec > startSec
          ? Math.round((endSec - startSec) * 1000) / 1000
          : null;
      const order =
        toNumber(scene.order) ??
        toNumber(scene.id) ??
        toNumber(scene.idx) ??
        toNumber(scene.shot_id) ??
        toNumber(scene.shotId) ??
        index + 1;
      const mustShowText = toText(scene.must_show).toLowerCase();
      const cameraSpecs = compactText(
        [scene.camera_shot_size, scene.camera_angle, scene.camera_movement].filter(Boolean)
      );
      return {
        id: toText(scene.id) || toText(scene.shot_id) || String(order),
        order,
        timeRange: buildTimeRange(scene),
        duration:
          toNumber(scene.duration) ??
          toNumber(scene.duration_sec) ??
          toNumber(scene.durationSec) ??
          toNumber(scene.estimated_seconds) ??
          toNumber(scene.estimatedSeconds) ??
          rangeDuration,
        imagePrompt:
          toText(scene.image_prompt) ||
          toText(scene.imagePrompt) ||
          toText(scene.prompt_text) ||
          toText(scene.scene_prompt) ||
          toText(scene.prompt) ||
          toText((scene.visual_specs as Record<string, unknown> | undefined)?.image_prompt),
        videoPrompt:
          toText(scene.video_prompt) ||
          toText(scene.videoPrompt) ||
          toText(scene.video_prompt_cn) ||
          toText(scene.scripted_shot_prompt) ||
          toText((scene.visual_specs as Record<string, unknown> | undefined)?.video_prompt),
        visualDescription:
          toText(scene.visual_description) ||
          toText(scene.visualDescription) ||
          toText(scene.visual_content_description) ||
          toText(scene.shot_goal) ||
          toText((scene.visual_specs as Record<string, unknown> | undefined)?.visual_description),
        cameraNotes:
          toText(scene.camera_notes) ||
          toText(scene.cameraNotes) ||
          cameraSpecs ||
          toText((scene.visual_specs as Record<string, unknown> | undefined)?.camera),
        lightingNotes:
          toText(scene.lighting_notes) ||
          toText(scene.lightingNotes) ||
          toText(scene.lighting_atmosphere) ||
          toText((scene.visual_specs as Record<string, unknown> | undefined)?.lighting_environment),
        narrativeRole:
          toText((scene.abstract_logic as Record<string, unknown> | undefined)?.narrative_role) ||
          toText(scene.scene_title_cn) ||
          toText(scene.shot_title_cn),
        universalInstruction:
          toText((scene.abstract_logic as Record<string, unknown> | undefined)?.universal_instruction),
        subjectAction:
          toText((scene.visual_specs as Record<string, unknown> | undefined)?.subject_action) ||
          toText(scene.action_blocking),
        referenceFrameUrl:
          toText(scene.reference_frame_url) ||
          toText(scene.referenceFrameUrl) ||
          toText(scene.image_url) ||
          toText(scene.imageUrl) ||
          toText(scene.ref_frame_image) ||
          toText(scene.ref_frame_url),
        hasPerson:
          toBoolOrNull(scene.has_person ?? scene.hasPerson) ??
          (mustShowText
            ? mustShowText.includes("person") || mustShowText.includes("human") || mustShowText.includes("人物")
            : null),
        hasProduct:
          toBoolOrNull(scene.has_product ?? scene.hasProduct) ??
          (mustShowText
            ? mustShowText.includes("product") || mustShowText.includes("产品") || mustShowText.includes("商品")
            : null),
        originalScript:
          toText(scene.original_script) ||
          toText(scene.originalScript) ||
          toText(scene.dialogue_vo_original) ||
          toText(scene.dialogue_vo_zh) ||
          toText(scene.sentence_mapping) ||
          toText(scene.text),
        rewrittenScript:
          toText(scene.rewritten_script) ||
          toText(scene.rewrittenScript) ||
          toText(scene.rewrite_vo_target_language) ||
          toText(scene.rewrite_vo_zh_translation),
        raw: scene,
      };
    };

    const rootSceneBreakdown = Array.isArray(parsed.scene_breakdown)
      ? (parsed.scene_breakdown as Record<string, unknown>[])
      : null;
    const rootSegments = Array.isArray(parsed.segments)
      ? (parsed.segments as Record<string, unknown>[])
      : null;
    const workflowData =
      parsed.workflow_data && typeof parsed.workflow_data === "object"
        ? (parsed.workflow_data as Record<string, unknown>)
        : parsed.workflowData && typeof parsed.workflowData === "object"
        ? (parsed.workflowData as Record<string, unknown>)
        : null;
    const workflowScenes = workflowData && Array.isArray(workflowData.scene_breakdown)
      ? (workflowData.scene_breakdown as Record<string, unknown>[])
      : null;

    let source: ParsedScriptAnalysis["source"] = "unknown";
    let sceneSource: Record<string, unknown>[] = [];

    if (rootSceneBreakdown) {
      source = "legacy_blueprint";
      sceneSource = rootSceneBreakdown;
    } else if (rootSegments) {
      source = "segments_payload";
      sceneSource = rootSegments;
    } else if (workflowScenes) {
      source = "workflow_data";
      sceneSource = workflowScenes;
    }

    const scenes = sceneSource
      .map((scene, index) => mapScene(scene, index))
      .sort((a, b) => a.order - b.order);

    const meta =
      (parsed.meta && typeof parsed.meta === "object" ? (parsed.meta as Record<string, unknown>) : null) ||
      (workflowData?.meta && typeof workflowData.meta === "object"
        ? (workflowData.meta as Record<string, unknown>)
        : {}) ||
      {};

    return {
      status: toText(parsed.status),
      source,
      meta,
      scenes,
      workflowData,
      raw: parsed,
      parseError: null,
    };
  } catch (error) {
    return {
      ...empty,
      parseError: error instanceof Error ? error.message : "Unknown parse error",
    };
  }
}

export function ScriptList({ initialScripts, products, characters }: ScriptListProps) {
  const searchParams = useSearchParams();
  const { t: i18nText, language } = useLanguage();
  const t = i18nText as any;
  const contentFilterLabels = useMemo(
    () => ({
      label: t.scripts?.contentFilters?.label || "内容类型",
      all: t.scripts?.contentFilters?.all || "全部",
      video: t.scripts?.contentFilters?.video || "视频",
      image: t.scripts?.contentFilters?.image || "图文",
    }),
    [t],
  );
  const scriptUi = useMemo(() => {
    if (language === "en") {
      return {
        collectorModeLabels: {
          keyword: "Keyword Search",
          creator: "Creator URL",
          video: "Post URL",
        } as Record<CollectorMode, string>,
        sortLabels: {
          recent: "Latest",
          likes: "Likes",
          collects: "Saves",
          comments: "Comments",
        },
        collectorPlaceholderKeyword:
          "One keyword per line, for example:\nSkincare review\nKitchen organizer",
        collectorPlaceholderInstagram:
          "One post URL per line. Only post/reel URLs are supported.",
        collectorPlaceholderDefault:
          "One URL per line. Supports creator profile URLs or post URLs.",
        referenceSearchPlaceholder: "Search viral references",
        creatorSearchPlaceholder: "Search creators",
        collectorNeedKeyword: "Please enter at least one keyword.",
        collectorNeedLink: "Please enter at least one URL.",
        collectorSubmitted: "Collection task submitted. Please refresh in a moment.",
        collectorSubmitFailed: "Failed to submit collection task.",
        collectData: "Collect Data",
        collectorTitle: "Data Collector",
        collectorKeywordList: "Keyword List",
        collectorLinkList: "URL List",
        collectorPerKeyword: "Results per keyword",
        collectorHint:
          "Collection usually finishes within tens of seconds. The latest data will refresh automatically.",
        cancel: "Cancel",
        submit: "Start Collecting",
        submitting: "Submitting...",
        collectorUnsupported: "This platform does not support built-in collecting yet. Please use the browser extension.",
        viewModeGrid: "Cards",
        viewModeList: "List",
        batchSelect: "Batch Select",
        batchCancel: "Cancel Batch",
        selectPage: "Select Page",
        deselectPage: "Deselect Page",
        deleting: "Deleting...",
        deleteAction: "Delete",
        noVideo: "No Video",
        noLinkForAutoCollect: "No valid URL available for auto collect",
        openCollectPageFailed: "Failed to open collection page",
        noteNoCollectLink: "This note does not have a collectible URL yet",
        openedCollectAssistant: "Collection helper opened in a new tab",
        noteNoViewLink: "This note does not have a viewable URL yet",
        referenceNoViewLink: "This reference does not have a viewable URL",
        deletedReferenceOne: "Reference deleted",
        missingCreatorId: "Creator ID not found, unable to sync",
        creatorNoLinkToCollect: "No note URL available, unable to start collection",
        openedSyncAssistant: "Collection helper opened. Please finish sync in the new tab",
        creatorSyncingSuffix: " syncing",
        creatingUploadToast: "Uploading video...",
        creatingScriptToast: "Creating script...",
        newReplicationScriptTitle: "New Replication Script",
        createScriptFailed: "Failed to create script",
        missingScriptId: "Missing script ID in response",
        scriptCreated: "Script created",
        uploadFailed: "Upload failed",
        invalidVideoFile: "Please upload a video file",
        uploadInProgress: "Uploading...",
        clickOrDropUpload: "Click or drag to upload video",
        supportFormats: "Supports MP4, MOV, and more",
        uploadFirstHint: "Upload a video on the left to configure storyboard or copy remix",
        newReplication: "Start New Replication",
        replicationTitle: "Viral Replication",
        referenceUntitled: "Untitled note",
        referenceUnknownAuthor: "Unknown author",
        directSource: "Open Source",
        subtitleCopy: "Subtitle Copy",
        subtitleEmpty: "No subtitles yet",
        referencesEmptyTitle: "No viral references yet",
        referencesEmptyDescription: "Try changing filters or wait for the collector to sync.",
        creatorsEmptyTitle: "No benchmark creators yet",
        creatorsEmptyDescription: "Sync creators through the collector plugin or adjust filters.",
        creatorUnnamed: "Unnamed creator",
        creatorTitleFallback: "Creator",
        creatorDetailTitle: "Creator Details",
        creatorStatsFans: "Fans",
        creatorStatsLikes: "Likes",
        creatorStatsWorks: "Posts",
        view: "View",
        viewProfile: "View Profile",
        latestContent: "Latest content",
        syncing: "Syncing...",
        syncLatestNotes: "Sync Latest Notes",
        refreshList: "Refresh List",
        collectNotes: "Collected Notes",
        sortByPublishTime: "By publish time",
        sortByLikes: "By likes",
        loadingFallback: "Loading...",
        unknownDate: "Unknown date",
        noteNoDescription: "No description",
        goSync: "Sync",
        goView: "View",
        notesEmptyTitle: "No notes yet",
        notesEmptyDescription: "No notes collected for this creator yet. Try syncing and check again.",
        loadMore: "Load More",
        noMore: "No more data",
        playVideo: "Play video",
        replicationTabs: {
          storyboard: "Storyboard Clone",
          copy: "Copy Clone",
        },
      } as const;
    }
    if (language === "zh-TW") {
      return {
        collectorModeLabels: {
          keyword: "關鍵詞採集",
          creator: "達人連結",
          video: "影片連結",
        } as Record<CollectorMode, string>,
        sortLabels: {
          recent: "最新",
          likes: "按讚",
          collects: "收藏",
          comments: "留言",
        },
        collectorPlaceholderKeyword: "每行一個關鍵詞，例如：\n保養品測評\n廚房收納",
        collectorPlaceholderInstagram:
          "每行一個作品連結，僅支援貼文 / Reels 連結。",
        collectorPlaceholderDefault:
          "每行一個連結，支援達人主頁或具體內容連結。",
        referenceSearchPlaceholder: "搜尋參考爆款",
        creatorSearchPlaceholder: "搜尋創作者",
        collectorNeedKeyword: "請至少輸入一個關鍵詞",
        collectorNeedLink: "請至少輸入一個連結",
        collectorSubmitted: "採集任務已提交，請稍後重新整理查看",
        collectorSubmitFailed: "提交採集任務失敗",
        collectData: "資料採集",
        collectorTitle: "資料採集",
        collectorKeywordList: "關鍵詞列表",
        collectorLinkList: "連結列表",
        collectorPerKeyword: "每個關鍵詞抓取數量",
        collectorHint: "採集任務提交後通常需要幾十秒完成，完成後系統會自動刷新最新內容。",
        cancel: "取消",
        submit: "開始採集",
        submitting: "提交中...",
        collectorUnsupported: "目前平台暫不支援內建採集，請使用瀏覽器插件同步內容。",
        viewModeGrid: "卡片",
        viewModeList: "列表",
        batchSelect: "批量選擇",
        batchCancel: "取消批量",
        selectPage: "全選本頁",
        deselectPage: "取消全選",
        deleting: "刪除中...",
        deleteAction: "刪除",
        noVideo: "無影片",
        noLinkForAutoCollect: "未找到可跳轉的連結",
        openCollectPageFailed: "無法打開採集頁面",
        noteNoCollectLink: "該筆記暫無可採集連結",
        openedCollectAssistant: "已在新分頁打開採集助手",
        noteNoViewLink: "該筆記暫無可訪問連結",
        referenceNoViewLink: "該內容沒有可訪問連結",
        deletedReferenceOne: "已刪除該參考",
        missingCreatorId: "未找到創作者 ID，無法同步",
        creatorNoLinkToCollect: "暫無筆記連結，無法跳轉採集",
        openedSyncAssistant: "已打開採集助手，請在新分頁完成同步",
        creatorSyncingSuffix: "同步中",
        creatingUploadToast: "上傳影片中...",
        creatingScriptToast: "正在建立腳本...",
        newReplicationScriptTitle: "新建復刻腳本",
        createScriptFailed: "腳本建立失敗",
        missingScriptId: "腳本建立回傳缺少 ID",
        scriptCreated: "腳本已建立",
        uploadFailed: "上傳失敗",
        invalidVideoFile: "請上傳影片檔案",
        uploadInProgress: "上傳中...",
        clickOrDropUpload: "點擊或拖拽上傳影片",
        supportFormats: "支援 MP4、MOV 等格式",
        uploadFirstHint: "請先在左側上傳影片，完成後即可配置分鏡或口播復刻",
        newReplication: "爆款復刻",
        replicationTitle: "爆款復刻",
        referenceUntitled: "未命名筆記",
        referenceUnknownAuthor: "未知作者",
        directSource: "直達原文",
        subtitleCopy: "字幕文案",
        subtitleEmpty: "暫無字幕",
        referencesEmptyTitle: "暫無參考爆款",
        referencesEmptyDescription: "可切換篩選條件，或等待採集器同步完成。",
        creatorsEmptyTitle: "暫無對標創作者",
        creatorsEmptyDescription: "請先透過採集插件同步博主，或調整篩選條件。",
        creatorUnnamed: "未命名創作者",
        creatorTitleFallback: "創作者",
        creatorDetailTitle: "創作者詳情",
        creatorStatsFans: "粉絲",
        creatorStatsLikes: "獲讚",
        creatorStatsWorks: "作品",
        view: "查看",
        viewProfile: "查看主頁",
        latestContent: "最新內容",
        syncing: "同步中...",
        syncLatestNotes: "同步最新筆記",
        refreshList: "刷新列表",
        collectNotes: "採集筆記",
        sortByPublishTime: "按發布時間",
        sortByLikes: "按按讚數",
        loadingFallback: "載入中...",
        unknownDate: "未知日期",
        noteNoDescription: "暫無簡介",
        goSync: "去同步",
        goView: "去查看",
        notesEmptyTitle: "暫無筆記",
        notesEmptyDescription: "該創作者暫無採集筆記，可稍後再試或手動同步。",
        loadMore: "載入更多",
        noMore: "沒有更多了",
        playVideo: "播放影片",
        replicationTabs: {
          storyboard: "復刻分鏡",
          copy: "復刻口播",
        },
      } as const;
    }
    return {
      collectorModeLabels: {
        keyword: "关键词采集",
        creator: "达人链接",
        video: "视频链接",
      } as Record<CollectorMode, string>,
      sortLabels: {
        recent: "最新",
        likes: "点赞",
        collects: "收藏",
        comments: "评论",
      },
      collectorPlaceholderKeyword: "每行一个关键词，例如：\n护肤品测评\n厨房收纳",
      collectorPlaceholderInstagram:
        "每行一个作品链接，仅支持具体内容（帖子 / Reels）链接。",
      collectorPlaceholderDefault: "每行一个链接，支持达人主页或具体内容链接。",
      referenceSearchPlaceholder: "搜索参考爆款",
      creatorSearchPlaceholder: "搜索创作者",
      collectorNeedKeyword: "请至少填写一个关键词",
      collectorNeedLink: "请至少填写一个链接",
      collectorSubmitted: "采集任务已提交，请稍候刷新查看",
      collectorSubmitFailed: "提交采集任务失败",
      collectData: "数据采集",
      collectorTitle: "数据采集",
      collectorKeywordList: "关键词列表",
      collectorLinkList: "链接列表",
      collectorPerKeyword: "每个关键词抓取条数",
      collectorHint: "采集任务提交后通常需要几十秒完成，完成后系统会自动刷新最新内容。",
      cancel: "取消",
      submit: "开始采集",
      submitting: "提交中...",
      collectorUnsupported: "当前平台暂不支持内置采集，请使用浏览器插件同步内容。",
      viewModeGrid: "卡片",
      viewModeList: "列表",
      batchSelect: "批量选择",
      batchCancel: "取消批量",
      selectPage: "全选本页",
      deselectPage: "取消全选",
      deleting: "删除中...",
      deleteAction: "删除",
      noVideo: "No Video",
      noLinkForAutoCollect: "未找到可跳转的链接",
      openCollectPageFailed: "无法打开采集页面",
      noteNoCollectLink: "该笔记暂无可采集的链接",
      openedCollectAssistant: "已在新标签页打开采集助手",
      noteNoViewLink: "该笔记暂无可访问链接",
      referenceNoViewLink: "该条内容没有可访问的链接",
      deletedReferenceOne: "已删除该参考",
      missingCreatorId: "未找到创作者 ID，无法同步",
      creatorNoLinkToCollect: "暂无笔记链接，无法跳转采集",
      openedSyncAssistant: "已打开采集助手，请在新标签页完成同步",
      creatorSyncingSuffix: "同步中",
      creatingUploadToast: "上传视频中...",
      creatingScriptToast: "正在创建脚本...",
      newReplicationScriptTitle: "新建复刻脚本",
      createScriptFailed: "脚本创建失败",
      missingScriptId: "脚本创建返回缺少 ID",
      scriptCreated: "脚本已创建",
      uploadFailed: "上传失败",
      invalidVideoFile: "请上传视频文件",
      uploadInProgress: "上传中...",
      clickOrDropUpload: "点击或拖拽上传视频",
      supportFormats: "支持 MP4、MOV 等格式",
      uploadFirstHint: "请先在左侧上传视频，上传完成后即可配置分镜或口播复刻",
      newReplication: "新建复刻",
      replicationTitle: "爆款复刻",
      referenceUntitled: "未命名笔记",
      referenceUnknownAuthor: "未知作者",
      directSource: "直达原文",
      subtitleCopy: "字幕文案",
      subtitleEmpty: "暂无字幕",
      referencesEmptyTitle: "暂无参考爆款",
      referencesEmptyDescription: "尝试切换筛选条件或等待采集器同步完成。",
      creatorsEmptyTitle: "暂无对标创作者",
      creatorsEmptyDescription: "请先通过采集插件同步博主或调整筛选条件。",
      creatorUnnamed: "未命名创作者",
      creatorTitleFallback: "创作者",
      creatorDetailTitle: "创作者详情",
      creatorStatsFans: "粉丝",
      creatorStatsLikes: "获赞",
      creatorStatsWorks: "作品",
      view: "查看",
      viewProfile: "查看主页",
      latestContent: "最新内容",
      syncing: "同步中...",
      syncLatestNotes: "同步最新笔记",
      refreshList: "刷新列表",
      collectNotes: "采集笔记",
      sortByPublishTime: "按发布时间",
      sortByLikes: "按点赞数",
      loadingFallback: "加载中...",
      unknownDate: "未知日期",
      noteNoDescription: "暂无简介",
      goSync: "去同步",
      goView: "去查看",
      notesEmptyTitle: "暂无笔记",
      notesEmptyDescription: "该创作者还没有采集到笔记，请尝试同步功能或稍后再试。",
      loadMore: "加载更多",
      noMore: "没有更多了",
      playVideo: "播放视频",
      replicationTabs: {
        storyboard: "复刻分镜",
        copy: "复刻口播",
      },
    } as const;
  }, [language]);
  const uiDateLocale = language === "en" ? "en-US" : language === "zh-TW" ? "zh-TW" : "zh-CN";
  const deletedReferencesMessage = useCallback(
    (count: number) => {
      if (language === "en") return `Deleted ${count} references`;
      if (language === "zh-TW") return `已刪除 ${count} 條參考`;
      return `已删除 ${count} 条参考`;
    },
    [language],
  );
  const deletedCreatorsMessage = useCallback(
    (count: number) => {
      if (language === "en") return `Deleted ${count} creators`;
      if (language === "zh-TW") return `已刪除 ${count} 位創作者`;
      return `已删除 ${count} 位创作者`;
    },
    [language],
  );
  const replicationComingSoon = REPLICATION_COMING_SOON;
  const [scripts, setScripts] = useState<Script[]>(initialScripts);
  const [activeTab, setActiveTab] = useState<ScriptTab>('my-templates');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [scriptToDelete, setScriptToDelete] = useState<string | null>(null);
  const [selectedReplicationScript, setSelectedReplicationScript] = useState<Script | null>(null);
  const [isReplicationModalOpen, setIsReplicationModalOpen] = useState(false);
  const [newReplicationUploadedUrl, setNewReplicationUploadedUrl] = useState('');
  const [newReplicationUploading, setNewReplicationUploading] = useState(false);
  const [newReplicationDragActive, setNewReplicationDragActive] = useState(false);
  const [replicationViewTab, setReplicationViewTab] = useState<'storyboard' | 'copy'>('storyboard');

  const [contentPlatform, setContentPlatform] = useState('xiaohongshu');
  const [referenceItems, setReferenceItems] = useState<ViralReferenceItemData[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceHasMore, setReferenceHasMore] = useState(false);
  const [activeVideoIds, setActiveVideoIds] = useState<Set<string>>(new Set());
  const referenceCursorRef = useRef<string | null>(null);
  const [referenceQuery, setReferenceQuery] = useState('');
  const debouncedReferenceQuery = useDebouncedValue(referenceQuery, 400);
  const [selectedReferenceItem, setSelectedReferenceItem] = useState<ViralReferenceItemData | null>(null);
  const [isReferenceModalOpen, setIsReferenceModalOpen] = useState(false);
  const [extractingReferenceIds, setExtractingReferenceIds] = useState<Set<string>>(new Set());
  const [referenceSelectionMode, setReferenceSelectionMode] = useState(false);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);
  const [referenceDeleting, setReferenceDeleting] = useState(false);
  const [referenceContentFilter, setReferenceContentFilter] = useState<ReferenceContentType>("all");
  const [referenceSort, setReferenceSort] = useState<string>("recent");
  const [referenceViewMode, setReferenceViewMode] = useState<ReferenceViewMode>("grid");
  const [isCollectorModalOpen, setIsCollectorModalOpen] = useState(false);
  const [collectorMode, setCollectorMode] = useState<CollectorMode>("video");
  const [collectorInput, setCollectorInput] = useState("");
  const [collectorLimit, setCollectorLimit] = useState("20");
  const [collectorSubmitting, setCollectorSubmitting] = useState(false);
  const referenceRealtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressedReferenceRealtimeEventsRef = useRef(0);
  const filteredReferenceItems = useMemo(
    () =>
      referenceItems.filter((item) => {
        if (referenceContentFilter === "all") {
          return true;
        }
        const isVideo = isVideoReference(item);
        return referenceContentFilter === "video" ? isVideo : !isVideo;
      }),
    [referenceItems, referenceContentFilter],
  );
  const allVisibleReferencesSelected = useMemo(
    () =>
      filteredReferenceItems.length > 0 &&
      filteredReferenceItems.every((item) => selectedReferenceIds.includes(item.id)),
    [filteredReferenceItems, selectedReferenceIds],
  );

  const [creatorPlatformFilter, setCreatorPlatformFilter] = useState('xiaohongshu');
  const [creatorItems, setCreatorItems] = useState<ViralCreatorData[]>([]);
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [creatorHasMore, setCreatorHasMore] = useState(false);
  const creatorCursorRef = useRef<string | null>(null);
  const [creatorQuery, setCreatorQuery] = useState('');
  const debouncedCreatorQuery = useDebouncedValue(creatorQuery, 400);
  const [selectedCreator, setSelectedCreator] = useState<ViralCreatorData | null>(null);
  const [creatorNotes, setCreatorNotes] = useState<ViralReferenceItemData[]>([]);
  const [creatorNotesLoading, setCreatorNotesLoading] = useState(false);
  const [creatorNotesError, setCreatorNotesError] = useState<string | null>(null);
  const [creatorNotesHasMore, setCreatorNotesHasMore] = useState(false);
  const [creatorNotesSort, setCreatorNotesSort] = useState<'recent' | 'likes'>('recent');
  const creatorNotesCursorRef = useRef<string | null>(null);
  const [creatorSyncing, setCreatorSyncing] = useState(false);
  const [creatorSelectionMode, setCreatorSelectionMode] = useState(false);
  const [selectedCreatorIds, setSelectedCreatorIds] = useState<string[]>([]);
  const [creatorDeleting, setCreatorDeleting] = useState(false);
  const selectedCreatorId = selectedCreator?.id ?? null;
  
  // Replication Mode
  const [replicationMode, setReplicationMode] = useState<'one-click' | 'storyboard' | 'digital-human'>('storyboard');
  const [analysisTab, setAnalysisTab] = useState<'replication' | 'breakdown' | 'storyboard' | 'copy'>('replication');

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setScripts(initialScripts);
  }, [initialScripts]);

  useEffect(() => {
    const tabParam = searchParams?.get('tab');
    if (isScriptTab(tabParam)) {
      setActiveTab((prev) => (prev === tabParam ? prev : tabParam));
    }
  }, [searchParams]);
  const replicationModeLabels = useMemo(() => {
    if (language === 'zh') {
      return {
        'one-click': '一键成片',
        'storyboard': '分镜成片',
        'digital-human': '数字人',
      } as const;
    }
    if (language === 'zh-TW') {
      return {
        'one-click': '一鍵成片',
        'storyboard': '分鏡成片',
        'digital-human': '數字人',
      } as const;
    }
    return {
      'one-click': ((t as any).home?.oneClickMode || 'One-Click Video') as string,
      'storyboard': ((t as any).home?.storyboardMode || 'Storyboard Board Mode') as string,
      'digital-human': (t.replication.digitalHumanModeLabel || 'Digital Human') as string,
    } as const;
  }, [language, t]);
  const selectedScriptInsights = useMemo(() => {
    if (!selectedReplicationScript) return null;
    return deriveCopyInsights({
      breakdown: selectedReplicationScript.breakdown,
      blueprint: selectedReplicationScript.blueprint,
    });
  }, [selectedReplicationScript]);
  const selectedScriptAnalysis = useMemo(() => {
    return parseScriptAnalysisPayload(
      selectedReplicationScript?.blueprint || selectedReplicationScript?.breakdown || null
    );
  }, [selectedReplicationScript?.blueprint, selectedReplicationScript?.breakdown]);
  const collectorModes = useMemo(() => PLATFORM_COLLECTOR_MODES[contentPlatform] ?? [], [contentPlatform]);
  const collectorModeEnabled = collectorModes.length > 0;
  const collectorPlaceholder = useMemo(() => {
    if (collectorMode === "keyword") {
      return scriptUi.collectorPlaceholderKeyword;
    }
    if (contentPlatform === "instagram") {
      return scriptUi.collectorPlaceholderInstagram;
    }
    return scriptUi.collectorPlaceholderDefault;
  }, [collectorMode, contentPlatform, scriptUi]);

  useEffect(() => {
    if (!selectedReplicationScript) return;
    const latest = scripts.find((script) => script.id === selectedReplicationScript.id);
    if (!latest) {
      setSelectedReplicationScript(null);
      return;
    }
    if (latest !== selectedReplicationScript) {
      setSelectedReplicationScript(latest);
    }
  }, [scripts, selectedReplicationScript]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      const userId = session?.user?.id;
      if (!userId) return;

      const normalize = (row: Record<string, unknown>): Script => ({
        id: String(row.id),
        title: String(row.title ?? ""),
        videoUrl: typeof row.videoUrl === "string" ? row.videoUrl : null,
        breakdown: typeof row.breakdown === "string" ? row.breakdown : null,
        blueprint: typeof row.blueprint === "string" ? row.blueprint : null,
        status: typeof row.status === "string" ? row.status : undefined,
        progress: typeof row.progress === "number" ? row.progress : 0,
        error: typeof row.error === "string" ? row.error : null,
        createdAt:
          typeof row.createdAt === "string"
            ? row.createdAt
            : (typeof row.created_at === "string" ? row.created_at : new Date().toISOString()),
      });

      channel = supabase
        .channel(`scripts-list-${userId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "scripts", filter: `userId=eq.${userId}` },
          (payload) => {
            const updated = normalize(payload.new as Record<string, unknown>);
            setScripts((prev) =>
              prev.map((script) => (script.id === updated.id ? { ...script, ...updated } : script)),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "scripts", filter: `userId=eq.${userId}` },
          (payload) => {
            const inserted = normalize(payload.new as Record<string, unknown>);
            setScripts((prev) => {
              if (prev.some((script) => script.id === inserted.id)) return prev;
              return [inserted, ...prev];
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "scripts", filter: `userId=eq.${userId}` },
          (payload) => {
            const deletedId = String((payload.old as Record<string, unknown>)?.id ?? "");
            if (!deletedId) return;
            setScripts((prev) => prev.filter((script) => script.id !== deletedId));
          },
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  useEffect(() => {
    setReplicationViewTab('storyboard');
  }, [selectedReplicationScript?.id, newReplicationUploadedUrl]);

  const handleComingSoonRedirect = useCallback(() => {
    setIsReplicationModalOpen(false);
    setSelectedReplicationScript(null);
    setAnalysisTab('replication');
    setActiveTab('viral-content');
  }, [setActiveTab, setAnalysisTab, setIsReplicationModalOpen, setSelectedReplicationScript]);

  const fallbackReplicationScript = useMemo(() => {
    if (!newReplicationUploadedUrl) return null;
    return {
      id: '__new__',
      title: scriptUi.newReplication,
      videoUrl: newReplicationUploadedUrl,
      status: 'completed',
      createdAt: new Date().toISOString(),
    } as Script;
  }, [newReplicationUploadedUrl, scriptUi.newReplication]);
  const activeReplicationScript = selectedReplicationScript || fallbackReplicationScript;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedMode = window.localStorage.getItem(REPLICATION_MODE_STORAGE_KEY);
      if (
        storedMode &&
        REPLICATION_MODES.includes(storedMode as 'one-click' | 'storyboard' | 'digital-human')
      ) {
        setReplicationMode(storedMode as 'one-click' | 'storyboard' | 'digital-human');
      }
    }

    setMounted(true);
    
  }, []);

  useEffect(() => {
    if (!collectorModeEnabled) {
      setCollectorMode("video");
      setCollectorInput("");
      return;
    }
    if (!collectorModes.includes(collectorMode)) {
      setCollectorMode(collectorModes[0]);
      setCollectorInput("");
    }
  }, [collectorModeEnabled, collectorModes, collectorMode]);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(REPLICATION_MODE_STORAGE_KEY, replicationMode);
    } catch (error) {
      console.warn('Failed to persist replication mode', error);
    }
  }, [replicationMode, mounted]);

  const parseCollectorEntries = useCallback((value: string): string[] => {
    return value
      .split(/[\n,，]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }, []);

  const handleCollectorSubmit = useCallback(async () => {
    if (!collectorModeEnabled) return;
    const entries = parseCollectorEntries(collectorInput);
    if (entries.length === 0) {
      toast.error(
        collectorMode === "keyword"
          ? scriptUi.collectorNeedKeyword
          : scriptUi.collectorNeedLink,
      );
      return;
    }
    setCollectorSubmitting(true);
    try {
      const res = await fetch("/api/social-scraper/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: contentPlatform,
          mode: collectorMode,
          entries,
          limit: collectorMode === "keyword" ? Number(collectorLimit || "20") : undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (language === "zh" ? payload?.error : null) ||
            scriptUi.collectorSubmitFailed ||
            t.common.error,
        );
      }
      toast.success((language === "zh" ? payload?.message : null) || scriptUi.collectorSubmitted);
      setCollectorInput("");
      setIsCollectorModalOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.error);
    } finally {
      setCollectorSubmitting(false);
    }
  }, [
    collectorInput,
    collectorLimit,
    collectorMode,
    collectorModeEnabled,
    contentPlatform,
    language,
    parseCollectorEntries,
    scriptUi,
    t.common.error,
  ]);

  const fetchReferences = useCallback(
    async (reset = false) => {
      setReferenceLoading(true);
      if (reset) {
        referenceCursorRef.current = null;
      }
      try {
        const params = new URLSearchParams({
          platform: contentPlatform,
          limit: '20',
          sort: referenceSort,
        });
        params.set('_', Date.now().toString());
        if (debouncedReferenceQuery.trim()) {
          params.set('q', debouncedReferenceQuery.trim());
        }
        if (referenceContentFilter === 'video') {
          params.set('contentType', 'video');
        } else if (referenceContentFilter === 'image') {
          params.set('contentType', 'image');
        }
        const cursor = reset ? null : referenceCursorRef.current;
        if (cursor) params.set('cursor', cursor);
        const headers: Record<string, string> = {
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        };
        if (typeof window !== 'undefined') {
          const apiKey = window.localStorage.getItem('user_api_key');
          if (apiKey) {
            headers['x-user-api-key'] = apiKey;
          }
        }
        const res = await fetch(`/api/viral-references?${params.toString()}`, {
          cache: 'no-store',
          credentials: 'include',
          headers,
        });
        if (res.status === 304) {
          setReferenceError(null);
          return;
        }
        const payload = await parseJsonSafely<any>(res);
        if (!res.ok) {
          const message = payload?.error || `Failed to load references (${res.status})`;
          throw new Error(message);
        }
        const data: ViralReferenceItemData[] = Array.isArray(payload?.data) ? payload.data : [];
        const normalizedData = data.map((item) => ({
          ...item,
          // Prefer the top-level scriptText hoisted by the API (rawPayload.scriptText).
          // Only fall back to rawPayload field extraction if API didn't return it.
          scriptText: typeof item.scriptText === "string" && item.scriptText.trim()
            ? item.scriptText
            : extractReferenceScriptText(item),
        }));
        setReferenceItems((prev) => {
          const base = reset ? normalizedData : [...prev, ...normalizedData];
          return sortReferenceItems(base, referenceSort);
        });
        referenceCursorRef.current = payload?.nextCursor ?? null;
        setReferenceHasMore(Boolean(payload?.nextCursor));
        setReferenceError(null);
      } catch (error) {
        setReferenceError(error instanceof Error ? error.message : t.common.error);
      } finally {
        setReferenceLoading(false);
      }
    },
    [contentPlatform, debouncedReferenceQuery, referenceContentFilter, referenceSort, t.common.error],
  );

  const scheduleReferenceAutoRefresh = useCallback(
    (delay = 800) => {
      if (referenceRealtimeTimerRef.current) {
        clearTimeout(referenceRealtimeTimerRef.current);
      }
      referenceRealtimeTimerRef.current = setTimeout(() => {
        referenceRealtimeTimerRef.current = null;
        void fetchReferences(true);
      }, delay);
    },
    [fetchReferences],
  );

  const openAutoCollectWindow = useCallback(
    (rawUrl: string | null | undefined, mode: 'single' | 'blogger' | 'profile', creatorId?: string | null) => {
      if (typeof window === "undefined") return false;
      if (!rawUrl) {
        toast.error(scriptUi.noLinkForAutoCollect);
        return false;
      }
      try {
        const target = new URL(rawUrl, rawUrl.startsWith("http") ? undefined : window.location.origin);
        const prefix = mode === "single" ? "a" : mode === "blogger" ? "b" : "c";
        const token = `${prefix}${Date.now()}`;
        target.searchParams.set("_m_t", token);
        target.searchParams.set("_m_ac", token);
        if (creatorId) {
          target.searchParams.set("_m_i", creatorId);
        }
        window.open(target.toString(), "_blank", "noreferrer");
        return true;
      } catch (error) {
        console.error("Failed to open auto collect url", error);
        toast.error(scriptUi.openCollectPageFailed);
        return false;
      }
    },
    [scriptUi.noLinkForAutoCollect, scriptUi.openCollectPageFailed],
  );

  useEffect(() => {
    return () => {
      if (referenceRealtimeTimerRef.current) {
        clearTimeout(referenceRealtimeTimerRef.current);
        referenceRealtimeTimerRef.current = null;
      }
    };
  }, []);

  const fetchCreators = useCallback(
    async (reset = false) => {
      setCreatorLoading(true);
      if (reset) {
        creatorCursorRef.current = null;
      }
      try {
        const params = new URLSearchParams({
          platform: creatorPlatformFilter,
          limit: '18',
          sort: 'recent',
          withSample: 'true',
          withCounts: 'true',
        });
        params.set('_', Date.now().toString());
        if (debouncedCreatorQuery.trim()) {
          params.set('q', debouncedCreatorQuery.trim());
        }
        const cursor = reset ? null : creatorCursorRef.current;
        if (cursor) params.set('cursor', cursor);
        const headers: Record<string, string> = {
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        };
        if (typeof window !== 'undefined') {
          const apiKey = window.localStorage.getItem('user_api_key');
          if (apiKey) {
            headers['x-user-api-key'] = apiKey;
          }
        }
        const res = await fetch(`/api/viral-creators?${params.toString()}`, {
          cache: 'no-store',
          credentials: 'include',
          headers,
        });
        if (res.status === 304) {
          setCreatorError(null);
          return;
        }
        const payload = await parseJsonSafely<any>(res);
        if (!res.ok) {
          const message = payload?.error || `Failed to load creators (${res.status})`;
          throw new Error(message);
        }
        const data: ViralCreatorData[] = Array.isArray(payload?.data) ? payload.data : [];
        setCreatorItems((prev) => (reset ? data : [...prev, ...data]));
        creatorCursorRef.current = payload?.nextCursor ?? null;
        setCreatorHasMore(Boolean(payload?.nextCursor));
        setCreatorError(null);
      } catch (error) {
        setCreatorError(error instanceof Error ? error.message : t.common.error);
      } finally {
        setCreatorLoading(false);
      }
    },
    [creatorPlatformFilter, debouncedCreatorQuery, t.common.error],
  );

  const loadCreatorReferences = useCallback(
    async (reset = false) => {
      if (!selectedCreatorId) return;
      setCreatorNotesLoading(true);
      if (reset) {
        creatorNotesCursorRef.current = null;
      }
      try {
        const params = new URLSearchParams({
          creatorId: selectedCreatorId,
          limit: "24",
          sort: creatorNotesSort,
        });
        params.set("sourceType", "blogger_note");
        params.set("_", Date.now().toString());
        const cursor = reset ? null : creatorNotesCursorRef.current;
        if (cursor) params.set("cursor", cursor);
        const headers: Record<string, string> = {
          "cache-control": "no-cache",
          pragma: "no-cache",
        };
        if (typeof window !== "undefined") {
          const apiKey = window.localStorage.getItem("user_api_key");
          if (apiKey) {
            headers["x-user-api-key"] = apiKey;
          }
        }
        const res = await fetch(`/api/viral-references?${params.toString()}`, {
          cache: "no-store",
          credentials: "include",
          headers,
        });
        if (res.status === 304) {
          setCreatorNotesError(null);
          return;
        }
        const payload = await parseJsonSafely<any>(res);
        if (!res.ok) {
          const message =
            payload?.error || `Failed to load creator references (${res.status})`;
          throw new Error(message);
        }
        const data: ViralReferenceItemData[] = Array.isArray(payload?.data)
          ? payload.data
          : [];
        setCreatorNotes((prev) => (reset ? data : [...prev, ...data]));
        creatorNotesCursorRef.current = payload?.nextCursor ?? null;
        setCreatorNotesHasMore(Boolean(payload?.nextCursor));
        setCreatorNotesError(null);
      } catch (error) {
        setCreatorNotesError(
          error instanceof Error ? error.message : t.common.error,
        );
      } finally {
        setCreatorNotesLoading(false);
      }
    },
    [selectedCreatorId, creatorNotesSort, t.common.error],
  );

  const handleNoteAutoSync = useCallback(
    (note: ViralReferenceItemData) => {
      if (!note.sourceUrl) {
        toast.error(scriptUi.noteNoCollectLink);
        return;
      }
      const success = openAutoCollectWindow(note.sourceUrl, "single", selectedCreatorId);
      if (success) {
        toast.success(scriptUi.openedCollectAssistant);
      }
    },
    [openAutoCollectWindow, scriptUi.noteNoCollectLink, scriptUi.openedCollectAssistant, selectedCreatorId],
  );

  const handleNoteView = useCallback((note: ViralReferenceItemData) => {
    if (typeof window === "undefined") return;
    if (!note.sourceUrl) {
      toast.error(scriptUi.noteNoViewLink);
      return;
    }
    window.open(note.sourceUrl, "_blank", "noreferrer");
  }, [scriptUi.noteNoViewLink]);

  useEffect(() => {
    fetchReferences(true);
  }, [fetchReferences]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleChange = (payload: { eventType?: string; new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => {
      const incomingPlatform =
        (payload.new?.platform as string | undefined) ??
        (payload.old?.platform as string | undefined) ??
        null;
      if (incomingPlatform && incomingPlatform !== contentPlatform) {
        return;
      }
      if (payload.eventType === 'DELETE' && suppressedReferenceRealtimeEventsRef.current > 0) {
        suppressedReferenceRealtimeEventsRef.current -= 1;
        return;
      }
      scheduleReferenceAutoRefresh();
    };

    const channel = supabase
      .channel(`viral-reference-feed-${contentPlatform}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'viral_reference_items' },
        handleChange,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'viral_reference_items' },
        handleChange,
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'viral_reference_items' },
        handleChange,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contentPlatform, scheduleReferenceAutoRefresh]);

  useEffect(() => {
    fetchCreators(true);
  }, [fetchCreators]);

  useEffect(() => {
    if (!selectedCreatorId) return;
    loadCreatorReferences(true);
  }, [selectedCreatorId, loadCreatorReferences]);

  const handleScriptCreated = (script?: ScriptFormSuccessPayload) => {
    setIsModalOpen(false);
    setEditingScript(null);
    if (!script) return;
    setScripts((prev) => {
      const createdAt =
        typeof script.createdAt === "string"
          ? script.createdAt
          : (script.createdAt ? String(script.createdAt) : new Date().toISOString());
      const normalized: Script = {
        id: script.id,
        title: script.title,
        videoUrl: script.videoUrl,
        breakdown: script.breakdown ?? null,
        status: script.status,
        progress: script.progress ?? 0,
        error: script.error ?? null,
        blueprint: script.blueprint ?? null,
        createdAt,
      };
      const index = prev.findIndex((item) => item.id === normalized.id);
      if (index === -1) {
        return [normalized, ...prev];
      }
      const next = [...prev];
      next[index] = { ...next[index], ...normalized };
      return next;
    });
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setScriptToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!scriptToDelete) return;

    try {
        await deleteScript(scriptToDelete);
        toast.success(t.common.success, {
            icon: '✅',
            duration: 2000,
            style: {
                borderRadius: '10px',
                background: '#f0fdf4',
                color: '#166534',
                border: '1px solid #bbf7d0',
            },
        });
        setScripts((prev) => prev.filter((script) => script.id !== scriptToDelete));
        if (selectedReplicationScript?.id === scriptToDelete) {
          setSelectedReplicationScript(null);
        }
    } catch (error) {
        console.error(error);
        toast.error(t.common.error);
    }
  };

  const toggleReferenceSelection = useCallback((id: string) => {
    setSelectedReferenceIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id],
    );
  }, []);
  const handleToggleSelectAllReferences = useCallback(() => {
    setSelectedReferenceIds((prev) => {
      if (filteredReferenceItems.length === 0) {
        return prev;
      }
      const visibleIds = filteredReferenceItems.map((item) => item.id);
      const isAllSelected = visibleIds.every((id) => prev.includes(id));
      if (isAllSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }, [filteredReferenceItems]);

  const toggleCreatorSelection = useCallback((id: string) => {
    setSelectedCreatorIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id],
    );
  }, []);

  const handleToggleReferenceSelectionMode = useCallback(() => {
    setReferenceSelectionMode((prev) => {
      if (prev) {
        setSelectedReferenceIds([]);
      }
      return !prev;
    });
  }, []);

  const handleReferenceOpen = useCallback((item: ViralReferenceItemData) => {
    if (typeof window === "undefined") return;
    if (item.sourceUrl) {
      window.open(item.sourceUrl, "_blank", "noreferrer");
    } else {
      toast.error(scriptUi.referenceNoViewLink);
    }
  }, [scriptUi.referenceNoViewLink]);

  const handleQuickDeleteReference = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        const res = await fetch("/api/viral-references", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          credentials: "include",
          body: JSON.stringify({ ids: [id] }),
        });
        const payload = await parseJsonSafely<any>(res);
        if (!res.ok) {
          throw new Error(payload?.error || `Failed to delete reference (${res.status})`);
        }
        setReferenceItems((prev) => prev.filter((item) => item.id !== id));
        toast.success(scriptUi.deletedReferenceOne);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t.common.error);
      }
    },
    [scriptUi.deletedReferenceOne, t.common.error],
  );

  const handleToggleCreatorSelectionMode = useCallback(() => {
    setCreatorSelectionMode((prev) => {
      if (prev) {
        setSelectedCreatorIds([]);
      }
      return !prev;
    });
  }, []);

  const handleDeleteSelectedReferences = useCallback(async () => {
    if (selectedReferenceIds.length === 0) return;
    setReferenceDeleting(true);
    try {
      const res = await fetch('/api/viral-references', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        credentials: 'include',
        body: JSON.stringify({ ids: selectedReferenceIds }),
      });
      const payload = await parseJsonSafely<any>(res);
      if (!res.ok) {
        const message = payload?.error || `Failed to delete references (${res.status})`;
        throw new Error(message);
      }
      setReferenceItems((prev) => prev.filter((item) => !selectedReferenceIds.includes(item.id)));
      setSelectedReferenceIds([]);
      setReferenceSelectionMode(false);
      suppressedReferenceRealtimeEventsRef.current += selectedReferenceIds.length;
      await fetchReferences(true);
      toast.success(deletedReferencesMessage(payload?.deleted ?? selectedReferenceIds.length));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.error);
    } finally {
      setReferenceDeleting(false);
    }
  }, [deletedReferencesMessage, selectedReferenceIds, t.common.error, fetchReferences]);

  const closeCreatorModal = useCallback(() => {
    setSelectedCreator(null);
    setCreatorNotes([]);
    setCreatorNotesError(null);
    setCreatorNotesHasMore(false);
    setCreatorNotesLoading(false);
    setCreatorSyncing(false);
    creatorNotesCursorRef.current = null;
  }, []);

  const handleDeleteSelectedCreators = useCallback(async () => {
    if (selectedCreatorIds.length === 0) return;
    setCreatorDeleting(true);
    try {
      const res = await fetch('/api/viral-creators', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        credentials: 'include',
        body: JSON.stringify({ ids: selectedCreatorIds }),
      });
      const payload = await parseJsonSafely<any>(res);
      if (!res.ok) {
        const message = payload?.error || `Failed to delete creators (${res.status})`;
        throw new Error(message);
      }
      setCreatorItems((prev) => prev.filter((creator) => !selectedCreatorIds.includes(creator.id)));
      if (selectedCreator && selectedCreatorIds.includes(selectedCreator.id)) {
        closeCreatorModal();
      }
      setSelectedCreatorIds([]);
      setCreatorSelectionMode(false);
      toast.success(deletedCreatorsMessage(payload?.deleted ?? selectedCreatorIds.length));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.error);
    } finally {
      setCreatorDeleting(false);
    }
  }, [deletedCreatorsMessage, selectedCreatorIds, selectedCreator, closeCreatorModal, t.common.error]);

  const handleCreatorCardClick = useCallback((creator: ViralCreatorData) => {
    if (creatorSelectionMode) {
      toggleCreatorSelection(creator.id);
      return;
    }
    setSelectedCreator(creator);
    setCreatorNotes([]);
    setCreatorNotesError(null);
    setCreatorNotesHasMore(false);
    setCreatorNotesLoading(false);
    setCreatorSyncing(false);
    creatorNotesCursorRef.current = null;
  }, [creatorSelectionMode, toggleCreatorSelection]);

  const handleSyncCreator = useCallback(async () => {
    const normalizedId =
      typeof selectedCreatorId === "number"
        ? String(selectedCreatorId)
        : (selectedCreatorId ?? "").trim();

    if (!normalizedId) {
      toast.error(scriptUi.missingCreatorId);
      return;
    }

    // 打开最新一条笔记，插件自动选中单篇采集
    const latestNote = creatorNotes[0];
    const targetUrl = latestNote?.sourceUrl || selectedCreator?.profileUrl;
    if (!targetUrl) {
      toast.error(scriptUi.creatorNoLinkToCollect);
      return;
    }
    const mode = latestNote?.sourceUrl ? "single" : "blogger";
    const opened = openAutoCollectWindow(targetUrl, mode, normalizedId);
    if (opened) {
      toast.success(scriptUi.openedSyncAssistant);
    } else {
      return;
    }

    setCreatorSyncing(true);
    try {
      const res = await fetch(`/api/viral-creators/${encodeURIComponent(normalizedId)}/sync`, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creatorId: normalizedId }),
      });
      const payload = await parseJsonSafely<any>(res);
      if (!res.ok) {
        const message =
          payload?.error || `Failed to sync creator (${res.status})`;
        throw new Error(message);
      }
      toast.success(
        (language === "zh" ? payload?.message : null) ||
          `${selectedCreator?.displayName || selectedCreator?.creatorHandle || scriptUi.creatorTitleFallback}${scriptUi.creatorSyncingSuffix}`,
      );
      await loadCreatorReferences(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.error);
    } finally {
      setCreatorSyncing(false);
    }
  }, [
    creatorNotes,
    language,
    loadCreatorReferences,
    openAutoCollectWindow,
    scriptUi.creatorNoLinkToCollect,
    scriptUi.creatorSyncingSuffix,
    scriptUi.creatorTitleFallback,
    scriptUi.missingCreatorId,
    scriptUi.openedSyncAssistant,
    selectedCreator,
    selectedCreatorId,
    t.common.error,
  ]);

  if (!mounted) {
    return null; // Or a loading spinner
  }

  const uploadNewReplicationVideo = async (file: File) => {
    setNewReplicationUploading(true);
    setSelectedReplicationScript(null);
    const toastId = toast.loading(scriptUi.creatingUploadToast);

    const finalize = () => {
      setNewReplicationUploading(false);
      toast.dismiss(toastId);
    };

    const createScriptRecord = async (videoUrl: string) => {
      toast.loading(scriptUi.creatingScriptToast, { id: toastId });
      const titleBase = file.name?.replace(/\.[^.]+$/, '') || scriptUi.newReplicationScriptTitle;
      try {
        const res = await fetch('/api/scripts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: titleBase,
            videoUrl,
            scriptPurpose: 'storyboard',
            description: '',
            skipBreakdown: true,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((language === "zh" ? payload?.error : null) || `${scriptUi.createScriptFailed} (${res.status})`);
        }
        const scriptId = payload.data?.scriptId;
        if (!scriptId) throw new Error(scriptUi.missingScriptId);
        const nextScript: Script = {
          id: scriptId,
          title: payload.data?.title || titleBase,
          videoUrl,
          blueprint: null,
          breakdown: null,
          progress: 0,
          error: null,
          createdAt: new Date().toISOString(),
        };
        setScripts((prev) => {
          if (prev.some((script) => script.id === nextScript.id)) return prev;
          return [nextScript, ...prev];
        });
        setSelectedReplicationScript(nextScript);
        setNewReplicationUploadedUrl(videoUrl);
        setReplicationViewTab('storyboard');
        setAnalysisTab('replication');
        toast.success(scriptUi.scriptCreated, { id: toastId });
      } catch (creationErr: any) {
        toast.error(creationErr.message || scriptUi.createScriptFailed, { id: toastId });
        throw creationErr;
      }
    };

    try {
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      if (presignRes.ok) {
        const { uploadUrl, publicUrl } = await presignRes.json();
        const up = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!up.ok) throw new Error(`${scriptUi.uploadFailed} (${up.status})`);
        await createScriptRecord(publicUrl);
        return;
      }
      const presignErr = await presignRes.json().catch(() => ({}));
      console.warn('[upload] presign unavailable, falling back to server upload:', presignErr.error);
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await fetch('/api/upload/video', { method: 'POST', body: fd });
      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error((language === "zh" ? errData?.error : null) || `${scriptUi.uploadFailed} (${uploadRes.status})`);
      }
      const { url } = await uploadRes.json();
      await createScriptRecord(url);
    } catch (err: any) {
      toast.error(err.message || scriptUi.uploadFailed, { id: toastId });
    } finally {
      finalize();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 font-sans">
      <div className="flex justify-between items-center mb-6">
        {/* Tab Navigation */}
        <div className="flex gap-6 sm:gap-8 border-b border-transparent items-end">
            <button
                onClick={() => setActiveTab('my-templates')}
                className={cn(
                    "font-semibold pb-2 transition-all duration-300 ease-in-out relative whitespace-nowrap tracking-tight",
                    activeTab === 'my-templates' 
                        ? "text-xl sm:text-2xl text-gray-900 dark:text-white" 
                        : "text-base sm:text-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                )}
            >
                {t.scripts.myTemplates}
                {activeTab === 'my-templates' && (
                    <motion.div
                        layoutId="script-tab-underline"
                        className="absolute bottom-0 left-0 w-full h-1 bg-black dark:bg-white rounded-full"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                )}
            </button>
            <button
                onClick={() => setActiveTab('viral-content')}
                className={cn(
                    "font-semibold pb-2 transition-all duration-300 ease-in-out relative whitespace-nowrap tracking-tight",
                    activeTab === 'viral-content' 
                        ? "text-xl sm:text-2xl text-gray-900 dark:text-white" 
                        : "text-base sm:text-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                )}
            >
                {t.scripts.viralTemplates || "Viral Templates"}
                {activeTab === 'viral-content' && (
                    <motion.div
                        layoutId="script-tab-underline"
                        className="absolute bottom-0 left-0 w-full h-1 bg-black dark:bg-white rounded-full"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                )}
            </button>
            <button
                onClick={() => setActiveTab('creators')}
                className={cn(
                    "font-semibold pb-2 transition-all duration-300 ease-in-out relative whitespace-nowrap tracking-tight",
                    activeTab === 'creators' 
                        ? "text-xl sm:text-2xl text-gray-900 dark:text-white" 
                        : "text-base sm:text-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                )}
            >
                {t.scripts?.creatorBenchmarks || "Creator Benchmarks"}
                {activeTab === 'creators' && (
                    <motion.div
                        layoutId="script-tab-underline"
                        className="absolute bottom-0 left-0 w-full h-1 bg-black dark:bg-white rounded-full"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                )}
            </button>
        </div>

        <AddButton
          label={scriptUi.newReplication}
          ariaLabel={scriptUi.newReplication}
          hideLabelOnMobile
          className="px-3 py-2 sm:px-5 sm:py-2.5 rounded-full"
          onClick={() => {
            setSelectedReplicationScript(null);
            setNewReplicationUploadedUrl('');
            setIsReplicationModalOpen(true);
          }}
        />
      </div>

      {activeTab === 'my-templates' && (
        // My Templates View
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {scripts.map((script) => (
            <div 
                key={script.id} 
                onClick={() => {
                    setSelectedReplicationScript(script);
                    setIsReplicationModalOpen(true);
                }}
                onMouseEnter={(e) => {
                    const video = e.currentTarget.querySelector('video');
                    if (video) {
                        video.play().catch(() => {});
                    }
                }}
                onMouseLeave={(e) => {
                    const video = e.currentTarget.querySelector('video');
                    if (video) {
                        video.pause();
                        video.currentTime = 0;
                    }
                }}
                className="group relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer shadow-sm hover:shadow-lg transition-all duration-300"
            >
                {/* Status Overlay for Pending Scripts */}
                {script.status && script.status !== 'completed' && (
                    <ScriptStatusBadge 
                        status={script.status} 
                        progress={script.progress || 0} 
                        scriptId={script.id}
                        error={script.error ?? undefined}
                        compact
                    />
                )}

                {/* Background Video/Image */}
                <div className="absolute inset-0">
                    {script.videoUrl ? (
                    <video
                        src={toProxyUrl(script.videoUrl, (script.title || 'video') + '.mp4')}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        muted
                        loop
                        playsInline
                        preload="metadata"
                    />
                    ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800">
                        <PlayCircle size={32} />
                        <span className="text-xs mt-2">{scriptUi.noVideo}</span>
                    </div>
                    )}
                </div>

                {/* Overlay Gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />

                {/* Bottom Content */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                    <h3 className="font-bold text-white text-sm line-clamp-2 mb-2 leading-tight drop-shadow-md" title={script.title}>
                        {script.title}
                    </h3>
                    
                    <div className="flex items-center justify-between text-[10px] text-gray-300">
                        <span suppressHydrationWarning>{new Date(script.createdAt).toLocaleDateString()}</span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEditingScript(script);
                                    setIsModalOpen(true);
                                }}
                                className="text-gray-300 hover:text-white p-1.5 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
                                title={t.common.edit}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 00 2 2h11a2 2 0 00 2-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            </button>
                            <button
                                onClick={(e) => handleDeleteClick(e, script.id)}
                                className="text-gray-300 hover:text-red-400 p-1.5 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
                                title={t.common.delete}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>
        </div>
            ))}
            
            {scripts.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  icon={<ScrollText className="h-6 w-6" />}
                  title={t.scripts.noScripts}
                  description={t.scripts.emptyDescription}
                  action={{
                    label: t.scripts.createFirst,
                    onClick: () => {
                      setEditingScript(null);
                      setIsModalOpen(true);
                    },
                  }}
                />
              </div>
            )}
        </div>
      )}

      {activeTab === 'viral-content' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            {VIRAL_PLATFORMS.map((platform) => (
              <button
                key={platform.id}
                onClick={() => {
                  setContentPlatform(platform.id);
                  referenceCursorRef.current = null;
                }}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-colors border",
                  contentPlatform === platform.id
                    ? "bg-black text-white border-black dark:bg-white dark:text-black"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
              >
                {getPlatformLabel(platform.id, language)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                value={referenceQuery}
                onChange={(e) => setReferenceQuery(e.target.value)}
                placeholder={t.common.search || scriptUi.referenceSearchPlaceholder}
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div className="flex items-center rounded-full border border-gray-200 dark:border-gray-700 overflow-hidden">
              {(["grid", "list"] as ReferenceViewMode[]).map((mode) => {
                const Icon = mode === "grid" ? LayoutGrid : ListIcon;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setReferenceViewMode(mode)}
                    className={cn(
                      "px-2.5 py-2 text-sm font-semibold transition-colors flex items-center gap-1",
                      referenceViewMode === mode
                        ? "bg-black text-white dark:bg-white dark:text-black"
                        : "text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {mode === "grid" ? scriptUi.viewModeGrid : scriptUi.viewModeList}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => fetchReferences(true)}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-black text-white dark:bg-white dark:text-black"
            >
              {t.common.refresh || scriptUi.refreshList}
            </button>
            <button
              type="button"
              onClick={() => collectorModeEnabled && setIsCollectorModalOpen(true)}
              disabled={!collectorModeEnabled}
              className={cn(
                "px-4 py-2 text-sm font-semibold rounded-lg border",
                collectorModeEnabled
                  ? "border-black text-black dark:border-white dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
                  : "border-dashed border-gray-300 text-gray-400 cursor-not-allowed",
              )}
            >
              {scriptUi.collectData}
            </button>
            <button
              type="button"
              onClick={handleToggleReferenceSelectionMode}
              className={cn(
                "px-4 py-2 text-sm font-semibold rounded-lg border",
                referenceSelectionMode
                  ? "border-black text-black dark:border-white dark:text-white"
                  : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              )}
            >
              {referenceSelectionMode ? scriptUi.batchCancel : scriptUi.batchSelect}
            </button>
            {referenceSelectionMode && (
              <button
                type="button"
                onClick={handleToggleSelectAllReferences}
                disabled={filteredReferenceItems.length === 0}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-lg border transition-colors",
                  allVisibleReferencesSelected
                    ? "border-primary text-primary bg-primary/10"
                    : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800",
                )}
              >
                {allVisibleReferencesSelected ? scriptUi.deselectPage : scriptUi.selectPage}
              </button>
            )}
            {referenceSelectionMode && (
              <button
                type="button"
                onClick={handleDeleteSelectedReferences}
                disabled={selectedReferenceIds.length === 0 || referenceDeleting}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {referenceDeleting ? scriptUi.deleting : `${scriptUi.deleteAction}(${selectedReferenceIds.length})`}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 text-sm">
            {/* Content type filter */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-200 shrink-0">
                {contentFilterLabels.label}
              </span>
              <div className="flex items-center gap-1.5">
                {REFERENCE_CONTENT_FILTERS.map((filterKey) => (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setReferenceContentFilter(filterKey)}
                    className={cn(
                      "px-3 py-1.5 rounded-full border transition-colors",
                      referenceContentFilter === filterKey
                        ? "bg-black text-white border-black dark:bg-white dark:text-black"
                        : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800",
                    )}
                  >
                    {filterKey === "all"
                      ? contentFilterLabels.all
                      : filterKey === "video"
                        ? contentFilterLabels.video
                        : contentFilterLabels.image}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort buttons */}
            <div className="flex items-center gap-1.5">
              {(
                [
                  { value: "recent", label: scriptUi.sortLabels.recent },
                  { value: "likes", label: scriptUi.sortLabels.likes },
                  { value: "collects", label: scriptUi.sortLabels.collects },
                  { value: "comments", label: scriptUi.sortLabels.comments },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setReferenceSort(value)}
                  className={cn(
                    "px-3 py-1.5 rounded-full border transition-colors",
                    referenceSort === value
                      ? "bg-black text-white border-black dark:bg-white dark:text-black"
                      : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {referenceError && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/40 px-3 py-2 rounded-lg">
              {referenceError}
            </div>
          )}

          {referenceViewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {filteredReferenceItems.map((item) => {
                const isSelected = selectedReferenceIds.includes(item.id);
                const isTiktokItem = item.platform === 'tiktok';
                const rawCoverUrl = getReferenceCoverImage(item) ?? REFERENCE_PLACEHOLDER_IMAGE;
                const displayVideoUrl = getReferenceVideoUrl(item);
                const proxiedPosterUrl = !isTiktokItem ? toProxyImgUrl(rawCoverUrl) : undefined;
                const proxiedVideoUrl = displayVideoUrl ? toProxyMediaUrl(displayVideoUrl) : null;
                const fallbackImageSrc = !isTiktokItem ? (proxiedPosterUrl ?? REFERENCE_PLACEHOLDER_IMAGE) : REFERENCE_PLACEHOLDER_IMAGE;
                const scriptPreview = (item.scriptText ?? "").trim();
                const hasScriptPreview = scriptPreview.length > 0;
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (referenceSelectionMode) {
                        toggleReferenceSelection(item.id);
                        return;
                      }
                      setSelectedReferenceItem(item);
                      setIsReferenceModalOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (referenceSelectionMode) {
                          toggleReferenceSelection(item.id);
                        } else {
                          setSelectedReferenceItem(item);
                          setIsReferenceModalOpen(true);
                        }
                      }
                    }}
                    className={cn(
                      "group relative block w-full aspect-[2/3] sm:aspect-[3/4] rounded-2xl overflow-hidden bg-gray-950 text-white shadow hover:shadow-xl transition-all duration-300 cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                      referenceSelectionMode && isSelected && "ring-2 ring-primary/60"
                    )}
                  >
                    {referenceSelectionMode && (
                      <span
                        className="absolute top-3 right-3 z-30 inline-flex items-center justify-center rounded-full bg-black/60 p-1 text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleReferenceSelection(item.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleReferenceSelection(item.id);
                          }
                        }}
                      >
                        {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      </span>
                    )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10" />
                  {proxiedVideoUrl ? (
                    activeVideoIds.has(item.id) ? (
                      <video
                        src={proxiedVideoUrl}
                        poster={proxiedPosterUrl}
                        muted
                        autoPlay
                        loop
                        playsInline
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                    ) : (
                      <>
                        <img
                          src={proxiedPosterUrl ?? REFERENCE_PLACEHOLDER_IMAGE}
                          alt={item.title || 'reference'}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveVideoIds((prev) => new Set(prev).add(item.id));
                          }}
                          className="absolute inset-0 z-20 flex items-center justify-center"
                          aria-label={scriptUi.playVideo}
                        >
                          <span className="flex items-center justify-center w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 ml-0.5"><path d="M8 5v14l11-7z"/></svg>
                          </span>
                        </button>
                      </>
                    )
                  ) : (
                    <img
                      src={fallbackImageSrc}
                      alt={item.title || 'reference'}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  )}
                  <div className="absolute top-3 left-3 z-20 flex gap-2">
                    <span className="px-2 py-1 text-[10px] uppercase font-bold tracking-widest rounded-full bg-white/90 text-gray-900">
                      {getPlatformLabel(item.platform, language)}
                    </span>
                    <span className="px-2 py-1 text-[10px] rounded-full bg-black/70 text-white shadow">
                      {getReferenceContentLabel(item, language)}
                    </span>
                    {item.category && (
                      <span className="px-2 py-1 text-[10px] rounded-full bg-black/60 backdrop-blur text-white border border-white/10">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 z-20 p-3 sm:p-4 space-y-2">
                    <p className="text-xs sm:text-sm font-semibold line-clamp-2 leading-tight">
                      {item.title || item.description || scriptUi.referenceUntitled}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] sm:text-[11px] uppercase tracking-wide text-white/80">
                      {item.stats?.likes != null && (
                        <span className="flex items-center gap-1">
                          ❤️ {formatCount(item.stats.likes as number | string)}
                        </span>
                      )}
                      {item.stats?.collects != null && (
                        <span className="flex items-center gap-1">
                          ⭐️ {formatCount(item.stats.collects as number | string)}
                        </span>
                      )}
                      {item.stats?.comments != null && (
                        <span className="flex items-center gap-1">
                          💬 {formatCount(item.stats.comments as number | string)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[9px] sm:text-[10px] text-white/70">
                      <span>{item.creator?.displayName || item.creator?.creatorHandle || scriptUi.referenceUnknownAuthor}</span>
                      <span>{formatDateLabel(item.publishedAt, uiDateLocale)}</span>
                    </div>
                  </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReferenceItems.map((item) => {
                const isSelected = selectedReferenceIds.includes(item.id);
                const isTiktokItem = item.platform === 'tiktok';
                const rawCoverUrl = getReferenceCoverImage(item) ?? REFERENCE_PLACEHOLDER_IMAGE;
                const displayVideoUrl = getReferenceVideoUrl(item);
                const proxiedPosterUrl = !isTiktokItem ? toProxyImgUrl(rawCoverUrl) : undefined;
                const proxiedVideoUrl = displayVideoUrl ? toProxyMediaUrl(displayVideoUrl) : null;
                const fallbackImageSrc = !isTiktokItem ? (proxiedPosterUrl ?? REFERENCE_PLACEHOLDER_IMAGE) : REFERENCE_PLACEHOLDER_IMAGE;
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (referenceSelectionMode) {
                        toggleReferenceSelection(item.id);
                        return;
                      }
                      setSelectedReferenceItem(item);
                      setIsReferenceModalOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (referenceSelectionMode) {
                          toggleReferenceSelection(item.id);
                        } else {
                          setSelectedReferenceItem(item);
                          setIsReferenceModalOpen(true);
                        }
                      }
                    }}
                    className={cn(
                      "w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 shadow-sm hover:shadow-md transition-shadow px-4 py-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                      referenceSelectionMode && isSelected && "ring-2 ring-primary/60"
                    )}
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
                      <div className="flex flex-1 items-center gap-4">
                        {referenceSelectionMode && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleReferenceSelection(item.id);
                            }}
                            className="text-primary"
                          >
                            {isSelected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                          </button>
                        )}
                        {proxiedVideoUrl ? (
                          activeVideoIds.has(item.id) ? (
                            <video
                              src={proxiedVideoUrl}
                              poster={proxiedPosterUrl}
                              muted
                              autoPlay
                              loop
                              playsInline
                              className="w-28 h-16 rounded-xl object-cover flex-shrink-0 border border-gray-100 dark:border-gray-800"
                            />
                          ) : (
                            <div className="relative w-28 h-16 flex-shrink-0">
                              <img
                                src={proxiedPosterUrl ?? REFERENCE_PLACEHOLDER_IMAGE}
                                alt={item.title || 'reference'}
                                loading="lazy"
                                className="w-full h-full rounded-xl object-cover border border-gray-100 dark:border-gray-800"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveVideoIds((prev) => new Set(prev).add(item.id));
                                }}
                                className="absolute inset-0 flex items-center justify-center rounded-xl"
                                aria-label={scriptUi.playVideo}
                              >
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm text-white">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 ml-0.5"><path d="M8 5v14l11-7z"/></svg>
                                </span>
                              </button>
                            </div>
                          )
                        ) : (
                          <img
                            src={fallbackImageSrc}
                            alt={item.title || "reference"}
                            loading="lazy"
                            className="w-28 h-16 rounded-xl object-cover flex-shrink-0 border border-gray-100 dark:border-gray-800"
                          />
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 text-[11px] uppercase text-gray-500 dark:text-gray-400">
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                              {getPlatformLabel(item.platform, language)}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-black/80 text-white text-[10px]">
                              {getReferenceContentLabel(item, language)}
                            </span>
                            {item.category && (
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300">
                                {item.category}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
                            {item.title || item.description || scriptUi.referenceUntitled}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span>{item.creator?.displayName || item.creator?.creatorHandle || scriptUi.referenceUnknownAuthor}</span>
                            <span>{formatDateLabel(item.publishedAt, uiDateLocale)}</span>
                          </div>
                        </div>
                        <div className="hidden lg:flex flex-col items-end gap-1 text-xs text-gray-600 dark:text-gray-300">
                          {item.stats?.likes != null && (
                            <span>❤️ {formatCount(item.stats.likes as number | string)}</span>
                          )}
                          {item.stats?.collects != null && (
                            <span>⭐️ {formatCount(item.stats.collects as number | string)}</span>
                          )}
                          {item.stats?.comments != null && (
                            <span>💬 {formatCount(item.stats.comments as number | string)}</span>
                          )}
                          {item.stats?.shares != null && (
                            <span>🔁 {formatCount(item.stats.shares as number | string)}</span>
                          )}
                        </div>
                        {!referenceSelectionMode && (
                          <div className="flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReferenceOpen(item);
                              }}
                              className="p-2 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                              title={scriptUi.directSource}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickDeleteReference(item.id);
                              }}
                              className="p-2 rounded-full border border-gray-200 dark:border-gray-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                              title={scriptUi.deleteAction}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="w-full md:w-5/12 border-t border-gray-100 dark:border-gray-800 pt-3 md:pt-0 md:border-t-0 md:border-l md:border-gray-200 dark:md:border-gray-700 md:pl-6">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                          {scriptUi.subtitleCopy}
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-100 whitespace-pre-line leading-relaxed line-clamp-5">
                          {item.scriptText?.trim() || item.description?.trim() || scriptUi.subtitleEmpty}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filteredReferenceItems.length === 0 && !referenceLoading && (
            <EmptyState
              icon={<AlertTriangle className="h-6 w-6 text-gray-400" />}
              title={scriptUi.referencesEmptyTitle}
              description={scriptUi.referencesEmptyDescription}
            />
          )}

          <div className="flex items-center justify-center">
            {referenceHasMore ? (
              <button
                type="button"
                disabled={referenceLoading}
                onClick={() => fetchReferences(false)}
                className="px-6 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                {referenceLoading ? t.common.loading : (t.common.loadMore || scriptUi.loadMore)}
              </button>
            ) : (
              <span className="text-xs text-gray-400">
                {filteredReferenceItems.length > 0 ? (t.common.noMoreData || scriptUi.noMore) : ''}
              </span>
            )}
            </div>
          </div>

      )}

      {activeTab === 'creators' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            {VIRAL_PLATFORMS.map((platform) => (
              <button
                key={platform.id}
                onClick={() => {
                  setCreatorPlatformFilter(platform.id);
                  creatorCursorRef.current = null;
                }}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-colors border",
                  creatorPlatformFilter === platform.id
                    ? "bg-black text-white border-black dark:bg-white dark:text-black"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
              >
                {getPlatformLabel(platform.id, language)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                value={creatorQuery}
                onChange={(e) => setCreatorQuery(e.target.value)}
                placeholder={scriptUi.creatorSearchPlaceholder}
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <button
              type="button"
              onClick={() => fetchCreators(true)}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-black text-white dark:bg-white dark:text-black"
            >
              {t.common.refresh || scriptUi.refreshList}
            </button>
            <button
              type="button"
              onClick={handleToggleCreatorSelectionMode}
              className={cn(
                "px-4 py-2 text-sm font-semibold rounded-lg border",
                creatorSelectionMode
                  ? "border-black text-black dark:border-white dark:text-white"
                  : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              )}
            >
              {creatorSelectionMode ? scriptUi.batchCancel : scriptUi.batchSelect}
            </button>
            {creatorSelectionMode && (
              <button
                type="button"
                onClick={handleDeleteSelectedCreators}
                disabled={selectedCreatorIds.length === 0 || creatorDeleting}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {creatorDeleting ? scriptUi.deleting : `${scriptUi.deleteAction}(${selectedCreatorIds.length})`}
              </button>
            )}
          </div>

          {creatorError && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/40 px-3 py-2 rounded-lg">
              {creatorError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {creatorItems.map((creator) => {
              const isSelected = selectedCreatorIds.includes(creator.id);
              return (
                <div
                  key={creator.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleCreatorCardClick(creator)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCreatorCardClick(creator);
                    }
                  }}
                  className={cn(
                    "rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/70 p-4 flex flex-col gap-3 shadow-sm outline-none transition-shadow relative",
                    "cursor-pointer hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary/50",
                    selectedCreator?.id === creator.id ? "ring-2 ring-primary/60 shadow-lg" : "",
                    creatorSelectionMode && isSelected ? "ring-2 ring-primary/60 shadow-lg" : ""
                  )}
                >
                  {creatorSelectionMode && (
                    <span
                      className="absolute top-3 right-3 z-20 inline-flex items-center justify-center rounded-full bg-black/60 p-1 text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCreatorSelection(creator.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleCreatorSelection(creator.id);
                        }
                      }}
                    >
                      {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </span>
                  )}
                <div className="flex items-center gap-3">
                  {creator.avatarUrl ? (
                    <img src={toProxyImgUrl(creator.avatarUrl)} alt={creator.displayName || creator.creatorHandle || 'creator'} className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-500">
                      {(creator.displayName || creator.creatorHandle || '?').slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{creator.displayName || creator.creatorHandle || scriptUi.creatorUnnamed}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{getPlatformLabel(creator.platform, language)}</p>
                  </div>
                  {creator.profileUrl && (
                    <a
                      href={creator.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-xs text-primary underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t.common.view || scriptUi.view}
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-300">
                  <span>{scriptUi.creatorStatsFans} {formatCount(creator.stats?.fans)}</span>
                  <span>{scriptUi.creatorStatsLikes} {formatCount(creator.stats?.likes)}</span>
                  <span>{scriptUi.creatorStatsWorks} {formatCount(creator.referenceCount)}</span>
                  </div>
                  {creator.recentReference && (
                    <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                      <div className="relative">
                        <img
                        src={toProxyImgUrl(getReferenceCoverImage(creator.recentReference) || REFERENCE_PLACEHOLDER_IMAGE)}
                        alt={creator.recentReference.title || 'reference'}
                        className="w-full h-36 object-cover"
                      />
                      <span className="absolute top-2 left-2 px-2 py-1 text-[10px] rounded-full bg-black/70 text-white">
                        {getReferenceContentLabel(creator.recentReference, language)}
                      </span>
                    </div>
                    <div className="p-3 space-y-1">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white line-clamp-2">
                        {creator.recentReference.title || creator.recentReference.description || scriptUi.latestContent}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {formatDateLabel(creator.recentReference.publishedAt, uiDateLocale)}
                      </p>
                    </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {creatorItems.length === 0 && !creatorLoading && (
            <EmptyState
              icon={<User className="h-6 w-6 text-gray-400" />}
              title={scriptUi.creatorsEmptyTitle}
              description={scriptUi.creatorsEmptyDescription}
            />
          )}

          <div className="flex items-center justify-center">
            {creatorHasMore ? (
              <button
                type="button"
                disabled={creatorLoading}
                onClick={() => fetchCreators(false)}
                className="px-6 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                {creatorLoading ? t.common.loading : (t.common.loadMore || scriptUi.loadMore)}
              </button>
            ) : (
              <span className="text-xs text-gray-400">
                {creatorItems.length > 0 ? (t.common.noMoreData || scriptUi.noMore) : ''}
              </span>
            )}
          </div>
        </div>
      )}

      <Modal
        isOpen={Boolean(selectedCreator)}
        onClose={closeCreatorModal}
        title={
          selectedCreator
            ? `${selectedCreator.displayName || selectedCreator.creatorHandle || scriptUi.creatorTitleFallback} · ${getPlatformLabel(selectedCreator.platform, language)}`
            : scriptUi.creatorDetailTitle
        }
        maxWidth="max-w-5xl"
      >
        {selectedCreator && (
          <div className="space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                {selectedCreator.avatarUrl ? (
                  <img
                    src={toProxyImgUrl(selectedCreator.avatarUrl)}
                    alt={selectedCreator.displayName || selectedCreator.creatorHandle || 'creator'}
                    className="w-16 h-16 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-lg font-bold text-gray-500">
                    {(selectedCreator.displayName || selectedCreator.creatorHandle || '?').slice(0, 1)}
                  </div>
                )}
                <div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {selectedCreator.displayName || selectedCreator.creatorHandle || scriptUi.creatorUnnamed}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {getPlatformLabel(selectedCreator.platform, language)}
                    {selectedCreator.creatorHandle ? ` · @${selectedCreator.creatorHandle}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{scriptUi.creatorStatsFans}</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCount(selectedCreator.stats?.fans)}</p>
                </div>
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{scriptUi.creatorStatsLikes}</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCount(selectedCreator.stats?.likes)}</p>
                </div>
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{scriptUi.creatorStatsWorks}</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCount(selectedCreator.referenceCount)}</p>
                </div>
                {selectedCreator.profileUrl && (
                  <a
                    href={selectedCreator.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    {t.common.view || scriptUi.viewProfile}
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleSyncCreator}
                  disabled={!selectedCreatorId || creatorSyncing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black text-sm font-semibold disabled:opacity-60"
                >
                  {creatorSyncing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {scriptUi.syncing}
                    </>
                  ) : (
                    <>
                      <RefreshCcw className="h-4 w-4" />
                      {scriptUi.syncLatestNotes}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => loadCreatorReferences(true)}
                  disabled={creatorNotesLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
                >
                  <RefreshCcw className="h-4 w-4" />
                  {creatorNotesLoading ? (t.common.loading || scriptUi.loadingFallback) : (t.common.refresh || scriptUi.refreshList)}
                </button>
              </div>
            </div>

            {creatorNotesError && (
              <div className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/40 px-3 py-2 rounded-lg">
                {creatorNotesError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{scriptUi.collectNotes}</p>
              <div className="inline-flex bg-gray-100 dark:bg-gray-800/70 rounded-full p-1 text-xs font-semibold text-gray-500 dark:text-gray-300">
                {[
                  { id: "recent" as const, label: scriptUi.sortByPublishTime },
                  { id: "likes" as const, label: scriptUi.sortByLikes },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCreatorNotesSort(option.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-full transition-colors",
                      creatorNotesSort === option.id
                        ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow"
                        : "text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {creatorNotesLoading && creatorNotes.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                {t.common.loading || scriptUi.loadingFallback}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {creatorNotes.map((note) => {
                    const publishedLabel =
                      formatDateLabel(note.publishedAt, uiDateLocale) || scriptUi.unknownDate;
                    return (
                      <div
                        key={note.id}
                        className="group rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900/70 shadow-sm hover:shadow-lg transition-shadow"
                      >
                        <div className="relative">
                          <img
                            src={toProxyImgUrl(getReferenceCoverImage(note) || REFERENCE_PLACEHOLDER_IMAGE)}
                            alt={note.title || "note"}
                            className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <span className="absolute top-3 right-3 px-2 py-1 text-[10px] rounded-full bg-black/70 text-white">
                            {publishedLabel}
                          </span>
                        </div>
                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
                              {note.title || note.description || scriptUi.referenceUntitled}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3">
                            {note.description || scriptUi.noteNoDescription}
                          </p>
                          <div className="flex items-center gap-4 text-[11px] text-gray-500 dark:text-gray-400">
                            <span>❤️ {formatCount(note.stats?.likes as number | string | null | undefined)}</span>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleNoteAutoSync(note)}
                              className="flex-1 inline-flex items-center justify-center rounded-xl bg-black text-white text-xs font-semibold py-2 hover:bg-gray-900"
                            >
                              {scriptUi.goSync}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleNoteView(note)}
                              disabled={!note.sourceUrl}
                              className={cn(
                                "flex-1 inline-flex items-center justify-center rounded-xl border text-xs font-semibold py-2 transition-colors",
                                note.sourceUrl
                                  ? "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                                  : "border-dashed border-gray-200 text-gray-400 cursor-not-allowed",
                              )}
                            >
                              {scriptUi.goView}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {creatorNotes.length === 0 && !creatorNotesLoading && (
                  <EmptyState
                    icon={<ScrollText className="h-6 w-6 text-gray-400" />}
                    title={scriptUi.notesEmptyTitle}
                    description={scriptUi.notesEmptyDescription}
                  />
                )}
              </>
            )}

            <div className="flex items-center justify-center pt-2">
              {creatorNotesHasMore ? (
                <button
                  type="button"
                  disabled={creatorNotesLoading}
                  onClick={() => loadCreatorReferences(false)}
                  className="px-6 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  {creatorNotesLoading ? t.common.loading : (t.common.loadMore || scriptUi.loadMore)}
                </button>
              ) : creatorNotes.length > 0 ? (
                <span className="text-xs text-gray-400">
                  {t.common.noMoreData || scriptUi.noMore}
                </span>
              ) : null}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isCollectorModalOpen}
        onClose={() => {
          setIsCollectorModalOpen(false);
          setCollectorInput("");
        }}
        title={`${getPlatformLabel(contentPlatform, language)} · ${scriptUi.collectorTitle}`}
        maxWidth="max-w-xl"
      >
        {collectorModeEnabled ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {collectorModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCollectorMode(mode)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors",
                    collectorMode === mode
                      ? "bg-black text-white border-black dark:bg-white dark:text-black"
                      : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300",
                  )}
                >
                  {scriptUi.collectorModeLabels[mode]}
                </button>
              ))}
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2 block">
                {collectorMode === "keyword" ? scriptUi.collectorKeywordList : scriptUi.collectorLinkList}
              </label>
              <textarea
                value={collectorInput}
                onChange={(e) => setCollectorInput(e.target.value)}
                placeholder={collectorPlaceholder}
                className="w-full h-32 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white p-3 focus:ring-2 focus:ring-primary outline-none resize-none"
              />
            </div>
            {collectorMode === "keyword" && (
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {scriptUi.collectorPerKeyword}
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={collectorLimit}
                  onChange={(e) => setCollectorLimit(e.target.value)}
                  className="w-24 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {scriptUi.collectorHint}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCollectorModalOpen(false);
                  setCollectorInput("");
                }}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {scriptUi.cancel}
              </button>
              <button
                type="button"
                onClick={handleCollectorSubmit}
                disabled={collectorSubmitting}
                className="px-4 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black text-sm font-semibold disabled:opacity-60"
              >
                {collectorSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {scriptUi.submitting}
                  </span>
                ) : (
                  scriptUi.submit
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            {scriptUi.collectorUnsupported}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
            setIsModalOpen(false);
            setEditingScript(null);
        }}
        title={editingScript ? t.scripts.editTitle : t.scripts.formTitle}
      >
        <ScriptForm 
            onSuccess={handleScriptCreated} 
            initialData={editingScript || undefined}
            key={editingScript?.id || 'new'}
            assistantLayout="floating"
            showAssistant={false}
        />
      </Modal>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
            setIsDeleteModalOpen(false);
            setScriptToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title={t.common.delete}
        message={t.common.confirmDelete}
      />

      <Modal
        isOpen={isReplicationModalOpen}
        onClose={() => {
            setIsReplicationModalOpen(false);
            setSelectedReplicationScript(null);
            setReplicationMode('storyboard');
            setAnalysisTab('replication');
            setNewReplicationUploadedUrl('');
            setNewReplicationDragActive(false);
        }}
        title={scriptUi.replicationTitle}
        maxWidth="max-w-4xl"
      >
        <div className="flex flex-col h-[65vh] relative">
            <ReplicationTabsHeader
              visible={Boolean(activeReplicationScript)}
              activeTab={replicationViewTab}
              onChange={setReplicationViewTab}
            />

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0 lg:pt-0">
                {/* Left: Video — 9:16 container */}
                <div className="lg:col-span-3 flex items-center justify-center min-h-0">
                    <div className="aspect-[9/16] h-full max-w-full bg-black rounded-xl overflow-hidden relative flex items-center justify-center">
                    {selectedReplicationScript?.videoUrl ? (
                        <>
                            <video
                                src={toProxyUrl(selectedReplicationScript.videoUrl, (selectedReplicationScript.title || 'video') + '.mp4')}
                                className="w-full h-full object-contain"
                                controls
                                autoPlay
                                muted
                                loop
                                playsInline
                            />
                            {selectedReplicationScript.status && selectedReplicationScript.status !== 'completed' && (
                                <div className="absolute inset-0 bg-white/90 dark:bg-gray-900/90 z-20 flex flex-col items-center justify-center">
                                    <ScriptStatusPoller
                                        scriptId={selectedReplicationScript.id}
                                        initialStatus={selectedReplicationScript.status}
                                        initialProgress={selectedReplicationScript.progress}
                                    />
                                </div>
                            )}
                        </>
                    ) : newReplicationUploadedUrl ? (
                        <video
                            src={newReplicationUploadedUrl}
                            className="w-full h-full object-contain"
                            controls
                            muted
                            playsInline
                        />
                    ) : (
                        <label
                            className={cn(
                                "flex flex-col items-center justify-center w-full h-full cursor-pointer transition-all",
                                newReplicationDragActive ? "bg-white/15 border-2 border-dashed border-yellow-400" : "hover:bg-white/5",
                                newReplicationUploading && "opacity-70 pointer-events-none"
                            )}
                            onDragOver={(e) => { e.preventDefault(); setNewReplicationDragActive(true); }}
                            onDragEnter={(e) => { e.preventDefault(); setNewReplicationDragActive(true); }}
                            onDragLeave={() => setNewReplicationDragActive(false)}
                            onDrop={async (e) => {
                                e.preventDefault();
                                setNewReplicationDragActive(false);
                                const file = e.dataTransfer.files?.[0];
                                if (!file?.type.startsWith('video/')) { toast.error(scriptUi.invalidVideoFile); return; }
                                await uploadNewReplicationVideo(file);
                            }}
                        >
                            {newReplicationUploading ? (
                                <>
                                    <Loader2 size={40} className="text-white/50 animate-spin mb-3" />
                                    <p className="text-white/60 text-sm">{scriptUi.uploadInProgress}</p>
                                </>
                            ) : (
                                <>
                                    <Upload size={40} className="text-white/40 mb-3" />
                                    <p className="text-white/80 font-medium mb-1">{scriptUi.clickOrDropUpload}</p>
                                    <p className="text-white/40 text-xs">{scriptUi.supportFormats}</p>
                                </>
                            )}
                            <input
                                type="file"
                                accept="video/*"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) await uploadNewReplicationVideo(file);
                                }}
                            />
                        </label>
                    )}
                    </div>
                </div>
                
                {/* Right: Replication Workspace */}
                <div className="flex flex-col h-full overflow-hidden lg:col-span-2">
                    {!activeReplicationScript ? (
                        <div className="flex flex-1 items-center justify-center text-gray-400 dark:text-gray-500 text-sm px-6 text-center">
                            {scriptUi.uploadFirstHint}
                        </div>
                    ) : replicationComingSoon && selectedReplicationScript ? (
                        <div className="flex flex-1 items-center justify-center px-6">
                            <EmptyState
                                className="w-full"
                                fullHeight
                                icon={<Zap className="h-6 w-6" />}
                                title={t.replication.comingSoon?.title || t.replication.title}
                                description={t.replication.comingSoon?.description}
                                action={t.replication.comingSoon?.action ? {
                                    label: t.replication.comingSoon.action,
                                    onClick: handleComingSoonRedirect,
                                } : undefined}
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            <div className="flex-1 min-h-0">
                                {replicationViewTab === 'storyboard' ? (
                                    <ReplicationForm
                                        key={activeReplicationScript.id}
                                        products={products}
                                        scripts={[activeReplicationScript]}
                                        characters={characters}
                                        preselectedScriptId={activeReplicationScript.id}
                                        mode="storyboard"
                                        onSuccess={() => {
                                            setIsReplicationModalOpen(false);
                                            setSelectedReplicationScript(null);
                                            setAnalysisTab('replication');
                                        }}
                                    />
                                ) : (
                                    <CopyRemixPanel
                                        script={selectedReplicationScript ?? activeReplicationScript}
                                        copyInsights={selectedReplicationScript ? selectedScriptInsights : null}
                                        videoUrl={activeReplicationScript.videoUrl || newReplicationUploadedUrl}
                                        isVideoUploaded={Boolean(newReplicationUploadedUrl)}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </Modal>

      {isReferenceModalOpen && (
        <ViralReferenceModal
          item={selectedReferenceItem}
          isExtracting={selectedReferenceItem ? extractingReferenceIds.has(selectedReferenceItem.id) : false}
          onClose={() => {
            setIsReferenceModalOpen(false);
            setSelectedReferenceItem(null);
          }}
          onExtractionStarted={(itemId) => {
            setExtractingReferenceIds((prev) => new Set(prev).add(itemId));
          }}
          onExtractionFailed={(itemId) => {
            setExtractingReferenceIds((prev) => {
              const next = new Set(prev);
              next.delete(itemId);
              return next;
            });
          }}
          onExtracted={(itemId, scriptText) => {
            setExtractingReferenceIds((prev) => {
              const next = new Set(prev);
              next.delete(itemId);
              return next;
            });
            setReferenceItems((prev) =>
              prev.map((it) => it.id === itemId ? { ...it, scriptText } : it)
            );
            setSelectedReferenceItem((prev) =>
              prev?.id === itemId ? { ...prev, scriptText } : prev
            );
          }}
        />
      )}
    </div>
  );
}

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function ReplicationTabsHeader({
  visible,
  activeTab,
  onChange,
}: {
  visible: boolean;
  activeTab: 'storyboard' | 'copy';
  onChange: (tab: 'storyboard' | 'copy') => void;
}) {
  const header = useModalHeader();
  const { language } = useLanguage();

  const tabLabels = useMemo(() => {
    if (language === "en") {
      return {
        storyboard: "Storyboard Clone",
        copy: "Copy Clone",
      } as const;
    }
    if (language === "zh-TW") {
      return {
        storyboard: "復刻分鏡",
        copy: "復刻口播",
      } as const;
    }
    return {
      storyboard: "复刻分镜",
      copy: "复刻口播",
    } as const;
  }, [language]);

  useEffect(() => {
    if (!header) return;
    if (!visible) {
      header.setContent(null);
      return () => header.setContent(null);
    }

    const node = (
      <div className="flex items-center justify-center gap-3">
        {[
          { id: 'storyboard' as const, label: tabLabels.storyboard },
          { id: 'copy' as const, label: tabLabels.copy },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "px-4 py-1.5 text-sm font-semibold rounded-full transition-all",
              activeTab === tab.id
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );

    header.setContent(node);
    return () => header.setContent(null);
  }, [header, visible, activeTab, onChange, tabLabels]);

  return null;
}
