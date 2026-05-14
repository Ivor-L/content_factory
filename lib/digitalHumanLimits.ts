const DEFAULT_CPS = 4.870689655172414;
const DEFAULT_LIMIT_SECONDS = 32;
const DEFAULT_SAFETY = 0.92;
const BASE_PADDING_SECONDS = 0.8;
const CHINESE_CHAR_PER_SECOND = DEFAULT_CPS;
const LATIN_WORDS_PER_SECOND = 13;

export const DIGITAL_HUMAN_MAX_SECONDS = DEFAULT_LIMIT_SECONDS;
export const DIGITAL_HUMAN_CPS = DEFAULT_CPS;
export const DIGITAL_HUMAN_SAFETY = DEFAULT_SAFETY;
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
  cps: number;
  needSplit: boolean;
  effectiveCount: number;
}

export interface ScriptDurationOptions {
  cps?: number;
  limitSeconds?: number;
  safety?: number;
  limitCharsOverride?: number;
}

const chineseCharReg = /[\u4e00-\u9fa5]/g;
const latinWordReg = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:'[A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;
const latinLetterReg = /[A-Za-zÀ-ÖØ-öø-ÿ]/g;

export function analyzeScriptDuration(
  text: string,
  options?: ScriptDurationOptions
): ScriptDurationPrecheckResult {
  const normalized = String(text ?? "").trim();
  const cleaned = normalized.replace(/\s+/g, "");
  const chineseCharMatches = cleaned.match(chineseCharReg);
  const chineseCharCount = chineseCharMatches ? chineseCharMatches.length : 0;
  const latinWordMatches = normalized.match(latinWordReg);
  const englishWordCount = latinWordMatches ? latinWordMatches.length : 0;
  const englishLetterCount = latinWordMatches
    ? latinWordMatches.reduce((sum, word) => sum + ((word.match(latinLetterReg) || []).length), 0)
    : 0;
  const rawOtherCharCount = cleaned.length - chineseCharCount - englishLetterCount;
  const otherCharCount = rawOtherCharCount > 0 ? rawOtherCharCount : 0;

  const cps = options?.cps && Number.isFinite(options.cps) ? Number(options.cps) : DEFAULT_CPS;
  const limitSeconds =
    options?.limitSeconds && Number.isFinite(options.limitSeconds)
      ? Number(options.limitSeconds)
      : DEFAULT_LIMIT_SECONDS;
  const safety =
    options?.safety && Number.isFinite(options.safety) ? Number(options.safety) : DEFAULT_SAFETY;
  const safeSeconds = limitSeconds * safety;
  const segmentTargetSeconds = Math.max(1, safeSeconds - BASE_PADDING_SECONDS);
  const defaultLimitChars = Math.floor(cps * segmentTargetSeconds);
  const limitChars =
    options?.limitCharsOverride && Number.isFinite(options.limitCharsOverride)
      ? Number(options.limitCharsOverride)
      : defaultLimitChars;

  const englishSeconds = englishWordCount > 0 ? englishWordCount / LATIN_WORDS_PER_SECOND : 0;
  const chineseSeconds = chineseCharCount > 0 ? chineseCharCount / CHINESE_CHAR_PER_SECOND : 0;
  const otherSeconds = otherCharCount > 0 ? otherCharCount / DEFAULT_CPS : 0;
  const paddingSeconds =
    englishWordCount + chineseCharCount + otherCharCount > 0 ? BASE_PADDING_SECONDS : 0;
  const rawSeconds = englishSeconds + chineseSeconds + otherSeconds + paddingSeconds;
  const normalizedSeconds = rawSeconds > 0 ? Number(rawSeconds.toFixed(3)) : 0;
  const estimatedSeconds = normalizedSeconds > 0 ? Math.ceil(normalizedSeconds) : 0;
  const effectiveCount = normalizedSeconds > 0 ? Math.round(normalizedSeconds * cps) : 0;
  const needSplit = normalizedSeconds > safeSeconds || estimatedSeconds > limitSeconds;

  return {
    cleanedLength: cleaned.length,
    chineseCharCount,
    englishWordCount,
    otherCharCount,
    estimatedSeconds,
    limitSeconds,
    limitChars,
    safety,
    cps,
    needSplit,
    effectiveCount,
  };
}

type LocaleKey = 'zh' | 'zh-cn' | 'zh-tw' | 'en';

export function formatScriptDurationMessage(
  stats: ScriptDurationPrecheckResult,
  options?: { locale?: string }
): string {
  const locale = (options?.locale?.toLowerCase() as LocaleKey | undefined) ?? 'zh';
  const isZh = locale.startsWith('zh');
  const est = stats.estimatedSeconds;
  const limitSec = stats.limitSeconds;
  const limitChars = stats.limitChars;
  const formatter = new Intl.NumberFormat(isZh ? 'zh-CN' : 'en-US');
  const splitSecondsHint = Math.max(1, Math.floor(limitSec * stats.safety));
  const countParts: string[] = [];

  const pushPart = (value: number, labelZh: string, labelEn: string) => {
    if (!value) return;
    const valueText = formatter.format(value);
    countParts.push(`${valueText} ${isZh ? labelZh : labelEn}`);
  };

  pushPart(stats.chineseCharCount, '字', 'Chinese chars');
  pushPart(stats.englishWordCount, '个英文词', 'English words');
  pushPart(stats.otherCharCount, '其他字符', 'other chars');
  if (!countParts.length) {
    const fallback = formatter.format(stats.cleanedLength);
    countParts.push(`${fallback} ${isZh ? '字' : 'chars'}`);
  }
  countParts[0] = `${isZh ? '约 ' : '≈ '}${countParts[0]}`;
  const baseIntro = isZh ? '文案含' : 'Script has';
  const countsDescription = `${baseIntro} ${countParts.join(' + ')}`;

  const englishWordCeiling = Math.max(
    0,
    Math.floor(
      Math.max(limitSec * stats.safety - BASE_PADDING_SECONDS, limitSec * stats.safety * 0.75) *
        LATIN_WORDS_PER_SECOND
    )
  );
  const englishLimitHintZh = englishWordCeiling
    ? `（≈${formatter.format(englishWordCeiling)} 个英文词）`
    : '';
  const englishLimitHintEn = englishWordCeiling
    ? `, ~${formatter.format(englishWordCeiling)} English words`
    : '';

  if (isZh) {
    if (stats.needSplit) {
      return `${countsDescription}，预计约 ${est}s（模型硬上限 ${limitSec}s，安全目标 ≤ ${splitSecondsHint}s）。建议拆分：每段约 ${formatter.format(limitChars)} 个中文字符${englishLimitHintZh}，避免末尾文字被截断。`;
    }
    return `${countsDescription}，预计约 ${est}s（安全目标 ≤ ${splitSecondsHint}s，模型硬上限 ${limitSec}s），可直接生成。`;
  }

  if (stats.needSplit) {
    return `${countsDescription} (~${est}s, hard limit ${limitSec}s, safe target ≤ ${splitSecondsHint}s). Split into chunks of ~${formatter.format(limitChars)} zh-char eq${englishLimitHintEn} to avoid clipped endings.`;
  }

  return `${countsDescription} (~${est}s, safe target ≤ ${splitSecondsHint}s, hard limit ${limitSec}s). Ready to render.`;
}
