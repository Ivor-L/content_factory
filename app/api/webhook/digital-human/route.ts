import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type ResultEntry = {
  fileUrl?: string;
  url?: string;
  resultUrl?: string;
  value?: string;
  outputType?: string;
  fileType?: string;
  type?: string;
};

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

    await prisma.digitalHumanVideo.update({
      where: { id: taskId },
      data: {
        status: updateStatus,
        resultUrl: videoUrl || task.resultUrl,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
