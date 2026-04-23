import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import {
  buildCanvasUpstreamHeaders,
  resolveCanvasUpstreamApiKey,
  resolveCanvasUpstreamEndpoint,
  relayUpstreamResponse,
} from "@/lib/canvasUpstream";
import { findSkillByName } from "@/lib/skills";
import {
  ASSISTANT_PROVIDER_OPTIONS,
  inferAssistantProviderFromModel,
  normalizeAssistantProviderId,
  parseAssistantProviderId,
  providerUsesNexApiProxy,
  type AssistantProviderId,
} from "@/lib/assistants/provider-routing";
import { ensureCoreDocsForFolder } from "@/lib/assistants/core-docs";

type AssistantMode = "xhs" | "wechat";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatRequestPayload = {
  assistantMode?: AssistantMode;
  messages?: ChatMessage[];
  folderId?: string;
  currentPath?: string;
  model?: string;
  skills?: string[];
  conversationId?: string;
  message?: string;
  providerId?: string;
  fastMode?: boolean;
  stream?: boolean;
};

type AgentActionType = "read" | "create" | "update" | "delete";

type AgentAction = {
  type: AgentActionType;
  path: string;
  content?: string;
  reason?: string;
};

type ParsedReadAction = {
  type: "read";
  path: string;
  reason?: string;
};

type KnowledgeFileItem = {
  id: string;
  title: string;
  originalPath: string | null;
  updatedAt: Date;
  createdAt: Date;
  metadata: unknown;
};

const DEFAULT_PROVIDER_ID: AssistantProviderId = "codex";
const DEFAULT_MODEL = "gpt-5.3-codex";
const MAX_MESSAGES = 30;
const MAX_FAST_MODE_MESSAGES = 8;
const MAX_PROXY_ROUTE_LOOKUP = 120;
const UPSTREAM_TIMEOUT_MS = 90_000;
const NEXAPI_MAIN_URL = process.env.NEXAPI_ROUTE_MAIN?.trim() || "https://aiapi.atomx.top";

const MAX_CORE_DOC_SCAN_FILES = 180;
const MAX_CORE_DOC_DOCS = 8;
const MAX_CORE_DOC_CONTENT_CHARS = 2200;

const MAX_WORKSPACE_FILE_SCAN = 420;
const MAX_WORKSPACE_FILE_SCAN_FAST = 240;
const MAX_WORKSPACE_RECENT_LIST = 12;
const MAX_WORKSPACE_RECENT_LIST_FAST = 8;

const MAX_SELECTED_FILE_CONTENT_CHARS = 2600;

const MAX_AUTO_READ_ACTIONS = 4;
const MAX_AUTO_READ_PATH_LEN = 240;
const MAX_AUTO_READ_FILE_CHARS = 2400;
const MAX_READ_RESULT_CONTEXT_CHARS = 6800;

const PROVIDER_LABEL_BY_ID = ASSISTANT_PROVIDER_OPTIONS.reduce<Record<string, string>>((acc, item) => {
  acc[item.id] = item.label;
  return acc;
}, {});

const UNIFIED_AGENT_PROMPT = [
  "你是一个文件树驱动的通用内容 Agent。",
  "你的职责是围绕当前仓库（文件树）执行文档增删改查与知识整理，不区分小红书/公众号等子助理。",
  "优先使用用户当前选中文档路径附近的核心文档（SOUL/IDENTITY/AGENTS/MEMORY/USER/CLAUDE）作为行为约束。",
].join("\n");

const ASSISTANT_MODE_PROMPTS: Record<AssistantMode, string> = {
  xhs: UNIFIED_AGENT_PROMPT,
  wechat: UNIFIED_AGENT_PROMPT,
};

const CORE_DOC_NAME_ALIASES: Array<{ canonical: string; names: string[] }> = [
  { canonical: "SOUL.md", names: ["SOUL.md", "SOULS.md"] },
  { canonical: "IDENTITY.md", names: ["IDENTITY.md"] },
  { canonical: "AGENTS.md", names: ["AGENTS.md", "AGENT.md"] },
  { canonical: "MEMORY.md", names: ["MEMORY.md", "MEMORIES.md"] },
  { canonical: "USER.md", names: ["USER.md", "USERS.md"] },
  { canonical: "CLAUDE.md", names: ["CLAUDE.md"] },
  { canonical: "README.md", names: ["README.md"] },
  { canonical: "INDEX.md", names: ["INDEX.md", "index.md"] },
];

type ConversationState = {
  conversationId: string | null;
  assistantMode: AssistantMode;
  model: string;
  providerId: AssistantProviderId;
  skills: string[];
  folderId: string | null;
  messages: ChatMessage[];
};

type UpstreamCallResult = {
  reply: string;
  route: string | null;
};

type UpstreamStreamHandlers = {
  onContentDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
};

function resolveInternalAppBaseUrl(request: NextRequest) {
  const envInternal = process.env.INTERNAL_APP_BASE_URL?.trim();
  if (envInternal) {
    return envInternal.replace(/\/$/, "");
  }

  const port = process.env.PORT?.trim() || request.nextUrl.port || "3000";
  if (process.env.NODE_ENV !== "production") {
    return `http://127.0.0.1:${port}`;
  }

  const origin = request.nextUrl.origin || process.env.NEXT_PUBLIC_SITE_URL || `http://127.0.0.1:${port}`;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.trim().toLowerCase();
    if (host === "127.0.0.1" || host === "0.0.0.0") {
      const parsedPort = parsed.port || request.nextUrl.port || "3000";
      return `${parsed.protocol}//localhost:${parsedPort}`;
    }
    return parsed.origin;
  } catch {
    return process.env.NEXT_PUBLIC_SITE_URL || `http://127.0.0.1:${port}`;
  }
}

function looksLikeByokUpstreamKey(value: string | null | undefined) {
  if (!value) return false;
  const token = value.trim();
  return token.startsWith("sk-") && token.length >= 20;
}

function normalizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const rows: ChatMessage[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const role = typeof row.role === "string" ? row.role : "";
    const content = typeof row.content === "string" ? row.content.trim() : "";
    if (!content) continue;
    if (role !== "user" && role !== "assistant" && role !== "system") continue;
    rows.push({ role, content });
    if (rows.length >= MAX_MESSAGES) break;
  }
  return rows;
}

function normalizeIncomingMessages(payload: ChatRequestPayload) {
  if (typeof payload.message === "string" && payload.message.trim()) {
    return [{ role: "user" as const, content: payload.message.trim() }];
  }
  const normalized = normalizeMessages(payload.messages);
  if (!normalized.length) return normalized;

  const last = normalized[normalized.length - 1];
  if (last?.role === "user") {
    return [last];
  }
  return normalized;
}

function limitText(input: string, max = 400): string {
  const trimmed = input.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function normalizeDocPath(input: string) {
  return input
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/")
    .trim();
}

function normalizeFilePath(input: string) {
  const normalized = normalizeDocPath(input);
  if (!normalized) return "";
  if (/\.(md|markdown|txt)$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}.md`;
}

function toNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function pathBasename(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function pathDirname(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

function buildCoreDocSearchDirs(currentPath?: string) {
  const normalizedCurrentPath = normalizeDocPath(currentPath || "");
  if (!normalizedCurrentPath) return [];

  const parts = normalizedCurrentPath.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  const looksLikeFile = /\.[a-z0-9]+$/i.test(last);
  const folderParts = looksLikeFile ? parts.slice(0, -1) : parts;
  const dirs: string[] = [];
  for (let idx = folderParts.length; idx >= 0; idx -= 1) {
    dirs.push(folderParts.slice(0, idx).join("/"));
  }
  return Array.from(new Set(dirs));
}

function extractAgentText(payload: unknown): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload.trim();
  if (Array.isArray(payload)) {
    return payload.map((item) => extractAgentText(item)).filter(Boolean).join("\n").trim();
  }
  if (typeof payload !== "object") return "";

  const record = payload as Record<string, unknown>;
  if (typeof record.content === "string") return record.content.trim();
  if (typeof record.text === "string") return record.text.trim();
  if (typeof record.result === "string") return record.result.trim();

  if (Array.isArray(record.content)) {
    const content = record.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        const partRecord = part as Record<string, unknown>;
        if (typeof partRecord.text === "string") return partRecord.text;
        return "";
      })
      .join("")
      .trim();
    if (content) return content;
  }

  if (Array.isArray(record.messages)) {
    const messageRows = record.messages as Array<Record<string, unknown>>;
    const lastAssistant = [...messageRows].reverse().find((item) => item?.role === "assistant");
    if (lastAssistant) {
      const text = extractAgentText(lastAssistant);
      if (text) return text;
    }
  }

  if (Array.isArray(record.choices) && record.choices.length > 0) {
    const choice = record.choices[0] as Record<string, unknown>;
    const text = extractAgentText(choice.message ?? choice.delta ?? choice);
    if (text) return text;
  }

  if (Array.isArray(record.output) && record.output.length > 0) {
    const output = record.output[0] as Record<string, unknown>;
    const text = extractAgentText(output.content ?? output);
    if (text) return text;
  }

  if (Array.isArray(record.candidates) && record.candidates.length > 0) {
    const candidate = record.candidates[0] as Record<string, unknown>;
    const text = extractAgentText(candidate.content ?? candidate);
    if (text) return text;
  }

  return "";
}

function normalizeActionType(value: unknown): AgentActionType | null {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  if (token === "read" || token === "create" || token === "update" || token === "delete") {
    return token;
  }
  return null;
}

function normalizeActionPath(value: unknown): string {
  if (typeof value !== "string") return "";
  return normalizeDocPath(value);
}

function extractJsonCodeBlock(input: string): string | null {
  const match = input.match(/```json\s*([\s\S]*?)\s*```/i);
  if (!match) return null;
  return match[1]?.trim() || null;
}

function parseAgentActions(reply: string): AgentAction[] {
  const text = reply.trim();
  if (!text) return [];

  const candidateJsonList: string[] = [];
  const jsonBlock = extractJsonCodeBlock(text);
  if (jsonBlock) candidateJsonList.push(jsonBlock);
  candidateJsonList.push(text);

  for (const candidate of candidateJsonList) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const actionsRaw = Array.isArray(parsed.agent_actions) ? parsed.agent_actions : [];
      const actions: AgentAction[] = [];
      for (const row of actionsRaw) {
        if (!row || typeof row !== "object") continue;
        const item = row as Record<string, unknown>;
        const type = normalizeActionType(item.type);
        const path = normalizeActionPath(item.path);
        if (!type || !path) continue;
        const action: AgentAction = {
          type,
          path,
        };
        if (typeof item.content === "string") action.content = item.content;
        if (typeof item.reason === "string") action.reason = item.reason;
        actions.push(action);
      }
      if (actions.length > 0 || Object.prototype.hasOwnProperty.call(parsed, "agent_actions")) return actions;
    } catch {
      // ignore
    }
  }

  return [];
}

function parseStructuredReplyText(reply: string): string {
  const text = reply.trim();
  if (!text) return "";

  const candidateJsonList: string[] = [];
  const jsonBlock = extractJsonCodeBlock(text);
  if (jsonBlock) candidateJsonList.push(jsonBlock);
  candidateJsonList.push(text);

  for (const candidate of candidateJsonList) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const structuredReply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
      if (structuredReply) return structuredReply;
    } catch {
      // ignore
    }
  }

  return text;
}

function parseStructuredThinking(reply: string): string[] {
  const text = reply.trim();
  if (!text) return [];

  const candidateJsonList: string[] = [];
  const jsonBlock = extractJsonCodeBlock(text);
  if (jsonBlock) candidateJsonList.push(jsonBlock);
  candidateJsonList.push(text);

  for (const candidate of candidateJsonList) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (!Array.isArray(parsed.thinking)) continue;
      const thinking = parsed.thinking
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
      if (thinking.length > 0) return thinking;
    } catch {
      // ignore
    }
  }

  return [];
}

function mergeThinkingItems(prev: string[], next: string[]) {
  if (!next.length) return prev;
  const merged = [...prev];
  const seen = new Set(prev);
  for (const item of next) {
    const token = item.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    merged.push(token);
  }
  return merged;
}

function extractThinkingItemsFromReasoningBuffer(buffer: string) {
  if (!buffer.trim()) return [] as string[];
  const normalized = buffer
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!normalized) return [] as string[];

  const chunks = normalized
    .split(/[\n。！？!?]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);

  if (!chunks.length) return [] as string[];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const compact = chunk.length > 90 ? `${chunk.slice(0, 90)}...` : chunk;
    if (seen.has(compact)) continue;
    seen.add(compact);
    unique.push(compact);
  }
  return unique.slice(-12);
}

function parseReadActions(actions: AgentAction[]): ParsedReadAction[] {
  const normalized: ParsedReadAction[] = [];
  const seen = new Set<string>();

  for (const action of actions) {
    if (action.type !== "read") continue;
    const normalizedPath = normalizeFilePath(action.path);
    if (!normalizedPath || normalizedPath.length > MAX_AUTO_READ_PATH_LEN) continue;
    if (normalizedPath.includes("..") || normalizedPath.startsWith("/")) continue;
    const key = normalizedPath.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      type: "read",
      path: normalizedPath,
      reason: action.reason,
    });
    if (normalized.length >= MAX_AUTO_READ_ACTIONS) break;
  }

  return normalized;
}

function getFilePathFromItem(file: KnowledgeFileItem) {
  const metadata =
    file.metadata && typeof file.metadata === "object" && !Array.isArray(file.metadata)
      ? (file.metadata as Record<string, unknown>)
      : {};

  const path = normalizeDocPath(
    toNonEmptyString(metadata.relativePath) ||
      toNonEmptyString(metadata.webkitRelativePath) ||
      toNonEmptyString(metadata.path) ||
      toNonEmptyString(file.originalPath) ||
      toNonEmptyString(file.title),
  );

  return path || normalizeDocPath(file.title);
}

async function buildCoreAgentDocsContext(userId: string, folderId?: string, currentPath?: string) {
  if (!folderId) return "";

  const files = await prisma.knowledgeFile.findMany({
    where: { folderId, userId },
    select: {
      id: true,
      title: true,
      originalPath: true,
      updatedAt: true,
      createdAt: true,
      metadata: true,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: MAX_CORE_DOC_SCAN_FILES,
  });

  const nameToCanonical = new Map<string, string>();
  for (const group of CORE_DOC_NAME_ALIASES) {
    for (const name of group.names) {
      nameToCanonical.set(name.toLowerCase(), group.canonical);
    }
  }

  const hasScopedPath = normalizeDocPath(currentPath || "").length > 0;
  const scopedDirs = buildCoreDocSearchDirs(currentPath);

  const pickedByCanonical = new Map<
    string,
    Map<string, { fileId: string; canonical: string; sourcePath: string }>
  >();

  for (const file of files) {
    const sourcePath = getFilePathFromItem(file);
    const byPath = pathBasename(sourcePath);
    const byTitle = toNonEmptyString(file.title);
    const candidate = (byPath || byTitle).trim();
    if (!candidate) continue;

    const canonical = nameToCanonical.get(candidate.toLowerCase());
    if (!canonical) continue;

    const dir = pathDirname(sourcePath);
    const byDir =
      pickedByCanonical.get(canonical) ||
      new Map<string, { fileId: string; canonical: string; sourcePath: string }>();

    if (!byDir.has(dir)) {
      byDir.set(dir, {
        fileId: file.id,
        canonical,
        sourcePath,
      });
      pickedByCanonical.set(canonical, byDir);
    }
  }

  const orderedMeta = CORE_DOC_NAME_ALIASES.map((group) => group.canonical)
    .map((canonical) => {
      const byDir = pickedByCanonical.get(canonical);
      if (!byDir) return null;

      if (hasScopedPath) {
        for (const dir of scopedDirs) {
          const hit = byDir.get(dir);
          if (hit) return hit;
        }
        return null;
      }

      const rootHit = byDir.get("");
      if (rootHit) return rootHit;
      return byDir.values().next().value || null;
    })
    .filter((item): item is { fileId: string; canonical: string; sourcePath: string } => Boolean(item))
    .slice(0, MAX_CORE_DOC_DOCS);

  if (!orderedMeta.length) return "";

  const selectedIds = Array.from(new Set(orderedMeta.map((item) => item.fileId)));
  const selectedFiles = await prisma.knowledgeFile.findMany({
    where: { id: { in: selectedIds } },
    select: {
      id: true,
      metadata: true,
      chunks: {
        select: { content: true },
        orderBy: { chunkIndex: "asc" },
        take: 8,
      },
    },
  });

  const contentByFileId = new Map(
    selectedFiles.map((file) => {
      const metadata =
        file.metadata && typeof file.metadata === "object" && !Array.isArray(file.metadata)
          ? (file.metadata as Record<string, unknown>)
          : {};
      const raw = toNonEmptyString(metadata.rawContent);
      const content = raw || file.chunks.map((chunk) => chunk.content).filter(Boolean).join("\n\n").trim();
      const compact = content.length > MAX_CORE_DOC_CONTENT_CHARS
        ? `${content.slice(0, MAX_CORE_DOC_CONTENT_CHARS)}...`
        : content;
      return [file.id, compact] as const;
    }),
  );

  const ordered = orderedMeta
    .map((item) => {
      const content = contentByFileId.get(item.fileId) || "";
      if (!content) return null;
      return {
        name: item.canonical,
        sourcePath: item.sourcePath,
        content,
      };
    })
    .filter((item): item is { name: string; sourcePath: string; content: string } => Boolean(item));

  if (!ordered.length) return "";

  return [
    "核心文档上下文（按当前路径就近继承，优先遵循）：",
    ...ordered.map((item) => `### ${item.name}\n来源：${item.sourcePath}\n${item.content}`),
  ].join("\n\n");
}

async function buildWorkspaceIndexContext(params: {
  userId: string;
  folderId?: string;
  currentPath?: string;
  fastMode: boolean;
}) {
  const { userId, folderId, currentPath, fastMode } = params;
  if (!folderId) return "";

  const take = fastMode ? MAX_WORKSPACE_FILE_SCAN_FAST : MAX_WORKSPACE_FILE_SCAN;
  const listLimit = fastMode ? MAX_WORKSPACE_RECENT_LIST_FAST : MAX_WORKSPACE_RECENT_LIST;

  const files = await prisma.knowledgeFile.findMany({
    where: { folderId, userId },
    select: {
      id: true,
      title: true,
      originalPath: true,
      updatedAt: true,
      createdAt: true,
      metadata: true,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take,
  });

  if (!files.length) return "";

  const normalizedCurrentPath = normalizeDocPath(currentPath || "");
  const currentDir = pathDirname(normalizedCurrentPath);

  const rows = files
    .map((file) => {
      const path = getFilePathFromItem(file);
      if (!path) return null;
      const inCurrentDir = currentDir && path.startsWith(currentDir) ? 1 : 0;
      return {
        path,
        title: file.title,
        updatedAt: file.updatedAt,
        score: inCurrentDir,
      };
    })
    .filter((item): item is { path: string; title: string; updatedAt: Date; score: number } => Boolean(item))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .slice(0, listLimit);

  if (!rows.length) return "";

  const lines = rows.map((item) => `- ${item.path} | ${item.updatedAt.toISOString().slice(0, 10)}`);

  return [
    `当前文件树索引（仅展示 ${rows.length} 个近期/相关文件，路径可用于 read）：`,
    ...lines,
  ].join("\n");
}

async function buildSelectedFileContext(params: {
  userId: string;
  folderId?: string;
  currentPath?: string;
}) {
  const { userId, folderId, currentPath } = params;
  const normalizedCurrentPath = normalizeFilePath(currentPath || "");
  if (!folderId || !normalizedCurrentPath) return "";

  const files = await prisma.knowledgeFile.findMany({
    where: { folderId, userId },
    select: {
      id: true,
      title: true,
      originalPath: true,
      metadata: true,
      chunks: {
        select: { chunkIndex: true, content: true },
        orderBy: { chunkIndex: "asc" },
        take: 12,
      },
    },
    take: 2000,
  });

  const targetLower = normalizedCurrentPath.toLowerCase();
  const target = files.find((file) => {
    const path = normalizeFilePath(getFilePathFromItem(file as unknown as KnowledgeFileItem));
    return path.toLowerCase() === targetLower;
  });

  if (!target) return "";

  const metadata =
    target.metadata && typeof target.metadata === "object" && !Array.isArray(target.metadata)
      ? (target.metadata as Record<string, unknown>)
      : {};
  const raw = toNonEmptyString(metadata.rawContent);
  const content = raw || target.chunks.map((chunk) => chunk.content).filter(Boolean).join("\n\n").trim();
  if (!content) return "";

  const compact = content.length > MAX_SELECTED_FILE_CONTENT_CHARS
    ? `${content.slice(0, MAX_SELECTED_FILE_CONTENT_CHARS)}...`
    : content;

  return [
    `当前选中文件：${normalizedCurrentPath}`,
    compact,
  ].join("\n\n");
}

async function buildSkillContext(skills: string[] | undefined, userId?: string | null) {
  const names = (skills ?? [])
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  if (!names.length) return "";

  const resolved = await Promise.all(names.map((name) => findSkillByName(name, userId)));
  const selected = resolved.filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (!selected.length) return "";

  return [
    "以下 skills 已启用，请在回复中遵循对应工作方式：",
    ...selected.map((skill) => {
      const summary = skill.description || "无描述";
      const content = skill.content.trim();
      const compactContent = content.length > 800 ? `${content.slice(0, 800)}...` : content;
      return `- ${skill.name}: ${summary}\n${compactContent}`;
    }),
  ].join("\n\n");
}

function buildProviderContext(providerId: AssistantProviderId, model: string) {
  const providerLabel = PROVIDER_LABEL_BY_ID[providerId] || providerId;
  return `当前推理供应商：${providerLabel}（${providerId}），模型：${model}。如无必要，不要建议切换模型。`;
}

function buildReplyProtocolPrompt() {
  return [
    "回复要求：简洁、可执行、按步骤输出。",
    "先判断是否需要读取文件；若信息不足，优先返回 read 动作，而不是猜测。",
    "当需要文件操作时，请优先输出 JSON（用 ```json 代码块包裹），格式如下：",
    "{",
    '  "reply": "给用户看的说明",',
    '  "thinking": ["可选，内部思考摘要"],',
    '  "agent_actions": [',
    '    { "type": "read|create|update|delete", "path": "相对路径.md", "content": "create/update 时需要", "reason": "可选原因" }',
    "  ]",
    "}",
    "若无需文件操作，可返回普通文本，或 JSON 且 agent_actions 为空数组。",
    "自动链路只会执行 read，create/update/delete 仍需前端确认执行。",
  ].join("\n");
}

function buildSystemPrompt(parts: {
  assistantMode: AssistantMode;
  providerContext: string;
  coreDocsContext?: string;
  selectedFileContext?: string;
  workspaceIndexContext?: string;
  skillContext?: string;
  readResultsContext?: string;
}) {
  return [
    ASSISTANT_MODE_PROMPTS[parts.assistantMode],
    buildReplyProtocolPrompt(),
    parts.providerContext,
    parts.coreDocsContext || "",
    parts.selectedFileContext || "",
    parts.workspaceIndexContext || "",
    parts.skillContext || "",
    parts.readResultsContext || "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildReadResultContext(readResults: Array<{ path: string; content: string; reason?: string }>) {
  if (!readResults.length) return "";

  let used = 0;
  const blocks: string[] = [];
  for (const item of readResults) {
    if (used >= MAX_READ_RESULT_CONTEXT_CHARS) break;
    const remained = MAX_READ_RESULT_CONTEXT_CHARS - used;
    const content = item.content.length > remained ? `${item.content.slice(0, remained)}...` : item.content;
    const block = [
      `### 读取结果：${item.path}`,
      item.reason ? `原因：${item.reason}` : "",
      content,
    ]
      .filter(Boolean)
      .join("\n");
    used += block.length;
    blocks.push(block);
  }

  if (!blocks.length) return "";
  return [
    "你刚刚请求的 read 已执行，以下是文件内容，请基于这些内容完成最终回答：",
    ...blocks,
  ].join("\n\n");
}

async function readFileByPath(params: {
  userId: string;
  folderId: string;
  path: string;
}): Promise<{ path: string; content: string } | null> {
  const { userId, folderId, path } = params;
  const files = await prisma.knowledgeFile.findMany({
    where: { folderId, userId },
    select: {
      id: true,
      title: true,
      originalPath: true,
      metadata: true,
      chunks: {
        select: { chunkIndex: true, content: true },
        orderBy: { chunkIndex: "asc" },
        take: 20,
      },
    },
    take: 2400,
  });

  const targetLower = normalizeFilePath(path).toLowerCase();
  if (!targetLower) return null;

  const target = files.find((file) => {
    const candidate = normalizeFilePath(getFilePathFromItem(file as unknown as KnowledgeFileItem));
    return candidate.toLowerCase() === targetLower;
  });

  if (!target) return null;

  const metadata =
    target.metadata && typeof target.metadata === "object" && !Array.isArray(target.metadata)
      ? (target.metadata as Record<string, unknown>)
      : {};
  const raw = toNonEmptyString(metadata.rawContent);
  const content = raw || target.chunks.map((chunk) => chunk.content).filter(Boolean).join("\n\n").trim();
  if (!content) return null;

  const compact = content.length > MAX_AUTO_READ_FILE_CHARS
    ? `${content.slice(0, MAX_AUTO_READ_FILE_CHARS)}...`
    : content;

  return {
    path: normalizeFilePath(path),
    content: compact,
  };
}

async function runAutoReadPass(params: {
  userId: string;
  folderId?: string | null;
  actions: AgentAction[];
}) {
  const { userId, folderId, actions } = params;
  if (!userId || !folderId) return [] as Array<{ path: string; content: string; reason?: string }>;

  const reads = parseReadActions(actions);
  if (!reads.length) return [];

  const results: Array<{ path: string; content: string; reason?: string }> = [];
  for (const action of reads) {
    const detail = await readFileByPath({
      userId,
      folderId,
      path: action.path,
    });
    if (!detail) continue;
    results.push({
      path: detail.path,
      content: detail.content,
      reason: action.reason,
    });
  }

  return results;
}

async function resolveProxyRouteByModel(modelId: string) {
  const found = await prisma.modelPrice.findUnique({
    where: { modelId },
    select: {
      modelId: true,
      provider: true,
      routes: true,
      displayName: true,
    },
  });

  if (found?.routes && found.routes.length > 0) {
    return found.routes[0] || null;
  }

  const providerToken = normalizeAssistantProviderId(found?.provider || inferAssistantProviderFromModel(modelId));
  const providerHints: Record<AssistantProviderId, string[]> = {
    codex: ["codex", "openai", "gpt"],
    "claude-code": ["claude", "anthropic", "sonnet", "opus", "haiku"],
    minimax: ["minimax", "hailuo", "abab"],
    canvas: ["canvas", "cloud"],
  };
  const hints = providerHints[providerToken] || [];
  if (!hints.length) return null;

  const candidates = await prisma.modelPrice.findMany({
    orderBy: [{ updatedAt: "desc" }, { modelId: "asc" }],
    take: MAX_PROXY_ROUTE_LOOKUP,
    select: {
      routes: true,
      provider: true,
      modelId: true,
    },
  });

  for (const item of candidates) {
    if (!item.routes || item.routes.length === 0) continue;
    const tokens = `${item.provider || ""} ${item.modelId}`.toLowerCase();
    if (hints.some((hint) => tokens.includes(hint))) {
      return item.routes[0] || null;
    }
  }

  return null;
}

async function resolveConversationHistory(
  userId: string,
  payload: ChatRequestPayload,
  incomingMessages: ChatMessage[],
): Promise<ConversationState> {
  const incomingModel = typeof payload.model === "string" && payload.model.trim()
    ? payload.model.trim()
    : "";
  const incomingProviderId = parseAssistantProviderId(payload.providerId);
  const skills = (payload.skills ?? []).filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  const incomingFolderId = typeof payload.folderId === "string" && payload.folderId.trim()
    ? payload.folderId.trim()
    : null;

  let conversationId =
    typeof payload.conversationId === "string" && payload.conversationId.trim()
      ? payload.conversationId.trim()
      : null;

  let conversation = conversationId
    ? await prisma.assistantConversation.findFirst({
        where: { id: conversationId, userId },
      })
    : null;

  const existingProviderId = parseAssistantProviderId(
    (conversation?.metadata as Record<string, unknown> | null)?.providerId as string | undefined,
  );
  const conversationAssistantMode: AssistantMode =
    conversation?.assistantMode === "wechat" ? "wechat" : "xhs";
  const assistantModeResolved: AssistantMode =
    payload.assistantMode === "wechat"
      ? "wechat"
      : payload.assistantMode === "xhs"
        ? "xhs"
        : conversationAssistantMode;
  const folderId = incomingFolderId ?? (conversation?.folderId || null);
  const fallbackModelFromConversation =
    typeof conversation?.model === "string" && conversation.model.trim()
      ? conversation.model.trim()
      : "";

  const model = incomingModel || fallbackModelFromConversation || DEFAULT_MODEL;
  const providerId = incomingProviderId
    || existingProviderId
    || inferAssistantProviderFromModel(model)
    || DEFAULT_PROVIDER_ID;

  const metadata = {
    ...(conversation?.metadata && typeof conversation.metadata === "object" ? conversation.metadata as Record<string, unknown> : {}),
    providerId,
  };

  if (!conversation) {
    const initialTitle =
      incomingMessages.find((message) => message.role === "user")?.content.slice(0, 50) ??
      "新对话";
    conversation = await prisma.assistantConversation.create({
      data: {
        userId,
        title: initialTitle,
        assistantMode: assistantModeResolved,
        folderId,
        model,
        skills,
        metadata,
        lastMessageAt: new Date(),
      },
    });
    conversationId = conversation.id;
  } else {
    conversationId = conversation.id;
    await prisma.assistantConversation.update({
      where: { id: conversation.id },
      data: {
        assistantMode: assistantModeResolved,
        folderId,
        model,
        skills,
        metadata,
      },
    });
  }

  if (incomingMessages.length > 0) {
    await prisma.assistantMessage.createMany({
      data: incomingMessages.map((message) => ({
        conversationId: conversationId as string,
        role: message.role,
        content: message.content,
      })),
    });
  }

  const messageRows = await prisma.assistantMessage.findMany({
    where: { conversationId: conversationId as string },
    orderBy: { createdAt: "asc" },
    take: MAX_MESSAGES,
  });

  return {
    conversationId: conversationId as string,
    assistantMode: assistantModeResolved,
    model,
    providerId,
    skills,
    folderId,
    messages: messageRows.map((row) => ({
      role: row.role as ChatMessage["role"],
      content: row.content,
    })),
  };
}

function resolveSlashSkill(rawContent: string, enabledSkills: string[]) {
  const trimmed = rawContent.trim();
  const match = trimmed.match(/^\/([a-zA-Z0-9_-]+)\b/);
  if (!match) return null;
  const invokedName = match[1].trim().toLowerCase();
  const enabled = new Set(enabledSkills.map((skill) => skill.trim().toLowerCase()));
  if (!enabled.has(invokedName)) {
    return {
      valid: false,
      error: `技能 /${invokedName} 未启用，请先在技能栏开启。`,
      transformed: rawContent,
      skillName: invokedName,
    } as const;
  }

  const rest = trimmed.replace(/^\/[a-zA-Z0-9_-]+\s*/, "").trim();
  const transformed = `请使用技能 ${invokedName} 处理以下请求：${rest || "(无补充说明)"}`;
  return {
    valid: true,
    error: "",
    transformed,
    skillName: invokedName,
  } as const;
}

async function invokeByProvider(params: {
  providerId: AssistantProviderId;
  model: string;
  messages: ChatMessage[];
  systemPrompt: string;
  userId: string;
  apiKey: string;
  appBaseUrl: string;
  stream?: boolean;
}) {
  const { providerId, model, messages, systemPrompt, userId, apiKey, appBaseUrl, stream = false } = params;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamBody = {
      model,
      temperature: 0.35,
      stream,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    };

    if (providerUsesNexApiProxy(providerId)) {
      if (looksLikeByokUpstreamKey(apiKey)) {
        const upstream = await fetch(new URL("/v1/chat/completions", `${NEXAPI_MAIN_URL.replace(/\/$/, "")}/`), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(upstreamBody),
          cache: "no-store",
          signal: controller.signal,
        });
        return { upstream, route: "nextide-main-direct" };
      }

      const route = (await resolveProxyRouteByModel(model)) || "nextide-main";
      const headers = new Headers();
      headers.set("Content-Type", "application/json");
      headers.set("Authorization", `Bearer ${apiKey}`);
      headers.set("x-nexapi-key", apiKey);
      headers.set("x-nexapi-route", route);
      const upstream = await fetch(new URL("/api/nexapi/proxy/v1/chat/completions", appBaseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify(upstreamBody),
        cache: "no-store",
        signal: controller.signal,
      });
      return { upstream, route };
    }

    const endpoint = resolveCanvasUpstreamEndpoint("chat");
    if (!endpoint) {
      return { upstream: null, route: null };
    }
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: buildCanvasUpstreamHeaders({
        userId,
        apiKey,
      }),
      body: JSON.stringify(upstreamBody),
      cache: "no-store",
      signal: controller.signal,
    });
    return { upstream, route: "canvas" };
  } finally {
    clearTimeout(timeoutId);
  }
}

function truncateMessagesForFastMode(messages: ChatMessage[]) {
  if (messages.length <= MAX_FAST_MODE_MESSAGES) {
    return messages;
  }
  return messages.slice(-MAX_FAST_MODE_MESSAGES);
}

async function callAndExtract(params: {
  providerId: AssistantProviderId;
  model: string;
  messages: ChatMessage[];
  systemPrompt: string;
  userId: string;
  apiKey: string;
  appBaseUrl: string;
  stream?: boolean;
  handlers?: UpstreamStreamHandlers;
}): Promise<UpstreamCallResult> {
  const { providerId, model, messages, systemPrompt, userId, apiKey, appBaseUrl, stream = false, handlers } = params;

  const { upstream, route } = await invokeByProvider({
    providerId,
    model,
    messages,
    systemPrompt,
    userId,
    apiKey,
    appBaseUrl,
    stream,
  });

  if (!upstream) {
    throw new Error("CANVAS_UPSTREAM_NOT_CONFIGURED");
  }

  if (!upstream.ok) {
    const relay = await relayUpstreamResponse(upstream);
    const errorText = await relay.text().catch(() => "");
    throw new Error(`UPSTREAM_NOT_OK:${relay.status}:${errorText || relay.statusText || "Unknown error"}`);
  }

  if (stream && upstream.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
    if (!upstream.body) {
      throw new Error("EMPTY_ASSISTANT_REPLY");
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";

    const getDeltaText = (payload: unknown): string => {
      if (!payload || typeof payload !== "object") return "";
      const record = payload as Record<string, unknown>;
      if (typeof record.content === "string") return record.content;
      if (typeof record.text === "string") return record.text;
      if (typeof record.reasoning_content === "string") return record.reasoning_content;

      if (Array.isArray(record.content)) {
        const text = record.content
          .map((part) => {
            if (typeof part === "string") return part;
            if (!part || typeof part !== "object") return "";
            const partRecord = part as Record<string, unknown>;
            if (typeof partRecord.text === "string") return partRecord.text;
            if (typeof partRecord.content === "string") return partRecord.content;
            return "";
          })
          .join("");
        if (text) return text;
      }
      return "";
    };

    const extractReasoningDelta = (delta: Record<string, unknown>) => {
      const direct = getDeltaText({ reasoning_content: delta.reasoning_content, text: delta.reasoning_content });
      if (direct) return direct;

      if (Array.isArray(delta.reasoning)) {
        return delta.reasoning
          .map((item) => getDeltaText(item))
          .filter(Boolean)
          .join("");
      }
      if (Array.isArray(delta.reasoning_content)) {
        return delta.reasoning_content
          .map((item) => getDeltaText(item))
          .filter(Boolean)
          .join("");
      }
      return "";
    };

    const processJsonLine = (jsonLine: string) => {
      if (!jsonLine || jsonLine === "[DONE]") return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonLine);
      } catch {
        return;
      }

      if (!parsed || typeof parsed !== "object") return;
      const record = parsed as Record<string, unknown>;

      if (Array.isArray(record.choices) && record.choices.length > 0) {
        const choice = record.choices[0];
        if (choice && typeof choice === "object") {
          const choiceRecord = choice as Record<string, unknown>;
          const deltaRaw = choiceRecord.delta ?? choiceRecord.message ?? choiceRecord;
          if (deltaRaw && typeof deltaRaw === "object") {
            const delta = deltaRaw as Record<string, unknown>;
            const reasoningDelta = extractReasoningDelta(delta);
            if (reasoningDelta) {
              handlers?.onReasoningDelta?.(reasoningDelta);
            }
            const contentDelta = getDeltaText(delta);
            if (contentDelta) {
              content += contentDelta;
              handlers?.onContentDelta?.(contentDelta);
            }
            return;
          }
        }
      }

      const fallbackText = getDeltaText(record);
      if (fallbackText) {
        content += fallbackText;
        handlers?.onContentDelta?.(fallbackText);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data:")) continue;
        processJsonLine(trimmed.slice(5).trim());
      }
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data:")) {
        processJsonLine(trimmed.slice(5).trim());
      }
    }

    const rawReply = content.trim();
    if (rawReply) {
      return {
        reply: rawReply,
        route,
      };
    }
  }

  const data = await upstream.json().catch(() => null);
  const rawReply = extractAgentText(data);
  if (!rawReply) {
    throw new Error("EMPTY_ASSISTANT_REPLY");
  }

  return {
    reply: rawReply,
    route,
  };
}

function parseUpstreamError(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      status: 502,
      code: "ASSISTANT_CHAT_FAILED",
      message: "assistant chat failed",
    };
  }

  if (error.message === "CANVAS_UPSTREAM_NOT_CONFIGURED") {
    return {
      status: 501,
      code: "CANVAS_UPSTREAM_NOT_CONFIGURED",
      message: "缺少对话上游地址配置",
    };
  }

  if (error.message === "EMPTY_ASSISTANT_REPLY") {
    return {
      status: 502,
      code: "EMPTY_ASSISTANT_REPLY",
      message: "模型返回为空，请重试。",
    };
  }

  if (error.message.startsWith("UPSTREAM_NOT_OK:")) {
    const [, statusText, details] = error.message.split(":", 3);
    const status = Number(statusText);
    return {
      status: Number.isFinite(status) && status > 0 ? status : 502,
      code: "UPSTREAM_NOT_OK",
      message: details || "上游请求失败",
    };
  }

  const isTimeout = error instanceof DOMException && error.name === "AbortError";
  if (isTimeout) {
    return {
      status: 504,
      code: "ASSISTANT_CHAT_FAILED",
      message: "上游响应超时，请重试。",
    };
  }

  return {
    status: 502,
    code: "ASSISTANT_CHAT_FAILED",
    message: error.message || "assistant chat failed",
  };
}

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();
  const { userId, apiKey, nexApiKey } = await getRequestUserContext(request, {
    allowDefaultApiKey: true,
    useSystemApiKey: false,
  });
  const headerNexApiKey = request.headers.get("x-nexapi-key")?.trim() || null;
  const resolvedNexApiKey = headerNexApiKey || nexApiKey || null;
  const canvasUpstreamApiKey = resolveCanvasUpstreamApiKey(apiKey);
  if (!userId && !resolvedNexApiKey && !canvasUpstreamApiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ChatRequestPayload;
  try {
    body = (await request.json()) as ChatRequestPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const incomingMessages = normalizeIncomingMessages(body);
  if (!incomingMessages.length) {
    return NextResponse.json({ error: "message or messages is required" }, { status: 400 });
  }

  const inferredHomeRequest =
    typeof body.currentPath === "string" && body.currentPath.trim().length > 0;
  const fastMode = body.fastMode === true || inferredHomeRequest;
  const streamMode = body.stream === true;
  const currentPath =
    typeof body.currentPath === "string" && body.currentPath.trim()
      ? body.currentPath.trim()
      : undefined;

  const conversationState =
    userId
      ? await resolveConversationHistory(userId, body, incomingMessages)
      : {
          conversationId: null,
          assistantMode: (body.assistantMode === "wechat" ? "wechat" : "xhs") as AssistantMode,
          model:
            typeof body.model === "string" && body.model.trim()
              ? body.model.trim()
              : DEFAULT_MODEL,
          providerId:
            parseAssistantProviderId(body.providerId)
            || inferAssistantProviderFromModel(body.model)
            || DEFAULT_PROVIDER_ID,
          skills: (body.skills ?? []).filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0,
          ),
          folderId:
            typeof body.folderId === "string" && body.folderId.trim()
              ? body.folderId.trim()
              : null,
          messages: incomingMessages,
        };

  const useNexApiProxy = providerUsesNexApiProxy(conversationState.providerId);
  const upstreamApiKey = useNexApiProxy ? resolvedNexApiKey : canvasUpstreamApiKey;
  if (!upstreamApiKey) {
    if (streamMode) {
      const streamEncoder = new TextEncoder();
      const stream = new ReadableStream<string>({
        start(controller) {
          controller.enqueue(
            `event: error\ndata: ${JSON.stringify({ message: useNexApiProxy ? "请先在设置中绑定有效的 NexAPI key。" : "对话服务尚未配置，请联系管理员处理。" })}\n\n`,
          );
          controller.close();
        },
      });
      return new NextResponse(
        stream.pipeThrough(
          new TransformStream<string, Uint8Array>({
            transform(chunk, controller) {
              controller.enqueue(streamEncoder.encode(chunk));
            },
          }),
        ),
        {
          status: 400,
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: useNexApiProxy ? "NEXAPI_KEY_REQUIRED" : "CANVAS_API_KEY_REQUIRED",
          message: useNexApiProxy
            ? "请先在设置中绑定有效的 NexAPI key。"
            : "对话服务尚未配置，请联系管理员处理。",
        },
      },
      { status: 400 },
    );
  }

  if (userId && conversationState.folderId) {
    try {
      await ensureCoreDocsForFolder({
        userId,
        folderId: conversationState.folderId,
      });
    } catch (error) {
      console.warn("[assistants/chat] failed to ensure core docs", {
        folderId: conversationState.folderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const lastUserMessage = [...conversationState.messages].reverse().find((message) => message.role === "user");
  if (lastUserMessage) {
    const slash = resolveSlashSkill(lastUserMessage.content, conversationState.skills);
    if (slash && !slash.valid) {
      return NextResponse.json(
        {
          error: {
            code: "SKILL_NOT_ENABLED",
            message: slash.error,
          },
        },
        { status: 400 },
      );
    }
    if (slash && slash.valid) {
      lastUserMessage.content = slash.transformed;
      if (conversationState.conversationId) {
        await prisma.assistantMessage.updateMany({
          where: {
            conversationId: conversationState.conversationId,
            role: "user",
            content: { startsWith: `/${slash.skillName}` },
          },
          data: { content: slash.transformed },
        });
      }
    }
  }

  const contextStartedAt = Date.now();
  const [coreDocsContext, workspaceIndexContext, selectedFileContext, skillContext] = await Promise.all([
    userId
      ? buildCoreAgentDocsContext(userId, conversationState.folderId ?? undefined, currentPath)
      : Promise.resolve(""),
    userId
      ? buildWorkspaceIndexContext({
          userId,
          folderId: conversationState.folderId ?? undefined,
          currentPath,
          fastMode,
        })
      : Promise.resolve(""),
    userId
      ? buildSelectedFileContext({
          userId,
          folderId: conversationState.folderId ?? undefined,
          currentPath,
        })
      : Promise.resolve(""),
    buildSkillContext(conversationState.skills, userId),
  ]);
  const contextMs = Date.now() - contextStartedAt;

  const providerContext = buildProviderContext(conversationState.providerId, conversationState.model);
  const upstreamMessages = fastMode
    ? truncateMessagesForFastMode(conversationState.messages)
    : conversationState.messages;

  const systemPrompt = buildSystemPrompt({
    assistantMode: conversationState.assistantMode,
    providerContext,
    coreDocsContext,
    selectedFileContext,
    workspaceIndexContext,
    skillContext,
  });

  let streamController: ReadableStreamDefaultController<string> | null = null;
  const streamEncoder = new TextEncoder();
  const stream = streamMode
    ? new ReadableStream<string>({
        start(controller) {
          streamController = controller;
        },
      })
    : null;

  const emit = (event: string, payload: Record<string, unknown>) => {
    if (!streamController) return;
    streamController.enqueue(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  const closeStream = () => {
    if (!streamController) return;
    streamController.close();
    streamController = null;
  };

  const errorStream = (message: string) => {
    emit("error", { message });
    closeStream();
  };

  if (streamMode) {
    emit("conversation", { conversationId: conversationState.conversationId });
    emit("status", { text: "正在准备上下文…" });
  }

  try {
    const appBaseUrl = resolveInternalAppBaseUrl(request);
    let streamedThinking: string[] = [];
    let streamedReasoningBuffer = "";
    let reasoningPulseAt = 0;
    const pushManualThinking = (text: string) => {
      if (!streamMode) return;
      const normalized = text.trim();
      if (!normalized) return;
      const merged = mergeThinkingItems(streamedThinking, [normalized]);
      if (merged.length === streamedThinking.length) return;
      streamedThinking = merged;
      emit("thinking", { items: merged });
    };

    if (streamMode) {
      emit("status", { text: "正在调用模型…" });
      pushManualThinking("正在分析需求并规划执行路径");
    }

    const firstPass = await callAndExtract({
      providerId: conversationState.providerId,
      model: conversationState.model,
      messages: upstreamMessages,
      systemPrompt,
      userId: userId ?? "anonymous",
      apiKey: upstreamApiKey,
      appBaseUrl,
      stream: streamMode,
      handlers: streamMode
        ? {
            onReasoningDelta: (delta) => {
              if (!delta) return;
              streamedReasoningBuffer += delta;
              streamedThinking = mergeThinkingItems(
                streamedThinking,
                extractThinkingItemsFromReasoningBuffer(streamedReasoningBuffer),
              );
              if (streamedThinking.length > 0) {
                emit("thinking", { items: streamedThinking });
              }
              const now = Date.now();
              if (now - reasoningPulseAt >= 2000) {
                reasoningPulseAt = now;
                emit("status", { text: "正在持续推理中…" });
              }
            },
          }
        : undefined,
    });

    let rawReply = firstPass.reply;
    let providerRoute = firstPass.route;
    let agentActions = parseAgentActions(rawReply);
    let thinking = parseStructuredThinking(rawReply);
    let reply = parseStructuredReplyText(rawReply);

    const emitThinkingProgress = (items: string[]) => {
      if (!streamMode || items.length === 0) return;
      const merged = mergeThinkingItems(streamedThinking, items);
      if (merged.length === streamedThinking.length) return;
      streamedThinking = merged;
      emit("thinking", { items: merged });
    };

    if (streamMode) {
      emit("status", { text: "第一轮推理完成，正在判断是否需要读取文件…" });
      pushManualThinking("首轮推理完成，正在判断是否需要读取文件");
      emitThinkingProgress(thinking);
      if (agentActions.length > 0) {
        emit("actions", { items: agentActions });
      }
    }

    const shouldAutoRead = Boolean(userId && conversationState.folderId);
    if (shouldAutoRead) {
      const readResults = await runAutoReadPass({
        userId: userId as string,
        folderId: conversationState.folderId,
        actions: agentActions,
      });

      if (readResults.length > 0) {
        if (streamMode) {
          emit("status", { text: "正在读取文件并二次推理…" });
          pushManualThinking(`已读取 ${readResults.length} 个文件，正在进行二次推理`);
          emit("actions", { items: readResults.map((item) => ({ type: "read", path: item.path, ok: true })) });
        }

        const secondPassSystemPrompt = buildSystemPrompt({
          assistantMode: conversationState.assistantMode,
          providerContext,
          coreDocsContext,
          selectedFileContext,
          workspaceIndexContext,
          skillContext,
          readResultsContext: buildReadResultContext(readResults),
        });

        const secondPass = await callAndExtract({
          providerId: conversationState.providerId,
          model: conversationState.model,
          messages: upstreamMessages,
          systemPrompt: secondPassSystemPrompt,
          userId: userId ?? "anonymous",
          apiKey: upstreamApiKey,
          appBaseUrl,
          stream: streamMode,
          handlers: streamMode
            ? {
                onReasoningDelta: (delta) => {
                  if (!delta) return;
                  streamedReasoningBuffer += delta;
                  streamedThinking = mergeThinkingItems(
                    streamedThinking,
                    extractThinkingItemsFromReasoningBuffer(streamedReasoningBuffer),
                  );
                  if (streamedThinking.length > 0) {
                    emit("thinking", { items: streamedThinking });
                  }
                  const now = Date.now();
                  if (now - reasoningPulseAt >= 2000) {
                    reasoningPulseAt = now;
                    emit("status", { text: "正在持续推理中…" });
                  }
                },
              }
            : undefined,
        });

        rawReply = secondPass.reply;
        providerRoute = secondPass.route || providerRoute;
        agentActions = parseAgentActions(rawReply);
        thinking = parseStructuredThinking(rawReply);
        reply = parseStructuredReplyText(rawReply);
        if (streamMode) {
          emitThinkingProgress(thinking);
          if (agentActions.length > 0) {
            emit("actions", { items: agentActions });
          }
        }
      }
    }

    if (!reply) {
      throw new Error("EMPTY_ASSISTANT_REPLY");
    }

    if (streamMode) {
      pushManualThinking("正在整合信息并组织最终回复");
      emitThinkingProgress(thinking);
      if (agentActions.length > 0) {
        emit("actions", { items: agentActions });
      }
      emit("status", { text: "正在生成回复…" });
    }

    const resolvedThinking = streamMode
      ? mergeThinkingItems(streamedThinking, thinking)
      : thinking;

    if (conversationState.conversationId) {
      await prisma.$transaction([
        prisma.assistantMessage.create({
          data: {
            conversationId: conversationState.conversationId,
            role: "assistant",
            content: reply,
            metadata: {
              agentActions,
              thinking: resolvedThinking,
            },
          },
        }),
        prisma.assistantConversation.update({
          where: { id: conversationState.conversationId },
          data: {
            lastMessageAt: new Date(),
            title:
              conversationState.messages.find((message) => message.role === "user")?.content.slice(0, 50) ||
              "新对话",
            metadata: {
              providerId: conversationState.providerId,
              providerRoute,
            },
          },
        }),
      ]);
    }

    if (streamMode) {
      emit("final", {
        reply,
        agentActions,
        thinking: resolvedThinking,
        conversationId: conversationState.conversationId,
        model: conversationState.model,
        providerId: conversationState.providerId,
        providerRoute,
        assistantMode: conversationState.assistantMode,
        folderId: conversationState.folderId ?? null,
      });
      closeStream();
      return new NextResponse(
        stream!.pipeThrough(
          new TransformStream<string, Uint8Array>({
            transform(chunk, controller) {
              controller.enqueue(streamEncoder.encode(chunk));
            },
          }),
        ),
        {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        },
      );
    }

    return NextResponse.json({
      reply,
      agentActions,
      thinking: resolvedThinking,
      conversationId: conversationState.conversationId,
      model: conversationState.model,
      providerId: conversationState.providerId,
      providerRoute,
      assistantMode: conversationState.assistantMode,
      folderId: conversationState.folderId ?? null,
    });
  } catch (error) {
    const parsed = parseUpstreamError(error);
    if (streamMode) {
      errorStream(parsed.message);
      return new NextResponse(
        stream!.pipeThrough(
          new TransformStream<string, Uint8Array>({
            transform(chunk, controller) {
              controller.enqueue(streamEncoder.encode(chunk));
            },
          }),
        ),
        {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: parsed.code,
          message: parsed.message,
        },
      },
      { status: parsed.status },
    );
  } finally {
    const totalMs = Date.now() - requestStartedAt;
    if (totalMs > 12_000) {
      console.warn("[assistants/chat] slow request", {
        totalMs,
        contextMs,
        fastMode,
        hasUserId: Boolean(userId),
        folderId: conversationState.folderId ?? null,
      });
    }
  }
}
