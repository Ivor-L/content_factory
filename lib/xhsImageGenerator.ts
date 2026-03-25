import type { StylePreset } from "@prisma/client";
import { generateImageFromPrompt } from "./cloudImage";
import { clampPosterCount, DEFAULT_POSTER_COUNT } from "./posterConfig";

export type MinimalStyle = Pick<StylePreset, "id" | "name" | "type" | "description" | "spec" | "metadata">;

type JsonRecord = Record<string, any>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};

const asArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null) {
          return (item as Record<string, any>).name || item.label || item.hex || "";
        }
        return "";
      })
      .filter((item) => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
};

const pickFirstNonEmpty = (...lists: string[][]): string[] => {
  for (const list of lists) {
    if (Array.isArray(list) && list.length) {
      return list;
    }
  }
  return [];
};

const safeLayoutValue = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizePalette = (colors: string[]) =>
  colors
    .map((hex) => `#${hex.replace(/^#/i, "")}`)
    .filter((entry) => /^#[0-9a-f]{3,8}$/i.test(entry) || entry.length > 1);

const paletteFromColorSystem = (colorSystem: JsonRecord) => {
  const sections = [
    { key: "background", label: "background" },
    { key: "primary_text", label: "primary_text" },
    { key: "secondary_text", label: "secondary_text" },
    { key: "accent", label: "accent" },
    { key: "warning_or_highlight", label: "warning" },
  ];
  const colors: string[] = [];
  for (const entry of sections) {
    const list = asArray(colorSystem?.[entry.key]);
    colors.push(...list);
  }
  return colors;
};

const promptsFromGeneration = (generation: JsonRecord) => {
  const notes = Array.isArray(generation.render_notes)
    ? generation.render_notes.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
  return [
    generation.prompt_text2img_universal,
    generation.prompt_img2img_style_transfer,
    ...notes,
  ]
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const negativesFromGeneration = (generation: JsonRecord) => {
  const base = typeof generation.negative_prompt === "string" ? generation.negative_prompt.trim() : "";
  return [base, "blurry text", "illegible typography", "overcrowded layout", "low resolution", "watermark"].filter(
    Boolean
  );
};

type XhsImageOptions = {
  style: MinimalStyle;
  copyText: string;
  title?: string;
  variations?: number;
};

type GeneratedPoster = {
  id: string;
  imageUrl: string;
  prompt: string;
};

function buildPrompt({
  style,
  cardCopy,
  title,
  variationLabel,
  cardIndex,
  cardTotal,
}: {
  style: MinimalStyle;
  cardCopy: string;
  title?: string;
  variationLabel?: string;
  cardIndex: number;
  cardTotal: number;
}) {
  const spec = asRecord(style.spec);
  const metadata = asRecord(style.metadata);
  const analysis = asRecord(metadata.analysis);
  const styleDna = asRecord(analysis.style_dna);
  const colorSystem = asRecord(styleDna.color_system);
  const generationPrompts = asRecord(analysis.generation_prompts);
  const palette = normalizePalette(
    pickFirstNonEmpty(
      asArray(analysis.palette),
      paletteFromColorSystem(colorSystem),
      asArray(spec.palette)
    )
  );
  const dnaMotifs = (() => {
    const illustration = asRecord(styleDna.illustration_iconography);
    const decorations = Array.isArray(illustration.decorations)
      ? illustration.decorations
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [];
    return [illustration.icon_style, illustration.chart_style, ...decorations]
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  })();
  const motifs = pickFirstNonEmpty(asArray(spec.elements || spec.motifs), dnaMotifs);
  const adjectives = asArray(spec.promptKit?.adjectives);
  const layout = {
    ...asRecord(spec.layout),
    ...asRecord(analysis.layout),
    ...{
      density:
        safeLayoutValue(styleDna.layout_system?.information_density) ||
        safeLayoutValue(styleDna.layout_system?.density),
      composition: safeLayoutValue(styleDna.layout_system?.grid),
      spacingNotes: safeLayoutValue(styleDna.layout_system?.module_spacing),
    },
  };
  const positive = pickFirstNonEmpty(
    asArray(analysis.promptKit?.positive),
    promptsFromGeneration(generationPrompts),
    asArray(spec.promptKit?.positive)
  );
  const negative = pickFirstNonEmpty(
    asArray(analysis.promptKit?.negative),
    negativesFromGeneration(generationPrompts),
    asArray(spec.promptKit?.negative)
  );
  const extraInstructions =
    typeof spec.promptKit?.instructions === "string" ? spec.promptKit.instructions : "";

  const lines: string[] = [
    cardTotal > 1
      ? `Design a high-resolution Xiaohongshu poster card ${cardIndex + 1} of ${cardTotal} (carousel) that visualizes the provided copy segment.`
      : `Design a high-resolution Xiaohongshu poster image that visualizes the provided copy.`,
    `Style preset: ${style.name}. Type: ${style.type}.`,
    style.description ? `Overall vibe: ${style.description}.` : "",
    adjectives.length ? `Adjectives: ${adjectives.join(", ")}.` : "",
    palette.length ? `Color palette inspirations: ${palette.join(", ")}.` : "",
    motifs.length ? `Motifs or graphic elements to emphasize: ${motifs.join(", ")}.` : "",
    layout.density ? `Layout density: ${layout.density}.` : "",
    layout.composition ? `Composition notes: ${layout.composition}.` : "",
    layout.spacingNotes ? `Spacing notes: ${layout.spacingNotes}.` : "",
    variationLabel ? `Create a unique composition focus: ${variationLabel}.` : "",
    cardTotal > 1
      ? "Ensure this card feels cohesive with the carousel but stands on its own with a clear focal copy block."
      : "",
    `Card copy focus (arrange as hero + supporting text, reserve negative space for typography):`,
    `"""${cardCopy.trim()}"""`,
    "Only render the copy shown above on this card. Avoid repeating copy from other cards.",
  ];

  if (title?.trim()) {
    lines.splice(2, 0, `Hero title text: ${title.trim()}.`);
  }
  if (positive.length) {
    lines.push(`Camera / rendering cues: ${positive.join(", ")}.`);
  }
  if (extraInstructions) {
    lines.push(extraInstructions);
  }
  if (negative.length) {
    lines.push(`Avoid: ${negative.join(", ")}.`);
  }
  lines.push(
    "Ensure clean negative space for Chinese typography, high-contrast hierarchy, and Xiaohongshu UI-ready framing.",
    "Do not add real brand logos or QR codes."
  );

  return lines.filter(Boolean).join("\n");
}

export async function generateXhsImages({
  style,
  copyText,
  title,
  variations = DEFAULT_POSTER_COUNT,
}: XhsImageOptions): Promise<GeneratedPoster[]> {
  const total = clampPosterCount(variations);
  const segments = splitCopyIntoSegments(copyText, total);
  const prompts = Array.from({ length: total }).map((_, index) =>
    buildPrompt({
      style,
      cardCopy: segments[index],
      title,
      variationLabel: total > 1 ? `Variation ${index + 1}` : undefined,
      cardIndex: index,
      cardTotal: total,
    })
  );

  const results = await Promise.all(
    prompts.map((prompt) =>
      generateImageFromPrompt({
        prompt,
        aspectRatio: "3:4",
      })
    )
  );

  return results.map((result, index) => ({
    id: `${style.id}-${Date.now()}-${index}`,
    imageUrl: result.dataUrl,
    prompt: prompts[index],
  }));
}

const normalizeWhitespace = (text: string) => text.replace(/\r\n/g, "\n").trim();

const splitByNewlines = (text: string) =>
  normalizeWhitespace(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

const splitBySentence = (text: string) => {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  const sentences: string[] = [];
  let buffer = "";
  for (const char of normalized) {
    buffer += char;
    if (/[。！？!?;；\n]/u.test(char)) {
      const trimmed = buffer.trim();
      if (trimmed) sentences.push(trimmed);
      buffer = "";
    }
  }
  const tail = buffer.trim();
  if (tail) sentences.push(tail);
  return sentences;
};

const chunkUnits = (units: string[], count: number) => {
  if (units.length === 0) {
    return Array(count).fill("");
  }
  const chunkSize = Math.max(1, Math.ceil(units.length / count));
  return Array.from({ length: count }).map((_, index) =>
    units.slice(index * chunkSize, (index + 1) * chunkSize).join("\n").trim()
  );
};

const chunkByCharacters = (text: string, count: number) => {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return Array(count).fill("");
  }
  const chunkSize = Math.max(1, Math.ceil(normalized.length / count));
  return Array.from({ length: count }).map((_, index) =>
    normalized.slice(index * chunkSize, (index + 1) * chunkSize).trim()
  );
};

function splitCopyIntoSegments(copyText: string, count: number) {
  const normalized = normalizeWhitespace(copyText);
  if (!normalized) {
    return Array(count).fill("");
  }
  let segments = chunkUnits(splitByNewlines(normalized), count);
  if (segments.some((segment) => !segment)) {
    const sentenceSegments = chunkUnits(splitBySentence(normalized), count);
    segments = segments.map((segment, index) => segment || sentenceSegments[index]);
  }
  if (segments.some((segment) => !segment)) {
    const charSegments = chunkByCharacters(normalized, count);
    segments = segments.map((segment, index) => segment || charSegments[index]);
  }
  return segments.map((segment) => segment || normalized);
}
