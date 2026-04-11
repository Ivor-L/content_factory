import {
  analyzeScriptDuration,
  type ScriptDurationPrecheckResult,
} from '@/lib/digitalHumanLimits';

const PRIMARY_BREAK_CHARS = new Set<string>([
  '。',
  '！',
  '!',
  '？',
  '?',
  '；',
  ';',
  '，',
  ',',
  '、',
  '：',
  ':',
  '.',
  '\n',
]);

const SECONDARY_BREAK_CHARS = new Set<string>([' ', '\t']);

export interface DigitalHumanScriptPlan {
  normalizedScript: string;
  chunks: string[];
  stats: ScriptDurationPrecheckResult;
  isSplit: boolean;
}

function findBreakPoint(chunk: string): number {
  for (const charset of [PRIMARY_BREAK_CHARS, SECONDARY_BREAK_CHARS]) {
    for (let i = chunk.length - 1; i >= 0; i -= 1) {
      if (charset.has(chunk[i])) {
        return i + 1;
      }
    }
  }
  return -1;
}

export function splitScriptIntoChunks(script: string, maxChars: number): string[] {
  const safeLimit = Math.max(1, Math.floor(maxChars));
  const normalized = String(script ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const remaining = normalized.length - cursor;
    if (remaining <= safeLimit) {
      const tail = normalized.slice(cursor).trim();
      if (tail) chunks.push(tail);
      break;
    }

    const tentativeEnd = cursor + safeLimit;
    const slice = normalized.slice(cursor, tentativeEnd);
    let breakPoint = findBreakPoint(slice);
    if (breakPoint <= 0) breakPoint = safeLimit;

    const segment = normalized.slice(cursor, cursor + breakPoint).trim();
    if (segment) chunks.push(segment);
    cursor += breakPoint;
  }

  return chunks;
}

export function planDigitalHumanScript(
  script: string,
  options?: {
    limitCharsOverride?: number;
    forceSingleChunk?: boolean;
  }
): DigitalHumanScriptPlan {
  const normalizedScript = String(script ?? '').trim();
  const stats = analyzeScriptDuration(
    normalizedScript,
    options?.limitCharsOverride != null
      ? { limitCharsOverride: options.limitCharsOverride }
      : undefined
  );

  const chunks =
    !normalizedScript
      ? []
      : options?.forceSingleChunk
        ? [normalizedScript]
        : stats.needSplit
          ? splitScriptIntoChunks(normalizedScript, stats.limitChars)
          : [normalizedScript];

  return {
    normalizedScript,
    chunks: chunks.filter((chunk) => chunk.trim().length > 0),
    stats,
    isSplit: chunks.length > 1,
  };
}
