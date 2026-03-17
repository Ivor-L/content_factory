export interface CopyInsightsResult {
  segments: {
    description?: string;
    intro?: string;
    body?: string;
    conclusion?: string;
  };
  copyText: string;
  coreViewpoint: string;
  viralAngles: string[];
  structureLogic: string[];
  goldenSentences: string[];
  painPoints: string[];
}

const painKeywords = [
  "痛",
  "烦",
  "难",
  "怕",
  "缺",
  "没",
  "问题",
  "困扰",
  "worry",
  "struggle",
  "can't",
  "cannot",
  "too",
];

const sentenceSplitter = /(?<=[。！？!?\n\.;])\s+/g;

function safeParse(raw?: string | Record<string, unknown> | null): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw as Record<string, any>;
  }
  return null;
}

function cleanText(value?: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return value.toString();
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (value && typeof value === "object") {
    return Object.values(value)
      .map((entry) => (typeof entry === "string" ? entry : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function uniqueNonEmpty(values: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = (value || "").trim();
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function splitSentences(text: string): string[] {
  if (!text) return [];
  return text
    .split(sentenceSplitter)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function deriveCopyInsights(params: {
  breakdown?: string | Record<string, unknown> | null;
  blueprint?: string | Record<string, unknown> | null;
}): CopyInsightsResult {
  const breakdown = safeParse(params.breakdown) ?? {};
  const blueprint = safeParse(params.blueprint) ?? {};
  const segments = {
    description: cleanText(breakdown.description),
    intro: cleanText(breakdown.intro),
    body: cleanText(breakdown.body),
    conclusion: cleanText(breakdown.conclusion),
  };

  const copyText = uniqueNonEmpty([segments.intro, segments.body, segments.conclusion]).join("\n\n");
  const combinedForSentences = segments.description
    ? `${segments.description}\n${copyText}`
    : copyText;
  const sentences = splitSentences(combinedForSentences);

  const goldenSentences = uniqueNonEmpty(
    sentences
      .filter((sentence) => sentence.length >= 12)
      .sort((a, b) => b.length - a.length)
      .slice(0, 3)
  );

  const painSentences = sentences.filter((sentence) =>
    painKeywords.some((keyword) => sentence.toLowerCase().includes(keyword))
  );

  const painPoints = uniqueNonEmpty([
    ...painSentences.slice(0, 3),
    ...sentences.slice(0, 2),
  ]).slice(0, 3);

  const meta = blueprint?.meta ?? {};
  const scenes: any[] = Array.isArray(blueprint?.scene_breakdown)
    ? (blueprint?.scene_breakdown as any[])
    : [];

  const viralAngles = uniqueNonEmpty([
    meta.art_style ? `视觉风格：${meta.art_style}` : undefined,
    meta.mood_atmosphere ? `情绪氛围：${meta.mood_atmosphere}` : undefined,
    ...scenes.slice(0, 4).map((scene) => {
      const role = cleanText(scene?.abstract_logic?.narrative_role);
      const hook = cleanText(scene?.visual_specs?.subject_action);
      if (role) return `镜头${scene?.id ?? ""}：${role}`.trim();
      if (hook) return `镜头亮点：${hook}`;
      return undefined;
    }),
  ]);

  const structureLogic = uniqueNonEmpty(
    scenes.slice(0, 6).map((scene) => {
      const timeRange = cleanText(scene?.time_range);
      const instruction = cleanText(scene?.abstract_logic?.universal_instruction);
      if (!timeRange && !instruction) return undefined;
      return `${timeRange || "镜头"}${instruction ? ` · ${instruction}` : ""}`;
    })
  );

  const fallbackStructure =
    structureLogic.length > 0
      ? structureLogic
      : uniqueNonEmpty([
          segments.intro ? `开场 · ${segments.intro.slice(0, 40)}...` : undefined,
          segments.body ? `演绎 · ${segments.body.slice(0, 40)}...` : undefined,
          segments.conclusion ? `收尾 · ${segments.conclusion.slice(0, 40)}...` : undefined,
        ]);

  const coreViewpoint =
    segments.description ||
    sentences[0] ||
    segments.body ||
    segments.intro ||
    "";

  return {
    segments,
    copyText,
    coreViewpoint,
    viralAngles,
    structureLogic: fallbackStructure,
    goldenSentences,
    painPoints,
  };
}
