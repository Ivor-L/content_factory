import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getApiKeyForUser } from "@/lib/authServer";
import { deductCredits } from "@/lib/credits";
import { parseMetadata } from "@/lib/creativeTaskService";
import { setTaskActionStatus } from "@/lib/creativeTaskUtils";

type ResultEntry = {
  fileUrl?: string;
  url?: string;
  resultUrl?: string;
  value?: string;
  outputType?: string;
  fileType?: string;
  type?: string;
};

const DEFAULT_WORKFLOW_ID = "flow_digital_human";
const SHORT_VIDEO_THRESHOLD = 15;
const DEFAULT_POINTS_API_BASE = "https://api.atomx.top";

const POINTS_API_BASES = Array.from(
  new Set(
    [process.env.POINTS_API_BASE, DEFAULT_POINTS_API_BASE]
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
      .map((value) => value.trim().replace(/\/$/, ""))
  )
);

type WorkflowCreditMeta = {
  workflow_id?: string;
  workflow_name?: string;
  credit_cost?: number;
};

const normalizeWorkflowId = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  const normalized = String(value).trim();
  return normalized ? normalized.toLowerCase() : "";
};

const resolveWorkflowIdForCredits = (
  payload: Record<string, unknown>,
  taskWorkflowId?: string | null,
  taskDurationSeconds?: number | null
): string => {
  const fromPayload = normalizeWorkflowId(
    payload.workflow_id ?? payload.workflowId ?? payload.flow
  );
  if (fromPayload) return fromPayload;
  if (taskWorkflowId) return normalizeWorkflowId(taskWorkflowId);
  if (
    typeof taskDurationSeconds === "number" &&
    taskDurationSeconds > 0 &&
    taskDurationSeconds <= SHORT_VIDEO_THRESHOLD
  ) {
    return "flow_digital_human16s";
  }
  return DEFAULT_WORKFLOW_ID;
};

async function fetchWorkflowCreditMeta(
  workflowId: string
): Promise<WorkflowCreditMeta | null> {
  for (const base of POINTS_API_BASES) {
    try {
      const url = `${base}/workflow-credits/query?workflow_id=${encodeURIComponent(
        workflowId
      )}`;
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        continue;
      }
      const parsed = await response.json();
      const payload =
        (parsed && typeof parsed === "object" && "data" in parsed
          ? (parsed as Record<string, unknown>).data
          : parsed) ?? {};
      if (payload && typeof payload === "object") {
        const payloadRecord = payload as Record<string, unknown>;
        const creditCost = Number(
          payloadRecord.credit_cost ?? payloadRecord.creditCost
        );
        const resolvedWorkflowId =
          payloadRecord.workflow_id ??
          payloadRecord.workflowId ??
          workflowId;
        const resolvedWorkflowName =
          payloadRecord.workflow_name ??
          payloadRecord.workflowName ??
          "Digital Human";

        return {
          workflow_id:
            resolvedWorkflowId !== undefined && resolvedWorkflowId !== null
              ? String(resolvedWorkflowId)
              : workflowId,
          workflow_name:
            resolvedWorkflowName !== undefined &&
            resolvedWorkflowName !== null
              ? String(resolvedWorkflowName)
              : "Digital Human",
          credit_cost: Number.isFinite(creditCost) ? creditCost : undefined,
        };
      }
    } catch (error) {
      console.error("Failed to fetch workflow credit meta", {
        workflowId,
        base,
        error,
      });
    }
  }
  return null;
}

async function deductCreditsForDigitalHuman(
  userId: string | null,
  workflowId: string
) {
  let apiKey: string | null = null;
  if (userId) {
    apiKey = await getApiKeyForUser(userId);
  }
  if (!apiKey && process.env.DEFAULT_USER_API_KEY) {
    apiKey = process.env.DEFAULT_USER_API_KEY;
  }
  if (!apiKey) {
    console.error("Skipping credit deduction: missing apiKey", {
      workflowId,
      userId,
    });
    return;
  }

  const workflowMeta = await fetchWorkflowCreditMeta(workflowId);
  const creditCost = workflowMeta?.credit_cost;
  if (!creditCost || creditCost <= 0) {
    console.error("Skipping credit deduction: invalid credit cost", {
      workflowId,
      workflowMeta,
    });
    return;
  }

  await deductCredits(apiKey, {
    amount: creditCost,
    workflowId: workflowMeta.workflow_id ?? workflowId,
    workflowName: workflowMeta.workflow_name ?? "Digital Human",
    reason: "digital_human",
  });
}

const toArray = (source: unknown): ResultEntry[] => {
  if (!source) return [];
  if (Array.isArray(source)) return source;
  if (typeof source === "object" && source !== null) {
    const maybeArray = (source as Record<string, unknown>).data;
    if (Array.isArray(maybeArray)) return maybeArray;
  }
  return [];
};

const pickMp4Url = (...sources: unknown[]): string | null => {
  for (const source of sources) {
    const entries = toArray(source);
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const urlCandidate =
        entry.fileUrl || entry.url || entry.resultUrl || entry.value;
      if (!urlCandidate || typeof urlCandidate !== "string") continue;
      const fileType = String(
        entry.outputType || entry.fileType || entry.type || ""
      ).toLowerCase();
      const looksLikeMp4 =
        fileType === "mp4" || urlCandidate.toLowerCase().includes(".mp4");
      if (looksLikeMp4) {
        return urlCandidate.trim();
      }
    }
  }
  return null;
};

const parseJsonIfNeeded = (value: unknown) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.error("Failed to parse JSON value:", error);
      return null;
    }
  }
  return value;
};

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    let body = await request.json();
    console.log("Digital Human Webhook received:", body);

    if (Array.isArray(body) && body.length > 0) {
      body = body[0];
    }

    const payload = body.body || body;
    const queryTaskId =
      requestUrl.searchParams.get("task_id") ||
      requestUrl.searchParams.get("taskId");
    const clientId =
      payload.clientId ||
      payload.client_id ||
      payload.clientID ||
      body.clientId ||
      body.client_id ||
      body.clientID;
    const fallbackTaskId =
      payload.taskId ||
      payload.task_id ||
      payload.id ||
      body.taskId ||
      body.task_id ||
      body.id;
    const taskId = queryTaskId || clientId || fallbackTaskId;

    if (!taskId) {
      console.error("Webhook missing task_id", body);
      return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
    }

    const task = await prisma.digitalHumanVideo.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      console.error(`Digital Human task not found: ${taskId}`);
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const normalizedPayload: Record<string, unknown> =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
    const workflowIdForCredits = resolveWorkflowIdForCredits(
      normalizedPayload,
      task.workflowId,
      task.durationSeconds
    );

    let updateStatus = "COMPLETED";
    let videoUrl: string | null = null;
    const statusString = String(
      payload.status || body.status || ""
    ).toLowerCase();
    if (
      statusString.includes("fail") ||
      statusString.includes("error") ||
      payload.error ||
      body.error
    ) {
      updateStatus = "FAILED";
    }

    const resultSources: unknown[] = [];

    if (payload.event && payload.eventData) {
      if (payload.event !== "TASK_END") {
        console.log(`Received non-completion event: ${payload.event}`);
        return NextResponse.json({ message: "Event ignored" });
      }

      const eventData = parseJsonIfNeeded(payload.eventData);

      if (!eventData) {
        console.warn(
          `Digital Human webhook ${taskId} provided event ${payload.event} without eventData; falling back to results array.`
        );
      } else {
        const { code, msg, data } = eventData as {
          code?: number;
          msg?: string;
          data?: unknown;
        };

        if (code !== 0) {
          updateStatus = "FAILED";
          console.error(`Task failed with code ${code}: ${msg}`);
        } else {
          resultSources.push(data);
        }
      }
    }

    resultSources.push(
      payload.results,
      payload.result,
      payload.data?.results,
      payload.videoFiles,
      payload.media?.videos,
      payload.media?.videoFiles,
      body.results,
      body.data?.results,
      body.videoFiles,
      body.media?.videos,
      body.media?.videoFiles
    );

    videoUrl = pickMp4Url(...resultSources);

    if (!videoUrl) {
      videoUrl =
        payload.video_url ||
        payload.videoUrl ||
        payload.result_url ||
        payload.resultUrl ||
        body.video_url ||
        body.videoUrl ||
        null;
    }

    if (videoUrl) {
      videoUrl = videoUrl.replace(/`/g, "").trim();
    } else {
      console.warn(
        `Digital Human webhook ${taskId} completed but no mp4 URL was found.`
      );
    }

    const shouldDeductCredits =
      updateStatus === "COMPLETED" && task.status !== "COMPLETED";

    await prisma.digitalHumanVideo.update({
      where: { id: taskId },
      data: {
        status: updateStatus,
        resultUrl: videoUrl || task.resultUrl,
      },
    });

    if (task.sourceTaskId) {
      const creativeTask = await prisma.creativeTask.findUnique({
        where: { id: task.sourceTaskId },
        select: { id: true, metadata: true },
      });
      if (creativeTask) {
        try {
          const nextMetadata = setTaskActionStatus(
            parseMetadata(creativeTask.metadata),
            "digitalHuman",
            {
              status: updateStatus === "COMPLETED" ? "ready" : "error",
              jobId: task.id,
              error:
                updateStatus === "COMPLETED"
                  ? undefined
                  : (payload.error as string | undefined) ??
                    (body.error as string | undefined) ??
                    undefined,
            }
          );
          await prisma.creativeTask.update({
            where: { id: creativeTask.id },
            data: { metadata: nextMetadata as Prisma.InputJsonValue },
          });
        } catch (metaError) {
          console.error("Failed to sync digital human status to creative task", {
            creativeTaskId: creativeTask.id,
            metaError,
          });
        }
      }
    }

    if (shouldDeductCredits) {
      try {
        await deductCreditsForDigitalHuman(task.userId, workflowIdForCredits);
      } catch (error) {
        console.error("Failed to deduct credits for digital human task", {
          taskId,
          workflowId: workflowIdForCredits,
          error,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
