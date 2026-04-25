'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  History,
  Loader2,
  Plus,
  FilePlus,
  Pencil,
  Search,
  SendHorizontal,
  Trash2,
  ScanText,
  WandSparkles,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTenant } from '@/hooks/useTenant';
import { ConfirmModal } from '@/components/ConfirmModal';
import { supabase } from '@/lib/supabaseClient';

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

type ChatRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    agentActions?: AgentAction[];
    thinking?: string[];
    processing?: Array<{
      text: string;
      atMs?: number;
    }> | string[];
    references?: Array<{
      path: string;
      sourcePath?: string;
    }>;
  } | null;
  createdAt?: string;
};

type ProcessStage = 'context' | 'read' | 'reason' | 'compose' | 'done' | 'other';

type ProcessItem = {
  text: string;
  atMs?: number;
};

type ConversationRow = {
  id: string;
  title?: string | null;
  folderId?: string | null;
  lastMessageAt?: string;
  _count?: {
    messages?: number;
  };
};

type KnowledgeFolder = {
  id: string;
  name: string;
};

type KnowledgeDoc = {
  id: string;
  title: string;
  metadata?: Record<string, unknown> | null;
};

type WikiOrganizeResult = {
  processed: number;
  succeeded: number;
  failed: number;
  items?: Array<{
    rawFileId: string;
    rawPath: string;
    ok: boolean;
    error?: string;
    wikiPath?: string;
    wikiFileId?: string;
  }>;
};

type NormalizeStructureResult = {
  moved: number;
  deleted: number;
  created: number;
  wrapperPrefixRemoved?: string | null;
};

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmText?: string;
  isDanger?: boolean;
  onConfirm: () => Promise<void> | void;
};

type FileTreeNode = {
  id: string;
  name: string;
  type: 'folder' | 'file';
  path: string;
  fileId?: string;
  children: FileTreeNode[];
};

type TreeContextMenuNodeType = 'root' | 'folder' | 'file';

type TreeContextMenuState = {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  nodeType: TreeContextMenuNodeType;
  path: string;
  folderPath: string;
  fileId?: string;
};

type TreeDragPayload = {
  nodeType: 'folder' | 'file';
  path: string;
  fileId?: string;
};

type PersistedFileTreeSelection = {
  folderId?: string | null;
  selectedDocId?: string | null;
  openTreePaths?: Record<string, boolean>;
  orderByParent?: Record<string, string[]>;
};

const NEXAPI_KEY_STORAGE_KEY = 'nexapi_key';
const CHAT_REQUEST_TIMEOUT_MS = 240_000;
const MESSAGE_FETCH_TIMEOUT_MS = 15_000;
const FILE_TREE_WIDTH = 320;
const DOC_PREVIEW_WIDTH = 460;
const FILE_TREE_SELECTION_STORAGE_KEY_PREFIX = 'chat:file-tree-selection';
const FOLDER_MARKER_FILE_NAME = '__folder__.md';
const TREE_DRAG_MIME = 'application/x-content-factory-tree-node';
const CORE_DOC_BASENAMES = new Set([
  'agents.md',
  'soul.md',
  'memory.md',
  'user.md',
  'identity.md',
  'claude.md',
  'index.md',
]);

function getFileTreeSelectionStorageKey(tenantSlug?: string | null) {
  const normalizedTenantSlug = tenantSlug?.trim().toLocaleLowerCase();
  return `${FILE_TREE_SELECTION_STORAGE_KEY_PREFIX}:${normalizedTenantSlug || 'default'}`;
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

function getParentPath(path: string) {
  const parts = normalizeDocPath(path).split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function joinPath(parentPath: string, name: string) {
  const parent = normalizeDocPath(parentPath);
  const child = normalizeDocPath(name);
  if (!parent) return child;
  if (!child) return parent;
  return `${parent}/${child}`;
}

function getPathBaseName(path: string) {
  const parts = normalizeDocPath(path).split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
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

function isCoreDocPath(path: string) {
  const baseName = path.split('/').filter(Boolean).pop()?.toLowerCase() || '';
  return CORE_DOC_BASENAMES.has(baseName);
}

function sortTreeNodes(
  nodes: FileTreeNode[],
  orderByParent: Record<string, string[]> = {},
  parentPath = '',
): FileTreeNode[] {
  const orderedIds = orderByParent[parentPath] || [];
  const orderIndexMap = new Map<string, number>();
  orderedIds.forEach((id, index) => {
    orderIndexMap.set(id, index);
  });

  const withSortedChildren = nodes.map((node) => {
    if (node.children.length === 0) return node;
    return {
      ...node,
      children: sortTreeNodes(node.children, orderByParent, node.path),
    };
  });

  return withSortedChildren.sort((a, b) => {
    const indexA = orderIndexMap.get(a.id);
    const indexB = orderIndexMap.get(b.id);
    if (typeof indexA === 'number' || typeof indexB === 'number') {
      if (typeof indexA !== 'number') return 1;
      if (typeof indexB !== 'number') return -1;
      if (indexA !== indexB) return indexA - indexB;
    }
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
  });
}

function dedupeIds(rows: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of rows) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

function parseTreeDragPayload(raw: string): TreeDragPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TreeDragPayload>;
    const nodeType = parsed.nodeType === 'folder' || parsed.nodeType === 'file' ? parsed.nodeType : null;
    const path = typeof parsed.path === 'string' ? normalizeDocPath(parsed.path) : '';
    if (!nodeType || !path) return null;
    const fileId = typeof parsed.fileId === 'string' ? parsed.fileId : undefined;
    if (nodeType === 'file' && !fileId) return null;
    return { nodeType, path, fileId };
  } catch {
    return null;
  }
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

function parseReferenceDocs(input: unknown): Array<{ path: string; sourcePath: string }> {
  if (!Array.isArray(input)) return [];
  const rows: Array<{ path: string; sourcePath: string }> = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const path = typeof row.path === 'string' ? normalizeDocPath(row.path) : '';
    const sourcePath = typeof row.sourcePath === 'string' ? normalizeDocPath(row.sourcePath) : path;
    if (!path) continue;
    const key = path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ path, sourcePath });
  }
  return rows;
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
    push(normalized.replace(/\.(md|markdown|txt)$/i, ""));
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

function stripMarkdownLikeFormatting(input: string) {
  const text = input.replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const lines = text.split('\n');
  const cleaned = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (/^---+$/.test(trimmed)) return '';
      if (/^#{1,6}\s+/.test(trimmed)) return trimmed.replace(/^#{1,6}\s+/, '');
      if (/^>\s?/.test(trimmed)) return trimmed.replace(/^>\s?/, '');
      if (/^[-*+]\s+/.test(trimmed)) return trimmed.replace(/^[-*+]\s+/, '• ');
      if (/^\d+\.\s+/.test(trimmed)) return trimmed.replace(/^\d+\.\s+/, '');
      return trimmed;
    })
    .filter(Boolean);

  return cleaned.join('\n');
}

function normalizeAssistantText(input: string) {
  const stripped = stripMarkdownLikeFormatting(input);
  if (!stripped) return '';
  if (/^[\[{]/.test(stripped.trim())) return stripped.trim();
  return stripped;
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

export function ChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { basePath, tenantSlug } = useTenant();

  const conversationId = useMemo(() => searchParams?.get('cid') || '', [searchParams]);

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [streamingStatus, setStreamingStatus] = useState('');
  const [streamingThinking, setStreamingThinking] = useState<string[]>([]);
  const [streamingActions, setStreamingActions] = useState<AgentAction[]>([]);
  const [streamingReply, setStreamingReply] = useState('');
  const [streamingProcess, setStreamingProcess] = useState<ProcessItem[]>([]);
  const [streamStartedAtMs, setStreamStartedAtMs] = useState<number | null>(null);
  const [processNowTick, setProcessNowTick] = useState<number>(Date.now());
  const [expandedProcessByMessageId, setExpandedProcessByMessageId] = useState<Record<string, boolean>>({});

  const [folderId, setFolderId] = useState<string>('');
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [organizingWiki, setOrganizingWiki] = useState(false);
  const [normalizingStructure, setNormalizingStructure] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [docSearch, setDocSearch] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocContent, setSelectedDocContent] = useState('');
  const [loadingDocContent, setLoadingDocContent] = useState(false);
  const [openTreePaths, setOpenTreePaths] = useState<Record<string, boolean>>({});
  const [treeOrderByParent, setTreeOrderByParent] = useState<Record<string, string[]>>({});
  const [fileTreeSelectionReady, setFileTreeSelectionReady] = useState(false);

  const [showFileTree, setShowFileTree] = useState(false);
  const [showDocPreview, setShowDocPreview] = useState(false);
  const [showPanelFolderPopover, setShowPanelFolderPopover] = useState(false);
  const [treeContextMenu, setTreeContextMenu] = useState<TreeContextMenuState | null>(null);
  const [treeContextMenuStyle, setTreeContextMenuStyle] = useState<{ left: number; top: number } | null>(null);
  const [draggingTreeNodePath, setDraggingTreeNodePath] = useState<string | null>(null);
  const [draggingTreeNodeId, setDraggingTreeNodeId] = useState<string | null>(null);
  const [draggingTreeNodeName, setDraggingTreeNodeName] = useState<string | null>(null);
  const [dragOverFolderPath, setDragOverFolderPath] = useState<string | null>(null);
  const [treeDropIndicator, setTreeDropIndicator] = useState<{ parentPath: string; index: number } | null>(null);
  const [movingTreeNode, setMovingTreeNode] = useState(false);

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [showHistoryPopover, setShowHistoryPopover] = useState(false);

  const [executingMessageId, setExecutingMessageId] = useState<string | null>(null);
  const [actionResultsByMessageId, setActionResultsByMessageId] = useState<Record<string, AgentActionResult[]>>({});

  const historyButtonRef = useRef<HTMLButtonElement | null>(null);
  const historyPopoverRef = useRef<HTMLDivElement | null>(null);
  const panelFolderButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelFolderPopoverRef = useRef<HTMLDivElement | null>(null);
  const treeContextMenuRef = useRef<HTMLDivElement | null>(null);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const messageBottomRef = useRef<HTMLDivElement | null>(null);
  const treeNodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const getTenantPath = useCallback(
    (path: string) => {
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      return `${basePath || ''}${normalizedPath}`;
    },
    [basePath],
  );

  const loadFolders = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/knowledge/folders?limit=100', {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => ({}))) as { data?: KnowledgeFolder[] };
      if (!res.ok || !Array.isArray(payload.data)) {
        setFolders([]);
        return;
      }
      setFolders(payload.data);
    } catch {
      setFolders([]);
    }
  }, [authToken]);

  const loadDocs = useCallback(
    async (targetFolderId: string) => {
      if (!authToken || !targetFolderId) {
        setDocs([]);
        return;
      }
      try {
        const res = await fetch(`/api/knowledge/folders/${targetFolderId}/files?limit=500`, {
          headers: { Authorization: `Bearer ${authToken}` },
          cache: 'no-store',
        });
        const payload = (await res.json().catch(() => ({}))) as { data?: KnowledgeDoc[] };
        if (!res.ok || !Array.isArray(payload.data)) {
          setDocs([]);
          return;
        }
        setDocs(payload.data);
      } catch {
        setDocs([]);
      }
    },
    [authToken],
  );

  const loadDocContent = useCallback(
    async (fileId: string) => {
      if (!authToken || !fileId) return;
      setLoadingDocContent(true);
      try {
        const res = await fetch(`/api/knowledge/files/${fileId}/content`, {
          headers: { Authorization: `Bearer ${authToken}` },
          cache: 'no-store',
        });
        const payload = (await res.json().catch(() => ({}))) as { data?: { content?: string } };
        if (!res.ok) {
          setSelectedDocContent('');
          return;
        }
        setSelectedDocContent(payload.data?.content || '');
      } catch {
        setSelectedDocContent('');
      } finally {
        setLoadingDocContent(false);
      }
    },
    [authToken],
  );

  const loadConversations = useCallback(async () => {
    if (!authToken) return;
    setLoadingConversations(true);
    try {
      const res = await fetch('/api/assistants/conversations?limit=200', {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      const payload = (await res.json().catch(() => ({}))) as { data?: ConversationRow[] };
      if (!res.ok || !Array.isArray(payload.data)) {
        setConversations([]);
        return;
      }
      setConversations(payload.data);
    } finally {
      setLoadingConversations(false);
    }
  }, [authToken]);

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
      if (parsed.orderByParent && typeof parsed.orderByParent === 'object') {
        const nextOrder: Record<string, string[]> = {};
        for (const [parentPath, rawIds] of Object.entries(parsed.orderByParent)) {
          if (typeof parentPath !== 'string' || !Array.isArray(rawIds)) continue;
          const ids = rawIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
          nextOrder[parentPath] = dedupeIds(ids);
        }
        setTreeOrderByParent(nextOrder);
      } else {
        setTreeOrderByParent({});
      }
      if (nextFolderId) setFolderId(nextFolderId);
      if (nextDocId) setSelectedDocId(nextDocId);
      setOpenTreePaths(nextOpenTreePaths);
    } catch {
      setTreeOrderByParent({});
    } finally {
      setFileTreeSelectionReady(true);
    }
  }, [tenantSlug]);

  useEffect(() => {
    if (!fileTreeSelectionReady || typeof window === 'undefined') return;
    const storageKey = getFileTreeSelectionStorageKey(tenantSlug);
    const payload: PersistedFileTreeSelection = {
      folderId: folderId || null,
      selectedDocId: selectedDocId || null,
      openTreePaths,
      orderByParent: treeOrderByParent,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [fileTreeSelectionReady, folderId, openTreePaths, selectedDocId, tenantSlug, treeOrderByParent]);

  useEffect(() => {
    if (!authToken) return;
    void loadFolders();
    void loadConversations();
  }, [authToken, loadConversations, loadFolders]);

  useEffect(() => {
    if (!conversationId) return;
    const current = conversations.find((row) => row.id === conversationId);
    if (current) {
      setFolderId(current.folderId ?? '');
    }
  }, [conversationId, conversations]);

  useEffect(() => {
    if (!authToken || !conversationId) {
      setMessages([]);
      return;
    }
    let alive = true;
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MESSAGE_FETCH_TIMEOUT_MS);

    fetch(`/api/assistants/conversations/${conversationId}/messages?limit=300`, {
      headers: { Authorization: `Bearer ${authToken}` },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeoutId);
        const payload = (await res.json().catch(() => ({}))) as {
          data?: Array<{
            id: string;
            role: string;
            content: string;
            metadata?: { agentActions?: AgentAction[]; thinking?: string[]; processing?: string[]; references?: unknown } | null;
            createdAt?: string;
          }>;
        };
        if (!alive) return;
        if (!res.ok || !Array.isArray(payload.data)) {
          setMessages([]);
          return;
        }
        setMessages(
          payload.data
            .filter((row) => row.role === 'user' || row.role === 'assistant')
            .map((row) => ({
              id: row.id,
              role: row.role as 'user' | 'assistant',
              content: row.content,
              metadata: {
                agentActions: parseAgentActions(row.metadata?.agentActions),
                thinking: parseThinkingItems(row.metadata?.thinking),
                processing: parseProcessingItems(row.metadata?.processing),
                references: parseReferenceDocs((row.metadata as { references?: unknown } | undefined)?.references),
              },
              createdAt: row.createdAt,
            })),
        );
      })
      .catch((error) => {
        if (!alive) return;
        const isTimeout = error instanceof DOMException && error.name === 'AbortError';
        if (isTimeout) {
          setMessages((prev) =>
            prev.length > 0
              ? prev
              : [
                  {
                    id: `${Date.now()}-load-timeout`,
                    role: 'assistant',
                    content: '会话加载超时，请刷新后重试。',
                  },
                ],
          );
          return;
        }
        setMessages([]);
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [authToken, conversationId]);

  useEffect(() => {
    if (!folderId) {
      setDocs([]);
      setSelectedDocId(null);
      setSelectedDocContent('');
      return;
    }
    void loadDocs(folderId);
  }, [folderId, loadDocs]);

  useEffect(() => {
    if (!selectedDocId) return;
    if (!docs.some((doc) => doc.id === selectedDocId)) return;
    void loadDocContent(selectedDocId);
  }, [docs, loadDocContent, selectedDocId]);

  useEffect(() => {
    if (!showHistoryPopover && !showPanelFolderPopover) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (showHistoryPopover) {
        if (historyPopoverRef.current?.contains(target)) return;
        if (historyButtonRef.current?.contains(target)) return;
        setShowHistoryPopover(false);
      }

      if (showPanelFolderPopover) {
        if (panelFolderPopoverRef.current?.contains(target)) return;
        if (panelFolderButtonRef.current?.contains(target)) return;
        setShowPanelFolderPopover(false);
      }
    };

    const handleEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowHistoryPopover(false);
      setShowPanelFolderPopover(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEsc);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [showHistoryPopover, showPanelFolderPopover]);

  useEffect(() => {
    if (!treeContextMenu) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (treeContextMenuRef.current?.contains(target)) return;
      setTreeContextMenu(null);
    };
    const handleEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setTreeContextMenu(null);
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [treeContextMenu]);

  useLayoutEffect(() => {
    if (!treeContextMenu) {
      setTreeContextMenuStyle(null);
      return;
    }
    const menu = treeContextMenuRef.current;
    if (!menu || typeof window === 'undefined') return;
    const margin = 8;
    const rect = menu.getBoundingClientRect();
    const left = Math.min(
      Math.max(margin, treeContextMenu.anchorX),
      Math.max(margin, window.innerWidth - rect.width - margin),
    );
    const top = Math.min(
      Math.max(margin, treeContextMenu.anchorY),
      Math.max(margin, window.innerHeight - rect.height - margin),
    );
    setTreeContextMenuStyle((prev) => (prev?.left === left && prev?.top === top ? prev : { left, top }));
  }, [treeContextMenu]);

  useEffect(() => {
    if (!sending || !streamStartedAtMs || typeof window === 'undefined') return;
    const timerId = window.setInterval(() => {
      setProcessNowTick(Date.now());
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [sending, streamStartedAtMs]);

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setActionResultsByMessageId({});
    setInput('');
    setShowHistoryPopover(false);
    router.push(getTenantPath('/chat'));
  }, [getTenantPath, router]);

  const openConversation = useCallback(
    (id: string) => {
      if (!id) return;
      setShowHistoryPopover(false);
      router.push(`${getTenantPath('/chat')}?cid=${id}`);
    },
    [getTenantPath, router],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (!authToken || !id || deletingConversationId) return;
      setConfirmDialog({
        title: '删除历史对话',
        message: '确认删除这个历史对话？该操作不可撤销。',
        confirmText: '删除',
        isDanger: true,
        onConfirm: async () => {
          setDeletingConversationId(id);
          try {
            const res = await fetch(`/api/assistants/conversations/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${authToken}` },
            });
            const payload = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
              throw new Error(payload.error || '删除对话失败');
            }

            if (id === conversationId) {
              setMessages([]);
              setActionResultsByMessageId({});
              setInput('');
              setStreamingStatus('');
              setStreamingThinking([]);
              setStreamingActions([]);
              setStreamingReply('');
              setStreamingProcess([]);
              router.push(getTenantPath('/chat'));
            }
            await loadConversations();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : '删除对话失败');
          } finally {
            setDeletingConversationId(null);
          }
        },
      });
    },
    [authToken, conversationId, deletingConversationId, getTenantPath, loadConversations, router],
  );

  const executeActions = useCallback(
    async (messageId: string, actions: AgentAction[]) => {
      if (!authToken || !folderId || actions.length === 0) return;
      setExecutingMessageId(messageId);
      try {
        const res = await fetch('/api/assistants/agent-actions/execute', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ folderId, actions }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
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

        const touchedFileIds = results
          .filter((item) => item.ok && (item.type === 'create' || item.type === 'update') && typeof item.fileId === 'string')
          .map((item) => item.fileId as string);
        const latestCreatedFileId = [...results]
          .reverse()
          .find((item) => item.ok && item.type === 'create' && typeof item.fileId === 'string')?.fileId;

        await loadDocs(folderId);

        if (selectedDocId && touchedFileIds.includes(selectedDocId)) {
          await loadDocContent(selectedDocId);
        } else if (!selectedDocId && latestCreatedFileId) {
          setSelectedDocId(latestCreatedFileId);
          setShowDocPreview(true);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '执行失败';
        setActionResultsByMessageId((prev) => ({
          ...prev,
          [messageId]: [{ type: 'read', path: '-', ok: false, error: message }],
        }));
      } finally {
        setExecutingMessageId(null);
      }
    },
    [authToken, folderId, loadDocContent, loadDocs, selectedDocId],
  );

  useEffect(() => {
    if (!folderId || streamingActions.length > 0) return;
    const latestAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant');
    if (!latestAssistantMessage) return;
    const actions = latestAssistantMessage.metadata?.agentActions || [];
    if (actions.length === 0) return;
    if (actionResultsByMessageId[latestAssistantMessage.id]?.length) return;
    if (executingMessageId) return;
    void executeActions(latestAssistantMessage.id, actions);
  }, [actionResultsByMessageId, executeActions, executingMessageId, folderId, messages, streamingActions.length]);

  const selectedDocPath = useMemo(() => {
    if (!selectedDocId) return undefined;
    const target = docs.find((doc) => doc.id === selectedDocId);
    if (!target) return undefined;
    return getDocVirtualPath(target);
  }, [docs, selectedDocId]);

  const docByVirtualPath = useMemo(() => {
    const map = new Map<string, KnowledgeDoc>();
    for (const doc of docs) {
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
  }, [docs]);

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
        .split("/")
        .filter(Boolean)
        .slice(0, -1)
        .map((_part, index, rows) => rows.slice(0, index + 1).join("/"));

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
      setShowPanelFolderPopover(false);
    },
    [docByVirtualPath],
  );

  const submit = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;

    setMessages((prev) => [...prev, { id: `${Date.now()}-u`, role: 'user', content }]);
    setInput('');
    setSending(true);
    setStreamingStatus('正在分析需求…');
    setStreamingThinking([]);
    setStreamingActions([]);
    setStreamingReply('');
    const streamStartedAt = Date.now();
    setStreamStartedAtMs(streamStartedAt);
    setStreamingProcess([{ text: '已发送请求，开始分析需求', atMs: 0 }]);

    let streamRafId: number | null = null;
    let pendingReplyDelta = '';
    const flushPendingReply = () => {
      if (!pendingReplyDelta) return;
      const chunk = pendingReplyDelta;
      pendingReplyDelta = '';
      setStreamingReply((prev) => prev + chunk);
    };
    const scheduleReplyFlush = () => {
      if (!pendingReplyDelta || streamRafId !== null) return;
      if (typeof window === 'undefined') {
        flushPendingReply();
        return;
      }
      streamRafId = window.requestAnimationFrame(() => {
        streamRafId = null;
        flushPendingReply();
      });
    };
    const resetReplyStream = () => {
      pendingReplyDelta = '';
      if (streamRafId !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(streamRafId);
      }
      streamRafId = null;
      setStreamingReply('');
    };

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
          conversationId: conversationId || undefined,
          folderId: folderId || undefined,
          currentPath: selectedDocPath,
          fastMode: false,
          message: content,
          stream: true,
        }),
      });
      if (!res.ok || !res.body) {
        clearTimeout(timeoutWarnId);
        const payload = (await res.json().catch(() => ({}))) as {
          error?: { message?: string } | string;
        };
        throw new Error(typeof payload.error === 'string' ? payload.error : payload.error?.message || '发送失败');
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

        let boundaryMatch = buffer.match(/\r?\n\r?\n/);
        while (boundaryMatch && typeof boundaryMatch.index === 'number') {
          const boundary = boundaryMatch.index;
          const boundaryLength = boundaryMatch[0].length;
          const block = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + boundaryLength);
          boundaryMatch = buffer.match(/\r?\n\r?\n/);
          if (!block) continue;

          const eventLine = block.split('\n').find((line) => line.startsWith('event:'));
          const dataLines = block
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim());
          const eventName = eventLine ? eventLine.replace(/^event:\s*/, '').trim() : 'message';
          const dataRaw = dataLines.join('\n');
          if (!dataRaw) continue;

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(dataRaw) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (eventName === 'conversation') {
            const cid = typeof payload.conversationId === 'string' ? payload.conversationId : '';
            if (cid) {
              nextConversationId = cid;
              pushProcess('会话已建立');
            }
          } else if (eventName === 'reply_reset') {
            finalReply = '';
            resetReplyStream();
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
              pendingReplyDelta += delta;
              scheduleReplyFlush();
            }
          } else if (eventName === 'final') {
            flushPendingReply();
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
            const message = typeof payload.message === 'string' ? payload.message : '发送失败';
            pushProcess(`错误：${message}`);
            throw new Error(message);
          }
        }
      }
      flushPendingReply();
      clearTimeout(timeoutWarnId);

      if (nextConversationId && nextConversationId !== conversationId) {
        router.push(`${getTenantPath('/chat')}?cid=${nextConversationId}`);
      }
      if (finalReply.trim()) {
        setMessages((prev) => [
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
      setStreamingStatus('');
      setStreamingThinking([]);
      setStreamingActions([]);
      setStreamingReply('');
      setStreamingProcess([]);
      setStreamStartedAtMs(null);
      await loadConversations();
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          role: 'assistant',
          content: `请求失败：${error instanceof Error ? error.message : '请稍后重试'}`,
        },
      ]);
      setStreamingStatus('');
      setStreamingThinking([]);
      setStreamingActions([]);
      setStreamingReply('');
      setStreamingProcess([]);
      setStreamStartedAtMs(null);
    } finally {
      if (streamRafId !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(streamRafId);
      }
      setSending(false);
    }
  }, [authToken, conversationId, folderId, getTenantPath, input, loadConversations, router, selectedDocPath, sending]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void submit();
      }
    },
    [submit],
  );

  const selectedFolder = useMemo(() => folders.find((item) => item.id === folderId), [folderId, folders]);
  const currentConversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversationId, conversations],
  );
  const streamingPreviewMessage = useMemo<ChatRow | null>(() => {
    if (!sending) return null;
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
  }, [sending, streamingActions, streamingProcess, streamingReply, streamingThinking]);
  const displayedMessages = useMemo(
    () => (streamingPreviewMessage ? [...messages, streamingPreviewMessage] : messages),
    [messages, streamingPreviewMessage],
  );

  useEffect(() => {
    if (!messageBottomRef.current) return;
    const rafId = window.requestAnimationFrame(() => {
      messageBottomRef.current?.scrollIntoView({
        block: 'end',
        behavior: sending ? 'auto' : 'smooth',
      });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [displayedMessages.length, sending, streamingReply, streamingProcess]);

  useEffect(() => {
    if (!showFileTree || !selectedDocId) return;
    const node = treeNodeRefs.current[selectedDocId];
    if (!node) return;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selectedDocId, showFileTree]);

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

    for (const doc of docs) {
      const virtualPath = getDocVirtualPath(doc);
      if (!virtualPath) continue;
      if (hasHiddenPathSegment(virtualPath) && !isCoreDocPath(virtualPath)) continue;
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

    return sortTreeNodes(roots, treeOrderByParent);
  }, [docs, treeOrderByParent]);

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

    return treeNodes.map((node) => filterNode(node)).filter((node): node is FileTreeNode => Boolean(node));
  }, [docSearch, treeNodes]);

  const pendingRawDocCount = useMemo(() => {
    let count = 0;
    for (const doc of docs) {
      const path = normalizeDocPath(getDocVirtualPath(doc)).toLowerCase();
      if (!path.startsWith('01-素材库/raw/')) continue;
      const metadata = doc.metadata || {};
      const contentFactory =
        metadata.contentFactory && typeof metadata.contentFactory === 'object' && !Array.isArray(metadata.contentFactory)
          ? (metadata.contentFactory as Record<string, unknown>)
          : {};
      const wikiStatus = typeof contentFactory.wikiStatus === 'string'
        ? contentFactory.wikiStatus.trim().toLowerCase()
        : '';
      if (wikiStatus !== 'done') count += 1;
    }
    return count;
  }, [docs]);

  const toggleFolder = useCallback((path: string) => {
    setOpenTreePaths((prev) => ({ ...prev, [path]: !prev[path] }));
  }, []);

  const selectDoc = useCallback((fileId: string) => {
    setSelectedDocId(fileId);
    setShowDocPreview(true);
  }, []);

  const createDocAtPath = useCallback(async (path: string, options?: { selectCreated?: boolean }) => {
    if (!authToken || !folderId) return null;
    const normalized = normalizeDocPath(path);
    if (!normalized) return null;
    const selectCreated = options?.selectCreated ?? true;
    const res = await fetch(`/api/knowledge/folders/${folderId}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: normalized, content: '' }),
    });
    const payload = await res.json().catch(() => ({})) as { data?: { id?: string }; error?: string };
    if (!res.ok) {
      toast.error(payload.error || '创建失败');
      return null;
    }
    await loadDocs(folderId);
    const nextId = payload.data?.id || null;
    if (nextId && selectCreated) selectDoc(nextId);
    return nextId;
  }, [authToken, folderId, loadDocs, selectDoc]);

  const createDocInFolder = useCallback(async (folderPath: string) => {
    const basePath = normalizeDocPath(folderPath);
    let name = 'new-file.md';
    let index = 1;
    const occupied = new Set(docs.map((doc) => normalizeDocPath(getDocVirtualPath(doc)).toLowerCase()));
    let candidate = basePath ? `${basePath}/${name}` : name;
    while (occupied.has(candidate.toLowerCase())) {
      index += 1;
      name = `new-file-${index}.md`;
      candidate = basePath ? `${basePath}/${name}` : name;
    }
    await createDocAtPath(candidate);
  }, [createDocAtPath, docs]);

  const createFolderAtPath = useCallback(async (folderPath: string) => {
    const normalizedFolder = normalizeDocPath(folderPath);
    if (!normalizedFolder) return;
    await createDocAtPath(`${normalizedFolder}/${FOLDER_MARKER_FILE_NAME}`, { selectCreated: false });
    setOpenTreePaths((prev) => ({ ...prev, [normalizedFolder]: true }));
  }, [createDocAtPath]);

  const createFolderInFolder = useCallback(async (parentPath: string) => {
    const basePath = normalizeDocPath(parentPath);
    let name = 'new-folder';
    let index = 1;
    const occupied = new Set<string>();
    for (const doc of docs) {
      const docPath = normalizeDocPath(getDocVirtualPath(doc));
      const parts = docPath.split('/').filter(Boolean);
      parts.pop();
      for (let i = 1; i <= parts.length; i += 1) {
        occupied.add(parts.slice(0, i).join('/').toLowerCase());
      }
    }
    let candidate = basePath ? `${basePath}/${name}` : name;
    while (occupied.has(candidate.toLowerCase())) {
      index += 1;
      name = `new-folder-${index}`;
      candidate = basePath ? `${basePath}/${name}` : name;
    }
    await createFolderAtPath(candidate);
  }, [createFolderAtPath, docs]);

  const deleteFileById = useCallback(async (fileId: string) => {
    if (!authToken || !fileId) return false;
    setConfirmDialog({
      title: '删除文件',
      message: '确认删除当前文件？该操作不可撤销。',
      confirmText: '删除',
      isDanger: true,
      onConfirm: async () => {
        const res = await fetch(`/api/knowledge/files/${fileId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const payload = await res.json().catch(() => ({})) as { error?: string };
        if (!res.ok) {
          toast.error(payload.error || '删除失败');
          return;
        }
        await loadDocs(folderId);
        if (selectedDocId === fileId) {
          setSelectedDocId(null);
          setSelectedDocContent('');
        }
        toast.success('文件已删除');
      },
    });
    return false;
  }, [authToken, folderId, loadDocs, selectedDocId]);

  const deleteFolderByPath = useCallback(async (folderPath: string) => {
    if (!authToken) return;
    const normalized = normalizeDocPath(folderPath);
    if (!normalized) return;
    const targets = docs.filter((doc) => normalizeDocPath(getDocVirtualPath(doc)).startsWith(`${normalized}/`));
    if (targets.length === 0) return;
    setConfirmDialog({
      title: '删除文件夹',
      message: `确认删除文件夹“${normalized}”及其全部内容？该操作不可撤销。`,
      confirmText: '删除',
      isDanger: true,
      onConfirm: async () => {
        for (const doc of targets) {
          const res = await fetch(`/api/knowledge/files/${doc.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${authToken}` },
          });
          const payload = await res.json().catch(() => ({})) as { error?: string };
          if (!res.ok) {
            toast.error(payload.error || '删除失败');
            return;
          }
        }
        const deletedIds = new Set(targets.map((doc) => doc.id));
        await loadDocs(folderId);
        if (selectedDocId && deletedIds.has(selectedDocId)) {
          setSelectedDocId(null);
          setSelectedDocContent('');
        }
        toast.success('文件夹已删除');
      },
    });
  }, [authToken, docs, folderId, loadDocs, selectedDocId]);

  const moveFile = useCallback(async (fileId: string, nextPath: string) => {
    if (!authToken || !fileId || !folderId || movingTreeNode) return false;
    const normalizedPath = normalizeDocPath(nextPath);
    if (!normalizedPath) return false;
    const hasConflict = docs.some((doc) => doc.id !== fileId && normalizeDocPath(getDocVirtualPath(doc)).toLowerCase() === normalizedPath.toLowerCase());
    if (hasConflict) {
      toast.error('目标位置已有同名文件');
      return false;
    }
    setMovingTreeNode(true);
    try {
      const res = await fetch(`/api/knowledge/files/${fileId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: normalizedPath }),
      });
      const payload = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(payload.error || '移动失败');
      await loadDocs(folderId);
      const parentPaths = normalizedPath.split('/').filter(Boolean).slice(0, -1).map((_v, i, arr) => arr.slice(0, i + 1).join('/'));
      setOpenTreePaths((prev) => {
        const next = { ...prev };
        parentPaths.forEach((p) => { next[p] = true; });
        return next;
      });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '移动失败');
      return false;
    } finally {
      setMovingTreeNode(false);
    }
  }, [authToken, docs, folderId, loadDocs, movingTreeNode]);

  const moveFolder = useCallback(async (sourceFolderPath: string, targetFolderPath: string) => {
    if (!authToken || !folderId || movingTreeNode) return;
    const source = normalizeDocPath(sourceFolderPath);
    const target = normalizeDocPath(targetFolderPath);
    if (!source || target === source || target.startsWith(`${source}/`)) return;
    const sourcePrefix = `${source}/`;
    const toMove = docs.filter((doc) => normalizeDocPath(getDocVirtualPath(doc)).startsWith(sourcePrefix));
    if (toMove.length === 0) return;
    setMovingTreeNode(true);
    try {
      for (const doc of toMove) {
        const currentPath = normalizeDocPath(getDocVirtualPath(doc));
        const suffix = currentPath.slice(sourcePrefix.length);
        const nextPath = joinPath(target, suffix);
        const hasConflict = docs.some((item) => item.id !== doc.id && normalizeDocPath(getDocVirtualPath(item)).toLowerCase() === nextPath.toLowerCase());
        if (hasConflict) throw new Error(`目标位置已有同名文件：${nextPath}`);
      }
      for (const doc of toMove) {
        const currentPath = normalizeDocPath(getDocVirtualPath(doc));
        const suffix = currentPath.slice(sourcePrefix.length);
        const nextPath = joinPath(target, suffix);
        const res = await fetch(`/api/knowledge/files/${doc.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: nextPath }),
        });
        const payload = await res.json().catch(() => ({})) as { error?: string };
        if (!res.ok) throw new Error(payload.error || '移动失败');
      }
      await loadDocs(folderId);
      setOpenTreePaths((prev) => ({ ...prev, [target]: true }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '移动失败');
    } finally {
      setMovingTreeNode(false);
    }
  }, [authToken, docs, folderId, loadDocs, movingTreeNode]);

  const renameFileById = useCallback(async (fileId: string, currentPath: string) => {
    const currentName = getPathBaseName(currentPath);
    const raw = window.prompt('请输入新的文件名（可含 .md）', currentName);
    if (!raw) return;
    const nextNameRaw = raw.trim();
    if (!nextNameRaw || nextNameRaw === currentName) return;
    const nextName = /\.(md|markdown|txt)$/i.test(nextNameRaw) ? nextNameRaw : `${nextNameRaw}.md`;
    const parentPath = getParentPath(currentPath);
    await moveFile(fileId, joinPath(parentPath, nextName));
  }, [moveFile]);

  const renameFolderByPath = useCallback(async (folderPath: string) => {
    const source = normalizeDocPath(folderPath);
    if (!source) return;
    const currentName = getPathBaseName(source);
    const raw = window.prompt('请输入新的文件夹名称', currentName);
    if (!raw) return;
    const nextName = raw.trim();
    if (!nextName || nextName === currentName) return;
    await moveFolder(source, joinPath(getParentPath(source), nextName));
  }, [moveFolder]);

  const reorderNodesInSameParent = useCallback((parentPath: string, draggedId: string, targetIndex: number) => {
    if (!draggedId) return;
    setTreeOrderByParent((prev) => {
      const current = prev[parentPath] || [];
      const withoutDragged = current.filter((id) => id !== draggedId);
      const clampedIndex = Math.max(0, Math.min(targetIndex, withoutDragged.length));
      const next = [
        ...withoutDragged.slice(0, clampedIndex),
        draggedId,
        ...withoutDragged.slice(clampedIndex),
      ];
      return { ...prev, [parentPath]: dedupeIds(next) };
    });
  }, []);

  const openTreeContextMenu = useCallback((event: ReactMouseEvent, input: Omit<TreeContextMenuState, 'x' | 'y' | 'anchorX' | 'anchorY'>) => {
    event.preventDefault();
    event.stopPropagation();
    setTreeContextMenu({
      ...input,
      x: event.clientX,
      y: event.clientY,
      anchorX: event.clientX,
      anchorY: event.clientY,
    });
  }, []);

  const renderTreeContextMenu = useCallback(() => {
    if (!treeContextMenu) return null;
    const canRenameFile = treeContextMenu.nodeType === 'file' && Boolean(treeContextMenu.fileId);
    const canRenameFolder = treeContextMenu.nodeType === 'folder';
    const canDeleteFile = treeContextMenu.nodeType === 'file' && Boolean(treeContextMenu.fileId);
    const canDeleteFolder = treeContextMenu.nodeType === 'folder';
    return (
      <div
        ref={treeContextMenuRef}
        className="fixed z-[90] min-w-[180px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl"
        style={{ left: `${treeContextMenuStyle?.left ?? treeContextMenu.x}px`, top: `${treeContextMenuStyle?.top ?? treeContextMenu.y}px` }}
      >
        <button
          type="button"
          onClick={() => {
            const p = treeContextMenu.folderPath;
            setTreeContextMenu(null);
            void createFolderInFolder(p);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100"
        >
          <FolderPlus className="h-4 w-4" />
          新建文件夹
        </button>
        <button
          type="button"
          onClick={() => {
            const p = treeContextMenu.folderPath;
            setTreeContextMenu(null);
            void createDocInFolder(p);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100"
        >
          <FilePlus className="h-4 w-4" />
          新建文档
        </button>
        {(canRenameFile || canRenameFolder) && (
          <button
            type="button"
            onClick={() => {
              const fileId = treeContextMenu.fileId;
              const currentPath = treeContextMenu.path;
              setTreeContextMenu(null);
              if (canRenameFile && fileId) {
                void renameFileById(fileId, currentPath);
                return;
              }
              if (canRenameFolder) {
                void renameFolderByPath(currentPath);
              }
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100"
          >
            <Pencil className="h-4 w-4" />
            重命名
          </button>
        )}
        {(canDeleteFile || canDeleteFolder) && (
          <button
            type="button"
            onClick={() => {
              const fileId = treeContextMenu.fileId;
              const currentPath = treeContextMenu.path;
              setTreeContextMenu(null);
              if (canDeleteFile && fileId) {
                void deleteFileById(fileId);
                return;
              }
              if (canDeleteFolder) {
                void deleteFolderByPath(currentPath);
              }
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            删除
          </button>
        )}
      </div>
    );
  }, [createDocInFolder, createFolderInFolder, deleteFileById, deleteFolderByPath, renameFileById, renameFolderByPath, treeContextMenu, treeContextMenuStyle]);

  const renderTree = useCallback(
    (nodes: FileTreeNode[], depth = 0, parentPath = ''): React.ReactNode => {
      if (nodes.length === 0) return null;
      return (
        <div className="space-y-0.5">
          {nodes.map((node) => {
            const nodeIndex = nodes.findIndex((item) => item.id === node.id);
            const isInsertLineAbove = treeDropIndicator?.parentPath === parentPath && treeDropIndicator.index === nodeIndex;
            const isInsertLineBelow = treeDropIndicator?.parentPath === parentPath && treeDropIndicator.index === nodeIndex + 1;

            if (node.type === 'folder') {
              const opened = openTreePaths[node.path] ?? true;
              const isDropTarget = dragOverFolderPath === node.path;
              return (
                <div key={node.id}>
                  {isInsertLineAbove ? <div className="my-0.5 h-0.5 rounded-full bg-emerald-500" style={{ marginLeft: `${8 + depth * 14}px` }} /> : null}
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      const payload: TreeDragPayload = { nodeType: 'folder', path: node.path };
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData(TREE_DRAG_MIME, JSON.stringify(payload));
                      setDraggingTreeNodePath(node.path);
                      setDraggingTreeNodeId(node.id);
                      setDraggingTreeNodeName(node.name);
                    }}
                    onDragEnd={() => {
                      setDraggingTreeNodePath(null);
                      setDraggingTreeNodeId(null);
                      setDraggingTreeNodeName(null);
                      setDragOverFolderPath(null);
                      setTreeDropIndicator(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const payload = parseTreeDragPayload(event.dataTransfer.getData(TREE_DRAG_MIME));
                      if (!payload) return;
                      if (payload.path === node.path) return;
                      if (payload.nodeType === 'folder' && node.path.startsWith(`${payload.path}/`)) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const y = event.clientY - rect.top;
                      const edge = Math.min(10, rect.height * 0.3);
                      if (y <= edge || y >= rect.height - edge) {
                        setDragOverFolderPath(null);
                        setTreeDropIndicator({ parentPath, index: y <= edge ? nodeIndex : nodeIndex + 1 });
                        return;
                      }
                      setTreeDropIndicator(null);
                      setDragOverFolderPath(node.path);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDragOverFolderPath(null);
                      const dropIndicator = treeDropIndicator;
                      setTreeDropIndicator(null);
                      const payload = parseTreeDragPayload(event.dataTransfer.getData(TREE_DRAG_MIME));
                      if (!payload) return;
                      if (dropIndicator && draggingTreeNodeId && getParentPath(payload.path) === dropIndicator.parentPath) {
                        reorderNodesInSameParent(dropIndicator.parentPath, draggingTreeNodeId, dropIndicator.index);
                        return;
                      }
                      if (payload.nodeType === 'file' && payload.fileId) {
                        const fileName = payload.path.split('/').filter(Boolean).pop() || 'new-file.md';
                        void moveFile(payload.fileId, joinPath(node.path, fileName));
                        return;
                      }
                      if (payload.nodeType === 'folder') {
                        void moveFolder(payload.path, node.path);
                      }
                    }}
                    onContextMenu={(event) => {
                      openTreeContextMenu(event, {
                        nodeType: 'folder',
                        path: node.path,
                        folderPath: node.path,
                      });
                    }}
                    onClick={() => toggleFolder(node.path)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 transition hover:bg-gray-100 ${
                      isDropTarget ? 'bg-emerald-100 ring-2 ring-emerald-400' : ''
                    } ${draggingTreeNodePath === node.path ? 'opacity-50' : ''}`}
                    style={{ paddingLeft: `${8 + depth * 14}px` }}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${opened ? '' : '-rotate-90'}`} />
                    <Folder className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                    <span className="truncate">{node.name}</span>
                    {isDropTarget && draggingTreeNodeName ? <span className="ml-auto text-[11px] font-medium text-emerald-700">移动到此文件夹</span> : null}
                  </button>
                  {opened ? renderTree(node.children, depth + 1, node.path) : null}
                  {isInsertLineBelow ? <div className="my-0.5 h-0.5 rounded-full bg-emerald-500" style={{ marginLeft: `${8 + depth * 14}px` }} /> : null}
                </div>
              );
            }

            const selected = selectedDocId === node.fileId;
            return (
              <div key={node.id}>
                {isInsertLineAbove ? <div className="my-0.5 h-0.5 rounded-full bg-emerald-500" style={{ marginLeft: `${24 + depth * 14}px` }} /> : null}
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    if (!node.fileId) return;
                    const payload: TreeDragPayload = { nodeType: 'file', path: node.path, fileId: node.fileId };
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData(TREE_DRAG_MIME, JSON.stringify(payload));
                    setDraggingTreeNodePath(node.path);
                    setDraggingTreeNodeId(node.id);
                    setDraggingTreeNodeName(node.name);
                  }}
                  onDragEnd={() => {
                    setDraggingTreeNodePath(null);
                    setDraggingTreeNodeId(null);
                    setDraggingTreeNodeName(null);
                    setDragOverFolderPath(null);
                    setTreeDropIndicator(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const payload = parseTreeDragPayload(event.dataTransfer.getData(TREE_DRAG_MIME));
                    if (!payload) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const y = event.clientY - rect.top;
                    setTreeDropIndicator({ parentPath, index: y <= rect.height / 2 ? nodeIndex : nodeIndex + 1 });
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const dropIndicator = treeDropIndicator;
                    setTreeDropIndicator(null);
                    const payload = parseTreeDragPayload(event.dataTransfer.getData(TREE_DRAG_MIME));
                    if (!dropIndicator || !draggingTreeNodeId || !payload) return;
                    if (getParentPath(payload.path) !== dropIndicator.parentPath) return;
                    reorderNodesInSameParent(dropIndicator.parentPath, draggingTreeNodeId, dropIndicator.index);
                  }}
                  onContextMenu={(event) => {
                    if (!node.fileId) return;
                    openTreeContextMenu(event, {
                      nodeType: 'file',
                      path: node.path,
                      folderPath: getParentPath(node.path),
                      fileId: node.fileId,
                    });
                  }}
                  onClick={() => node.fileId && selectDoc(node.fileId)}
                  ref={(element) => {
                    if (!node.fileId) return;
                    treeNodeRefs.current[node.fileId] = element;
                  }}
                  data-doc-node-id={node.fileId}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                    selected ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                  } ${draggingTreeNodePath === node.path ? 'opacity-50' : ''}`}
                  style={{ paddingLeft: `${24 + depth * 14}px` }}
                  title={node.path}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                  <span className="truncate">{node.name}</span>
                </button>
                {isInsertLineBelow ? <div className="my-0.5 h-0.5 rounded-full bg-emerald-500" style={{ marginLeft: `${24 + depth * 14}px` }} /> : null}
              </div>
            );
          })}
        </div>
      );
    },
    [
      dragOverFolderPath,
      draggingTreeNodeId,
      draggingTreeNodeName,
      draggingTreeNodePath,
      moveFile,
      moveFolder,
      openTreeContextMenu,
      openTreePaths,
      reorderNodesInSameParent,
      selectDoc,
      selectedDocId,
      toggleFolder,
      treeDropIndicator,
    ],
  );

  const organizeWiki = useCallback(async () => {
    if (!authToken || !folderId || organizingWiki) return;
    setOrganizingWiki(true);
    try {
      const res = await fetch(`/api/knowledge/folders/${folderId}/wiki-organize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 8 }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        data?: WikiOrganizeResult;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || '梳理失败');
      const result = payload.data;
      const processed = result?.processed ?? 0;
      const succeeded = result?.succeeded ?? 0;
      const failed = result?.failed ?? 0;
      if (processed === 0) {
        toast.success('没有待梳理的原始文章');
      } else if (failed > 0) {
        const failedItems = (result?.items || []).filter((item) => !item.ok).slice(0, 3);
        const firstError = failedItems[0];
        const detail = firstError
          ? `；示例：${firstError.rawPath}${firstError.error ? `（${firstError.error}）` : ''}`
          : '';
        toast.error(`梳理完成：成功 ${succeeded}，失败 ${failed}${detail}`);
      } else {
        toast.success(`已梳理 ${succeeded} 篇原始文章`);
      }
      await loadDocs(folderId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '梳理失败');
    } finally {
      setOrganizingWiki(false);
    }
  }, [authToken, folderId, loadDocs, organizingWiki]);

  const normalizeStructure = useCallback(async () => {
    if (!authToken || !folderId || normalizingStructure) return;
    setConfirmDialog({
      title: '整理默认内容工厂结构',
      message: '将当前仓库整理为默认内容工厂结构，并清理非必要文件，是否继续？',
      confirmText: '开始整理',
      isDanger: false,
      onConfirm: async () => {
        setNormalizingStructure(true);
        try {
          const res = await fetch(`/api/knowledge/folders/${folderId}/normalize-structure`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          });
          const payload = (await res.json().catch(() => ({}))) as {
            data?: NormalizeStructureResult;
            error?: string;
          };
          if (!res.ok) throw new Error(payload.error || '结构整理失败');
          const data = payload.data;
          const moved = data?.moved ?? 0;
          const deleted = data?.deleted ?? 0;
          const created = data?.created ?? 0;
          const extra = data?.wrapperPrefixRemoved ? `，已去除外层目录 ${data.wrapperPrefixRemoved}` : '';
          toast.success(`结构整理完成：迁移 ${moved}、删除 ${deleted}、创建 ${created}${extra}`);
          await loadDocs(folderId);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : '结构整理失败');
        } finally {
          setNormalizingStructure(false);
        }
      },
    });
  }, [authToken, folderId, loadDocs, normalizingStructure]);

  const mainPaddingClass = showFileTree
    ? showDocPreview
      ? 'md:pr-[792px]'
      : 'md:pr-[332px]'
    : '';

  return (
    <div className="min-h-screen bg-white">
      <div className={`mx-auto flex h-full w-full max-w-6xl flex-col px-4 pb-24 pt-3 ${mainPaddingClass}`}>
        <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-2">
          <div className="relative flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(getTenantPath('/dashboard'))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50"
              aria-label="返回首页"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={startNewConversation}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
              aria-label="新对话"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              ref={historyButtonRef}
              type="button"
              onClick={() => setShowHistoryPopover((prev) => !prev)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
              aria-label="历史对话"
            >
              <History className="h-4 w-4" />
            </button>
            <p className="max-w-[220px] truncate pl-1 text-sm font-medium text-gray-800">
              {currentConversation?.title?.trim() || (conversationId ? '未命名对话' : '新对话')}
            </p>

            {showHistoryPopover && (
              <div
                ref={historyPopoverRef}
                className="absolute left-0 top-12 z-30 w-[min(86vw,360px)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
                  <p className="text-sm font-semibold text-gray-900">历史对话</p>
                  <button
                    type="button"
                    onClick={startNewConversation}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新建
                  </button>
                </div>
                <div className="max-h-[360px] overflow-y-auto py-1.5">
                  {loadingConversations ? (
                    <div className="flex items-center gap-2 px-4 py-4 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      加载中…
                    </div>
                  ) : conversations.length === 0 ? (
                    <p className="px-4 py-5 text-sm text-gray-500">暂无历史对话</p>
                  ) : (
                    conversations.map((item) => {
                      const selected = item.id === conversationId;
                      return (
                        <div key={item.id} className="group flex items-center gap-1 px-2 py-1">
                          <button
                            type="button"
                            onClick={() => openConversation(item.id)}
                            className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition ${
                              selected ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <p className="truncate text-sm font-medium">{item.title?.trim() || '未命名对话'}</p>
                            <p className="mt-0.5 text-xs text-gray-500">{item._count?.messages ?? 0} 条消息</p>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteConversation(item.id);
                            }}
                            disabled={Boolean(deletingConversationId)}
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 ${
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

          <button
            type="button"
            onClick={() => {
              setShowFileTree((prev) => !prev);
              if (showFileTree) {
                setShowPanelFolderPopover(false);
              }
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-50"
            aria-label="打开文件树"
            title="文件树"
          >
            <Folder className="h-4 w-4" />
          </button>
        </div>

        <div ref={messageScrollRef} className="flex-1 overflow-y-auto px-1 py-2">
          {loading ? (
            <div className="mx-auto inline-flex max-w-4xl items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载会话…
            </div>
          ) : !conversationId && messages.length === 0 ? (
            <p className="mx-auto max-w-4xl text-sm text-gray-500">点击左上角 + 发起新对话</p>
          ) : displayedMessages.length === 0 ? (
            <p className="mx-auto max-w-4xl text-sm text-gray-500">暂无消息，开始输入吧。</p>
          ) : (
            <>
              <div className="mx-auto w-full max-w-4xl space-y-6">
                {displayedMessages.map((message) => {
                const actions = parseAgentActions(message.metadata?.agentActions);
                const thinking = parseThinkingItems(message.metadata?.thinking);
                    const referencedDocs = message.role === 'assistant'
                      ? ((message.metadata?.references?.length ?? 0) > 0
                        ? message.metadata!.references!.map((item) => item.path)
                        : extractReferencedDocs(actions))
                      : [];
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
                return (
                  <article key={message.id}>
                    <p className="mb-1 text-[11px] font-medium text-gray-400">{message.role === 'user' ? '你' : 'Agent'}</p>
                    {processingWithHint.length > 0 ? (
                      <div className="mb-2 text-xs text-gray-700">
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
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-50"
                            >
                              {processExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              {processExpanded ? '收起' : `展开 ${processGroups.length} 项`}
                            </button>
                          ) : null}
                        </div>
                        <ol className="relative pl-4">
                          <span className="pointer-events-none absolute bottom-1 left-[5px] top-1 w-px bg-gray-300" />
                          {visibleProcessGroups.map((group, groupIdx) => {
                            const actualGroupIdx = processExpanded ? groupIdx : processGroups.length - 1 + groupIdx;
                            const isCurrent = isStreamingMessage && actualGroupIdx === processGroups.length - 1;
                            return (
                              <li key={`${message.id}-processing-group-${actualGroupIdx}`} className="relative mb-2 last:mb-0">
                                <span
                                  className={`absolute -left-[15px] top-[4px] inline-block h-2.5 w-2.5 rounded-full ${
                                    isCurrent
                                      ? 'bg-gray-900 ring-2 ring-gray-200'
                                      : 'bg-gray-200'
                                  }`}
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className={`text-[12px] font-semibold ${isCurrent ? 'text-gray-900' : 'text-gray-300'}`}>
                                      {actualGroupIdx + 1}. {getProcessStageLabel(group.stage)}
                                    </p>
                                    <span className={`text-[11px] ${isCurrent ? 'text-gray-700' : 'text-gray-300'}`}>
                                      {formatProcessDuration(group.elapsedMs)}
                                    </span>
                                  </div>
                                  <p className={`mt-0.5 text-[12px] ${isCurrent ? 'text-gray-600' : 'text-gray-400'}`}>
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
                      <div className="mb-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300">
                        <p className="mb-1 font-semibold">分析过程</p>
                        <ul className="space-y-1">
                          {thinking.map((item, idx) => (
                            <li key={`${message.id}-thinking-${idx}`}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="whitespace-pre-wrap text-[15px] leading-8 text-gray-800">{normalizeAssistantText(message.content)}</div>

                    {message.role === 'assistant' && actions.length > 0 ? (
                      <div className="mt-2 text-xs text-gray-600">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>待执行文件操作 {actions.length} 项</span>
                          <button
                            type="button"
                            onClick={() => void executeActions(message.id, actions)}
                            disabled={isStreamingMessage || !folderId || executingMessageId === message.id}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {executingMessageId === message.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            执行
                          </button>
                          {!folderId ? <span className="text-amber-700">未选择文件夹</span> : null}
                        </div>

                        {results.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {results.map((result, idx) => (
                              <p key={`${message.id}:result:${idx}`} className={result.ok ? 'text-emerald-700' : 'text-red-700'}>
                                {result.ok ? 'OK' : 'ERR'} · {result.type.toUpperCase()} · {result.path}
                                {result.error ? ` · ${result.error}` : ''}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {message.role === 'assistant' ? (
                      <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                        <p className="font-semibold text-gray-800">引用文档</p>
                        {referencedDocs.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {referencedDocs.map((path) => (
                              <button
                                key={`${message.id}-ref-${path}`}
                                type="button"
                                onClick={() => openReferencedDoc(path)}
                                className="rounded-md border border-gray-200 bg-white px-2 py-0.5 font-mono text-[11px] text-gray-700 transition hover:border-gray-300 hover:bg-gray-100"
                                title={path}
                              >
                                {path}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-gray-500">本次回复未引用文档</p>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
                })}
              </div>
              <div ref={messageBottomRef} className="h-1 w-full" />
            </>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur">
        <div className={`mx-auto w-full max-w-6xl px-4 pb-4 pt-3 ${mainPaddingClass}`}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="继续输入需求，Ctrl/⌘ + Enter 发送"
            className="min-h-[80px] w-full resize-none bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {selectedFolder?.name ? `当前文件夹：${selectedFolder.name}` : '未选择文件夹'}
              {selectedDocPath ? ` · 当前文件：${selectedDocPath}` : ''}
            </span>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={sending || !input.trim()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--tenant-primary,#16a34a)] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="发送"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {showFileTree && (
        <aside
          className="fixed inset-y-0 right-0 z-40 bg-white ring-1 ring-gray-200"
          style={{ width: `${FILE_TREE_WIDTH}px` }}
        >
          <div className="flex h-full flex-col">
            <div className="flex h-[52px] items-center justify-between border-b border-gray-200 px-3">
              <div className="relative min-w-0">
                <button
                  ref={panelFolderButtonRef}
                  type="button"
                  onClick={() => setShowPanelFolderPopover((prev) => !prev)}
                  className="inline-flex h-8 max-w-[220px] items-center gap-2 rounded-lg px-2 text-sm font-medium text-gray-800 transition hover:bg-gray-100"
                >
                  <Folder className="h-4 w-4 shrink-0 text-gray-500" />
                  <span className="truncate">{selectedFolder?.name || '未选择文件夹'}</span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition ${showPanelFolderPopover ? 'rotate-180' : ''}`} />
                </button>

                {showPanelFolderPopover && (
                  <div
                    ref={panelFolderPopoverRef}
                    className="absolute left-0 top-full z-50 mt-2 w-[260px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
                  >
                    <div className="max-h-[280px] overflow-y-auto py-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setFolderId('');
                          setSelectedDocId(null);
                          setSelectedDocContent('');
                          setShowPanelFolderPopover(false);
                        }}
                        className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                          !folderId ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span>不使用仓库</span>
                        {!folderId ? <Check className="h-4 w-4" /> : null}
                      </button>
                      {folders.map((item) => {
                        const selected = item.id === folderId;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setFolderId(item.id);
                              setSelectedDocId(null);
                              setSelectedDocContent('');
                              setShowPanelFolderPopover(false);
                            }}
                            className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                              selected ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span className="truncate">{item.name}</span>
                            {selected ? <Check className="h-4 w-4" /> : null}
                          </button>
                        );
                      })}
                      {folders.length === 0 ? <p className="px-4 py-5 text-xs text-gray-500">暂无文件夹</p> : null}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void createFolderInFolder('')}
                  disabled={!folderId}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="新建文件夹"
                  title="新建文件夹"
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void createDocInFolder('')}
                  disabled={!folderId}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="新建文档"
                  title="新建文档"
                >
                  <FilePlus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void normalizeStructure()}
                  disabled={!folderId || normalizingStructure}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="整理为默认内容工厂结构"
                  title="整理为默认内容工厂结构"
                >
                  {normalizingStructure ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => void organizeWiki()}
                  disabled={!folderId || organizingWiki}
                  className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="梳理待处理原文为 llm-wiki"
                  title="梳理待处理原文为 llm-wiki"
                >
                  {organizingWiki ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                  {pendingRawDocCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold leading-4 text-white">
                      {pendingRawDocCount > 99 ? '99+' : pendingRawDocCount}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowFileTree(false);
                    setShowPanelFolderPopover(false);
                    setTreeContextMenu(null);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100"
                  aria-label="关闭文件树"
                  title="关闭文件树"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="border-b border-gray-200 px-3 py-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={docSearch}
                  onChange={(event) => setDocSearch(event.target.value)}
                  placeholder="筛选文件..."
                  className="h-9 w-full rounded-xl bg-gray-50 pl-8 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:bg-gray-100"
                />
              </div>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto p-3"
              onContextMenu={(event) => {
                openTreeContextMenu(event, {
                  nodeType: 'root',
                  path: '',
                  folderPath: '',
                });
              }}
              onDragOver={(event) => {
                event.preventDefault();
                const payload = parseTreeDragPayload(event.dataTransfer.getData(TREE_DRAG_MIME));
                if (!payload) return;
                if (payload.path.includes('/')) {
                  event.dataTransfer.dropEffect = 'move';
                  setDragOverFolderPath('');
                  setTreeDropIndicator(null);
                }
              }}
              onDragLeave={() => {
                setDragOverFolderPath((prev) => (prev === '' ? null : prev));
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragOverFolderPath(null);
                setTreeDropIndicator(null);
                const payload = parseTreeDragPayload(event.dataTransfer.getData(TREE_DRAG_MIME));
                if (!payload) return;
                if (payload.nodeType === 'file' && payload.fileId) {
                  const fileName = payload.path.split('/').filter(Boolean).pop() || 'new-file.md';
                  void moveFile(payload.fileId, fileName);
                  return;
                }
                if (payload.nodeType === 'folder') {
                  void moveFolder(payload.path, '');
                }
              }}
            >
              {dragOverFolderPath === '' ? (
                <div className="mb-2 rounded-lg border-2 border-dashed border-emerald-400 bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-800">
                  松开后将移动到根目录
                </div>
              ) : null}
              {!folderId ? (
                <p className="rounded-xl bg-gray-50 px-3 py-6 text-center text-xs text-gray-500">先选择一个文件夹</p>
              ) : filteredTreeNodes.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-3 py-6 text-center text-xs text-gray-500">当前暂无 Markdown 文件</p>
              ) : (
                renderTree(filteredTreeNodes)
              )}
              {renderTreeContextMenu()}
            </div>
          </div>
        </aside>
      )}

      {showDocPreview && selectedDocId && (
        <>
          <aside
            className="fixed inset-y-0 z-40 hidden bg-white ring-1 ring-gray-200 md:flex md:flex-col"
            style={{ right: `${FILE_TREE_WIDTH}px`, width: `${DOC_PREVIEW_WIDTH}px` }}
          >
            <div className="flex h-[52px] items-center justify-between border-b border-gray-200 px-4">
              <p className="truncate text-sm font-medium text-gray-700">{selectedDocPath || '文档预览'}</p>
              <button
                type="button"
                onClick={() => setShowDocPreview(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100"
                aria-label="关闭文档预览"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {loadingDocContent ? (
                <div className="inline-flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  加载文档中
                </div>
              ) : (
                <article className="whitespace-pre-wrap text-sm leading-7 text-gray-800">{selectedDocContent || '文档为空'}</article>
              )}
            </div>
          </aside>

          <div className="fixed inset-0 z-50 bg-black/45 p-3 md:hidden">
            <div className="flex h-full flex-col rounded-xl bg-white shadow-xl">
              <div className="flex h-[50px] items-center justify-between border-b border-gray-200 px-3">
                <p className="truncate text-sm font-medium text-gray-700">{selectedDocPath || '文档预览'}</p>
                <button
                  type="button"
                  onClick={() => setShowDocPreview(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {loadingDocContent ? (
                  <div className="inline-flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    加载文档中
                  </div>
                ) : (
                  <article className="whitespace-pre-wrap text-sm leading-7 text-gray-800">{selectedDocContent || '文档为空'}</article>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      <ConfirmModal
        isOpen={Boolean(confirmDialog)}
        onClose={() => setConfirmDialog(null)}
        onConfirm={async () => {
          if (!confirmDialog) return;
          await confirmDialog.onConfirm();
        }}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        confirmText={confirmDialog?.confirmText}
        cancelText="取消"
        isDanger={confirmDialog?.isDanger ?? true}
      />
    </div>
  );
}
