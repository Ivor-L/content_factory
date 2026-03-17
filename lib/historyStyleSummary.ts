import type { Prisma } from "@prisma/client";

type JsonValue = Prisma.JsonValue;

export interface HistoryDocStyleSource {
  id?: string;
  title?: string | null;
  metadata?: JsonValue | null;
}

export interface HistoryStyleSummary {
  hookHighlights: string[];
  openingFormulas: string[];
  transitionMoves: string[];
  closingSignatures: string[];
  proofAngles: string[];
}

type FrequencyEntry = {
  text: string;
  count: number;
  sources: Set<string>;
};

function toRecord(value: JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, any>;
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function recordFrequency(
  map: Map<string, FrequencyEntry>,
  value: unknown,
  source: string
) {
  const text = normalizeText(value);
  if (!text) return;
  const existing = map.get(text);
  if (existing) {
    existing.count += 1;
    existing.sources.add(source);
    return;
  }
  map.set(text, {
    text,
    count: 1,
    sources: new Set([source]),
  });
}

function pickTopTexts(
  map: Map<string, FrequencyEntry>,
  limit: number
): string[] {
  if (map.size === 0) return [];
  return Array.from(map.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.text.localeCompare(b.text, "zh");
    })
    .slice(0, limit)
    .map((entry) => {
      const countLabel =
        entry.sources.size > 1 ? `（${entry.sources.size} 篇）` : "";
      return `${entry.text}${countLabel}`;
    });
}

function formatPattern(
  pattern: Record<string, any> | null | undefined,
  fallbackLabel: string
) {
  if (!pattern || typeof pattern !== "object") return "";
  const label = normalizeText(pattern.label) || fallbackLabel;
  const example =
    normalizeText(pattern.example) || normalizeText(pattern.usage);
  if (example) {
    return `${label}｜${example}`;
  }
  return label;
}

export function summarizeHistoryStyles(
  historyDocs: HistoryDocStyleSource[],
  limit = 4
): HistoryStyleSummary | null {
  if (!historyDocs || historyDocs.length === 0) return null;

  const hookMap = new Map<string, FrequencyEntry>();
  const transitionMap = new Map<string, FrequencyEntry>();
  const closingMap = new Map<string, FrequencyEntry>();
  const proofMap = new Map<string, FrequencyEntry>();
  const openingMap = new Map<string, FrequencyEntry>();

  historyDocs.forEach((doc) => {
    const meta = toRecord(doc.metadata);
    const reusable = toRecord(meta.reusableBlocks);
    const sourceLabel = normalizeText(doc.title) || "未命名稿件";

    if (Array.isArray(reusable.hooks)) {
      reusable.hooks.forEach((hook: unknown) =>
        recordFrequency(hookMap, hook, sourceLabel)
      );
    }

    if (Array.isArray(reusable.transitions)) {
      reusable.transitions.forEach((item: unknown) =>
        recordFrequency(transitionMap, item, sourceLabel)
      );
    }

    if (Array.isArray(reusable.closers)) {
      reusable.closers.forEach((item: unknown) =>
        recordFrequency(closingMap, item, sourceLabel)
      );
    }

    if (Array.isArray(reusable.proofPoints)) {
      reusable.proofPoints.forEach((item: unknown) =>
        recordFrequency(proofMap, item, sourceLabel)
      );
    }

    if (Array.isArray(meta.openingPatterns)) {
      meta.openingPatterns.forEach((pattern: any, idx: number) => {
        const text = formatPattern(pattern, `开场${idx + 1}`);
        if (text) {
          recordFrequency(openingMap, text, sourceLabel);
        }
      });
    }

    if (Array.isArray(meta.transitionPlaybook)) {
      meta.transitionPlaybook.forEach((pattern: any, idx: number) => {
        const text = formatPattern(pattern, `转折${idx + 1}`);
        if (text) {
          recordFrequency(transitionMap, text, sourceLabel);
        }
      });
    }
  });

  const summary: HistoryStyleSummary = {
    hookHighlights: pickTopTexts(hookMap, limit),
    openingFormulas: pickTopTexts(openingMap, limit),
    transitionMoves: pickTopTexts(transitionMap, limit),
    closingSignatures: pickTopTexts(closingMap, limit),
    proofAngles: pickTopTexts(proofMap, limit),
  };

  const hasContent = Object.values(summary).some(
    (arr) => Array.isArray(arr) && arr.length > 0
  );
  return hasContent ? summary : null;
}
