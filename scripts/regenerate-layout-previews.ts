import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, "..", "public", "system-style-previews");
const DEFAULT_ASPECT_RATIO = "4:5";
const DEFAULT_BASE_URL = "https://yunwu.ai/v1beta";
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

type LayoutCopy = {
  hero: string;
  bullets: string[];
};

type LayoutDefinition = {
  slug: string;
  name: string;
  summary: string;
  arrangement: string;
  buildHint: (copy: LayoutCopy) => string;
};

const LAYOUTS: LayoutDefinition[] = [
  {
    slug: "flow",
    name: "Flow Layout",
    summary: "Process / timeline arrangement with arrows and connected stages.",
    arrangement:
      "Show a serpentine path with rounded modules connected by arrows and micro icons. Keep consistent spacing and annotate each step with numbers.",
    buildHint: (copy) => {
      const steps = copy.bullets
        .map((point, index) => `Step ${index + 1}: "${point}"`)
        .join(" | ");
      return [
        "Map the supporting lines into sequential steps.",
        steps,
        "Place the hero title as the header bar and route the timeline underneath with visible arrowheads.",
      ].join("\n");
    },
  },
  {
    slug: "comparison",
    name: "Comparison Layout",
    summary: "Split view with mirrored columns separated by a central divider.",
    arrangement:
      "Two frosted panels share one hero title on top. Use a vertical divider with subtle glow; align content symmetrically.",
    buildHint: (copy) => {
      const midpoint = Math.ceil(copy.bullets.length / 2);
      const left = copy.bullets.slice(0, midpoint);
      const right = copy.bullets.slice(midpoint);
      const formatColumn = (items: string[]) =>
        items.map((item) => `• "${item}"`).join(" / ");
      return [
        "Split the supporting lines evenly between the left and right columns.",
        `Left column: ${formatColumn(left) || "（留空）"}`,
        `Right column: ${formatColumn(right) || "（留空）"}`,
        "Use only thin English letters such as A/B for column badges if needed; do not invent new Chinese text.",
      ].join("\n");
    },
  },
  {
    slug: "list",
    name: "List Layout",
    summary: "Vertical enumeration with numbered hierarchy.",
    arrangement:
      "Display a tall hero title on top and a vertical ladder of rounded cards underneath. Each card has a bold numeral badge on the left.",
    buildHint: (copy) => {
      const entries = copy.bullets
        .map((item, index) => `${index + 1}. "${item}"`)
        .join("\n");
      return [
        "Render each supporting line as an individual numbered list item.",
        entries,
        "Only digits 1-9 may prefix the cards; do not rewrite the Chinese copy.",
      ].join("\n");
    },
  },
  {
    slug: "dense",
    name: "Dense Layout",
    summary: "High-information grid with micro cards and connectors.",
    arrangement:
      "Use a modular grid (2x3 or 3x2) with glass panels, thin dividers, and small icon chips for each data point.",
    buildHint: (copy) => {
      return [
        "Distribute the supporting lines across micro cards inside the grid, allowing multiple phrases per row if needed.",
        "Stack cards tightly but keep alignment crisp. You may pair two related phrases inside one card separated by a dot symbol (·).",
      ].join("\n");
    },
  },
  {
    slug: "balanced",
    name: "Balanced Layout",
    summary: "Standard Xiaohongshu density with hero header and 3-4 key blocks.",
    arrangement:
      "Hero bar up top, equal-width content blocks below with generous padding and soft drop shadows.",
    buildHint: (copy) => {
      return [
        "Use the hero copy as the main banner.",
        "Place the supporting lines into 3-4 balanced modules underneath, keeping each phrase on its own line.",
      ].join("\n");
    },
  },
  {
    slug: "sparse",
    name: "Sparse Layout",
    summary: "Ultra-minimal cover with single focus and large whitespace.",
    arrangement:
      "Center the hero copy. Use the supporting lines as floating chips or corner annotations with thin connectors.",
    buildHint: (copy) => {
      const phrases = copy.bullets.map((item) => `• "${item}"`).join(" ");
      return [
        "Keep 60-70% whitespace.",
        "Convert the supporting lines into soft gradient pills hugging the perimeter.",
        phrases,
      ].join("\n");
    },
  },
];

function getArgValue(flag: string) {
  const prefix = `${flag}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function decodeEscapes(value: string | null) {
  if (!value) return value;
  return value.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

async function loadCopy(): Promise<LayoutCopy> {
  const textFilePath = getArgValue("--text-file");
  const inlineText = decodeEscapes(getArgValue("--text"));
  let raw = inlineText;

  if (!raw && textFilePath) {
    raw = await fs.readFile(path.resolve(textFilePath), "utf8");
  }

  if (!raw || !raw.trim()) {
    throw new Error("Provide copy via --text=\"...\" or --text-file=path.");
  }

  return parseCopy(raw);
}

function parseCopy(raw: string): LayoutCopy {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("Copy text must contain at least one non-empty line.");
  }

  const hero = lines[0];
  const remaining = lines.slice(1).join(" ");
  const bullets = splitPhrases(remaining);

  if (!bullets.length) {
    throw new Error("Provide at least one supporting phrase beneath the hero line.");
  }

  return { hero, bullets };
}

function splitPhrases(text: string) {
  return text
    .split(/[、，,。\/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function fileExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeBase64(b64: string) {
  return b64.replace(/^data:.*;base64,/, "").trim();
}

async function callYunwuImage(prompt: string, aspectRatio: string) {
  const apiKey = process.env.CLOUD_API_KEY;
  if (!apiKey) {
    throw new Error("CLOUD_API_KEY is required (load it before running the script).");
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

  const payload = {
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
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Yunwu image request failed (${response.status}): ${errorText}`);
  }

  const body = await response.json();
  const base64 = extractInlineImage(body);
  if (!base64) {
    throw new Error("Yunwu response did not include inline image data.");
  }
  return base64;
}

function extractInlineImage(payload: any): string | null {
  const candidates = payload?.candidates;
  if (Array.isArray(candidates) && candidates.length) {
    const parts = candidates[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        const inline = part?.inline_data || part?.inlineData || part?.inlineDataV2;
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

function buildLayoutPrompt(definition: LayoutDefinition, copy: LayoutCopy) {
  const parts = [
    `Design a futuristic Xiaohongshu ${definition.name}.`,
    definition.summary,
    definition.arrangement,
    "Visual style: frosted glass cards, blueprint grid, subtle volumetric lighting, gradient silver-to-ice-blue background, neon cyan accent strokes, no photography, no people.",
    "Keep everything inside a rounded-rectangle frame suitable for mobile cover art (4:5).",
    "Typography should be crisp, high-contrast, and perfectly legible. Avoid serif fonts; use geometric sans or tech mono.",
    buildExactCopyBlock(copy),
    definition.buildHint(copy),
    "You may add minimal English labels such as A/B or digits 1-5 solely for structure, but never invent extra Chinese sentences.",
  ];
  return parts.filter(Boolean).join("\n\n");
}

function buildExactCopyBlock(copy: LayoutCopy) {
  const lines = copy.bullets
    .map((value, index) => `${index + 1}. "${value}"`)
    .join("\n");
  return [
    "Render the following Chinese copy exactly as provided (no translation, no paraphrasing).",
    `Title: "${copy.hero}"`,
    "Supporting lines (each must stay on its own line or card):",
    lines,
    "Do not add punctuation beyond thin separators or dot characters.",
  ].join("\n");
}

function pickLayoutsFromArgs() {
  const slugsValue = getArgValue("--slugs");
  if (!slugsValue) {
    return LAYOUTS;
  }
  const allowed = new Set(
    slugsValue
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean)
  );
  const selected = LAYOUTS.filter((layout) => allowed.has(layout.slug));
  if (!selected.length) {
    throw new Error(`No layout definitions matched --slugs=${slugsValue}`);
  }
  return selected;
}

async function main() {
  const layoutCopy = await loadCopy();
  const layouts = pickLayoutsFromArgs();
  const force = hasFlag("--force");

  await ensureOutputDir();

  for (const layout of layouts) {
    const fileName = `${layout.slug}.png`;
    const targetPath = path.join(OUTPUT_DIR, fileName);
    const exists = await fileExists(targetPath);
    if (exists && !force) {
      console.log(`Skipping ${layout.slug} (already exists). Use --force to overwrite.`);
      continue;
    }

    console.log(`Generating ${layout.slug} preview...`);
    const prompt = buildLayoutPrompt(layout, layoutCopy);
    const base64 = await callYunwuImage(prompt, DEFAULT_ASPECT_RATIO);
    const buffer = Buffer.from(sanitizeBase64(base64), "base64");
    await fs.writeFile(targetPath, buffer);
    console.log(`Saved ${targetPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
