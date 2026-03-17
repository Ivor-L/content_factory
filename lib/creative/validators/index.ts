import type { CreativeStageKey } from "@/lib/creativeStages";
import type {
  Stage00Result,
  Stage01Result,
  Stage02Result,
  Stage03Result,
  Stage04Result,
  StageResult,
} from "@/types/creativeRuntime";

export type ValidationStatus = "pass" | "fix" | "retry" | "degrade";

export interface StageValidationOutcome<TStage extends CreativeStageKey = CreativeStageKey> {
  status: ValidationStatus;
  message?: string;
  patchedResult?: StageResult & { stage: TStage };
}

export interface StageValidationContext {
  stage: CreativeStageKey;
  frameworkSections?: Array<{ functionCue?: string }>;
  closingCTA?: string;
  expectedSectionCount?: number;
  userMaterialsCount: number;
  userMaterials?: Array<{ title?: string | null; summary?: string | null }>;
  runtimeTemplates?: string[];
  taskOverview?: {
    goal?: Record<string, any> | null;
  } | null;
}

export function validateStageResult(
  stage: CreativeStageKey,
  result: StageResult,
  context: StageValidationContext,
): StageValidationOutcome {
  switch (stage) {
    case "diagnosis":
      return validateStage00(result as Stage00Result, context);
    case "mining":
      return validateStage01(result as Stage01Result);
    case "topic":
      return validateStage02(result as Stage02Result);
    case "framework":
      return validateStage03(result as Stage03Result, context);
    case "draft":
      return validateStage04(result as Stage04Result, context);
    default:
      return { status: "pass" };
  }
}

function validateStage00(
  result: Stage00Result,
  context: StageValidationContext,
): StageValidationOutcome<"diagnosis"> {
  const { clarity, keyQuestions, nextActions, summary } = result.aiOutput;
  if (clarity !== "clear" && clarity !== "fuzzy") {
    return { status: "retry", message: "clarity 字段非法" };
  }
  if (!summary?.trim()) {
    return { status: "retry", message: "summary 缺失" };
  }
  if (clarity === "fuzzy" && keyQuestions.filter(Boolean).length < 2) {
    return { status: "retry", message: "缺少关键追问" };
  }
  if (nextActions.length === 0) {
    return { status: "retry", message: "缺少下一步" };
  }
  const bannedPhrases = ["明确目标受众", "收集用户材料", "考虑使用案例"];
  const hasBanned = nextActions.some((action) => bannedPhrases.some((phrase) => action.includes(phrase)));
  if (hasBanned) {
    return { status: "retry", message: "nextActions 出现泛化建议，请引用用户上下文" };
  }
  const needsNumbering = nextActions.some((action) => !/^\d+/.test(action));
  if (needsNumbering) {
    const patched = {
      ...result,
      aiOutput: {
        ...result.aiOutput,
        nextActions: nextActions.map((action, idx) => `${idx + 1}. ${action}`),
      },
    };
    return { status: "fix", patchedResult: patched, message: "补全 nextActions 编号" };
  }

  const supplementedFields = extractSupplementedFields(context.taskOverview?.goal);
  if (supplementedFields.size > 0 && Array.isArray(keyQuestions) && keyQuestions.length > 0) {
    const repeated = detectRepeatedMissingFields(keyQuestions, supplementedFields);
    if (repeated.length > 0) {
      return {
        status: "retry",
        message: `keyQuestions 包含已补充字段: ${repeated.join(", ")}`,
      };
    }
  }
  return { status: "pass" };
}

function extractSupplementedFields(
  goal: Record<string, any> | null | undefined,
): Map<string, string> {
  const fields = new Map<string, string>();
  if (!goal || typeof goal !== "object") {
    return fields;
  }
  const entries: Array<[string, string[]]> = [
    ["audience", ["audience", "targetAudience", "target_audience", "受众", "目标人群"]],
    ["coreIdea", ["coreIdea", "核心观点", "核心主张", "核心idea"]],
    ["example", ["example", "案例", "示例", "例子"]],
  ];
  for (const [field, aliases] of entries) {
    for (const alias of aliases) {
      const value = readUserGoalValue(goal as Record<string, any>, alias);
      if (value) {
        fields.set(field, value);
        break;
      }
    }
  }
  return fields;
}

function readUserGoalValue(goal: Record<string, any>, key: string): string {
  if (!Object.prototype.hasOwnProperty.call(goal, key)) {
    return "";
  }
  const raw = goal[key];
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, any>;
    const possibleSource =
      record.source ??
      record.origin ??
      record.by ??
      record.updatedBy ??
      record.meta?.source;
    if ("value" in record) {
      const normalized = normalizeGoalValue(record.value);
      if (!normalized || !isUserContributedSource(possibleSource)) {
        return "";
      }
      return normalized;
    }
    if ("text" in record) {
      const normalized = normalizeGoalValue(record.text);
      if (!normalized || !isUserContributedSource(possibleSource)) {
        return "";
      }
      return normalized;
    }
    if (possibleSource && !isUserContributedSource(possibleSource)) {
      return "";
    }
  }
  return normalizeGoalValue(raw);
}

function normalizeGoalValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeGoalValue(item))
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value).trim();
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function isUserContributedSource(source: unknown): boolean {
  if (!source) return true;
  const normalized = String(source).trim().toLowerCase();
  if (!normalized) return true;
  const accepted = new Set(["user", "manual", "editor", "customer", "author"]);
  return accepted.has(normalized);
}

function detectRepeatedMissingFields(
  keyQuestions: string[],
  supplemented: Map<string, string>,
): string[] {
  const keywords: Record<string, RegExp[]> = {
    audience: [/受众/, /人群/, /audience/i, /目标用户/, /目标人群/],
    coreIdea: [/核心观点/, /核心主张/, /主张/, /idea/i, /核心想法/],
    example: [/案例/, /示例/, /例子/, /example/i, /story/i],
  };
  const repeated: string[] = [];
  for (const [field, patterns] of Object.entries(keywords)) {
    if (!supplemented.has(field)) continue;
    const matched = keyQuestions.some((question) =>
      patterns.some((pattern) => pattern.test(question)),
    );
    if (matched) {
      repeated.push(field);
    }
  }
  return repeated;
}

function validateStage01(result: Stage01Result): StageValidationOutcome<"mining"> {
  const { insights } = result.aiOutput;
  if (insights.length < 2) {
    return { status: "retry", message: "至少需要 2 条洞察" };
  }
  const missingStage = insights.filter((item) => !item.recommendedStage);
  if (missingStage.length > 0) {
    const patched = {
      ...result,
      aiOutput: {
        ...result.aiOutput,
        insights: insights.map((item) => ({
          ...item,
          recommendedStage: item.recommendedStage ?? "body",
        })),
      },
    };
    return { status: "fix", patchedResult: patched, message: "自动补 recommendedStage" };
  }
  return { status: "pass" };
}

function validateStage02(result: Stage02Result): StageValidationOutcome<"topic"> {
  const { heroSentence, angles, titles, proofPoints } = result.aiOutput;
  if (heroSentence.length > 20) {
    return { status: "retry", message: "灵魂句过长" };
  }
  if (angles.length < 2) {
    return { status: "retry", message: "需要至少 2 个角度" };
  }
  if (titles.length < 2) {
    return { status: "retry", message: "需要至少 2 个标题备选" };
  }
  if (proofPoints.length === 0) {
    return { status: "retry", message: "缺少 proofPoints" };
  }
  return { status: "pass" };
}

function validateStage03(
  result: Stage03Result,
  context: StageValidationContext,
): StageValidationOutcome<"framework"> {
  const { sections, closingCTA } = result.aiOutput;
  if (sections.length < 3) {
    return { status: "retry", message: "段落数量不足" };
  }
  if (!closingCTA?.trim()) {
    return { status: "retry", message: "缺少 CTA" };
  }
  const missingEvidence = sections.some((section) => section.evidence.length === 0);
  if (missingEvidence) {
    return { status: "retry", message: "每段必须指定证据" };
  }
  return { status: "pass" };
}

function validateStage04(
  result: Stage04Result,
  context: StageValidationContext,
): StageValidationOutcome<"draft"> {
  const text = result.aiOutput.trim();
  if (!text) {
    return { status: "retry", message: "正文为空" };
  }
  const markdownPattern = /(^|\n)\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>)/;
  if (markdownPattern.test(text)) {
    return { status: "retry", message: "正文包含 Markdown" };
  }
  if (/[^\x00-\x7F]/.test(text) === false) {
    return { status: "retry", message: "正文必须为中文" };
  }
  if (hasHeadingLikeLine(text)) {
    return { status: "retry", message: "检测到标题或结构标签，请输出纯口播正文" };
  }
  if (isArticleTone(text)) {
    return { status: "retry", message: "口播稿仍呈现文章体，请改成口语对话" };
  }
  const leakedCue = detectLeakedFunctionCue(text, context.frameworkSections ?? []);
  if (leakedCue) {
    return { status: "retry", message: `请勿在正文中打印内部提示「${leakedCue}」` };
  }
  if (shouldUseUserCase(context) && !referencesUserMaterial(text, context.userMaterials ?? [])) {
    return { status: "retry", message: "需优先讲述用户提供的真实案例" };
  }
  const reusedTemplate = detectTemplateReuse(text, context.runtimeTemplates ?? []);
  if (reusedTemplate) {
    return { status: "retry", message: "检测到历史模板句被直接复用，请改写句式" };
  }
  if (context.closingCTA && !hasCtaIntent(text, context.closingCTA)) {
    return {
      status: "fix",
      message: "CTA 未覆盖口语化意图，已追加提示",
      patchedResult: appendCta(result, context.closingCTA),
    };
  }
  return { status: "pass" };
}

function appendCta(result: Stage04Result, cta: string): Stage04Result {
  const normalizedBody = result.aiOutput.trim();
  const punctuatedBody = ensureSentenceEnding(normalizedBody);
  const spokenCta = buildSpokenCta(cta);
  const spacer = /\s$/.test(punctuatedBody) ? "" : " ";
  const patchedText = `${punctuatedBody}${spacer}${spokenCta}`.trim();
  return { ...result, aiOutput: patchedText, rawText: patchedText };
}

function hasHeadingLikeLine(text: string) {
  return text.split(/\n+/).some((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^第[一二三四五六七八九十百千万零]+(章|节|段|部分|篇)/.test(trimmed)) return true;
    if (/^(前言|导语|概念介绍|背景说明|成功案例分享|总结|小结|结语)(：|:)?$/.test(trimmed)) return true;
    if (/^(?:\d+\.|[一二三四五六七八九十]+、|[（(]\d+[)）])/.test(trimmed) && trimmed.length <= 12) return true;
    if ((trimmed.endsWith("：") || trimmed.endsWith(":")) && trimmed.length <= 12) return true;
    return false;
  });
}

function isArticleTone(text: string) {
  const keywords = ["本文", "本篇", "文章", "段落", "章节", "目录", "综上", "以上内容", "接下来从", "以下几点"];
  return keywords.some((kw) => text.includes(kw));
}

function detectLeakedFunctionCue(text: string, sections: Array<{ functionCue?: string }> = []) {
  const haystack = stripWhitespace(text);
  for (const section of sections) {
    const cue = section?.functionCue?.trim();
    if (!cue) continue;
    const normalizedCue = stripWhitespace(cue);
    if (normalizedCue.length < 4) continue;
    if (haystack.includes(normalizedCue)) {
      return cue;
    }
  }
  return null;
}

function shouldUseUserCase(context: StageValidationContext) {
  return (context.userMaterialsCount ?? 0) > 0 && (context.userMaterials?.length ?? 0) > 0;
}

function referencesUserMaterial(text: string, materials: Array<{ title?: string | null; summary?: string | null }>) {
  const groups = extractMaterialSignalGroups(materials);
  if (groups.length === 0) {
    return true;
  }
  const haystack = stripWhitespace(text).toLowerCase();
  return groups.some((group) => {
    let hits = 0;
    const threshold = group.length >= 3 ? 2 : 1;
    for (const signal of group) {
      const normalizedSignal = stripWhitespace(signal).toLowerCase();
      if (normalizedSignal && haystack.includes(normalizedSignal)) {
        hits += 1;
        if (hits >= threshold) {
          return true;
        }
      }
    }
    return false;
  });
}

function detectTemplateReuse(text: string, templates: string[]) {
  if (!templates || templates.length === 0) return null;
  const haystack = stripWhitespace(text);
  for (const template of templates) {
    if (!template) continue;
    const normalized = stripWhitespace(template);
    if (normalized.length < 6) continue;
    if (haystack.includes(normalized)) {
      return template;
    }
  }
  return null;
}

function stripWhitespace(value: string) {
  return value.replace(/\s+/g, "");
}

function hasCtaIntent(text: string, cta: string) {
  const normalizedText = stripWhitespace(text);
  const verbs = [
    "评论",
    "留言",
    "关注",
    "点赞",
    "收藏",
    "转发",
    "分享",
    "下单",
    "购买",
    "报名",
    "预约",
    "咨询",
    "私信",
    "告诉我",
    "回复",
    "输入",
    "点个赞",
    "点个",
    "加我",
  ];
  const hasVerb = verbs.some((verb) => normalizedText.includes(stripWhitespace(verb)));
  if (!hasVerb) {
    return false;
  }
  const signals = extractCtaSignals(cta);
  if (signals.length === 0) {
    return true;
  }
  return signals.some((signal) => normalizedText.includes(stripWhitespace(signal)));
}

function extractCtaSignals(cta: string) {
  if (!cta) return [];
  const cleaned = cta.replace(/[“”"『』【】\[\]()（）]/g, " ");
  const parts = cleaned.split(/[\s,，。\.!?！？：:、]/).map((part) => part.trim()).filter(Boolean);
  return parts
    .filter((part) => part.length >= 2)
    .map((part) => part.toLowerCase());
}

function buildSpokenCta(cta: string) {
  const trimmed = cta.trim();
  if (!trimmed) {
    return "最后，记得告诉我你的想法。";
  }
  if (/^(最后|记得|别忘了|欢迎|快来)/.test(trimmed)) {
    return trimmed;
  }
  return `最后，${trimmed}`;
}

function extractMaterialSignalGroups(materials: Array<{ title?: string | null; summary?: string | null }>) {
  const groups: string[][] = [];
  for (const material of materials) {
    const source = [material.title ?? "", material.summary ?? ""].join(" ").trim();
    if (!source) continue;
    const tokens = new Set<string>();
    const chinesePhrases = source.match(/[\u4e00-\u9fa5]{2,4}/g) ?? [];
    chinesePhrases.forEach((phrase) => tokens.add(phrase));
    const numbers = source.match(/\d+\.?\d*/g) ?? [];
    numbers.forEach((num) => tokens.add(num));
    const alpha = source.match(/[A-Za-z]{3,}/g) ?? [];
    alpha.forEach((word) => tokens.add(word.toLowerCase()));
    const cues = Array.from(tokens)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .slice(0, 5);
    if (cues.length > 0) {
      groups.push(cues);
    }
  }
  return groups;
}

function ensureSentenceEnding(text: string) {
  const trimmed = text.trimEnd();
  if (!trimmed) {
    return "";
  }
  if (/[。?!！？…\.]$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}。`;
}
