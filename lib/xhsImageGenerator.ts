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
          return item.name || item.label || item.hex || "";
        }
        return "";
      })
      .filter((item) => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }
  return [];
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
  const palette =
    asArray(analysis.palette).map((hex) => `#${hex.replace(/^#/, "")}`) ||
    asArray(spec.palette);
  const motifs = asArray(spec.elements || spec.motifs);
  const adjectives = asArray(spec.promptKit?.adjectives);
  const layout = asRecord(spec.layout || analysis.layout);
  const positive = asArray(analysis.promptKit?.positive || spec.promptKit?.positive);
  const negative = asArray(analysis.promptKit?.negative || spec.promptKit?.negative);
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
