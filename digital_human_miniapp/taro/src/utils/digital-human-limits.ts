const DEFAULT_CPS = 4.870689655172414;
const DEFAULT_LIMIT_SECONDS = 32;
const DEFAULT_SAFETY = 0.92;
const BASE_PADDING_SECONDS = 0.8;
const LATIN_WORDS_PER_SECOND = 13;

export const DIGITAL_HUMAN_MAX_SECONDS = DEFAULT_LIMIT_SECONDS;
export const DIGITAL_HUMAN_SAFE_SECONDS = Math.floor(DEFAULT_LIMIT_SECONDS * DEFAULT_SAFETY);

export interface ScriptDurationPrecheckResult {
  cleanedLength: number;
  chineseCharCount: number;
  englishWordCount: number;
  otherCharCount: number;
  estimatedSeconds: number;
  limitSeconds: number;
  limitChars: number;
  safety: number;
  needSplit: boolean;
}

const chineseCharReg = /[\u4e00-\u9fa5]/g;
const latinWordReg = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:'[A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;
const latinLetterReg = /[A-Za-zÀ-ÖØ-öø-ÿ]/g;

export function analyzeScriptDuration(text: string): ScriptDurationPrecheckResult {
  const normalized = String(text || '').trim();
  const cleaned = normalized.replace(/\s+/g, '');
  const chineseCharMatches = cleaned.match(chineseCharReg);
  const chineseCharCount = chineseCharMatches ? chineseCharMatches.length : 0;
  const latinWordMatches = normalized.match(latinWordReg);
  const englishWordCount = latinWordMatches ? latinWordMatches.length : 0;
  const englishLetterCount = latinWordMatches
    ? latinWordMatches.reduce((sum, word) => sum + ((word.match(latinLetterReg) || []).length), 0)
    : 0;
  const rawOtherCharCount = cleaned.length - chineseCharCount - englishLetterCount;
  const otherCharCount = rawOtherCharCount > 0 ? rawOtherCharCount : 0;
  const safeSeconds = DEFAULT_LIMIT_SECONDS * DEFAULT_SAFETY;
  const segmentTargetSeconds = Math.max(1, safeSeconds - BASE_PADDING_SECONDS);
  const limitChars = Math.floor(DEFAULT_CPS * segmentTargetSeconds);
  const englishSeconds = englishWordCount > 0 ? englishWordCount / LATIN_WORDS_PER_SECOND : 0;
  const chineseSeconds = chineseCharCount > 0 ? chineseCharCount / DEFAULT_CPS : 0;
  const otherSeconds = otherCharCount > 0 ? otherCharCount / DEFAULT_CPS : 0;
  const paddingSeconds =
    englishWordCount + chineseCharCount + otherCharCount > 0 ? BASE_PADDING_SECONDS : 0;
  const rawSeconds = englishSeconds + chineseSeconds + otherSeconds + paddingSeconds;
  const estimatedSeconds = rawSeconds > 0 ? Math.ceil(Number(rawSeconds.toFixed(3))) : 0;
  const needSplit = rawSeconds > safeSeconds || estimatedSeconds > DEFAULT_LIMIT_SECONDS;

  return {
    cleanedLength: cleaned.length,
    chineseCharCount,
    englishWordCount,
    otherCharCount,
    estimatedSeconds,
    limitSeconds: DEFAULT_LIMIT_SECONDS,
    limitChars,
    safety: DEFAULT_SAFETY,
    needSplit,
  };
}

export function formatScriptDurationMessage(stats: ScriptDurationPrecheckResult): string {
  const formatNumber = (value: number) => String(Math.round(value));
  const splitSecondsHint = Math.max(1, Math.floor(stats.limitSeconds * stats.safety));
  const countParts: string[] = [];

  if (stats.chineseCharCount) countParts.push(`${formatNumber(stats.chineseCharCount)} 字`);
  if (stats.englishWordCount) countParts.push(`${formatNumber(stats.englishWordCount)} 个英文词`);
  if (stats.otherCharCount) countParts.push(`${formatNumber(stats.otherCharCount)} 其他字符`);
  if (!countParts.length) countParts.push(`${formatNumber(stats.cleanedLength)} 字`);

  countParts[0] = `约 ${countParts[0]}`;
  if (stats.needSplit) {
    return `文案含 ${countParts.join(' + ')}，预计约 ${stats.estimatedSeconds}s。模型硬上限 ${stats.limitSeconds}s，提交后会自动拆成安全目标约 ${splitSecondsHint}s 内的任务，避免末尾文字被截断。`;
  }

  return `文案含 ${countParts.join(' + ')}，预计约 ${stats.estimatedSeconds}s，安全目标 ${splitSecondsHint}s 内，可直接生成。`;
}
