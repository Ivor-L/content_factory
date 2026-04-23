'use client';

/* eslint-disable @next/next/no-img-element -- Dashboard cards render remote task thumbnails with mixed dimensions */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  User,
  Grid3x3,
  SendHorizontal,
  Sparkles,
  BookOpen,
  Check,
  ChevronRight,
  ChevronDown,
  Image as ImageIcon,
  Paperclip,
  Play,
  X,
  Folder,
  FileText,
  Loader2,
  Search,
  Plus,
  Trash2,
  Eye,
  Pencil,
  Save,
  MessageSquare,
  Settings,
  History,
} from 'lucide-react';
import Image from 'next/image';
import { toast } from 'react-hot-toast';
import { useTenant } from '@/hooks/useTenant';
import { Modal } from '@/components/Modal';
import { DigitalHumanModal } from '@/components/DigitalHumanModal';
import { QuickPosterForm, QuickGridForm } from './QuickActionForms';
import { CreativeQuickStartModal } from './CreativeQuickStart';
import { MarkdownWechatLayoutModal } from './MarkdownWechatLayoutModal';
import { MarkdownXhsLayoutModal } from './MarkdownXhsLayoutModal';
import { supabase } from '@/lib/supabaseClient';
import {
  inferAssistantProviderFromModel,
  normalizeAssistantProviderId,
} from '@/lib/assistants/provider-routing';

type Attachment = {
  id: string;
  localUrl: string;
  uploadedUrl: string | null;
  type: 'image' | 'video';
  name: string;
  uploading: boolean;
};

type ConversationSummary = {
  id: string;
  folderId?: string | null;
  model?: string | null;
  metadata?: {
    providerId?: string;
  } | null;
  skills?: string[];
};

type ConversationHistoryItem = {
  id: string;
  title?: string | null;
  folderId?: string | null;
  lastMessageAt?: string;
  _count?: {
    messages?: number;
  };
};

type AgentActionType = 'read' | 'create' | 'update' | 'delete';

type AgentAction = {
  type: AgentActionType;
  path: string;
  content?: string;
  reason?: string;
};

type AgentActionResult = {
  type: AgentActionType;
  path: string;
  ok: boolean;
  error?: string;
  fileId?: string;
};

const AGENT_AVATAR_SRC = '/logo/black-logo.png';

type ChatMessageRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  metadata?: {
    agentActions?: AgentAction[];
    thinking?: string[];
    processing?: Array<{
      text: string;
      atMs?: number;
    }> | string[];
  } | null;
};

type ProcessStage = 'context' | 'read' | 'reason' | 'compose' | 'done' | 'other';

type ProcessItem = {
  text: string;
  atMs?: number;
};

type SkillOption = {
  id: string;
  name: string;
  description?: string;
  source?: string;
  tags?: string[];
};

function getSkillBrief(input?: string) {
  const text = (input || '').replace(/\s+/g, ' ').trim();
  if (!text) return '暂无描述';
  const compact = text
    .replace(/^[-*]\s+/g, '')
    .replace(/^#{1,6}\s+/g, '')
    .trim();
  if (compact.length <= 96) return compact;
  return `${compact.slice(0, 96).trim()}…`;
}

type KnowledgeFolder = {
  id: string;
  name: string;
  description?: string | null;
  _count?: {
    files: number;
    chunks: number;
    conversations: number;
  };
};

type KnowledgeDoc = {
  id: string;
  title: string;
  status?: string;
  metadata?: Record<string, unknown> | null;
  _count?: {
    chunks: number;
  };
};

type FileTreeNode = {
  id: string;
  name: string;
  type: 'folder' | 'file';
  path: string;
  fileId?: string;
  children: FileTreeNode[];
};

type ModelOption = {
  modelId: string;
  displayName: string;
  provider?: string | null;
};

type DocViewMode = 'preview' | 'edit';
type PersistedFileTreeSelection = {
  folderId?: string | null;
  selectedDocId?: string | null;
  openTreePaths?: Record<string, boolean>;
};

const PLACEHOLDER_HINTS = [
  '帮我拆解这个爆款视频的分镜结构…',
  '帮我复刻这个爆款视频…',
  '帮我生成一套小红书图文…',
  '帮我把产品图片变成视频…',
  '帮我生成一个数字人口播视频…',
  '帮我生成一张竖版产品海报…',
];
const NEXAPI_KEY_STORAGE_KEY = 'nexapi_key';
const FILE_TREE_SELECTION_STORAGE_KEY_PREFIX = 'dashboard:file-tree-selection';
const MODEL_SELECTION_STORAGE_KEY_PREFIX = 'dashboard:model-selection';
const CHAT_REQUEST_TIMEOUT_MS = 240_000;
const MIN_FILE_TREE_WIDTH = 260;
const DEFAULT_FILE_TREE_WIDTH = MIN_FILE_TREE_WIDTH;
const MIN_DOC_PREVIEW_WIDTH = 420;
const DEFAULT_DOC_PREVIEW_WIDTH = 560;

function getFileTreeSelectionStorageKey(tenantSlug?: string | null) {
  const normalizedTenantSlug = tenantSlug?.trim().toLocaleLowerCase();
  return `${FILE_TREE_SELECTION_STORAGE_KEY_PREFIX}:${normalizedTenantSlug || 'default'}`;
}

function getModelSelectionStorageKey(tenantSlug?: string | null) {
  const normalizedTenantSlug = tenantSlug?.trim().toLocaleLowerCase();
  return `${MODEL_SELECTION_STORAGE_KEY_PREFIX}:${normalizedTenantSlug || 'default'}`;
}

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

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDocPath(input: string) {
  return input
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/+/g, '/')
    .trim();
}

type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'strong'; value: string }
  | { type: 'em'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; value: string; href: string };

function parseInlineMarkdown(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(input);

  while (match) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: input.slice(lastIndex, match.index) });
    }
    if (match[2] && match[3]) {
      tokens.push({ type: 'link', value: match[2], href: match[3] });
    } else if (match[4]) {
      tokens.push({ type: 'code', value: match[4] });
    } else if (match[5]) {
      tokens.push({ type: 'strong', value: match[5] });
    } else if (match[6]) {
      tokens.push({ type: 'em', value: match[6] });
    } else {
      tokens.push({ type: 'text', value: match[0] });
    }
    lastIndex = pattern.lastIndex;
    match = pattern.exec(input);
  }

  if (lastIndex < input.length) {
    tokens.push({ type: 'text', value: input.slice(lastIndex) });
  }

  return tokens;
}

function getDocVirtualPath(doc: KnowledgeDoc): string {
  const metadata = doc.metadata || {};
  const path =
    toNonEmptyString(metadata.relativePath) ||
    toNonEmptyString(metadata.webkitRelativePath) ||
    toNonEmptyString(metadata.path) ||
    toNonEmptyString(metadata.originalFilename) ||
    toNonEmptyString(doc.title) ||
    doc.id;
  return normalizeDocPath(path);
}

function isMarkdownPath(path: string) {
  return /\.(md|markdown)$/i.test(path);
}

function hasHiddenPathSegment(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .some((segment) => segment.startsWith('.'));
}

function sortTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  for (const node of nodes) {
    if (node.children.length > 0) {
      node.children = sortTreeNodes(node.children);
    }
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
  });
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function parseAgentActions(input: unknown): AgentAction[] {
  if (!Array.isArray(input)) return [];
  const rows: AgentAction[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const type = typeof row.type === 'string' ? row.type.trim().toLowerCase() : '';
    const path = typeof row.path === 'string' ? row.path.trim() : '';
    if (!path) continue;
    if (type !== 'read' && type !== 'create' && type !== 'update' && type !== 'delete') continue;
    rows.push({
      type: type as AgentActionType,
      path,
      content: typeof row.content === 'string' ? row.content : undefined,
      reason: typeof row.reason === 'string' ? row.reason : undefined,
    });
  }
  return rows;
}

function extractReferencedDocs(actions: AgentAction[]): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const action of actions) {
    if (action.type !== 'read') continue;
    const normalizedPath = normalizeDocPath(action.path || '');
    if (!normalizedPath) continue;
    if (seen.has(normalizedPath)) continue;
    seen.add(normalizedPath);
    refs.push(normalizedPath);
  }
  return refs;
}

function buildReferencePathCandidates(path: string): string[] {
  const normalized = normalizeDocPath(path);
  if (!normalized) return [];

  const lowerSet = new Set<string>();
  const rows: string[] = [];
  const push = (value: string) => {
    const token = normalizeDocPath(value);
    if (!token) return;
    const lower = token.toLowerCase();
    if (lowerSet.has(lower)) return;
    lowerSet.add(lower);
    rows.push(token);
  };

  push(normalized);

  const hasExt = /\.(md|markdown|txt)$/i.test(normalized);
  if (!hasExt) {
    push(`${normalized}.md`);
    push(`${normalized}.markdown`);
    push(`${normalized}.txt`);
  } else {
    push(normalized.replace(/\.(md|markdown|txt)$/i, ''));
  }

  return rows;
}

function parseThinkingItems(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function parseProcessingItems(input: unknown): ProcessItem[] {
  if (!Array.isArray(input)) return [];
  const rows: ProcessItem[] = [];
  for (const item of input) {
    if (typeof item === 'string') {
      const text = item.trim();
      if (text) rows.push({ text });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const text = typeof record.text === 'string' ? record.text.trim() : '';
    if (!text) continue;
    const atMs = typeof record.atMs === 'number' && Number.isFinite(record.atMs)
      ? Math.max(0, Math.round(record.atMs))
      : undefined;
    rows.push({ text, atMs });
  }
  return rows;
}

function resolveProcessStage(text: string): ProcessStage {
  const token = text.toLocaleLowerCase();
  if (token.includes('上下文') || token.includes('准备') || token.includes('请求') || token.includes('发送')) return 'context';
  if (token.includes('read') || token.includes('读取') || token.includes('文件') || token.includes('动作：read')) return 'read';
  if (token.includes('思考') || token.includes('分析') || token.includes('推理')) return 'reason';
  if (token.includes('回复') || token.includes('生成')) return 'compose';
  if (token.includes('完成') || token.includes('最终')) return 'done';
  return 'other';
}

function getProcessStageLabel(stage: ProcessStage) {
  if (stage === 'context') return '准备上下文';
  if (stage === 'read') return '读取文件';
  if (stage === 'reason') return '推理分析';
  if (stage === 'compose') return '组织回复';
  if (stage === 'done') return '完成';
  return '其他';
}

function formatProcessDuration(ms?: number) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function groupProcessItems(items: ProcessItem[], nowMs?: number) {
  const groups: Array<{ stage: ProcessStage; items: ProcessItem[]; elapsedMs?: number }> = [];
  for (const item of items) {
    const stage = resolveProcessStage(item.text);
    const current = groups[groups.length - 1];
    if (!current || current.stage !== stage) {
      groups.push({ stage, items: [item] });
    } else {
      current.items.push(item);
    }
  }

  for (let idx = 0; idx < groups.length; idx += 1) {
    const current = groups[idx];
    const start = current.items.find((item) => typeof item.atMs === 'number')?.atMs;
    const next = groups[idx + 1];
    const nextStart = next?.items.find((item) => typeof item.atMs === 'number')?.atMs;
    if (typeof start === 'number' && typeof nextStart === 'number' && nextStart >= start) {
      current.elapsedMs = nextStart - start;
      continue;
    }
    if (typeof start === 'number' && typeof nowMs === 'number' && nowMs >= start) {
      current.elapsedMs = nowMs - start;
    }
  }

  return groups;
}

function withPendingHint(items: ProcessItem[], nowMs?: number) {
  if (!items.length || typeof nowMs !== 'number') return items;
  const last = items[items.length - 1];
  if (!last || typeof last.atMs !== 'number') return items;
  const idleMs = nowMs - last.atMs;
  if (idleMs < 5000) return items;
  if (last.text.includes('等待上游响应')) return items;
  return [
    ...items,
    {
      text: '等待上游响应…',
      atMs: nowMs,
    },
  ];
}

function getProviderLabel(provider?: string | null) {
  if (!provider) return 'Model';
  const normalized = provider.trim().toLocaleLowerCase();
  if (!normalized) return 'Model';
  return provider
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(' ');
}

function isCodingModel(model: { modelId: string; provider?: string | null }) {
  const tokens = `${model.modelId} ${model.provider || ''}`.toLocaleLowerCase();
  return (
    tokens.includes('codex') ||
    tokens.includes('gpt-5') ||
    tokens.includes('claude') ||
    tokens.includes('sonnet') ||
    tokens.includes('opus') ||
    tokens.includes('haiku') ||
    tokens.includes('minimax') ||
    tokens.includes('hailuo') ||
    tokens.includes('abab')
  );
}

export function HomeContent() {
  const { t } = useLanguage();
  const { tenant, tenantSlug, basePath } = useTenant();
  const router = useRouter();

  const [showGridModal, setShowGridModal] = useState(false);
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [showCreativeModal, setShowCreativeModal] = useState(false);
  const [showDigitalHumanModal, setShowDigitalHumanModal] = useState(false);

  const [heroTitleEntered, setHeroTitleEntered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFileTree, setShowFileTree] = useState(false);
  const [showDocPreview, setShowDocPreview] = useState(false);
  const [showWechatLayoutModal, setShowWechatLayoutModal] = useState(false);
  const [showXhsLayoutModal, setShowXhsLayoutModal] = useState(false);
  const [fileTreeWidth, setFileTreeWidth] = useState(DEFAULT_FILE_TREE_WIDTH);
  const [docPreviewWidth, setDocPreviewWidth] = useState(DEFAULT_DOC_PREVIEW_WIDTH);
  const [isResizingFileTree, setIsResizingFileTree] = useState(false);
  const [isResizingDocPreview, setIsResizingDocPreview] = useState(false);
  const [fileTreeSelectionReady, setFileTreeSelectionReady] = useState(false);
  const [modelSelectionReady, setModelSelectionReady] = useState(false);
  const fileTreeResizeStartRef = useRef<{ x: number; width: number } | null>(null);
  const docPreviewResizeStartRef = useRef<{ x: number; width: number } | null>(null);
  const hasRestoredFileTreeSelectionRef = useRef(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainContentRef = useRef<HTMLDivElement | null>(null);
  const composerContainerRef = useRef<HTMLDivElement | null>(null);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const messageBottomRef = useRef<HTMLDivElement | null>(null);
  const treeNodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageRow[]>([]);
  const [loadingConversationMessages, setLoadingConversationMessages] = useState(false);
  const [streamingStatus, setStreamingStatus] = useState<string>('');
  const [streamingThinking, setStreamingThinking] = useState<string[]>([]);
  const [streamingActions, setStreamingActions] = useState<AgentAction[]>([]);
  const [streamingReply, setStreamingReply] = useState<string>('');
  const [streamingProcess, setStreamingProcess] = useState<ProcessItem[]>([]);
  const [streamStartedAtMs, setStreamStartedAtMs] = useState<number | null>(null);
  const [processNowTick, setProcessNowTick] = useState<number>(Date.now());
  const [expandedProcessByMessageId, setExpandedProcessByMessageId] = useState<Record<string, boolean>>({});
  const [executingMessageId, setExecutingMessageId] = useState<string | null>(null);
  const [actionResultsByMessageId, setActionResultsByMessageId] = useState<Record<string, AgentActionResult[]>>({});
  const [historyConversations, setHistoryConversations] = useState<ConversationHistoryItem[]>([]);
  const [loadingHistoryConversations, setLoadingHistoryConversations] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [showHistoryPopover, setShowHistoryPopover] = useState(false);
  const historyButtonRef = useRef<HTMLButtonElement | null>(null);
  const historyPopoverRef = useRef<HTMLDivElement | null>(null);
  const [showSkillsPopover, setShowSkillsPopover] = useState(false);
  const skillsPopoverRef = useRef<HTMLDivElement | null>(null);
  const skillsButtonRef = useRef<HTMLButtonElement | null>(null);
  const [skillsPopoverStyle, setSkillsPopoverStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [showModelPopover, setShowModelPopover] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const modelPopoverRef = useRef<HTMLDivElement | null>(null);
  const modelButtonRef = useRef<HTMLButtonElement | null>(null);
  const modelSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [showFolderPopover, setShowFolderPopover] = useState(false);
  const [folderSearch, setFolderSearch] = useState('');
  const folderPopoverRef = useRef<HTMLDivElement | null>(null);
  const folderButtonRef = useRef<HTMLButtonElement | null>(null);
  const folderSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [showFileTreeFolderPopover, setShowFileTreeFolderPopover] = useState(false);
  const [fileTreeFolderSearch, setFileTreeFolderSearch] = useState('');
  const fileTreeFolderPopoverRef = useRef<HTMLDivElement | null>(null);
  const fileTreeFolderButtonRef = useRef<HTMLButtonElement | null>(null);
  const fileTreeFolderSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(false);

  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [knowledgeFolders, setKnowledgeFolders] = useState<KnowledgeFolder[]>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);
  const [openTreePaths, setOpenTreePaths] = useState<Record<string, boolean>>({});
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocContent, setSelectedDocContent] = useState<string>('');
  const [docDraftContent, setDocDraftContent] = useState('');
  const [docViewMode, setDocViewMode] = useState<DocViewMode>('preview');
  const [savingDocContent, setSavingDocContent] = useState(false);
  const [loadingDocContent, setLoadingDocContent] = useState(false);
  const [docSearch, setDocSearch] = useState('');

  const [selectedModel, setSelectedModel] = useState('gpt-5.3-codex');
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([
    { modelId: 'gpt-5.3-codex', displayName: 'GPT-5.3-Codex', provider: 'codex' },
  ]);
  const [skillOptions, setSkillOptions] = useState<SkillOption[]>([]);
  const [enabledSkills, setEnabledSkills] = useState<string[]>([]);

  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  const [fixedComposerInset, setFixedComposerInset] = useState<{ left: number; right: number }>({
    left: 0,
    right: 0,
  });

  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState('');
  const [typingForward, setTypingForward] = useState(true);
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConversationMode = chatMessages.length > 0 || assistantLoading || loadingConversationMessages;
  useEffect(() => {
    if (isConversationMode) {
      setDisplayedPlaceholder('');
      return;
    }

    const target = PLACEHOLDER_HINTS[placeholderIdx];
    if (typingForward) {
      if (displayedPlaceholder.length < target.length) {
        typingRef.current = setTimeout(() => {
          setDisplayedPlaceholder(target.slice(0, displayedPlaceholder.length + 1));
        }, 60);
      } else {
        typingRef.current = setTimeout(() => setTypingForward(false), 2200);
      }
    } else if (displayedPlaceholder.length > 0) {
      typingRef.current = setTimeout(() => {
        setDisplayedPlaceholder(displayedPlaceholder.slice(0, -1));
      }, 28);
    } else {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_HINTS.length);
      setTypingForward(true);
    }

    return () => {
      if (typingRef.current) clearTimeout(typingRef.current);
    };
  }, [displayedPlaceholder, isConversationMode, placeholderIdx, typingForward]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthToken(data.session?.access_token ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthToken(session?.access_token ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storageKey = getFileTreeSelectionStorageKey(tenantSlug);
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) {
      hasRestoredFileTreeSelectionRef.current = false;
      setFileTreeSelectionReady(true);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as PersistedFileTreeSelection;
      const nextFolderId = toNonEmptyString(parsed.folderId);
      const nextDocId = toNonEmptyString(parsed.selectedDocId);
      const nextOpenTreePaths: Record<string, boolean> = {};

      if (parsed.openTreePaths && typeof parsed.openTreePaths === 'object') {
        for (const [path, opened] of Object.entries(parsed.openTreePaths)) {
          if (typeof path === 'string' && typeof opened === 'boolean') {
            nextOpenTreePaths[path] = opened;
          }
        }
      }

      if (nextFolderId) {
        setSelectedFolderId(nextFolderId);
        hasRestoredFileTreeSelectionRef.current = true;
      } else {
        hasRestoredFileTreeSelectionRef.current = false;
      }
      if (nextDocId) {
        setSelectedDocId(nextDocId);
      }
      setOpenTreePaths(nextOpenTreePaths);
    } catch (error) {
      console.warn('Failed to restore file tree selection', error);
      hasRestoredFileTreeSelectionRef.current = false;
    } finally {
      setFileTreeSelectionReady(true);
    }
  }, [tenantSlug]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = getModelSelectionStorageKey(tenantSlug);
    const savedModelId = window.localStorage.getItem(storageKey)?.trim();
    if (savedModelId) {
      setSelectedModel(savedModelId);
    }
    setModelSelectionReady(true);
  }, [tenantSlug]);

  useEffect(() => {
    if (!fileTreeSelectionReady || typeof window === 'undefined') return;

    const storageKey = getFileTreeSelectionStorageKey(tenantSlug);
    const payload: PersistedFileTreeSelection = {
      folderId: selectedFolderId || null,
      selectedDocId: selectedDocId || null,
      openTreePaths,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [fileTreeSelectionReady, openTreePaths, selectedDocId, selectedFolderId, tenantSlug]);

  useEffect(() => {
    if (!modelSelectionReady || typeof window === 'undefined') return;
    const storageKey = getModelSelectionStorageKey(tenantSlug);
    window.localStorage.setItem(storageKey, selectedModel);
  }, [modelSelectionReady, selectedModel, tenantSlug]);

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
        setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, uploadedUrl: url, uploading: false } : a)));
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

  const fetchKnowledgeFolders = useCallback(async () => {
    if (!authToken) return;

    setLoadingKnowledge(true);
    setKnowledgeError(null);
    try {
      const res = await fetch('/api/knowledge/folders?limit=100', {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({})) as { data?: KnowledgeFolder[]; error?: string };
      if (!res.ok) {
        setKnowledgeFolders([]);
        setKnowledgeError(payload.error || '加载知识库失败');
        return;
      }
      const rows = Array.isArray(payload.data) ? payload.data : [];
      setKnowledgeFolders(rows);
      setSelectedFolderId((prev) => {
        if (prev && rows.some((folder) => folder.id === prev)) return prev;
        return rows[0]?.id || '';
      });
    } catch (error) {
      console.error('Failed to load knowledge folders', error);
      setKnowledgeFolders([]);
      setKnowledgeError(error instanceof Error ? error.message : '加载知识库失败');
    } finally {
      setLoadingKnowledge(false);
    }
  }, [authToken]);

  const fetchKnowledgeDocs = useCallback(async (folderId: string) => {
    if (!authToken || !folderId) {
      setKnowledgeDocs([]);
      return;
    }

    try {
      const res = await fetch(`/api/knowledge/folders/${folderId}/files?limit=200`, {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({})) as { data?: KnowledgeDoc[] };
      if (!res.ok) {
        setKnowledgeDocs([]);
        return;
      }
      setKnowledgeDocs(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      console.error('Failed to load knowledge docs', error);
      setKnowledgeDocs([]);
    }
  }, [authToken]);

  const fetchLatestConversation = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/assistants/conversations?limit=1', {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({})) as { data?: ConversationSummary[] };
      if (!res.ok) return;

      const latest = Array.isArray(payload.data) ? payload.data[0] : null;
      if (!latest) return;

      if (latest.folderId && !hasRestoredFileTreeSelectionRef.current) {
        setSelectedFolderId(latest.folderId);
      }
      if (latest.model) {
        setSelectedModel((prev) => {
          if (!modelSelectionReady && prev === 'gpt-5.3-codex') {
            return latest.model as string;
          }
          return prev;
        });
      }
      // Keep homepage skill selection user-driven. Do not auto-bind from latest conversation.
    } catch (error) {
      console.error('Failed to load latest conversation', error);
    }
  }, [authToken, modelSelectionReady]);

  const fetchConversationHistory = useCallback(async () => {
    if (!authToken) return;
    setLoadingHistoryConversations(true);
    try {
      const res = await fetch('/api/assistants/conversations?limit=200', {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({})) as { data?: ConversationHistoryItem[] };
      if (!res.ok || !Array.isArray(payload.data)) {
        setHistoryConversations([]);
        return;
      }
      setHistoryConversations(payload.data);
    } catch (error) {
      console.error('Failed to load conversation history', error);
      setHistoryConversations([]);
    } finally {
      setLoadingHistoryConversations(false);
    }
  }, [authToken]);

  const fetchSkills = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/skills', {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({})) as {
        skills?: SkillOption[];
      };
      if (!res.ok || !Array.isArray(payload.skills)) {
        setSkillOptions([]);
        return;
      }
      setSkillOptions(payload.skills);
      setEnabledSkills((prev) => prev.filter((name) => payload.skills!.some((skill) => skill.name === name)));
    } catch (error) {
      console.error('Failed to load skills', error);
      setSkillOptions([]);
    }
  }, [authToken]);

  const fetchModels = useCallback(async () => {
    if (!authToken) return;

    setLoadingModels(true);
    try {
      const res = await fetch('/api/nexapi/models', {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({})) as {
        ok?: boolean;
        models?: Array<{ modelId: string; displayName?: string; provider?: string }>;
      };
      if (!res.ok || !payload.ok || !Array.isArray(payload.models)) return;
      const next = payload.models
        .filter((model) => isCodingModel({ modelId: model.modelId, provider: model.provider || null }))
        .slice(0, 60)
        .map((model) => ({
          modelId: model.modelId,
          displayName: model.displayName || model.modelId,
          provider: model.provider || null,
        }));
      if (next.length > 0) {
        setModelOptions(next);
        setSelectedModel((prev) => (next.find((m) => m.modelId === prev) ? prev : next[0].modelId));
      }
    } catch (error) {
      console.error('Failed to load model options', error);
    } finally {
      setLoadingModels(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;
    void fetchKnowledgeFolders();
    void fetchModels();
    void fetchSkills();
    void fetchLatestConversation();
    void fetchConversationHistory();
  }, [authToken, fetchConversationHistory, fetchKnowledgeFolders, fetchModels, fetchSkills, fetchLatestConversation]);

  useEffect(() => {
    if (!selectedFolderId) {
      setKnowledgeDocs([]);
      setSelectedDocId(null);
      setSelectedDocContent('');
      setOpenTreePaths({});
      return;
    }
    void fetchKnowledgeDocs(selectedFolderId);
  }, [selectedFolderId, fetchKnowledgeDocs]);

  const treeNodes = useMemo<FileTreeNode[]>(() => {
    const roots: FileTreeNode[] = [];
    const folderMap = new Map<string, FileTreeNode>();

    const ensureFolder = (path: string): FileTreeNode => {
      const normalizedPath = normalizeDocPath(path);
      const cached = folderMap.get(normalizedPath);
      if (cached) return cached;

      const parts = normalizedPath.split('/').filter(Boolean);
      const name = parts[parts.length - 1] || normalizedPath || '未命名目录';
      const parentPath = parts.slice(0, -1).join('/');
      const node: FileTreeNode = {
        id: `folder:${normalizedPath}`,
        name,
        type: 'folder',
        path: normalizedPath,
        children: [],
      };
      folderMap.set(normalizedPath, node);

      if (parentPath) {
        ensureFolder(parentPath).children.push(node);
      } else {
        roots.push(node);
      }
      return node;
    };

    for (const doc of knowledgeDocs) {
      const virtualPath = getDocVirtualPath(doc);
      if (!virtualPath) continue;
      if (hasHiddenPathSegment(virtualPath)) continue;
      if (!isMarkdownPath(virtualPath)) continue;

      const parts = virtualPath.split('/').filter(Boolean);
      const fileName = parts.pop() || doc.title || `${doc.id}.md`;
      const parentPath = parts.join('/');
      const fileNode: FileTreeNode = {
        id: `file:${doc.id}`,
        name: fileName,
        type: 'file',
        path: virtualPath,
        fileId: doc.id,
        children: [],
      };

      if (parentPath) {
        ensureFolder(parentPath).children.push(fileNode);
      } else {
        roots.push(fileNode);
      }
    }

    return sortTreeNodes(roots);
  }, [knowledgeDocs]);

  const selectedDocPath = useMemo(() => {
    if (!selectedDocId) return null;
    const match = knowledgeDocs.find((doc) => doc.id === selectedDocId);
    if (!match) return null;
    return getDocVirtualPath(match);
  }, [knowledgeDocs, selectedDocId]);

  const docByVirtualPath = useMemo(() => {
    const map = new Map<string, KnowledgeDoc>();
    for (const doc of knowledgeDocs) {
      const virtualPath = normalizeDocPath(getDocVirtualPath(doc));
      if (!virtualPath) continue;
      for (const candidate of buildReferencePathCandidates(virtualPath)) {
        const key = candidate.toLowerCase();
        if (!map.has(key)) {
          map.set(key, doc);
        }
      }
    }
    return map;
  }, [knowledgeDocs]);

  const filteredTreeNodes = useMemo(() => {
    const keyword = docSearch.trim().toLowerCase();
    if (!keyword) return treeNodes;

    const filterNode = (node: FileTreeNode): FileTreeNode | null => {
      const selfMatched = node.name.toLowerCase().includes(keyword) || node.path.toLowerCase().includes(keyword);
      if (node.type === 'file') return selfMatched ? node : null;
      const keptChildren = node.children
        .map((child) => filterNode(child))
        .filter((child): child is FileTreeNode => Boolean(child));
      if (!selfMatched && keptChildren.length === 0) return null;
      return { ...node, children: keptChildren };
    };

    return treeNodes
      .map((node) => filterNode(node))
      .filter((node): node is FileTreeNode => Boolean(node));
  }, [docSearch, treeNodes]);

  const loadDocContent = useCallback(async (fileId: string) => {
    if (!authToken) return;
    setLoadingDocContent(true);
    try {
      const res = await fetch(`/api/knowledge/files/${fileId}/content`, {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({})) as { data?: { content?: string }; error?: string };
      if (!res.ok) throw new Error(payload.error || '加载文档失败');
      const nextContent = payload.data?.content || '';
      setSelectedDocContent(nextContent);
      setDocDraftContent(nextContent);
      setDocViewMode('preview');
    } catch (error) {
      console.error('Failed to load knowledge doc content', error);
      setSelectedDocContent('');
      setDocDraftContent('');
    } finally {
      setLoadingDocContent(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (!selectedDocId) return;
    if (!knowledgeDocs.some((doc) => doc.id === selectedDocId)) return;
    void loadDocContent(selectedDocId);
  }, [knowledgeDocs, selectedDocId, loadDocContent]);

  const selectedFolder = useMemo(
    () => knowledgeFolders.find((folder) => folder.id === selectedFolderId) ?? null,
    [knowledgeFolders, selectedFolderId],
  );
  const selectedModelOption = useMemo(
    () => modelOptions.find((item) => item.modelId === selectedModel) ?? null,
    [modelOptions, selectedModel],
  );
  const filteredModelOptions = useMemo(() => {
    const keyword = normalizeSearchText(modelSearch);
    if (!keyword) return modelOptions;
    return modelOptions.filter((model) =>
      [model.displayName, model.modelId, model.provider || '']
        .join(' ')
        .toLocaleLowerCase()
        .includes(keyword),
    );
  }, [modelOptions, modelSearch]);
  const groupedModelOptions = useMemo(() => {
    const groups = new Map<string, ModelOption[]>();
    for (const model of filteredModelOptions) {
      const label = getProviderLabel(model.provider);
      const current = groups.get(label);
      if (current) current.push(model);
      else groups.set(label, [model]);
    }
    return Array.from(groups.entries());
  }, [filteredModelOptions]);
  const filteredFolders = useMemo(() => {
    const keyword = normalizeSearchText(folderSearch);
    if (!keyword) return knowledgeFolders;
    return knowledgeFolders.filter((folder) => folder.name.toLocaleLowerCase().includes(keyword));
  }, [folderSearch, knowledgeFolders]);
  const filteredFoldersInFileTree = useMemo(() => {
    const keyword = normalizeSearchText(fileTreeFolderSearch);
    if (!keyword) return knowledgeFolders;
    return knowledgeFolders.filter((folder) => folder.name.toLocaleLowerCase().includes(keyword));
  }, [fileTreeFolderSearch, knowledgeFolders]);
  const selectedSkill = enabledSkills[0] ?? null;
  const selectedSkillLabel = selectedSkill ? selectedSkill.replace(/-/g, ' ') : '';
  const assistantInputLength = assistantInput.trim().length;
  const activeConversationTitle = useMemo(() => {
    if (!conversationId) return '新对话';
    const current = historyConversations.find((item) => item.id === conversationId);
    return current?.title?.trim() || '未命名对话';
  }, [conversationId, historyConversations]);
  const assistantTextareaMinHeightClass =
    assistantInputLength >= 180
      ? 'min-h-[112px]'
      : assistantInputLength >= 70
        ? 'min-h-[86px]'
        : 'min-h-[60px]';
  const composerMaxWidth = showDocPreview ? 760 : showFileTree ? 820 : 940;
  const conversationContentMaxWidth = Math.max(680, composerMaxWidth - 40);
  const hideFolderSelectorInComposer = composerMaxWidth <= 760;
  const hideModelSelectorInComposer = composerMaxWidth <= 700;
  const modelSelectorMaxWidthClass = composerMaxWidth <= 820 ? 'max-w-[170px]' : 'max-w-[230px]';

  useEffect(() => {
    if (!modelOptions.find((item) => item.modelId === selectedModel)) {
      const fallback = modelOptions[0]?.modelId;
      if (fallback) setSelectedModel(fallback);
    }
  }, [modelOptions, selectedModel]);

  useEffect(() => {
    if (hideFolderSelectorInComposer && showFolderPopover) {
      setShowFolderPopover(false);
    }
    if (hideModelSelectorInComposer && showModelPopover) {
      setShowModelPopover(false);
    }
  }, [hideFolderSelectorInComposer, hideModelSelectorInComposer, showFolderPopover, showModelPopover]);

  useEffect(() => {
    if (!isConversationMode || typeof window === 'undefined') return;
    const updateInset = () => {
      const root = mainContentRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const left = Math.max(0, Math.round(rect.left));
      const right = Math.max(0, Math.round(window.innerWidth - rect.right));
      setFixedComposerInset((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };

    updateInset();
    window.addEventListener('resize', updateInset);
    return () => window.removeEventListener('resize', updateInset);
  }, [docPreviewWidth, fileTreeWidth, isConversationMode, showDocPreview, showFileTree]);

  useEffect(() => {
    if (!isConversationMode || typeof window === 'undefined') return;
    const node = composerContainerRef.current;
    if (!node) return;

    const updateHeight = () => {
      const next = Math.round(node.getBoundingClientRect().height);
      setComposerHeight((prev) => (prev === next ? prev : next));
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isConversationMode]);

  useEffect(() => {
    if (!assistantLoading || !streamStartedAtMs || typeof window === 'undefined') return;
    const timerId = window.setInterval(() => {
      setProcessNowTick(Date.now());
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [assistantLoading, streamStartedAtMs]);

  useEffect(() => {
    if (!showFileTree || !selectedDocId) return;
    const node = treeNodeRefs.current[selectedDocId];
    if (!node) return;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [openTreePaths, selectedDocId, showFileTree]);

  const openReferencedDoc = useCallback(
    (referencePath: string) => {
      const candidates = buildReferencePathCandidates(referencePath);
      const targetDoc =
        candidates
          .map((candidate) => docByVirtualPath.get(candidate.toLowerCase()))
          .find(Boolean) || null;

      if (!targetDoc) {
        if (referencePath.trim()) {
          toast.error(`未在当前文件夹找到引用文档：${referencePath}`);
        }
        return;
      }

      const targetPath = normalizeDocPath(getDocVirtualPath(targetDoc));
      const parentFolders = targetPath
        .split('/')
        .filter(Boolean)
        .slice(0, -1)
        .map((_part, index, rows) => rows.slice(0, index + 1).join('/'));

      if (parentFolders.length > 0) {
        setOpenTreePaths((prev) => {
          const next = { ...prev };
          for (const folderPath of parentFolders) {
            next[folderPath] = true;
          }
          return next;
        });
      }

      setShowFileTree(true);
      setShowDocPreview(true);
      setSelectedDocId(targetDoc.id);
      setShowFileTreeFolderPopover(false);
    },
    [docByVirtualPath],
  );

  const loadConversationMessages = useCallback(async (id: string) => {
    if (!authToken || !id) {
      setChatMessages([]);
      return;
    }
    setLoadingConversationMessages(true);
    try {
      const res = await fetch(`/api/assistants/conversations/${id}/messages?limit=300`, {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => ({})) as {
        data?: Array<{
          id: string;
          role: string;
          content: string;
          createdAt?: string;
          metadata?: {
            agentActions?: unknown;
            thinking?: unknown;
          } | null;
        }>;
      };
      if (!res.ok || !Array.isArray(payload.data)) {
        setChatMessages([]);
        return;
      }
      setChatMessages(
        payload.data
          .filter((row) => row.role === 'user' || row.role === 'assistant')
          .map((row) => ({
            id: row.id,
            role: row.role as 'user' | 'assistant',
            content: row.content,
            createdAt: row.createdAt,
            metadata: {
              agentActions: parseAgentActions(row.metadata?.agentActions),
              thinking: parseThinkingItems(row.metadata?.thinking),
            },
          })),
      );
    } catch (error) {
      console.error('Failed to load conversation messages', error);
      setChatMessages([]);
    } finally {
      setLoadingConversationMessages(false);
    }
  }, [authToken]);

  const executeActions = useCallback(async (messageId: string, actions: AgentAction[]) => {
    if (!authToken || !selectedFolderId || actions.length === 0) return;
    setExecutingMessageId(messageId);
    try {
      const res = await fetch('/api/assistants/agent-actions/execute', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ folderId: selectedFolderId, actions }),
      });
      const payload = await res.json().catch(() => ({})) as {
        data?: { results?: AgentActionResult[] };
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error || '执行失败');
      }
      const results = Array.isArray(payload.data?.results) ? payload.data.results : [];
      setActionResultsByMessageId((prev) => ({
        ...prev,
        [messageId]: results,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行失败';
      setActionResultsByMessageId((prev) => ({
        ...prev,
        [messageId]: [{ type: 'read', path: '-', ok: false, error: message }],
      }));
    } finally {
      setExecutingMessageId(null);
    }
  }, [authToken, selectedFolderId]);

  const toggleSkill = useCallback((skill: string) => {
    setEnabledSkills((prev) => (prev[0] === skill ? [] : [skill]));
    setShowSkillsPopover(false);
  }, []);

  const handleFolderChange = useCallback((nextFolderId: string) => {
    setSelectedFolderId(nextFolderId);
    setConversationId(null);
    setSelectedDocId(null);
    setSelectedDocContent('');
    setDocDraftContent('');
    setDocViewMode('preview');
    setDocSearch('');
    setOpenTreePaths({});
  }, []);

  const handleSelectModel = useCallback((nextModelId: string) => {
    setSelectedModel(nextModelId);
    setShowModelPopover(false);
    setModelSearch('');
  }, []);

  const handleSelectFolder = useCallback((nextFolderId: string) => {
    handleFolderChange(nextFolderId);
    setShowFolderPopover(false);
    setFolderSearch('');
  }, [handleFolderChange]);

  const handleSelectFolderInFileTree = useCallback((nextFolderId: string) => {
    handleFolderChange(nextFolderId);
    setShowFileTreeFolderPopover(false);
    setFileTreeFolderSearch('');
  }, [handleFolderChange]);

  const hasDocDraftChanges = selectedDocId
    ? docDraftContent.replace(/\r\n/g, '\n') !== selectedDocContent.replace(/\r\n/g, '\n')
    : false;
  const currentDocMarkdown = docViewMode === 'edit' ? docDraftContent : selectedDocContent;

  useEffect(() => {
    if (selectedDocId) return;
    setShowWechatLayoutModal(false);
    setShowXhsLayoutModal(false);
  }, [selectedDocId]);

  const saveDocContent = useCallback(async () => {
    if (!selectedDocId || !authToken || savingDocContent) return;
    setSavingDocContent(true);
    try {
      const res = await fetch(`/api/knowledge/files/${selectedDocId}/content`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: docDraftContent,
        }),
      });
      const payload = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(payload.error || '保存失败');
      setSelectedDocContent(docDraftContent);
      toast.success('文档已保存');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSavingDocContent(false);
    }
  }, [authToken, docDraftContent, savingDocContent, selectedDocId]);

  const createDocInCurrentFolder = useCallback(async () => {
    if (!authToken || !selectedFolderId || creatingDoc) return;
    const raw = window.prompt('请输入新文档路径（例如：notes/weekly-summary.md）');
    if (!raw) return;
    const path = raw.trim();
    if (!path) return;

    setCreatingDoc(true);
    try {
      const res = await fetch(`/api/knowledge/folders/${selectedFolderId}/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path,
          content: '',
        }),
      });
      const payload = await res.json().catch(() => ({})) as {
        data?: { id?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || '创建文档失败');

      await fetchKnowledgeDocs(selectedFolderId);
      const nextId = payload.data?.id;
      if (nextId) {
        setSelectedDocId(nextId);
        setShowDocPreview(true);
      }
      toast.success('文档已创建');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建文档失败');
    } finally {
      setCreatingDoc(false);
    }
  }, [authToken, creatingDoc, fetchKnowledgeDocs, selectedFolderId]);

  const deleteSelectedDoc = useCallback(async () => {
    if (!authToken || !selectedDocId || deletingDoc) return;
    const confirmed = window.confirm('确认删除当前文档？该操作不可撤销。');
    if (!confirmed) return;

    setDeletingDoc(true);
    try {
      const res = await fetch(`/api/knowledge/files/${selectedDocId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const payload = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(payload.error || '删除文档失败');

      const deletedId = selectedDocId;
      await fetchKnowledgeDocs(selectedFolderId);
      setSelectedDocId((prev) => (prev === deletedId ? null : prev));
      if (selectedDocId === deletedId) {
        setSelectedDocContent('');
        setDocDraftContent('');
      }
      toast.success('文档已删除');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除文档失败');
    } finally {
      setDeletingDoc(false);
    }
  }, [authToken, deletingDoc, fetchKnowledgeDocs, selectedDocId, selectedFolderId]);

  const renderMarkdownPreview = useCallback((content: string): ReactNode[] => {
    const normalized = content.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const nodes: ReactNode[] = [];
    let i = 0;
    let key = 0;

    const renderInlineMarkdown = (text: string, keyPrefix: string): ReactNode[] => {
      const tokens = parseInlineMarkdown(text);
      return tokens.map((token, idx) => {
        const nodeKey = `${keyPrefix}-${idx}`;
        if (token.type === 'strong') return <strong key={nodeKey}>{token.value}</strong>;
        if (token.type === 'em') return <em key={nodeKey}>{token.value}</em>;
        if (token.type === 'code') {
          return (
            <code
              key={nodeKey}
              className="rounded bg-gray-100 px-1 py-0.5 text-[0.92em] text-gray-800 dark:bg-gray-800 dark:text-gray-100"
            >
              {token.value}
            </code>
          );
        }
        if (token.type === 'link') {
          return (
            <a
              key={nodeKey}
              href={token.href}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700 dark:text-blue-300 dark:decoration-blue-500 dark:hover:text-blue-200"
            >
              {token.value}
            </a>
          );
        }
        return <span key={nodeKey}>{token.value}</span>;
      });
    };

    const pushParagraph = (text: string) => {
      if (!text.trim()) return;
      const paragraphLines = text.split('\n');
      nodes.push(
        <p key={`p-${key++}`} className="mb-4 whitespace-pre-wrap text-[15px] leading-7 text-gray-800 dark:text-gray-100">
          {paragraphLines.map((line, idx) => (
            <span key={`pl-${idx}`}>
              {renderInlineMarkdown(line, `p-${key}-l-${idx}`)}
              {idx < paragraphLines.length - 1 ? '\n' : null}
            </span>
          ))}
        </p>,
      );
    };

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i += 1;
        continue;
      }

      const headingMatch = /^#{1,6}\s+(.+)$/.exec(trimmed);
      if (headingMatch) {
        const level = Math.min(6, Math.max(1, trimmed.match(/^#+/)?.[0].length ?? 1));
        const text = headingMatch[1];
        const headingClass =
          level === 1
            ? 'mb-6 mt-2 text-4xl font-bold leading-tight text-gray-900 dark:text-white'
            : level === 2
              ? 'mb-4 mt-8 text-3xl font-semibold leading-tight text-gray-900 dark:text-white'
              : level === 3
                ? 'mb-3 mt-6 text-2xl font-semibold leading-snug text-gray-900 dark:text-white'
                : 'mb-3 mt-5 text-xl font-semibold leading-snug text-gray-900 dark:text-white';
        nodes.push(
          <div key={`h-${key++}`} className={headingClass}>
            {renderInlineMarkdown(text, `h-${key}`)}
          </div>,
        );
        i += 1;
        continue;
      }

      const secondaryHeadingMatch = /^\*\*([^*\n]+)\*\*(?:\s*([：:])\s*(.+))?$/.exec(trimmed);
      if (secondaryHeadingMatch && (secondaryHeadingMatch[2] || !secondaryHeadingMatch[3])) {
        const label = secondaryHeadingMatch[1].trim();
        const separator = secondaryHeadingMatch[2] ?? '';
        const tail = secondaryHeadingMatch[3]?.trim();
        if (tail) {
          nodes.push(
            <p key={`sh-${key++}`} className="mb-4 mt-5 text-[18px] leading-8 text-gray-900 dark:text-gray-100">
              <strong>{label + separator}</strong>
              {' '}
              {renderInlineMarkdown(tail, `sh-${key}-tail`)}
            </p>,
          );
        } else {
          nodes.push(
            <div key={`sh-${key++}`} className="mb-3 mt-6 text-2xl font-semibold leading-snug text-gray-900 dark:text-white">
              {label}
            </div>,
          );
        }
        i += 1;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        nodes.push(<hr key={`hr-${key++}`} className="my-6 border-gray-200 dark:border-gray-700" />);
        i += 1;
        continue;
      }

      if (trimmed.startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length) {
          const quoteLine = lines[i].trim();
          if (!quoteLine.startsWith('>')) break;
          quoteLines.push(quoteLine.replace(/^>\s?/, ''));
          i += 1;
        }
        nodes.push(
          <blockquote
            key={`q-${key++}`}
            className="mb-5 rounded-r-xl border-l-4 border-gray-300 bg-gray-50 px-4 py-3 text-[15px] leading-7 text-gray-700 dark:border-gray-600 dark:bg-gray-800/70 dark:text-gray-200"
          >
            {quoteLines.map((quoteLine, idx) => (
              <span key={`q-line-${idx}`}>
                {renderInlineMarkdown(quoteLine, `q-${key}-l-${idx}`)}
                {idx < quoteLines.length - 1 ? '\n' : null}
              </span>
            ))}
          </blockquote>,
        );
        continue;
      }

      if (/^(\*|-)\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length) {
          const itemLine = lines[i].trim();
          const itemMatch = /^(\*|-)\s+(.+)$/.exec(itemLine);
          if (!itemMatch) break;
          items.push(itemMatch[2]);
          i += 1;
        }
        nodes.push(
          <ul key={`ul-${key++}`} className="mb-5 list-disc space-y-1 pl-6 text-[15px] leading-7 text-gray-800 dark:text-gray-100">
            {items.map((item, idx) => (
              <li key={`uli-${idx}`}>{renderInlineMarkdown(item, `ul-${key}-i-${idx}`)}</li>
            ))}
          </ul>,
        );
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length) {
          const itemLine = lines[i].trim();
          const itemMatch = /^\d+\.\s+(.+)$/.exec(itemLine);
          if (!itemMatch) break;
          items.push(itemMatch[1]);
          i += 1;
        }
        nodes.push(
          <ol key={`ol-${key++}`} className="mb-5 list-decimal space-y-1 pl-6 text-[15px] leading-7 text-gray-800 dark:text-gray-100">
            {items.map((item, idx) => (
              <li key={`oli-${idx}`}>{renderInlineMarkdown(item, `ol-${key}-i-${idx}`)}</li>
            ))}
          </ol>,
        );
        continue;
      }

      const paragraphLines: string[] = [];
      while (i < lines.length) {
        const next = lines[i];
        const nextTrimmed = next.trim();
        if (!nextTrimmed) break;
        if (
          /^#{1,6}\s+/.test(nextTrimmed) ||
          /^(-{3,}|\*{3,}|_{3,})$/.test(nextTrimmed) ||
          nextTrimmed.startsWith('>') ||
          /^(\*|-)\s+/.test(nextTrimmed) ||
          /^\d+\.\s+/.test(nextTrimmed)
        ) {
          break;
        }
        paragraphLines.push(next);
        i += 1;
      }
      pushParagraph(paragraphLines.join('\n'));
    }

    if (nodes.length === 0) {
      return [
        <p key="empty" className="rounded-xl bg-gray-50 px-3 py-8 text-center text-xs text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
          文档暂无正文内容
        </p>,
      ];
    }
    return nodes;
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setChatMessages([]);
      return;
    }
    void loadConversationMessages(conversationId);
  }, [conversationId, loadConversationMessages]);

  useEffect(() => {
    if (!showHistoryPopover) return;
    void fetchConversationHistory();
  }, [showHistoryPopover, fetchConversationHistory]);

  useEffect(() => {
    if (!showHistoryPopover) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (historyPopoverRef.current?.contains(target)) return;
      if (historyButtonRef.current?.contains(target)) return;
      setShowHistoryPopover(false);
    };

    const handleEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setShowHistoryPopover(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [showHistoryPopover]);

  useEffect(() => {
    if (!showSkillsPopover) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (skillsPopoverRef.current?.contains(target)) return;
      if (skillsButtonRef.current?.contains(target)) return;
      setShowSkillsPopover(false);
    };

    const handleEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setShowSkillsPopover(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [showSkillsPopover]);

  useEffect(() => {
    if (!showSkillsPopover) return;
    if (typeof window === 'undefined') return;

    const updatePosition = () => {
      const btn = skillsButtonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 12;
      const desiredWidth = Math.min(360, viewportWidth - margin * 2);
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, viewportWidth - desiredWidth - margin),
      );

      const spaceAbove = rect.top - margin;
      const spaceBelow = viewportHeight - rect.bottom - margin;
      const openUpward = spaceAbove >= spaceBelow;
      const maxHeight = Math.max(180, Math.min(560, (openUpward ? spaceAbove : spaceBelow) - 8));
      const top = openUpward
        ? Math.max(margin, rect.top - maxHeight - 8)
        : Math.min(viewportHeight - margin - maxHeight, rect.bottom + 8);

      setSkillsPopoverStyle({
        left,
        top,
        width: desiredWidth,
        maxHeight,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showSkillsPopover]);

  useEffect(() => {
    if (!showModelPopover) return;
    modelSearchInputRef.current?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (modelPopoverRef.current?.contains(target)) return;
      if (modelButtonRef.current?.contains(target)) return;
      setShowModelPopover(false);
    };

    const handleEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setShowModelPopover(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [showModelPopover]);

  useEffect(() => {
    if (!showFolderPopover) return;
    folderSearchInputRef.current?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (folderPopoverRef.current?.contains(target)) return;
      if (folderButtonRef.current?.contains(target)) return;
      setShowFolderPopover(false);
    };

    const handleEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setShowFolderPopover(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [showFolderPopover]);

  useEffect(() => {
    if (!showFileTreeFolderPopover) return;
    fileTreeFolderSearchInputRef.current?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (fileTreeFolderPopoverRef.current?.contains(target)) return;
      if (fileTreeFolderButtonRef.current?.contains(target)) return;
      setShowFileTreeFolderPopover(false);
    };

    const handleEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setShowFileTreeFolderPopover(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [showFileTreeFolderPopover]);

  useEffect(() => {
    if (!isResizingFileTree) return;

    const handleMouseMove = (event: MouseEvent) => {
      const start = fileTreeResizeStartRef.current;
      if (!start) return;
      const deltaX = start.x - event.clientX;
      const nextWidth = start.width + deltaX;
      setFileTreeWidth(Math.max(MIN_FILE_TREE_WIDTH, nextWidth));
    };

    const handleMouseUp = () => {
      setIsResizingFileTree(false);
      fileTreeResizeStartRef.current = null;
    };

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      fileTreeResizeStartRef.current = null;
    };
  }, [isResizingFileTree]);

  useEffect(() => {
    if (!isResizingDocPreview) return;

    const handleMouseMove = (event: MouseEvent) => {
      const start = docPreviewResizeStartRef.current;
      if (!start) return;
      const deltaX = start.x - event.clientX;
      const nextWidth = start.width + deltaX;
      setDocPreviewWidth(Math.max(MIN_DOC_PREVIEW_WIDTH, nextWidth));
    };

    const handleMouseUp = () => {
      setIsResizingDocPreview(false);
      docPreviewResizeStartRef.current = null;
    };

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      docPreviewResizeStartRef.current = null;
    };
  }, [isResizingDocPreview]);

  const submitAssistantChat = useCallback(async () => {
    const content = assistantInput.trim();
    if (!content || assistantLoading) return;

    setChatMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-u`,
        role: 'user',
        content,
      },
    ]);
    setAssistantLoading(true);
    setStreamingStatus('正在分析需求…');
    setStreamingThinking([]);
    setStreamingActions([]);
    setStreamingReply('');
    const streamStartedAt = Date.now();
    setStreamStartedAtMs(streamStartedAt);
    setStreamingProcess([{ text: '已发送请求，开始分析需求', atMs: 0 }]);
    setAssistantInput('');

    try {
      const timeoutWarnId = setTimeout(() => {
        setStreamingStatus('上游响应较慢，继续等待中…');
      }, CHAT_REQUEST_TIMEOUT_MS);
      const localNexApiKey =
        typeof window !== 'undefined' ? window.localStorage.getItem(NEXAPI_KEY_STORAGE_KEY)?.trim() : '';
      const res = await fetch('/api/assistants/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          ...(localNexApiKey ? { 'x-nexapi-key': localNexApiKey } : {}),
        },
        body: JSON.stringify({
          conversationId: conversationId ?? undefined,
          folderId: selectedFolderId || undefined,
          currentPath: selectedDocPath || undefined,
          providerId: normalizeAssistantProviderId(inferAssistantProviderFromModel(selectedModel)),
          model: selectedModel,
          skills: enabledSkills,
          fastMode: true,
          message: content,
          stream: true,
        }),
      });
      if (!res.ok || !res.body) {
        clearTimeout(timeoutWarnId);
        const payload = await res.json().catch(() => ({})) as {
          error?: { message?: string } | string;
        };
        throw new Error(
          typeof payload.error === 'string'
            ? payload.error
            : payload.error?.message || '助手生成失败',
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let nextConversationId = conversationId;
      let finalReply = '';
      let finalActions: AgentAction[] = [];
      let finalThinking: string[] = [];
      let finalProcessing: ProcessItem[] = [{ text: '已发送请求，开始分析需求', atMs: 0 }];
      const seenThinking = new Set<string>();
      const seenActionKeys = new Set<string>();
      const pushProcess = (entry: string) => {
        const text = entry.trim();
        if (!text) return;
        if (finalProcessing[finalProcessing.length - 1]?.text === text) return;
        finalProcessing = [...finalProcessing, { text, atMs: Date.now() - streamStartedAt }].slice(-32);
        setStreamingProcess(finalProcessing);
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');
          if (!block) continue;

          const eventLine = block.split('\n').find((line) => line.startsWith('event:'));
          const dataLines = block
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim());
          const eventName = eventLine ? eventLine.replace(/^event:\s*/, '').trim() : 'message';
          const dataRaw = dataLines.join('\n');
          if (!dataRaw) continue;

          const payload = JSON.parse(dataRaw) as Record<string, unknown>;
          if (eventName === 'conversation') {
            const cid = typeof payload.conversationId === 'string' ? payload.conversationId : '';
            if (cid) {
              nextConversationId = cid;
              pushProcess('会话已建立');
            }
          } else if (eventName === 'status') {
            const text = typeof payload.text === 'string' ? payload.text : '';
            if (text) {
              setStreamingStatus(text);
              pushProcess(text);
            }
          } else if (eventName === 'thinking') {
            const items = parseThinkingItems(payload.items);
            const merged = [...finalThinking];
            for (const item of items) {
              if (!item || merged.includes(item)) continue;
              merged.push(item);
            }
            finalThinking = merged;
            setStreamingThinking(merged);
            for (const item of merged.slice(0, 8)) {
              if (seenThinking.has(item)) continue;
              seenThinking.add(item);
              pushProcess(`思考：${item}`);
            }
          } else if (eventName === 'actions') {
            const actions = parseAgentActions(payload.items);
            const merged = [...finalActions];
            for (const action of actions) {
              const key = `${action.type}:${action.path}`;
              if (merged.some((item) => item.type === action.type && item.path === action.path)) continue;
              merged.push(action);
              if (!seenActionKeys.has(key)) {
                seenActionKeys.add(key);
                pushProcess(`动作：${action.type.toUpperCase()} ${action.path}`);
              }
            }
            finalActions = merged;
            setStreamingActions(merged);
          } else if (eventName === 'reply_delta') {
            const delta = typeof payload.delta === 'string' ? payload.delta : '';
            if (delta) {
              if (!finalReply) {
                pushProcess('模型开始输出回复');
              }
              finalReply += delta;
              setStreamingReply((prev) => prev + delta);
            }
          } else if (eventName === 'final') {
            const reply = typeof payload.reply === 'string' ? payload.reply : '';
            if (reply) {
              finalReply = reply;
              setStreamingReply(reply);
            }
            const actions = parseAgentActions(payload.agentActions);
            if (actions.length > 0) {
              const merged = [...finalActions];
              for (const action of actions) {
                if (merged.some((item) => item.type === action.type && item.path === action.path)) continue;
                merged.push(action);
              }
              finalActions = merged;
              setStreamingActions(merged);
            }
            const thinking = parseThinkingItems(payload.thinking);
            if (thinking.length > 0) {
              const merged = [...finalThinking];
              for (const item of thinking) {
                if (!item || merged.includes(item)) continue;
                merged.push(item);
              }
              finalThinking = merged;
              setStreamingThinking(merged);
            }
            pushProcess('已生成最终回复');
            const cid = typeof payload.conversationId === 'string' ? payload.conversationId : '';
            if (cid) nextConversationId = cid;
          } else if (eventName === 'error') {
            const message = typeof payload.message === 'string' ? payload.message : '助手生成失败';
            pushProcess(`错误：${message}`);
            throw new Error(message);
          }
        }
      }
      clearTimeout(timeoutWarnId);

      if (!nextConversationId) {
        throw new Error('会话创建失败，请稍后重试');
      }
      setConversationId(nextConversationId);
      setStreamingStatus('');
      setStreamingReply('');
      setStreamingActions([]);
      setStreamingThinking([]);
      setStreamingProcess([]);
      setStreamStartedAtMs(null);

      if (finalReply.trim()) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-a`,
            role: 'assistant',
            content: finalReply,
            metadata: {
              agentActions: finalActions,
              thinking: finalThinking,
              processing: finalProcessing,
            },
          },
        ]);
      }
      await fetchConversationHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : '请求失败，请稍后重试';
      setChatMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-err`,
          role: 'assistant',
          content: `请求失败：${message}`,
        },
      ]);
      setStreamingStatus('');
      setStreamingReply('');
      setStreamingActions([]);
      setStreamingThinking([]);
      setStreamingProcess([]);
      setStreamStartedAtMs(null);
    } finally {
      setAssistantLoading(false);
    }
  }, [
    assistantInput,
    assistantLoading,
    authToken,
    conversationId,
    enabledSkills,
    fetchConversationHistory,
    selectedDocPath,
    selectedFolderId,
    selectedModel,
  ]);

  const handleAssistantInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void submitAssistantChat();
      }
    },
    [submitAssistantChat],
  );

  const renderTreeNodes = useCallback((nodes: FileTreeNode[], depth = 0): ReactNode[] => {
    return nodes.map((node) => {
      const opened = openTreePaths[node.path] ?? depth <= 1;
      if (node.type === 'folder') {
        return (
          <div key={node.id}>
            <button
              type="button"
              onClick={() => {
                setOpenTreePaths((prev) => ({ ...prev, [node.path]: !opened }));
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-800 transition hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800/70"
              style={{ paddingLeft: `${depth * 18 + 8}px` }}
            >
              <ChevronRight className={`h-4 w-4 shrink-0 text-gray-500 transition ${opened ? 'rotate-90' : ''}`} />
              <Folder className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-300" />
              <span className="truncate">{node.name}</span>
            </button>
            {opened && node.children.length > 0 && (
              <div className="relative before:absolute before:left-[12px] before:top-0 before:h-full before:w-px before:bg-gray-200 dark:before:bg-gray-700">
                {renderTreeNodes(node.children, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      const selected = selectedDocId === node.fileId;
      return (
        <button
          key={node.id}
          type="button"
          onClick={() => {
            if (!node.fileId) return;
            setSelectedDocId(node.fileId);
            setShowDocPreview(true);
          }}
          ref={(element) => {
            if (!node.fileId) return;
            treeNodeRefs.current[node.fileId] = element;
          }}
          data-doc-node-id={node.fileId}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
            selected
              ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
              : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50'
          }`}
          style={{ paddingLeft: `${depth * 18 + 34}px` }}
        >
          <FileText className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
          <span className="truncate">{node.name}</span>
        </button>
      );
    });
  }, [openTreePaths, selectedDocId]);

  const openQuickAction = useCallback((action: 'creative' | 'grid' | 'poster' | 'digitalHuman') => {
    if (action === 'creative') {
      setShowCreativeModal(true);
      return;
    }
    if (action === 'grid') {
      setShowGridModal(true);
      return;
    }
    if (action === 'poster') {
      setShowPosterModal(true);
      return;
    }
    setShowDigitalHumanModal(true);
  }, []);

  const streamingPreviewMessage = useMemo<ChatMessageRow | null>(() => {
    if (!assistantLoading) return null;
    if (!streamingReply.trim() && streamingActions.length === 0 && streamingThinking.length === 0 && streamingProcess.length === 0) return null;
    return {
      id: 'streaming-assistant',
      role: 'assistant',
      content: streamingReply || '',
      metadata: {
        agentActions: streamingActions,
        thinking: streamingThinking,
        processing: streamingProcess,
      },
    };
  }, [assistantLoading, streamingActions, streamingProcess, streamingReply, streamingThinking]);

  const displayedMessages = useMemo(
    () => (streamingPreviewMessage ? [...chatMessages, streamingPreviewMessage] : chatMessages),
    [chatMessages, streamingPreviewMessage],
  );

  useEffect(() => {
    if (!isConversationMode) return;
    if (!messageBottomRef.current) return;
    const rafId = window.requestAnimationFrame(() => {
      messageBottomRef.current?.scrollIntoView({
        block: 'end',
        behavior: assistantLoading ? 'auto' : 'smooth',
      });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [assistantLoading, isConversationMode, displayedMessages.length, streamingReply, streamingProcess]);

  const openHistoryConversation = useCallback((id: string) => {
    if (!id) return;
    setShowHistoryPopover(false);
    setConversationId(id);
    const conversation = historyConversations.find((item) => item.id === id);
    if (conversation?.folderId) {
      setSelectedFolderId(conversation.folderId);
    }
  }, [historyConversations]);

  const createHomepageConversation = useCallback(() => {
    setConversationId(null);
    setChatMessages([]);
    setActionResultsByMessageId({});
    setStreamingReply('');
    setStreamingActions([]);
    setStreamingThinking([]);
    setStreamingStatus('');
    setStreamingProcess([]);
    setStreamStartedAtMs(null);
    setAssistantInput('');
    setShowHistoryPopover(false);
  }, []);

  const deleteHistoryConversation = useCallback(async (id: string) => {
    if (!authToken || !id || deletingConversationId) return;
    const confirmed = window.confirm('确认删除这个历史对话？该操作不可撤销。');
    if (!confirmed) return;

    setDeletingConversationId(id);
    try {
      const res = await fetch(`/api/assistants/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const payload = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || '删除对话失败');
      }

      if (conversationId === id) {
        setConversationId(null);
        setChatMessages([]);
        setActionResultsByMessageId({});
        setStreamingReply('');
        setStreamingActions([]);
        setStreamingThinking([]);
        setStreamingStatus('');
        setStreamingProcess([]);
        setStreamStartedAtMs(null);
      }
      await fetchConversationHistory();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除对话失败');
    } finally {
      setDeletingConversationId(null);
    }
  }, [authToken, conversationId, deletingConversationId, fetchConversationHistory]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0f1012] font-sans">
      <div
        ref={mainContentRef}
        className={`px-4 transition-[padding-right] duration-150 ${isConversationMode ? 'pb-0 pt-0' : 'pb-12 pt-0'}`}
        style={showFileTree
          ? {
              paddingRight: `${fileTreeWidth + (showDocPreview ? docPreviewWidth : 0) + 20}px`,
            }
          : undefined}
      >
          <section
            className={isConversationMode ? 'mb-2 pb-2 pt-0 md:pb-3' : 'mb-10 pb-8 pt-0 md:pb-12 md:pt-0'}
            style={isConversationMode ? { paddingBottom: `${composerHeight + 28}px` } : undefined}
          >
          {isConversationMode ? (
            <>
              <div className="-mx-4 sticky top-0 z-30 mb-3 bg-white dark:bg-[#0f1012]">
              <div className="flex h-[53px] w-full items-center justify-between gap-3 px-4">
                <div className="min-w-0 flex items-center gap-2">
                  <div className="relative flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void createHomepageConversation()}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                      aria-label="新对话"
                      title="新对话"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                    <button
                      ref={historyButtonRef}
                      type="button"
                      onClick={() => {
                        setShowHistoryPopover((prev) => !prev);
                        setShowSkillsPopover(false);
                        setShowModelPopover(false);
                        setShowFolderPopover(false);
                        setShowFileTreeFolderPopover(false);
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                      aria-label="历史对话"
                      title="历史对话"
                    >
                      <History className="h-5 w-5" />
                    </button>
                    {showHistoryPopover && (
                      <div
                        ref={historyPopoverRef}
                        className="absolute left-0 top-12 z-50 w-[min(86vw,360px)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
                      >
                        <div className="border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">历史对话</p>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto py-1.5">
                          {loadingHistoryConversations ? (
                            <div className="flex items-center gap-2 px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              加载中…
                            </div>
                          ) : historyConversations.length === 0 ? (
                            <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">暂无历史对话</p>
                          ) : (
                            historyConversations.map((item) => {
                              const selected = item.id === conversationId;
                              return (
                                <div key={item.id} className="group flex items-center gap-1 px-2 py-1">
                                  <button
                                    type="button"
                                    onClick={() => openHistoryConversation(item.id)}
                                    className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition ${
                                      selected
                                        ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/70'
                                    }`}
                                  >
                                    <p className="truncate text-sm font-medium">{item.title?.trim() || '未命名对话'}</p>
                                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                      {item._count?.messages ?? 0} 条消息
                                    </p>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void deleteHistoryConversation(item.id);
                                    }}
                                    disabled={Boolean(deletingConversationId)}
                                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-red-400 ${
                                      deletingConversationId === item.id
                                        ? 'opacity-100'
                                        : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto'
                                    }`}
                                    aria-label="删除对话"
                                    title="删除对话"
                                  >
                                    {deletingConversationId === item.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 pl-1">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{activeConversationTitle}</p>
                  </div>
                </div>

                {!showFileTree ? (
                  <button
                    type="button"
                    onClick={() => setShowFileTree(true)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    aria-label="文件夹"
                    title="文件夹"
                  >
                    <Folder className="h-5 w-5" />
                  </button>
                ) : (
                  <span className="inline-flex h-10 w-10" />
                )}
              </div>
              </div>
            </>
          ) : (
            <div className="-mx-4 mb-3 bg-white dark:bg-[#0f1012]">
              <div className="flex h-[53px] w-full items-center justify-between gap-3 px-4">
                <div className="relative flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void createHomepageConversation()}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    aria-label="新对话"
                    title="新对话"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                  <button
                    ref={historyButtonRef}
                    type="button"
                    onClick={() => {
                      setShowHistoryPopover((prev) => !prev);
                      setShowSkillsPopover(false);
                      setShowModelPopover(false);
                      setShowFolderPopover(false);
                      setShowFileTreeFolderPopover(false);
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    aria-label="历史对话"
                    title="历史对话"
                  >
                    <History className="h-5 w-5" />
                  </button>
                  {showHistoryPopover && (
                    <div
                      ref={historyPopoverRef}
                      className="absolute left-0 top-12 z-50 w-[min(86vw,360px)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
                    >
                      <div className="border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">历史对话</p>
                      </div>
                      <div className="max-h-[60vh] overflow-y-auto py-1.5">
                        {loadingHistoryConversations ? (
                          <div className="flex items-center gap-2 px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            加载中…
                          </div>
                        ) : historyConversations.length === 0 ? (
                          <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">暂无历史对话</p>
                        ) : (
                          historyConversations.map((item) => {
                            const selected = item.id === conversationId;
                            return (
                              <div key={item.id} className="group flex items-center gap-1 px-2 py-1">
                                <button
                                  type="button"
                                  onClick={() => openHistoryConversation(item.id)}
                                  className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition ${
                                    selected
                                      ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                                      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/70'
                                  }`}
                                >
                                  <p className="truncate text-sm font-medium">{item.title?.trim() || '未命名对话'}</p>
                                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                    {item._count?.messages ?? 0} 条消息
                                  </p>
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void deleteHistoryConversation(item.id);
                                  }}
                                  disabled={Boolean(deletingConversationId)}
                                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-red-400 ${
                                    deletingConversationId === item.id
                                      ? 'opacity-100'
                                      : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto'
                                  }`}
                                  aria-label="删除对话"
                                  title="删除对话"
                                >
                                  {deletingConversationId === item.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {!showFileTree ? (
                  <button
                    type="button"
                    onClick={() => setShowFileTree(true)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    aria-label="文件夹"
                    title="文件夹"
                  >
                    <Folder className="h-5 w-5" />
                  </button>
                ) : (
                  <span className="inline-flex h-10 w-10" />
                )}
              </div>
            </div>
          )}

          {!isConversationMode && (
            <div className="mt-16 space-y-3 text-center md:mt-20">
              <h1
                className={`transform-gpu text-[1.45rem] font-semibold leading-snug text-gray-900 [word-break:keep-all] transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] sm:text-[2.1rem] sm:leading-tight md:text-[2.75rem] dark:text-white ${
                  heroTitleEntered
                    ? 'translate-y-0 scale-100 blur-0 opacity-100'
                    : 'translate-y-3 scale-[0.985] blur-[2px] opacity-0'
                }`}
              >
                {heroTitle}
              </h1>
            </div>
          )}

          {isConversationMode && (
            <div ref={messageScrollRef} className="mx-auto mb-3 min-h-0 w-full flex-1 px-2 sm:px-4" style={{ maxWidth: `${conversationContentMaxWidth}px` }}>
              {loadingConversationMessages ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载对话中…
                </div>
              ) : displayedMessages.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">当前会话暂无消息，输入需求开始对话。</p>
              ) : (
                <>
                  <div className="space-y-5">
                    {displayedMessages.map((message) => {
                    const actions = parseAgentActions(message.metadata?.agentActions);
                    const thinking = parseThinkingItems(message.metadata?.thinking);
                    const referencedDocs = extractReferencedDocs(actions);
                    const processing = parseProcessingItems(message.metadata?.processing);
                    const isStreamingMessage = message.id === 'streaming-assistant';
                    const processingNowMs = isStreamingMessage && streamStartedAtMs
                      ? Math.max(0, processNowTick - streamStartedAtMs)
                      : undefined;
                    const processingWithHint = withPendingHint(processing, processingNowMs);
                    const processGroups = groupProcessItems(processingWithHint, processingNowMs);
                    const processExpanded = isStreamingMessage || Boolean(expandedProcessByMessageId[message.id]);
                    const visibleProcessGroups = processExpanded ? processGroups : processGroups.slice(-2);
                    const results = actionResultsByMessageId[message.id] || [];
                    if (message.role === 'user') {
                      return (
                        <article key={message.id} className="flex justify-end">
                          <div className="inline-block max-w-[78%] rounded-2xl bg-gray-100 px-4 py-3 dark:bg-gray-800">
                            <div className="whitespace-pre-wrap text-[15px] font-medium leading-7 text-gray-900 dark:text-gray-100">
                              {message.content}
                            </div>
                          </div>
                        </article>
                      );
                    }

                    return (
                      <article key={message.id} className="flex items-start gap-3">
                        <Image
                          src={AGENT_AVATAR_SRC}
                          alt="Agent"
                          width={28}
                          height={28}
                          className="mt-1 h-7 w-7 rounded-md object-cover"
                        />
                        <div className="min-w-0 max-w-[84%]">
                          {processingWithHint.length > 0 ? (
                            <div className="mb-3 text-xs text-gray-700 dark:text-gray-200">
                              <div className="mb-2 flex items-center gap-2">
                                <p className="font-semibold">处理过程</p>
                                {processGroups.length > 1 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpandedProcessByMessageId((prev) => ({
                                        ...prev,
                                        [message.id]: !prev[message.id],
                                      }));
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                                  >
                                    {processExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    {processExpanded ? '收起' : `展开 ${processGroups.length} 项`}
                                  </button>
                                ) : null}
                              </div>
                              <ol className="relative pl-4">
                                <span className="pointer-events-none absolute bottom-1 left-[5px] top-1 w-px bg-gray-300 dark:bg-gray-600" />
                                {visibleProcessGroups.map((group, groupIdx) => {
                                  const actualGroupIdx = processExpanded ? groupIdx : processGroups.length - 1 + groupIdx;
                                  const isCurrent = isStreamingMessage && actualGroupIdx === processGroups.length - 1;
                                  return (
                                    <li key={`${message.id}-processing-group-${actualGroupIdx}`} className="relative mb-2 last:mb-0">
                                      <span
                                        className={`absolute -left-[15px] top-[4px] inline-block h-2.5 w-2.5 rounded-full ${
                                          isCurrent
                                            ? 'bg-gray-900 ring-2 ring-gray-200 dark:bg-gray-100 dark:ring-gray-700'
                                            : 'bg-gray-200 dark:bg-gray-700'
                                        }`}
                                      />
                                      <div className="min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className={`text-[12px] font-semibold ${isCurrent ? 'text-gray-900 dark:text-gray-100' : 'text-gray-300 dark:text-gray-500'}`}>
                                            {actualGroupIdx + 1}. {getProcessStageLabel(group.stage)}
                                          </p>
                                          <span className={`text-[11px] ${isCurrent ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-500'}`}>
                                            {formatProcessDuration(group.elapsedMs)}
                                          </span>
                                        </div>
                                        <p className={`mt-0.5 text-[12px] ${isCurrent ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                                          {group.items.map((item) => item.text).join(' · ')}
                                        </p>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ol>
                            </div>
                          ) : null}
                          {thinking.length > 0 ? (
                            <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
                              <p className="mb-1 font-semibold">分析过程</p>
                              <ul className="space-y-1">
                                {thinking.map((item, idx) => (
                                  <li key={`${message.id}-thinking-${idx}`}>• {item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {message.content ? (
                            <div className="whitespace-pre-wrap text-[15px] leading-7 text-gray-800 dark:text-gray-200">
                              {message.content}
                            </div>
                          ) : null}
                          {actions.length > 0 ? (
                            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-200">
                              <div className="mb-1 flex items-center justify-between">
                                <p className="font-semibold">动作计划</p>
                                {!isStreamingMessage ? (
                                  <button
                                    type="button"
                                    onClick={() => void executeActions(message.id, actions)}
                                    disabled={!selectedFolderId || executingMessageId === message.id}
                                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
                                  >
                                    {executingMessageId === message.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                    执行
                                  </button>
                                ) : null}
                              </div>
                              <div className="space-y-1">
                                {actions.map((action, idx) => (
                                  <p key={`${message.id}-action-${idx}`}>
                                    {action.type.toUpperCase()} · {action.path}
                                    {action.reason ? ` · ${action.reason}` : ''}
                                  </p>
                                ))}
                              </div>
                              {results.length > 0 ? (
                                <div className="mt-2 space-y-1 border-t border-gray-200 pt-2 dark:border-gray-700">
                                  {results.map((result, idx) => (
                                    <p key={`${message.id}-result-${idx}`} className={result.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                                      {result.ok ? 'OK' : 'ERR'} · {result.type.toUpperCase()} · {result.path}
                                      {result.error ? ` · ${result.error}` : ''}
                                    </p>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {!isStreamingMessage ? (
                            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-200">
                              <p className="font-semibold">引用文档</p>
                              {referencedDocs.length > 0 ? (
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {referencedDocs.map((path) => (
                                    <button
                                      key={`${message.id}-ref-${path}`}
                                      type="button"
                                      onClick={() => openReferencedDoc(path)}
                                      className="rounded-md border border-gray-200 bg-white px-2 py-0.5 font-mono text-[11px] text-gray-700 transition hover:border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                      title={path}
                                    >
                                      {path}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-1 text-gray-500 dark:text-gray-400">本次回复未引用文档</p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                    })}
                  </div>
                  <div ref={messageBottomRef} className="h-1 w-full" />
                </>
              )}
            </div>
          )}

          <div
            ref={composerContainerRef}
            className={isConversationMode
              ? 'fixed bottom-4 z-40'
              : 'mx-auto mt-10 w-full md:mt-12'}
            style={isConversationMode
              ? { left: `${fixedComposerInset.left}px`, right: `${fixedComposerInset.right}px` }
              : { maxWidth: `${composerMaxWidth}px` }}
          >
            <div
              className={isConversationMode
                ? `relative mx-auto w-full rounded-[30px] border bg-white px-4 py-3 shadow-sm transition-colors dark:bg-gray-900 ${
                  isDragOver ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-200 dark:border-gray-800'
                }`
                : `relative rounded-[30px] border bg-white px-4 py-3 shadow-sm transition-colors dark:bg-gray-900 ${
                  isDragOver ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-200 dark:border-gray-800'
                }`}
              style={isConversationMode ? { maxWidth: `${composerMaxWidth}px` } : undefined}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {knowledgeError && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  {knowledgeError}
                </div>
              )}

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

              {selectedSkill && (
                <div className="mb-2 flex items-center">
                  <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                    <BookOpen className="h-4 w-4" />
                    {selectedSkillLabel}
                    <button
                      type="button"
                      onClick={() => setEnabledSkills([])}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                      aria-label="取消已选技能"
                      title="取消技能"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              )}

              {isDragOver ? (
                <div className="flex min-h-[120px] items-center justify-center gap-3 rounded-xl border border-dashed border-blue-300 text-blue-500">
                  <Paperclip className="h-5 w-5" />
                  <span className="text-sm font-medium">松开鼠标导入图片或视频</span>
                </div>
              ) : (
                <textarea
                  value={assistantInput}
                  onChange={(event) => setAssistantInput(event.target.value)}
                  onKeyDown={handleAssistantInputKeyDown}
                  placeholder={isConversationMode ? '' : (displayedPlaceholder || ' ')}
                  className={`${assistantTextareaMinHeightClass} w-full resize-none bg-transparent text-base text-gray-900 outline-none transition-[min-height] duration-200 placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500`}
                />
              )}

              <div className="mt-3 flex items-center gap-2 overflow-hidden whitespace-nowrap">
                <div className="flex shrink-0 items-center gap-1">
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white"
                      aria-label="上传图片或视频"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <span className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-sm transition group-hover:opacity-100 dark:bg-gray-100 dark:text-gray-900">
                      上传文件
                    </span>
                  </div>
                  <div className="group relative">
                    <button
                      ref={skillsButtonRef}
                      type="button"
                      onClick={() => setShowSkillsPopover((prev) => !prev)}
                      className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
                        showSkillsPopover || enabledSkills.length > 0
                          ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white'
                      }`}
                      aria-label="选择技能"
                    >
                      <BookOpen className="h-4 w-4" />
                    </button>
                    <span className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-sm transition group-hover:opacity-100 dark:bg-gray-100 dark:text-gray-900">
                      选择技能
                    </span>
                  </div>
                </div>
                {!hideModelSelectorInComposer ? (
                  <div className="flex min-w-0 items-center gap-1">
                  <div className="relative">
                    <button
                      ref={modelButtonRef}
                      type="button"
                      onClick={() => {
                        setShowModelPopover((prev) => !prev);
                        setShowFolderPopover(false);
                        setShowFileTreeFolderPopover(false);
                      }}
                      className={`inline-flex h-8 min-w-0 ${modelSelectorMaxWidthClass} items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10`}
                      aria-label="选择模型"
                    >
                      <span className="truncate">{selectedModelOption?.displayName || selectedModel}</span>
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition ${showModelPopover ? 'rotate-180' : ''}`} />
                    </button>
                    {showModelPopover && (
                      <div
                        ref={modelPopoverRef}
                        className="absolute bottom-full left-0 z-40 mb-2 w-[min(86vw,360px)] overflow-hidden rounded-[20px] border border-gray-200 bg-[#f7f7f7] shadow-[0_10px_30px_rgba(0,0,0,0.13)] dark:border-gray-700 dark:bg-gray-900"
                      >
                        <div className="border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
                          <input
                            ref={modelSearchInputRef}
                            value={modelSearch}
                            onChange={(event) => setModelSearch(event.target.value)}
                            placeholder="搜索模型..."
                            className="w-full bg-transparent text-[15px] font-medium text-gray-600 outline-none placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-gray-500"
                          />
                        </div>
                        <div className="max-h-[300px] overflow-y-auto px-0 py-1">
                          {groupedModelOptions.length === 0 ? (
                            <p className="px-4 py-6 text-xs text-gray-500 dark:text-gray-400">未找到匹配模型</p>
                          ) : (
                            groupedModelOptions.map(([groupLabel, models], groupIndex) => (
                              <div
                                key={groupLabel}
                                className={groupIndex > 0 ? 'border-t border-gray-200 pt-1 dark:border-gray-700' : ''}
                              >
                                <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                                  {groupLabel}
                                </p>
                                {models.map((model) => {
                                  const selected = model.modelId === selectedModel;
                                  return (
                                    <button
                                      key={model.modelId}
                                      type="button"
                                      onClick={() => handleSelectModel(model.modelId)}
                                      className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition ${
                                        selected
                                          ? 'bg-white/80 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                                          : 'text-gray-700 hover:bg-white/70 dark:text-gray-200 dark:hover:bg-gray-800/80'
                                      }`}
                                    >
                                      <span className="text-[14px] leading-tight">{model.displayName}</span>
                                      {selected ? <Check className="h-4 w-4 shrink-0 text-gray-800 dark:text-gray-100" /> : null}
                                    </button>
                                  );
                                })}
                              </div>
                            ))
                          )}
                        </div>
                        <div className="border-t border-gray-200 px-3 py-2 dark:border-gray-700">
                          <button
                            type="button"
                            onClick={() => {
                              setShowModelPopover(false);
                              setModelSearch('');
                              router.push(getTenantPath('/nexapi/models'));
                            }}
                            className="inline-flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[14px] text-gray-600 transition hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                          >
                            <Settings className="h-3.5 w-3.5" />
                            管理服务商
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {loadingModels && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                </div>
                ) : null}
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  {!hideFolderSelectorInComposer ? (
                  <div className="relative">
                    <button
                      ref={folderButtonRef}
                      type="button"
                      onClick={() => {
                        if (knowledgeError) return;
                        setShowFolderPopover((prev) => !prev);
                        setShowModelPopover(false);
                        setShowFileTreeFolderPopover(false);
                      }}
                      disabled={Boolean(knowledgeError)}
                      className="inline-flex h-8 max-w-[200px] items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 dark:text-gray-200 dark:hover:bg-white/10 dark:disabled:text-gray-500"
                      aria-label="选择文件夹"
                    >
                      <span className="truncate">{selectedFolder?.name || '不使用仓库'}</span>
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition ${showFolderPopover ? 'rotate-180' : ''}`} />
                    </button>
                    {showFolderPopover && (
                      <div
                        ref={folderPopoverRef}
                        className="absolute bottom-full right-0 z-40 mb-2 w-[min(82vw,280px)] overflow-hidden rounded-[18px] border border-gray-200 bg-[#f7f7f7] shadow-[0_10px_30px_rgba(0,0,0,0.13)] dark:border-gray-700 dark:bg-gray-900"
                      >
                        <div className="border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
                          <input
                            ref={folderSearchInputRef}
                            value={folderSearch}
                            onChange={(event) => setFolderSearch(event.target.value)}
                            placeholder="搜索文件夹..."
                            className="w-full bg-transparent text-[14px] font-medium text-gray-600 outline-none placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-gray-500"
                          />
                        </div>
                        <div className="max-h-[260px] overflow-y-auto py-1.5">
                          <button
                            type="button"
                            onClick={() => handleSelectFolder('')}
                            className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition ${
                              !selectedFolderId
                                ? 'bg-white/80 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                                : 'text-gray-700 hover:bg-white/70 dark:text-gray-200 dark:hover:bg-gray-800/80'
                            }`}
                          >
                            <span className="text-[14px]">不使用仓库</span>
                            {!selectedFolderId ? <Check className="h-4 w-4 shrink-0 text-gray-800 dark:text-gray-100" /> : null}
                          </button>
                          {filteredFolders.map((folder) => {
                            const selected = selectedFolderId === folder.id;
                            return (
                              <button
                                key={folder.id}
                                type="button"
                                onClick={() => handleSelectFolder(folder.id)}
                                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition ${
                                  selected
                                    ? 'bg-white/80 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                                    : 'text-gray-700 hover:bg-white/70 dark:text-gray-200 dark:hover:bg-gray-800/80'
                                }`}
                              >
                                <span className="truncate text-[14px]">{folder.name}</span>
                                {selected ? <Check className="h-4 w-4 shrink-0 text-gray-800 dark:text-gray-100" /> : null}
                              </button>
                            );
                          })}
                          {filteredFolders.length === 0 && (
                            <p className="px-4 py-5 text-xs text-gray-500 dark:text-gray-400">未找到匹配文件夹</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  ) : null}
                </div>
                <div className="group relative shrink-0">
                  <button
                    type="button"
                    onClick={() => void submitAssistantChat()}
                    disabled={assistantLoading || !assistantInput.trim()}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--tenant-primary,#16a34a)] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="发送"
                  >
                    {assistantLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
                  </button>
                  <span className="pointer-events-none absolute -top-9 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-sm transition group-hover:opacity-100 dark:bg-gray-100 dark:text-gray-900">
                    发送
                  </span>
                </div>
              </div>

              {showSkillsPopover && (
                <div
                  ref={skillsPopoverRef}
                  className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-xl dark:border-gray-800 dark:bg-gray-900"
                  style={
                    skillsPopoverStyle
                      ? {
                          left: skillsPopoverStyle.left,
                          top: skillsPopoverStyle.top,
                          width: skillsPopoverStyle.width,
                          maxHeight: skillsPopoverStyle.maxHeight,
                        }
                      : undefined
                  }
                >
                  <div className="mb-3 flex shrink-0 items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Skills</p>
                    <button
                      type="button"
                      onClick={() => setShowSkillsPopover(false)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                      aria-label="关闭 Skills 弹窗"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {skillOptions.map((skill) => {
                      const selected = enabledSkills.includes(skill.name);
                      return (
                        <button
                          key={skill.id || skill.name}
                          type="button"
                          onClick={() => toggleSkill(skill.name)}
                          className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition ${
                            selected
                              ? 'border-gray-200 bg-gray-100 text-gray-900 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-100'
                              : 'border-transparent bg-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800/70'
                          }`}
                        >
                          <span className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center ${
                            selected
                              ? 'text-gray-900 dark:text-gray-100'
                              : 'text-gray-500 dark:text-gray-300'
                          }`}>
                            <BookOpen className="h-4 w-4" />
                          </span>
                          <span className="space-y-0.5">
                            <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                              {skill.name}
                            </span>
                            <span className="line-clamp-2 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                              {getSkillBrief(skill.description)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {skillOptions.length === 0 && (
                      <div className="rounded-xl border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        暂无技能，前往技能市场安装内置技能后即可使用。
                      </div>
                    )}
                  </div>
                  <div className="mt-3 shrink-0 border-t border-gray-200 pt-3 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSkillsPopover(false);
                        router.push(getTenantPath('/skills'));
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <MessageSquare className="h-4 w-4" />
                      打开技能市场
                    </button>
                  </div>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {!isConversationMode && (
            <div className="mx-auto mt-10 w-full" style={{ maxWidth: `${composerMaxWidth}px` }}>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
              <button
                type="button"
                onClick={() => openQuickAction('creative')}
                className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white/90 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-400 hover:bg-white hover:text-gray-900 dark:border-transparent dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-900"
              >
                <Sparkles className="h-4 w-4" />
                智能创作
              </button>
              <button
                type="button"
                onClick={() => openQuickAction('grid')}
                className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white/90 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-400 hover:bg-white hover:text-gray-900 dark:border-transparent dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-900"
              >
                <Grid3x3 className="h-4 w-4" />
                九宫格创作
              </button>
              <button
                type="button"
                onClick={() => openQuickAction('poster')}
                className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white/90 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-400 hover:bg-white hover:text-gray-900 dark:border-transparent dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-900"
              >
                <ImageIcon className="h-4 w-4" />
                小红书图文
              </button>
              <button
                type="button"
                onClick={() => openQuickAction('digitalHuman')}
                className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border border-gray-200 bg-white/90 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-400 hover:bg-white hover:text-gray-900 dark:border-transparent dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-900"
              >
                <User className="h-4 w-4" />
                数字人视频
              </button>
            </div>
            </div>
          )}
        </section>

        {showFileTree && (
          <>
            {showDocPreview && (
              <aside
                className="fixed inset-y-0 z-40 bg-white ring-1 ring-gray-200/90 dark:bg-gray-900 dark:ring-gray-700/80"
                style={{ right: `${fileTreeWidth}px`, width: `${docPreviewWidth}px` }}
              >
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="调整文档预览区宽度"
                onMouseDown={(event) => {
                  event.preventDefault();
                  docPreviewResizeStartRef.current = { x: event.clientX, width: docPreviewWidth };
                  setIsResizingDocPreview(true);
                }}
                className="absolute -left-1 top-0 z-20 h-full w-2 cursor-col-resize"
              >
                <div className="mx-auto h-full w-px bg-gray-200 dark:bg-gray-700" />
              </div>

                <div className="flex h-full flex-col">
                  <div className="flex h-[53px] items-center justify-between border-b border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <span className="truncate pr-3">{selectedDocPath || '请选择 Markdown 文件'}</span>
                    <button
                      type="button"
                      onClick={() => setShowDocPreview(false)}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                      aria-label="关闭文档预览区"
                      title="关闭预览"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    {loadingDocContent ? (
                      <div className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        加载文档中
                      </div>
                    ) : selectedDocId ? (
                      <div className="space-y-3">
                        <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between rounded-xl border border-gray-200/80 bg-white/95 px-3 py-2 backdrop-blur dark:border-gray-700/70 dark:bg-gray-900/95">
                          <div className="inline-flex items-center rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
                            <button
                              type="button"
                              onClick={() => setDocViewMode('preview')}
                              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                                docViewMode === 'preview'
                                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
                              }`}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              浏览
                            </button>
                            <button
                              type="button"
                              onClick={() => setDocViewMode('edit')}
                              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                                docViewMode === 'edit'
                                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
                              }`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              编辑
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setShowXhsLayoutModal(true)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                              title="小红书排版"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                              小红书排版
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowWechatLayoutModal(true)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                              title="公众号排版"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              公众号排版
                            </button>
                            {docViewMode === 'edit' && (
                              <button
                                type="button"
                                onClick={() => void saveDocContent()}
                                disabled={savingDocContent || !hasDocDraftChanges}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                              >
                                {savingDocContent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                保存
                              </button>
                            )}
                          </div>
                        </div>
                        {docViewMode === 'edit' ? (
                          <textarea
                            value={docDraftContent}
                            onChange={(event) => setDocDraftContent(event.target.value)}
                            className="min-h-[calc(100vh-250px)] w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm leading-relaxed text-gray-800 outline-none ring-0 focus:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-gray-600"
                          />
                        ) : (
                          <article className="rounded-xl bg-white px-3 py-3 dark:bg-gray-900">
                            {renderMarkdownPreview(selectedDocContent)}
                          </article>
                        )}
                      </div>
                    ) : (
                      <p className="rounded-xl bg-gray-50 px-3 py-8 text-center text-xs text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
                        请在右侧文件树中选择 .md 文件
                      </p>
                    )}
                  </div>
                </div>
              </aside>
            )}

            <aside
              className="fixed inset-y-0 right-0 z-40 bg-white ring-1 ring-gray-200/90 dark:bg-gray-900 dark:ring-gray-700/80"
              style={{ width: `${fileTreeWidth}px` }}
            >
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="调整文件树宽度"
                onMouseDown={(event) => {
                  event.preventDefault();
                  fileTreeResizeStartRef.current = { x: event.clientX, width: fileTreeWidth };
                  setIsResizingFileTree(true);
                }}
                className="absolute -left-1 top-0 z-20 h-full w-2 cursor-col-resize"
              >
                <div className="mx-auto h-full w-px bg-gray-200 dark:bg-gray-700" />
              </div>

              <div className="flex h-full flex-col">
                <div className="flex h-[53px] items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                  <div className="relative">
                    <button
                      ref={fileTreeFolderButtonRef}
                      type="button"
                      onClick={() => {
                        setShowFileTreeFolderPopover((prev) => !prev);
                        setShowFolderPopover(false);
                        setShowModelPopover(false);
                      }}
                      className="inline-flex h-8 max-w-[240px] items-center gap-2 rounded-lg px-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
                    >
                      <Folder className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-300" />
                      <span className="truncate">{selectedFolder?.name || '未选择仓库'}</span>
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition ${showFileTreeFolderPopover ? 'rotate-180' : ''}`} />
                    </button>
                    {showFileTreeFolderPopover && (
                      <div
                        ref={fileTreeFolderPopoverRef}
                        className="absolute left-0 top-full z-50 mt-2 w-[260px] max-w-[min(78vw,260px)] overflow-hidden rounded-[16px] border border-gray-200 bg-[#f7f7f7] shadow-[0_10px_30px_rgba(0,0,0,0.13)] dark:border-gray-700 dark:bg-gray-900"
                      >
                        <div className="border-b border-gray-200 px-3.5 py-2.5 dark:border-gray-700">
                          <input
                            ref={fileTreeFolderSearchInputRef}
                            value={fileTreeFolderSearch}
                            onChange={(event) => setFileTreeFolderSearch(event.target.value)}
                            placeholder="搜索文件夹..."
                            className="w-full bg-transparent text-[14px] font-medium text-gray-600 outline-none placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-gray-500"
                          />
                        </div>
                        <div className="max-h-[240px] overflow-y-auto py-1">
                          <button
                            type="button"
                            onClick={() => handleSelectFolderInFileTree('')}
                            className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition ${
                              !selectedFolderId
                                ? 'bg-white/80 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                                : 'text-gray-700 hover:bg-white/70 dark:text-gray-200 dark:hover:bg-gray-800/80'
                            }`}
                          >
                            <span className="text-[13px]">未选择仓库</span>
                            {!selectedFolderId ? <Check className="h-4 w-4 shrink-0 text-gray-800 dark:text-gray-100" /> : null}
                          </button>
                          {filteredFoldersInFileTree.map((folder) => {
                            const selected = selectedFolderId === folder.id;
                            return (
                              <button
                                key={folder.id}
                                type="button"
                                onClick={() => handleSelectFolderInFileTree(folder.id)}
                                className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition ${
                                  selected
                                    ? 'bg-white/80 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                                    : 'text-gray-700 hover:bg-white/70 dark:text-gray-200 dark:hover:bg-gray-800/80'
                                }`}
                              >
                                <span className="truncate text-[13px]">{folder.name}</span>
                                {selected ? <Check className="h-4 w-4 shrink-0 text-gray-800 dark:text-gray-100" /> : null}
                              </button>
                            );
                          })}
                          {filteredFoldersInFileTree.length === 0 && (
                            <p className="px-3.5 py-5 text-xs text-gray-500 dark:text-gray-400">未找到匹配文件夹</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void createDocInCurrentFolder()}
                      disabled={!selectedFolderId || creatingDoc}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
                      title="新建文档"
                      aria-label="新建文档"
                    >
                      {creatingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSelectedDoc()}
                      disabled={!selectedDocId || deletingDoc}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-500/10"
                      title="删除当前文档"
                      aria-label="删除当前文档"
                    >
                      {deletingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFileTree(false)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      aria-label="关闭文件夹视图"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="border-b border-gray-200/80 px-3 py-2 dark:border-gray-800">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={docSearch}
                      onChange={(event) => setDocSearch(event.target.value)}
                      placeholder="筛选文件..."
                      className="h-9 w-full rounded-xl bg-gray-50 pl-8 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:bg-gray-100 dark:bg-gray-800/70 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:bg-gray-800"
                    />
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {loadingKnowledge && (
                    <div className="mb-2 inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      加载中
                    </div>
                  )}
                  {filteredTreeNodes.length === 0 ? (
                    <p className="rounded-xl bg-gray-50 px-3 py-8 text-center text-xs text-gray-500 dark:bg-gray-800/70 dark:text-gray-400">
                      当前暂无 Markdown 文件
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      {renderTreeNodes(filteredTreeNodes)}
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </>
        )}

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
                <User className="h-5 w-5" />
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

        <MarkdownWechatLayoutModal
          isOpen={showWechatLayoutModal}
          onClose={() => setShowWechatLayoutModal(false)}
          markdown={currentDocMarkdown}
          filePath={selectedDocPath}
        />
        <MarkdownXhsLayoutModal
          isOpen={showXhsLayoutModal}
          onClose={() => setShowXhsLayoutModal(false)}
          markdown={currentDocMarkdown}
          filePath={selectedDocPath}
        />

        <CreativeQuickStartModal isOpen={showCreativeModal} onClose={() => setShowCreativeModal(false)} />
      </div>
    </div>
  );
}
