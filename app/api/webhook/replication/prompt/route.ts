import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type PromptWebhookPayload = {
  task_id?: string;
  taskId?: string;
  replication_id?: string;
  replicationId?: string;
  status?: string;
  stage?: string;
  result?: unknown;
};

function safeParseJson(payload?: string | null): Record<string, any> {
  if (!payload) return {};
  try {
    return JSON.parse(payload);
  } catch (error) {
    console.warn("Failed to parse replication.result JSON. Returning empty object.", error);
    return {};
  }
}

function extractTaskId(body: PromptWebhookPayload): string | undefined {
  return (
    body.task_id ||
    body.taskId ||
    body.replication_id ||
    body.replicationId
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as PromptWebhookPayload;
    const taskId = extractTaskId(body);

    if (!taskId) {
      console.error("Prompt webhook missing task identifier", body);
      return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
    }

    const replication = await prisma.replication.findUnique({
      where: { id: taskId },
    });

    if (!replication) {
      console.error(`Prompt webhook replication not found: ${taskId}`);
      return NextResponse.json({ error: "Replication task not found" }, { status: 404 });
    }

    const existingResult = safeParseJson(replication.result);

    const mergedResult: Record<string, unknown> = {
      ...existingResult,
      lastStage: body.stage || body.status || existingResult.lastStage,
      stage: body.stage ?? existingResult.stage,
      status: body.status ?? existingResult.status,
      promptTaskId: taskId,
    };

    if (body.result !== undefined) {
      mergedResult.result = body.result;
      mergedResult.promptResult = body.result;
    }

    const nextStatus =
      replication.status === "pending" ? "processing" : replication.status;

    await prisma.replication.update({
      where: { id: taskId },
      data: {
        status: nextStatus,
        result: JSON.stringify(mergedResult),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing replication prompt webhook", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
