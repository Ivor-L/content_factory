import { Prisma } from "@prisma/client";

const KNOWN_TABLE_TOKENS = [
  "knowledge_folders",
  "knowledge_files",
  "knowledge_chunks",
  "assistant_conversations",
  "assistant_messages",
];

export function isKnowledgeSchemaMissingError(error: unknown) {
  if (!error) return false;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return true;
    }
    const meta = (error.meta ?? {}) as Record<string, unknown>;
    const table = typeof meta.table === "string" ? meta.table.toLowerCase() : "";
    if (table && KNOWN_TABLE_TOKENS.some((token) => table.includes(token))) {
      return true;
    }
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === "string"
        ? error.toLowerCase()
        : "";

  if (!message) return false;
  if (message.includes("undefined_table") || message.includes("does not exist")) {
    return KNOWN_TABLE_TOKENS.some((token) => message.includes(token));
  }
  return false;
}

export function getKnowledgeSchemaMissingMessage() {
  return "知识库数据表尚未初始化，请执行 supabase/migrations/20260423162000_add_knowledgebase_and_assistant_sessions.sql 后重试。";
}
