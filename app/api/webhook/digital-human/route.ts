import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getApiKeyForUser } from "@/lib/authServer";
import { deductCredits } from "@/lib/credits";
import { getCreditCostForModel } from "@/lib/creditCosts";
import { parseMetadata } from "@/lib/creativeTaskService";
import { setTaskActionStatus } from "@/lib/creativeTaskUtils";
import { syncTaskToSummary } from "@/lib/taskSummary";
import { logCreditUsage } from "@/lib/logCreditUsage";

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
  const creditCost = await getCreditCostForModel(
    "digital_human",
    workflowId,
    workflowMeta?.credit_cost ?? 10
  );
  if (!creditCost || creditCost <= 0) {
    console.error("Skipping credit deduction: invalid credit cost", {
      workflowId,
      workflowMeta,
    });
    return;
  }

  await deductCredits(apiKey, {
    amount: creditCost,
    workflowId: workflowMeta?.workflow_id ?? workflowId,
    workflowName: workflowMeta?.workflow_name ?? "Digital Human",
    reason: "digital_human",
  });
  logCreditUsage({ featureKey: "digital_human", userId: userId ?? undefined, amount: creditCost, success: true });
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

const tryParseJsonString = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const coerceFormBody = (raw: string) => {
  const params = new URLSearchParams(raw);
  const result: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      const current = result[key];
      if (Array.isArray(current)) {
        current.push(value);
      } else {
        result[key] = [current, value];
      }
    } else {
      result[key] = value;
    }
  }
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string") {
      const parsed = tryParseJsonString(value);
      if (parsed !== null) {
        result[key] = parsed;
      }
    }
  }
  return result;
};

async function readRequestBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const rawBody = await request.text();
  if (!rawBody) {
    return {};
  }

  const trimmed = rawBody.trim();
  const parsedJson = tryParseJsonString(trimmed);

  if (contentType.includes("application/json")) {
    if (parsedJson === null) {
      throw new Error("Invalid JSON payload");
    }
    return parsedJson;
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return coerceFormBody(rawBody);
  }

  if (parsedJson !== null) {
    return parsedJson;
  }

  const fallbackForm = coerceFormBody(rawBody);
  if (Object.keys(fallbackForm).length > 0) {
    return fallbackForm;
  }

  throw new Error("Unsupported request body format");
}

const pickFirstString = (
  source: Record<string, unknown>,
  keys: string[]
): string | undefined => {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = source[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    } else if (typeof value === "number" || typeof value === "bigint") {
      return String(value);
    }
  }
  return undefined;
};

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    let body: unknown;
    try {
      body = await readRequestBody(request);
    } catch (parseError) {
      console.error("Digital Human webhook received invalid body", parseError);
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    console.log("Digital Human Webhook received:", body);

    if (Array.isArray(body) && body.length > 0) {
      body = body[0];
    }

    if (!body || typeof body !== "object") {
      console.error("Webhook body must be an object", { body });
      return NextResponse.json(
        { error: "Invalid body payload" },
        { status: 400 }
      );
    }

    const bodyRecord = body as Record<string, unknown>;
    let payloadCandidate = bodyRecord.body ?? bodyRecord;
    payloadCandidate = parseJsonIfNeeded(payloadCandidate);

    if (!payloadCandidate || typeof payloadCandidate !== "object") {
      console.error("Webhook payload must be an object", {
        payload: payloadCandidate,
      });
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const payload = payloadCandidate as Record<string, unknown>;
    const queryTaskId =
      requestUrl.searchParams.get("task_id") ||
      requestUrl.searchParams.get("taskId");
    const clientId =
      pickFirstString(payload, ["clientId", "client_id", "clientID"]) ??
      pickFirstString(bodyRecord, ["clientId", "client_id", "clientID"]);
    const fallbackTaskId =
      pickFirstString(payload, ["taskId", "task_id", "id"]) ??
      pickFirstString(bodyRecord, ["taskId", "task_id", "id"]);
    const taskId = queryTaskId || clientId || fallbackTaskId;

    if (!taskId) {
      console.error("Webhook missing task_id", bodyRecord);
      return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
    }

    const payloadData = payload as Record<string, any>;
    const bodyData = bodyRecord as Record<string, any>;

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
      payloadData.status || bodyData.status || ""
    ).toLowerCase();
    if (
      statusString.includes("fail") ||
      statusString.includes("error") ||
      payloadData.error ||
      bodyData.error
    ) {
      updateStatus = "FAILED";
    }

    const resultSources: unknown[] = [];

    if (payloadData.event && payloadData.eventData) {
      if (payloadData.event !== "TASK_END") {
        console.log(`Received non-completion event: ${payloadData.event}`);
        return NextResponse.json({ message: "Event ignored" });
      }

      const eventData = parseJsonIfNeeded(payloadData.eventData);

      if (!eventData) {
        console.warn(
          `Digital Human webhook ${taskId} provided event ${payloadData.event} without eventData; falling back to results array.`
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
      payloadData.results,
      payloadData.result,
      payloadData.data?.results,
      payloadData.videoFiles,
      payloadData.media?.videos,
      payloadData.media?.videoFiles,
      bodyData.results,
      bodyData.data?.results,
      bodyData.videoFiles,
      bodyData.media?.videos,
      bodyData.media?.videoFiles
    );

    videoUrl = pickMp4Url(...resultSources);

    if (!videoUrl) {
      videoUrl =
        payloadData.video_url ||
        payloadData.videoUrl ||
        payloadData.result_url ||
        payloadData.resultUrl ||
        bodyData.video_url ||
        bodyData.videoUrl ||
        null;
    }

    if (videoUrl) {
      videoUrl = videoUrl.replace(/`/g, "").trim();
    } else {
      console.warn(
        `Digital Human webhook ${taskId} completed but no mp4 URL was found.`
      );
    }

    // 只在成功且有视频URL时更新resultUrl，失败时不覆盖
    if (updateStatus === "COMPLETED" && videoUrl) {
      await prisma.digitalHumanVideo.update({
        where: { id: taskId },
        data: {
          status: updateStatus,
          resultUrl: videoUrl,
        },
      });

      await syncTaskToSummary({
        taskType: 'digitalHuman',
        taskId: taskId,
        operation: 'update',
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
                status: "ready",
                jobId: task.id,
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

      // 只在成功时扣积分
      if (task.status !== "COMPLETED") {
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
    } else if (updateStatus === "FAILED") {
      // 失败时只更新状态，不更新resultUrl，不扣积分
      await prisma.digitalHumanVideo.update({
        where: { id: taskId },
        data: { status: updateStatus },
      });

      await syncTaskToSummary({
        taskType: 'digitalHuman',
        taskId: taskId,
        operation: 'update',
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
                status: "error",
                jobId: task.id,
                error:
                  (payloadData.error as string | undefined) ??
                  (bodyData.error as string | undefined) ??
                  "Task failed",
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
