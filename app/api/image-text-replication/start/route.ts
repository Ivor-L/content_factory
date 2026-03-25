import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUserContext } from "@/lib/authServer";
import prisma from "@/lib/prisma";
import { initMetadata } from "@/lib/creativeTaskUtils";
import { toInputJson } from "@/lib/jsonUtils";

function isTransactionStartTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Unable to start a transaction in the given time") ||
    message.includes("Transaction API error")
  );
}

async function runWithRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransactionStartTimeoutError(error) || attempt >= maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 120 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Unknown error"));
}

function buildTaskMetadata(body: {
  sourceTitle?: string;
  sourceText?: string;
  sourceImages?: string[];
  sourcePlatform?: string;
  sourceId?: string;
  sourceUrl?: string;
}) {
  const metadata = initMetadata();
  const custom = (metadata.custom = metadata.custom ?? {});
  custom.posterMode = "text2image";
  custom.source = "image_text_replication";
  custom.replication = {
    phase: "ready_to_generate",
    sourceTitle: body.sourceTitle ?? null,
    sourceText: body.sourceText ?? null,
    sourceImages: body.sourceImages ?? [],
    sourcePlatform: body.sourcePlatform ?? null,
    sourceId: body.sourceId ?? null,
    sourceUrl: body.sourceUrl ?? null,
  };
  return metadata;
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    sourceTitle?: string;
    sourceText?: string;
    sourceImages?: string[];
    sourcePlatform?: string;
    sourceId?: string;
    sourceUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const taskId = randomUUID();
  const title = (body.sourceTitle || "").trim() || "爆款图文复刻";
  const preview = (body.sourceText || "").trim().slice(0, 140) || "正在分析原帖内容";
  const metadata = buildTaskMetadata(body);

  // Write in two steps to avoid transaction-start timeouts under high DB load.
  try {
    await runWithRetry(() =>
      prisma.creativeTask.create({
        data: {
          id: taskId,
          userId,
          title,
          ideaText: body.sourceText ?? "",
          channel: "xhs",
          targetOutput: "poster",
          status: "BREAKDOWN_COMPLETED",
          progress: 15,
          metadata: toInputJson(metadata) ?? undefined,
        },
      }),
    );
  } catch (err) {
    console.error("[image-text-replication/start] task create failed", err);
    const rawMessage = err instanceof Error ? err.message : String(err ?? "");
    const friendlyMessage = rawMessage.includes("Can't reach database server")
      ? "数据库连接失败（127.0.0.1:54322 无响应），请先启动本地 Supabase/Postgres 或恢复数据库隧道。"
      : rawMessage;
    return NextResponse.json(
      { error: friendlyMessage || "任务创建失败" },
      { status: 500 },
    );
  }

  try {
    await runWithRetry(() =>
      prisma.taskSummary.upsert({
        where: { taskType_taskId: { taskType: "poster", taskId } },
        create: {
          userId,
          taskType: "poster",
          taskId,
          title,
          status: "PROCESSING",
          preview,
          progress: 15,
          metadata: {
            posterMode: "text2image",
            source: "image_text_replication",
          },
          updatedAt: new Date(),
        },
        update: {
          title,
          status: "PROCESSING",
          preview,
          progress: 15,
          metadata: {
            posterMode: "text2image",
            source: "image_text_replication",
          },
          updatedAt: new Date(),
        },
      }),
    );
  } catch (err) {
    // Summary write is non-blocking for generation; keep task usable.
    console.error("[image-text-replication/start] summary upsert failed", err);
  }

  return NextResponse.json({ taskId, status: "BREAKDOWN_COMPLETED" });
}
