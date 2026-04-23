import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

type AgentActionType = "read" | "create" | "update" | "delete";

type AgentAction = {
  type: AgentActionType;
  path: string;
  content?: string;
  reason?: string;
};

type ExecutePayload = {
  folderId?: string;
  actions?: AgentAction[];
};

type ParsedAction = {
  type: AgentActionType;
  path: string;
  content?: string;
  reason?: string;
};

function normalizeDocPath(input: string) {
  return input
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/")
    .trim();
}

function normalizeFilePath(input: string) {
  const normalized = input
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+/g, "/")
    .trim();
  if (!normalized) return "";
  if (!/\.(md|markdown|txt)$/i.test(normalized)) {
    return `${normalized}.md`;
  }
  return normalized;
}

function safePath(input: string) {
  const normalized = normalizeFilePath(input);
  if (!normalized) return "";
  if (normalized.includes("..")) return "";
  if (normalized.startsWith("/")) return "";
  return normalized;
}

function parseActionType(value: unknown): AgentActionType | null {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  if (token === "read" || token === "create" || token === "update" || token === "delete") {
    return token;
  }
  return null;
}

function isParsedAction(value: ParsedAction | null): value is ParsedAction {
  return Boolean(value);
}

function splitTextToChunks(content: string, chunkSize = 1100, overlap = 160, maxChunks = 240) {
  const text = content.replace(/\r\n/g, "\n");
  const chunks: Array<{ chunkIndex: number; content: string; contentLength: number }> = [];
  if (!text.trim()) return chunks;

  let start = 0;
  let index = 0;
  while (start < text.length && chunks.length < maxChunks) {
    const end = Math.min(start + chunkSize, text.length);
    const chunkContent = text.slice(start, end).trim();
    if (chunkContent) {
      chunks.push({ chunkIndex: index, content: chunkContent, contentLength: chunkContent.length });
      index += 1;
    }
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

async function readFileContent(fileId: string, userId: string) {
  const file = await prisma.knowledgeFile.findFirst({
    where: { id: fileId, userId },
    select: {
      id: true,
      title: true,
      originalPath: true,
      metadata: true,
      chunks: {
        select: { chunkIndex: true, content: true },
        orderBy: { chunkIndex: "asc" },
      },
    },
  });
  if (!file) return null;

  const metadata =
    file.metadata && typeof file.metadata === "object" && !Array.isArray(file.metadata)
      ? (file.metadata as Record<string, unknown>)
      : {};
  const raw = typeof metadata.rawContent === "string" ? metadata.rawContent : "";
  const content = raw || file.chunks.map((chunk) => chunk.content).filter(Boolean).join("\n\n");

  return {
    id: file.id,
    title: file.title,
    path: normalizeDocPath((typeof metadata.path === "string" ? metadata.path : "") || file.originalPath || file.title),
    content,
  };
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ExecutePayload;
  try {
    payload = (await request.json()) as ExecutePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const folderId = typeof payload.folderId === "string" && payload.folderId.trim() ? payload.folderId.trim() : "";
  if (!folderId) {
    return NextResponse.json({ error: "folderId is required" }, { status: 400 });
  }

  const folder = await prisma.knowledgeFolder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  });
  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const inputActions = Array.isArray(payload.actions) ? payload.actions : [];
  if (inputActions.length === 0) {
    return NextResponse.json({ error: "actions is required" }, { status: 400 });
  }

  const actionRows = inputActions
    .map((row) => {
      const type = parseActionType(row?.type);
      const path = safePath(typeof row?.path === "string" ? row.path : "");
      const content = typeof row?.content === "string" ? row.content.replace(/\r\n/g, "\n") : undefined;
      const reason = typeof row?.reason === "string" ? row.reason : undefined;
      if (!type || !path) return null;
      return { type, path, content, reason } as ParsedAction;
    })
    .filter(isParsedAction)
    .slice(0, 50);

  if (actionRows.length === 0) {
    return NextResponse.json({ error: "No valid actions" }, { status: 400 });
  }

  const files = await prisma.knowledgeFile.findMany({
    where: { folderId: folder.id, userId },
    select: {
      id: true,
      title: true,
      originalPath: true,
      metadata: true,
      status: true,
    },
    take: 2000,
  });

  const pathToFile = new Map<string, typeof files[number]>();
  for (const file of files) {
    const metadata =
      file.metadata && typeof file.metadata === "object" && !Array.isArray(file.metadata)
        ? (file.metadata as Record<string, unknown>)
        : {};
    const candidatePath = normalizeDocPath(
      (typeof metadata.relativePath === "string" ? metadata.relativePath : "") ||
      (typeof metadata.path === "string" ? metadata.path : "") ||
      file.originalPath ||
      file.title,
    );
    const normalized = safePath(candidatePath);
    if (normalized && !pathToFile.has(normalized)) {
      pathToFile.set(normalized, file);
    }
  }

  const results: Array<Record<string, unknown>> = [];

  for (const action of actionRows) {
    const existing = pathToFile.get(action.path);

    if (action.type === "read") {
      if (!existing) {
        results.push({ type: action.type, path: action.path, ok: false, error: "File not found" });
        continue;
      }
      const detail = await readFileContent(existing.id, userId);
      if (!detail) {
        results.push({ type: action.type, path: action.path, ok: false, error: "File not found" });
        continue;
      }
      results.push({
        type: action.type,
        path: action.path,
        ok: true,
        fileId: detail.id,
        title: detail.title,
        content: detail.content,
      });
      continue;
    }

    if (action.type === "delete") {
      if (!existing) {
        results.push({ type: action.type, path: action.path, ok: false, error: "File not found" });
        continue;
      }
      await prisma.knowledgeFile.delete({ where: { id: existing.id } });
      pathToFile.delete(action.path);
      results.push({ type: action.type, path: action.path, ok: true, fileId: existing.id });
      continue;
    }

    if (action.type === "create") {
      if (existing) {
        results.push({ type: action.type, path: action.path, ok: false, error: "File already exists", fileId: existing.id });
        continue;
      }
      const content = action.content || "";
      const chunks = splitTextToChunks(content);
      const title = action.path.split("/").filter(Boolean).pop() || "untitled.md";

      const created = await prisma.$transaction(async (tx) => {
        const file = await tx.knowledgeFile.create({
          data: {
            folderId: folder.id,
            userId,
            title,
            sourceType: "manual",
            status: "READY",
            originalPath: action.path,
            metadata: {
              relativePath: action.path,
              path: action.path,
              originalFilename: title,
              rawContent: content,
              createdBy: "agent-action",
            },
          },
        });

        if (chunks.length > 0) {
          await tx.knowledgeChunk.createMany({
            data: chunks.map((chunk) => ({
              folderId: folder.id,
              fileId: file.id,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              contentLength: chunk.contentLength,
            })),
          });
        }

        return file;
      });

      pathToFile.set(action.path, created);
      results.push({ type: action.type, path: action.path, ok: true, fileId: created.id });
      continue;
    }

    if (action.type === "update") {
      if (!existing) {
        results.push({ type: action.type, path: action.path, ok: false, error: "File not found" });
        continue;
      }
      const content = action.content || "";
      const chunks = splitTextToChunks(content);

      await prisma.$transaction(async (tx) => {
        await tx.knowledgeChunk.deleteMany({ where: { fileId: existing.id } });
        if (chunks.length > 0) {
          await tx.knowledgeChunk.createMany({
            data: chunks.map((chunk) => ({
              folderId: folder.id,
              fileId: existing.id,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              contentLength: chunk.contentLength,
            })),
          });
        }

        const metadata =
          existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
            ? (existing.metadata as Record<string, unknown>)
            : {};

        await tx.knowledgeFile.update({
          where: { id: existing.id },
          data: {
            status: "READY",
            metadata: {
              ...metadata,
              rawContent: content,
              path: action.path,
              relativePath: action.path,
              updatedBy: "agent-action",
            },
          },
        });
      });

      results.push({ type: action.type, path: action.path, ok: true, fileId: existing.id });
      continue;
    }
  }

  return NextResponse.json({
    data: {
      folderId: folder.id,
      total: actionRows.length,
      succeeded: results.filter((item) => item.ok === true).length,
      failed: results.filter((item) => item.ok !== true).length,
      results,
    },
  });
}
