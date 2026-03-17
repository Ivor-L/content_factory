import { Language } from "@/lib/i18n";

export type StyleLike = {
  name?: string | null;
  metadata?: unknown;
};

type StyleNameMap = Record<string, Partial<Record<Language, string>>>;

const systemStyleNameMap: StyleNameMap = {
  cute: {
    en: "Cute Visual",
    zh: "甜美视觉",
    "zh-TW": "甜美視覺",
  },
  fresh: {
    en: "Fresh Visual",
    zh: "清新视觉",
    "zh-TW": "清新視覺",
  },
  tech: {
    en: "Tech Visual",
    zh: "科技视觉",
    "zh-TW": "科技視覺",
  },
  warm: {
    en: "Warm Visual",
    zh: "暖调视觉",
    "zh-TW": "暖調視覺",
  },
  bold: {
    en: "Bold Visual",
    zh: "醒目视觉",
    "zh-TW": "醒目視覺",
  },
  minimal: {
    en: "Minimal Visual",
    zh: "极简视觉",
    "zh-TW": "極簡視覺",
  },
  retro: {
    en: "Retro Visual",
    zh: "复古视觉",
    "zh-TW": "復古視覺",
  },
  pop: {
    en: "Pop Visual",
    zh: "波普视觉",
    "zh-TW": "波普視覺",
  },
  notion: {
    en: "Notion Visual",
    zh: "Notion 看板视觉",
    "zh-TW": "Notion 看板視覺",
  },
  productivity: {
    en: "Productivity Visual",
    zh: "效率视觉",
    "zh-TW": "效率視覺",
  },
  insight: {
    en: "Insight Visual",
    zh: "洞察视觉",
    "zh-TW": "洞察視覺",
  },
  sparse: {
    en: "Sparse Layout",
    zh: "留白布局",
    "zh-TW": "留白佈局",
  },
  balanced: {
    en: "Balanced Layout",
    zh: "平衡布局",
    "zh-TW": "平衡佈局",
  },
  dense: {
    en: "Dense Layout",
    zh: "密集布局",
    "zh-TW": "密集佈局",
  },
  list: {
    en: "List Layout",
    zh: "列表布局",
    "zh-TW": "列表佈局",
  },
  comparison: {
    en: "Comparison Layout",
    zh: "对比布局",
    "zh-TW": "對比佈局",
  },
  flow: {
    en: "Flow Layout",
    zh: "流程布局",
    "zh-TW": "流程佈局",
  },
};

const isPlainObject = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function getLocalizedStyleName(
  style: StyleLike | null | undefined,
  language: Language
): string {
  if (!style) return "";
  const rawName = typeof style.name === "string" ? style.name : "";
  const metadata = isPlainObject(style.metadata) ? style.metadata : undefined;
  const slug = typeof metadata?.slug === "string" ? metadata.slug : undefined;
  const fallback = rawName || slug || "";

  if (!slug) {
    return fallback;
  }

  const translations = systemStyleNameMap[slug];
  if (!translations) {
    return fallback;
  }

  return (
    translations[language] ??
    translations.zh ??
    translations.en ??
    fallback
  );
}

export { systemStyleNameMap };
