import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { syncTaskToSummary } from "@/lib/taskSummary";

const safeParse = (value?: string | null) => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const toRecord = (value: unknown): Record<string, any> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, any>;
};

const pickString = (
  keys: string[],
  ...sources: Array<Record<string, any> | null | undefined>
): string | undefined => {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const raw = source[key];
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const replicationId =
      body.replication_id ||
      body.replicationId ||
      body.task_id ||
      body.taskId;

    if (!replicationId) {
      console.error("[webhook/replication/copy] missing replication_id", body);
      return NextResponse.json({ error: "Missing replication_id" }, { status: 400 });
    }

    const replication = await prisma.replication.findUnique({
      where: { id: replicationId },
    });
    if (!replication) {
      console.error("[webhook/replication/copy] replication not found", replicationId);
      return NextResponse.json({ error: "Replication not found" }, { status: 404 });
    }

    const statusRaw = typeof body.status === "string" ? body.status.toLowerCase() : "";
    const ok =
      statusRaw === "completed" ||
      statusRaw === "success" ||
      statusRaw === "copy_ready" ||
      statusRaw === "script_ready" ||
      body.code === 0;

    const bodyData = toRecord(body.data);
    const bodyResult = toRecord(body.result);
    const existingResult = safeParse(replication.result);
    const normalizedResult = {
      ...existingResult,
      copyPayload: body,
      originalCopy:
        pickString(
          ["original_copy", "originalCopy", "source_copy"],
          body,
          bodyData,
          bodyResult,
        ) ??
        existingResult.originalCopy,
      remixCopy:
        pickString(
          [
            "remix_copy",
            "remixCopy",
            "new_copy",
            "second_copy",
            "script_content",
            "scriptContent",
            "copy_text",
            "copyText",
            "text",
            "正文",
          ],
          body,
          bodyData,
          bodyResult,
        ) ??
        existingResult.remixCopy,
    };

    await prisma.replication.update({
      where: { id: replicationId },
      data: {
        status: ok ? "copy_ready" : "copy_failed",
        result: JSON.stringify(normalizedResult),
      },
    });

    await syncTaskToSummary({
      taskType: "replication",
      taskId: replicationId,
      operation: "update",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[webhook/replication/copy] error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
