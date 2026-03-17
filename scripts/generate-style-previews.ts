import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prisma from "../lib/prisma";
import { systemStylePresets } from "../lib/systemStylePresets";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, "..", "public", "system-style-previews");
const DEFAULT_BASE_URL = "https://yunwu.ai/v1beta";
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

type Preset = (typeof systemStylePresets)[number];

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeColor(color: any): string | null {
  if (!color) return null;
  if (typeof color === "string") return color;
  if (typeof color === "object") {
    return color.hex || color.color || color.name || null;
  }
  return null;
}

function buildPrompt(preset: Preset) {
  const spec = (preset.spec || {}) as Record<string, any>;
  const isLayout = preset.type.includes("layout");
  const palette =
    Array.isArray(spec.palette) && spec.palette.length
      ? spec.palette
          .map(normalizeColor)
          .filter(Boolean)
          .join(", ")
      : "";
  const tone = typeof spec.tone === "string" ? spec.tone : preset.description;
  const bestFor = Array.isArray(spec.bestFor)
    ? spec.bestFor.join(", ")
    : typeof spec.bestFor === "string"
    ? spec.bestFor
    : "";
  const adjectives = Array.isArray(spec.promptKit?.adjectives)
    ? spec.promptKit.adjectives.join(", ")
    : "";
  const extraInstructions = typeof spec.promptKit?.instructions === "string" ? spec.promptKit.instructions : "";

  if (isLayout) {
    return [
      `Design a high-resolution wireframe card that represents the "${preset.name}" information layout for Xiaohongshu posts.`,
      tone ? `Overall tone: ${tone}.` : "",
      bestFor ? `Use cases: ${bestFor}.` : "",
      palette ? `Use a limited monochrome palette inspired by: ${palette}.` : "",
      "Show only abstract panels, cards, arrows, and dotted guides. Avoid real text, Chinese characters, or paragraphs.",
      "Use semi-transparent blocks, numbered badges, or icons to hint at hierarchy without any readable copy.",
      "Background should be clean with soft shadows. Do not include logos, watermarks, or realistic photos.",
      extraInstructions,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Create a polished Xiaohongshu cover moodboard for the "${preset.name}" visual style.`,
    tone ? `Tone keywords: ${tone}.` : "",
    bestFor ? `Ideal content themes: ${bestFor}.` : "",
    palette ? `Color palette hints: ${palette}.` : "",
    adjectives ? `Adjectives: ${adjectives}.` : "",
    "Show a collage-like hero composition with lighting, props, and background that match the description.",
    "Include depth, lighting, and styling clues but avoid readable text, Chinese characters, or interface mockups.",
    "No logos, no watermarks, no QR codes.",
    extraInstructions,
  ]
    .filter(Boolean)
    .join("\n");
}

async function callYunwuImage(prompt: string, aspectRatio: string) {
  const apiKey = process.env.CLOUD_API_KEY;
  if (!apiKey) {
    throw new Error("CLOUD_API_KEY is required to generate previews.");
  }
  const baseUrl =
    process.env.CLOUD_IMAGE_BASE_URL ||
    process.env.CLOUD_API_BASE_URL ||
    DEFAULT_BASE_URL;
  const model =
    process.env.CLOUD_IMAGE_MODEL ||
    process.env.CLOUD_DEFAULT_IMAGE_MODEL ||
    DEFAULT_IMAGE_MODEL;
  const endpoint = `${baseUrl.replace(/\/$/, "")}/models/${model}:generateContent`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio },
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Yunwu image request failed (${response.status}): ${errorText}`
    );
  }

  const payload = await response.json();
  const base64 = extractInlineImage(payload);
  if (!base64) {
    throw new Error("No inline image returned from Yunwu response.");
  }
  return base64;
}

function extractInlineImage(payload: any): string | null {
  const candidates = payload?.candidates;
  if (Array.isArray(candidates) && candidates.length) {
    const parts = candidates[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        const inline =
          part?.inline_data ||
          part?.inlineData ||
          part?.inlineDataV2;
        if (inline?.data) {
          return String(inline.data).trim();
        }
      }
    }
  }
  if (payload?.image?.data) return String(payload.image.data);
  if (payload?.data?.image) return String(payload.data.image);
  return null;
}

async function updatePreviewUrl(preset: Preset, relativeUrl: string) {
  await prisma.stylePreset.updateMany({
    where: { id: preset.id },
    data: { previewUrl: relativeUrl },
  });
}

async function generateForPreset(preset: Preset, force: boolean) {
  const aspectRatio = preset.type.includes("layout") ? "3:4" : "1:1";
  const prompt = buildPrompt(preset);
  const fileName = `${preset.slug}.png`;
  const filePath = path.join(OUTPUT_DIR, fileName);
  const relativeUrl = `/system-style-previews/${fileName}`;

  const exists = await fileExists(filePath);
  if (exists && !force) {
    console.log(`Skipping ${preset.slug} (already exists).`);
    await updatePreviewUrl(preset, relativeUrl);
    return;
  }

  console.log(`Generating ${preset.slug}...`);
  const base64 = await callYunwuImage(prompt, aspectRatio);
  const buffer = Buffer.from(
    base64.replace(/^data:.*;base64,/, ""),
    "base64"
  );
  await fs.writeFile(filePath, buffer);
  await updatePreviewUrl(preset, relativeUrl);
  console.log(`Saved ${fileName}`);
}

async function main() {
  await ensureOutputDir();
  const force = process.argv.includes("--force");

  for (const preset of systemStylePresets) {
    try {
      await generateForPreset(preset, force);
    } catch (error) {
      console.error(
        `Failed to generate preview for ${preset.slug}:`,
        error
      );
    }
  }

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  prisma.$disconnect().catch(() => {});
  process.exit(1);
});
