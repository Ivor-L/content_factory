import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";

const webhookUrl =
  process.env.N8N_EXTRACT_VIDEO_TEXT_WEBHOOK ||
  "https://hooks.atomx.top/webhook/extract_video_text";

function normalizeExtractLanguage(raw: unknown): "zh-CN" | "zh-TW" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "zh-CN";
  if (
    value === "zh-tw" ||
    value === "zh-hk" ||
    value === "tw" ||
    value === "hk" ||
    value.includes("traditional") ||
    value.includes("繁")
  ) {
    return "zh-TW";
  }
  return "zh-CN";
}

function normalizeWebhookEnvelope(rawData: any): any {
  const normalized = Array.isArray(rawData) ? rawData[0] ?? null : rawData;
  if (
    normalized &&
    typeof normalized === "object" &&
    normalized.data &&
    typeof normalized.data === "object"
  ) {
    return normalized.data;
  }
  return normalized;
}

function extractTextFromEnvelope(envelope: any): string {
  const candidates = [
    envelope?.text,
    envelope?.transcript,
    envelope?.result?.text,
    envelope?.copyText,
    envelope?.copy_text,
    envelope?.raw?.text,
    envelope?.data?.text,
    envelope?.data?.transcript,
    envelope?.data?.result?.text,
    envelope?.data?.copyText,
    envelope?.data?.copy_text,
    envelope?.data?.raw?.text,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export async function POST(request: NextRequest) {
  const { userId } = await getRequestUserContext(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scriptId = typeof body.scriptId === "string" ? body.scriptId : undefined;
  const referenceItemId = typeof body.referenceItemId === "string" ? body.referenceItemId : undefined;
  const sourcePlatform = typeof body.sourcePlatform === "string" ? body.sourcePlatform : undefined;
  const noteDescription = typeof body.noteDescription === "string" ? body.noteDescription.trim() : undefined;
  const language = normalizeExtractLanguage(
    body?.language ?? body?.target_language ?? body?.targetLanguage ?? body?.lang,
  );
  let videoUrl =
    typeof body.videoUrl === "string" ? body.videoUrl.trim() : undefined;

  let script: { id: string; breakdown: string | null; videoUrl: string | null } | null = null;
  if (scriptId) {
    script = await prisma.script.findUnique({
      where: { id: scriptId },
      select: { id: true, breakdown: true, videoUrl: true },
    });
    if (!script) {
      return NextResponse.json({ error: "脚本不存在" }, { status: 404 });
    }
    if (!videoUrl) {
      videoUrl = script.videoUrl || undefined;
    }
  }

  if (!videoUrl) {
    return NextResponse.json({ error: "缺少视频地址" }, { status: 400 });
  }

  // Build callback URL so n8n can POST the result back asynchronously.
  const callbackBase = (process.env.N8N_CALLBACK_BASE_URL || "").replace(/\/+$/, "");
  let callbackUrl: string | null = null;
  if (callbackBase) {
    try {
      const callback = new URL(`${callbackBase}/api/replication/copy/extract/callback`);
      if (scriptId) callback.searchParams.set("script_id", scriptId);
      if (referenceItemId) callback.searchParams.set("reference_item_id", referenceItemId);
      callbackUrl = callback.toString();
    } catch (error) {
      console.error("[replication/copy/extract] invalid callback base url", {
        callbackBase,
        error,
      });
      callbackUrl = null;
    }
  }

  const payload: Record<string, unknown> = {
    video_url: videoUrl,
    script_id: scriptId,
    user_id: userId,
    extract_type: "subtitle",
    content_hint: "video_subtitle_only",
    source_platform: sourcePlatform,
    note_description: noteDescription || null,
    reference_item_id: referenceItemId || null,
    language,
    target_language: language,
    // If callback_url is present, n8n should POST the result there instead of
    // responding synchronously. If null, n8n responds synchronously (dev / fallback).
    callback_url: callbackUrl,
  };

  // ── Async path (preferred in production) ─────────────────────────────────
  // Fire the webhook without awaiting so nginx/Vercel never times out.
  // n8n will call callback_url when done.
  if (callbackUrl) {
    // Intentionally not awaited — runs in background.
    // If n8n returns transcript synchronously, we still persist it here as a fallback,
    // so UI won't depend on callback_url being correctly handled by the workflow.
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const rawData = await res.json().catch(() => null);
        if (!res.ok) {
          console.error("[replication/copy/extract] background fetch failed", {
            status: res.status,
            body: rawData,
          });
          return;
        }

        const envelope = normalizeWebhookEnvelope(rawData);
        const extractedText = extractTextFromEnvelope(envelope);
        if (!extractedText) return;

        try {
          await persistExtractedText({ scriptId, referenceItemId, extractedText, script });
        } catch (persistError) {
          console.error("[replication/copy/extract] background persist error", persistError);
        }
      })
      .catch((err) => {
        console.error("[replication/copy/extract] background fetch error", err);
      });

    return NextResponse.json({
      data: {
        status: "pending",
      },
    });
  }

  // ── Sync fallback (no callback URL configured) ────────────────────────────
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const rawData = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        (rawData && (rawData.error || rawData.message)) ||
        `Failed with status ${res.status}`;
      throw new Error(message);
    }

    const envelope = normalizeWebhookEnvelope(rawData);
    const extractedText = extractTextFromEnvelope(envelope);

    if (!extractedText) {
      throw new Error("未获取到文案内容");
    }

    await persistExtractedText({ scriptId, referenceItemId, extractedText, script });

    const wordsEstimate =
      envelope?.words_estimate ??
      envelope?.wordsEstimate ??
      (typeof extractedText === "string"
        ? Math.max(1, Math.round(extractedText.replace(/\s+/g, "").length / 2))
        : null);
    const language = envelope?.language ?? envelope?.lang ?? null;
    const taskRef = envelope?.task_id ?? envelope?.taskId ?? null;

    return NextResponse.json({
      data: {
        text: extractedText,
        transcript: extractedText,
        wordsEstimate,
        language,
        taskId: taskRef,
        raw: envelope ?? rawData,
      },
    });
  } catch (error) {
    console.error("[replication/copy/extract] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "提取失败" },
      { status: 500 },
    );
  }
}

// ── Shared persistence helper (used by both sync path and callback route) ──

export async function persistExtractedText({
  scriptId,
  referenceItemId,
  extractedText,
  script,
}: {
  scriptId?: string;
  referenceItemId?: string;
  extractedText: string;
  script?: { id: string; breakdown: string | null } | null;
}) {
  // Persist to Script.breakdown.originalCopy
  if (scriptId) {
    const s = script ?? await prisma.script.findUnique({
      where: { id: scriptId },
      select: { id: true, breakdown: true },
    });
    if (s) {
      let parsed: Record<string, any>;
      try {
        parsed = s.breakdown ? JSON.parse(s.breakdown) : {};
      } catch {
        parsed = {};
      }
      parsed.originalCopy = extractedText;
      await prisma.script.update({
        where: { id: s.id },
        data: { breakdown: JSON.stringify(parsed) },
      });
    }
  }

  // Persist to ViralReferenceItem.rawPayload.scriptText
  if (referenceItemId) {
    const refItem = await prisma.viralReferenceItem.findUnique({
      where: { id: referenceItemId },
      select: { rawPayload: true },
    });
    if (refItem) {
      const existingPayload =
        refItem.rawPayload && typeof refItem.rawPayload === "object" && !Array.isArray(refItem.rawPayload)
          ? (refItem.rawPayload as Record<string, unknown>)
          : {};
      await prisma.viralReferenceItem.update({
        where: { id: referenceItemId },
        data: {
          rawPayload: {
            ...existingPayload,
            scriptText: extractedText,
          },
        },
      });
    }
  }
}
