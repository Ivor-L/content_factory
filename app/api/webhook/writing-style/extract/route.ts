import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const WEBHOOK_SECRET = process.env.WRITING_STYLE_EXTRACT_WEBHOOK_SECRET || "";

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function coerceJsonObject(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
      if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === "object") {
        return parsed[0] as Record<string, any>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function extractStyleJson(payload: Record<string, any>) {
  return (
    coerceJsonObject(payload.style_json) ||
    coerceJsonObject(payload.style_profile_json) ||
    coerceJsonObject(payload.analysis_result) ||
    coerceJsonObject(payload.output) ||
    coerceJsonObject(payload.output_json) ||
    null
  );
}

function extractField(payload: Record<string, any>, key: string) {
  const direct = safeText(payload[key]);
  if (direct) return direct;
  const dataObj = asRecord(payload.data);
  return safeText(dataObj[key]);
}

export async function POST(request: NextRequest) {
  if (WEBHOOK_SECRET) {
    const provided = request.headers.get("x-workflow-secret")?.trim();
    if (provided !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: Record<string, any>;
  try {
    body = (await request.json()) as Record<string, any>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = new URL(request.url);
  const styleId =
    safeText(url.searchParams.get("style_id")) ||
    safeText(body.style_id) ||
    safeText(body.task_id) ||
    safeText(body.record_id) ||
    safeText(body.style_record_id);

  if (!styleId) {
    return NextResponse.json({ error: "style_id is required" }, { status: 400 });
  }

  const style = await prisma.writingStyle.findUnique({ where: { id: styleId } });
  if (!style) {
    return NextResponse.json({ error: "style not found" }, { status: 404 });
  }

  const status = safeText(body.status).toUpperCase();
  const hasFailure =
    status === "FAILED" ||
    status === "ERROR" ||
    Boolean(safeText(body.error)) ||
    Boolean(safeText(body.error_message));

  if (hasFailure) {
    await prisma.writingStyle.update({
      where: { id: style.id },
      data: {
        extractionStatus: "FAILED",
        metadata: {
          ...asRecord(style.metadata),
          extract: {
            ...asRecord(asRecord(style.metadata).extract),
            status: "FAILED",
            finishedAt: new Date().toISOString(),
            error: safeText(body.error) || safeText(body.error_message) || "extract failed",
          },
        },
      },
    });
    return NextResponse.json({ ok: true });
  }

  const styleJson = extractStyleJson(body);
  if (!styleJson) {
    return NextResponse.json({ error: "style_json is required" }, { status: 400 });
  }

  const domainInference = asRecord(styleJson.domain_inference);
  const sampleGaps =
    extractField(body, "sample_gaps") ||
    extractField(body, "样本缺失点") ||
    safeText(domainInference.gaps);
  const sampleImprovement =
    extractField(body, "sample_improvement") ||
    extractField(body, "改进方向") ||
    safeText(domainInference.adaptation_strategy);

  const latest = await prisma.writingStyleProfile.findFirst({
    where: { styleId: style.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  const profile = await prisma.writingStyleProfile.create({
    data: {
      styleId: style.id,
      version: nextVersion,
      status: "READY",
      profileJson: styleJson,
      sampleGaps: sampleGaps || null,
      sampleImprovement: sampleImprovement || null,
      metadata: {
        workflowId: safeText(body.workflow_id),
        workflowName: safeText(body.workflow_name),
        sourceStatus: status || "COMPLETED",
        receivedAt: new Date().toISOString(),
      },
    },
  });

  await prisma.writingStyle.update({
    where: { id: style.id },
    data: {
      extractionStatus: "READY",
      currentProfileId: profile.id,
      metadata: {
        ...asRecord(style.metadata),
        extract: {
          ...asRecord(asRecord(style.metadata).extract),
          status: "READY",
          finishedAt: new Date().toISOString(),
          profileId: profile.id,
          version: nextVersion,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, data: { styleId: style.id, profileId: profile.id } });
}
