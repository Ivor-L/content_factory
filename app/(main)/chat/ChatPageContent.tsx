'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  History,
  Loader2,
  Plus,
  Search,
  SendHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
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

type FileTreeNode = {
  id: string;
  name: string;
  type: 'folder' | 'file';
  path: string;
  fileId?: string;
  children: FileTreeNode[];
};

const NEXAPI_KEY_STORAGE_KEY = 'nexapi_key';
const CHAT_REQUEST_TIMEOUT_MS = 240_000;
const MESSAGE_FETCH_TIMEOUT_MS = 15_000;
const FILE_TREE_WIDTH = 320;
const DOC_PREVIEW_WIDTH = 460;

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
  const { basePath } = useTenant();

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
  const [docSearch, setDocSearch] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocContent, setSelectedDocContent] = useState('');
  const [loadingDocContent, setLoadingDocContent] = useState(false);
  const [openTreePaths, setOpenTreePaths] = useState<Record<string, boolean>>({});

  const [showFileTree, setShowFileTree] = useState(false);
  const [showDocPreview, setShowDocPreview] = useState(false);
  const [showPanelFolderPopover, setShowPanelFolderPopover] = useState(false);

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
            metadata?: { agentActions?: AgentAction[]; thinking?: string[]; processing?: string[] } | null;
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
      const confirmed = window.confirm('确认删除这个历史对话？该操作不可撤销。');
      if (!confirmed) return;

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
        window.alert(error instanceof Error ? error.message : '删除对话失败');
      } finally {
        setDeletingConversationId(null);
      }
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
    [authToken, folderId],
  );

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
          window.alert(`未在当前文件夹找到引用文档：${referencePath}`);
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
          fastMode: true,
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
            const message = typeof payload.message === 'string' ? payload.message : '发送失败';
            pushProcess(`错误：${message}`);
            throw new Error(message);
          }
        }
      }
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
  }, [openTreePaths, selectedDocId, showFileTree]);

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
  }, [docs]);

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

  const toggleFolder = useCallback((path: string) => {
    setOpenTreePaths((prev) => ({ ...prev, [path]: !prev[path] }));
  }, []);

  const selectDoc = useCallback((fileId: string) => {
    setSelectedDocId(fileId);
    setShowDocPreview(true);
  }, []);

  const renderTree = useCallback(
    (nodes: FileTreeNode[], depth = 0): React.ReactNode => {
      if (nodes.length === 0) {
        return null;
      }

      return (
        <div className="space-y-0.5">
          {nodes.map((node) => {
            if (node.type === 'folder') {
              const opened = openTreePaths[node.path] ?? true;
              return (
                <div key={node.id}>
                  <button
                    type="button"
                    onClick={() => toggleFolder(node.path)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 transition hover:bg-gray-100"
                    style={{ paddingLeft: `${8 + depth * 14}px` }}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${opened ? '' : '-rotate-90'}`} />
                    <Folder className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                    <span className="truncate">{node.name}</span>
                  </button>
                  {opened ? renderTree(node.children, depth + 1) : null}
                </div>
              );
            }

            const selected = selectedDocId === node.fileId;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => node.fileId && selectDoc(node.fileId)}
                ref={(element) => {
                  if (!node.fileId) return;
                  treeNodeRefs.current[node.fileId] = element;
                }}
                data-doc-node-id={node.fileId}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                  selected ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                }`}
                style={{ paddingLeft: `${24 + depth * 14}px` }}
                title={node.path}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                <span className="truncate">{node.name}</span>
              </button>
            );
          })}
        </div>
      );
    },
    [openTreePaths, selectDoc, selectedDocId, toggleFolder],
  );

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
                    const referencedDocs = message.role === 'assistant' ? extractReferencedDocs(actions) : [];
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
                      <div className="mb-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                        <p className="mb-1 font-semibold">分析过程</p>
                        <ul className="space-y-1">
                          {thinking.map((item, idx) => (
                            <li key={`${message.id}-thinking-${idx}`}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="whitespace-pre-wrap text-[15px] leading-8 text-gray-800">{message.content}</div>

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

              <button
                type="button"
                onClick={() => {
                  setShowFileTree(false);
                  setShowPanelFolderPopover(false);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100"
                aria-label="关闭文件树"
              >
                <X className="h-4 w-4" />
              </button>
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

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {!folderId ? (
                <p className="rounded-xl bg-gray-50 px-3 py-6 text-center text-xs text-gray-500">先选择一个文件夹</p>
              ) : filteredTreeNodes.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-3 py-6 text-center text-xs text-gray-500">当前暂无 Markdown 文件</p>
              ) : (
                renderTree(filteredTreeNodes)
              )}
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
    </div>
  );
}
