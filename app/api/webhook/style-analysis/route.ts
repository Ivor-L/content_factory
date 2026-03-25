import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toInputJson } from "@/lib/jsonUtils";

const DEFAULT_WORKFLOW_ID = process.env.N8N_STYLE_WORKFLOW_ID || "flow_xhs_Vision";
const DEFAULT_WORKFLOW_NAME = process.env.N8N_STYLE_WORKFLOW_NAME || "小红书视觉风格分析";
const WEBHOOK_SECRET = process.env.STYLE_ANALYSIS_WEBHOOK_SECRET || "";
const SUCCESS_STATUSES = new Set(["COMPLETED", "SUCCESS", "SUCCEEDED", "SUCCESSFUL", "DONE", "FINISHED", "OK"]);

const nowIso = () => new Date().toISOString();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const coerceJson = (value: unknown): Record<string, any> | null => {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === "string") {
    try {
      const trimmed = value.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
      if (!trimmed) return null;
      return JSON.parse(trimmed);
    } catch {
      // fallback: extract the first JSON object slice when extra text wraps around it
      const raw = value.trim();
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(raw.slice(start, end + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }
  return null;
};

const safeText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function buildSpecFromStyleJson(
  base: Record<string, any>,
  styleJson: Record<string, any> | null,
  promptText: string,
  negativePrompt: string
) {
  if (!styleJson) return base;
  const next = { ...base };
  const dna = asRecord(styleJson.style_dna);
  const colorSystem = asRecord(dna.color_system);
  const palette: Array<{ hex: string; usage: string }> = [];
  const pushColors = (list: unknown, usage: string) => {
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      const hex = safeText(entry);
      if (hex) {
        palette.push({ hex, usage });
      }
    }
  };
  pushColors(colorSystem.background, "background");
  pushColors(colorSystem.primary_text, "primary_text");
  pushColors(colorSystem.secondary_text, "secondary_text");
  pushColors(colorSystem.accent, "accent");
  pushColors(colorSystem.warning_or_highlight, "warning");
  if (palette.length) {
    next.palette = palette;
  }

  const typography = asRecord(dna.typography);
  next.typography = {
    primary: safeText(typography.title_font_vibe),
    secondary: safeText(typography.body_font_vibe),
    casing: safeText(typography.hierarchy?.h1?.letter_spacing),
  };

  const layout = asRecord(dna.layout_system);
  next.layout = {
    density: safeText(layout.information_density) || safeText(layout.density),
    composition: safeText(layout.grid),
    spacingNotes: safeText(layout.module_spacing),
  };

  const illustration = asRecord(dna.illustration_iconography);
  const decorations = Array.isArray(illustration.decorations)
    ? illustration.decorations.map(safeText).filter(Boolean)
    : [];
  const motifs = [safeText(illustration.icon_style), safeText(illustration.chart_style), ...decorations].filter(Boolean);
  if (motifs.length) {
    next.motifs = motifs;
  }

  const texture = asRecord(dna.texture_and_background);
  next.lighting = safeText(texture.shadow_and_depth);
  next.texture = safeText(texture.background_texture);

  const generationPrompts = asRecord(styleJson.generation_prompts);
  const renderNotes = Array.isArray(generationPrompts.render_notes)
    ? generationPrompts.render_notes.map(safeText).filter(Boolean)
    : [];
  const positives = [promptText, safeText(generationPrompts.prompt_img2img_style_transfer), ...renderNotes].filter(Boolean);
  const negatives = [negativePrompt || safeText(generationPrompts.negative_prompt)].filter(Boolean);
  if (positives.length || negatives.length) {
    next.promptKit = {
      positive: positives.length ? positives : next.promptKit?.positive ?? [],
      negative: negatives.length ? negatives : next.promptKit?.negative ?? [],
    };
  }

  next.analysis = styleJson;
  return next;
}

export async function POST(request: NextRequest) {
  if (WEBHOOK_SECRET) {
    const provided = request.headers.get("x-style-analysis-secret")?.trim();
    if (provided !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (Array.isArray(body)) {
    body = body[0] ?? {};
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload object" }, { status: 400 });
  }

  const styleId = safeText(body.task_id || body.style_id);
  if (!styleId) {
    return NextResponse.json({ error: "task_id is required" }, { status: 400 });
  }

  const workflowId = safeText(body.workflow_id) || DEFAULT_WORKFLOW_ID;
  if (DEFAULT_WORKFLOW_ID && workflowId !== DEFAULT_WORKFLOW_ID) {
    return NextResponse.json({ error: "workflow_id mismatch" }, { status: 400 });
  }

  const style = await prisma.stylePreset.findUnique({ where: { id: styleId } });
  if (!style) {
    return NextResponse.json({ error: "Style preset not found" }, { status: 404 });
  }

  const incomingStatus = safeText(body.status);
  const status = incomingStatus ? incomingStatus.toUpperCase() : "COMPLETED";
  const isSuccess = SUCCESS_STATUSES.has(status);
  const styleJson = coerceJson(
    body.style_json ??
      body.style_profile_json ??
      body.analysis_result ??
      body.raw_result_text
  );
  const styleSummary = safeText(body.style_summary);
  const promptText = safeText(body.prompt_text2img_universal);
  const negativePrompt = safeText(body.negative_prompt);
  const errorMessage = safeText(body.error_message || body.message);

  const nextMetadata = asRecord(style.metadata);
  nextMetadata.processingStatus = isSuccess ? "READY" : "FAILED";
  nextMetadata.workflow = {
    ...(asRecord(nextMetadata.workflow)),
    provider: "n8n",
    workflowId,
    workflowName: safeText(body.workflow_name) || DEFAULT_WORKFLOW_NAME,
    status,
    lastEventAt: nowIso(),
    error: isSuccess ? undefined : errorMessage || undefined,
  };
  if (isSuccess) {
    nextMetadata.processedAt = nowIso();
    nextMetadata.lastError = "";
  } else {
    nextMetadata.failedAt = nowIso();
    nextMetadata.lastError = errorMessage || "style analysis failed";
  }
  if (styleSummary) {
    nextMetadata.styleSummary = styleSummary;
  }
  if (promptText) {
    nextMetadata.promptText2ImgUniversal = promptText;
  }
  if (negativePrompt) {
    nextMetadata.negativePrompt = negativePrompt;
  }
  if (styleJson) {
    nextMetadata.analysis = styleJson;
  }

  let nextSpec = asRecord(style.spec);
  if (isSuccess && styleJson) {
    nextSpec = buildSpecFromStyleJson(nextSpec, styleJson, promptText, negativePrompt);
    if (Array.isArray(nextSpec.palette) && nextSpec.palette.length) {
      nextMetadata.palettePreview = nextSpec.palette.slice(0, 5).map((color: any) => color.hex || color);
    }
  }

  await prisma.stylePreset.update({
    where: { id: style.id },
    data: {
      spec: toInputJson(nextSpec) ?? undefined,
      metadata: toInputJson(nextMetadata) ?? undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
