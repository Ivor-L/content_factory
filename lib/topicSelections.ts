import type {
  TopicSelectionAngle,
  TopicSelectionItem,
  TopicUserSelections,
} from "@/types/creative";

const DEFAULT_TITLE_MODE = "single" as const;

type TitleSelectionMode = "single" | "all";

export function buildTopicItemKey(prefix: string, index: number, text: string) {
  const safe = (text ?? "").replace(/\s+/g, " ").trim().slice(0, 32);
  return `${prefix}-${index}-${safe || "item"}`;
}

export function normalizeTopicSelectionKey(
  item?: TopicSelectionAngle | TopicSelectionItem | null
): string {
  if (!item) return "";
  if ("key" in item && item.key) return item.key;
  if ("value" in item && item.value) return item.value;
  const angle = item as TopicSelectionAngle;
  if (angle?.name || angle?.hook) {
    return `${angle?.name ?? ""}-${angle?.hook ?? ""}`;
  }
  return "";
}

export function cleanTopicSelections(input: TopicUserSelections | null): TopicUserSelections | null {
  if (!input) return null;
  const next: TopicUserSelections = { ...input };
  if (!next.coreTopic) delete next.coreTopic;
  if (!next.promise) delete next.promise;
  if (!next.heroSentence) delete next.heroSentence;

  if (Array.isArray(next.angles) && next.angles.length > 0) {
    next.angles = next.angles
      .map((angle, idx) => ({
        ...angle,
        key: angle?.key ?? buildTopicItemKey("angle", idx, angle?.name || angle?.hook || ""),
      }))
      .filter((angle) => normalizeTopicSelectionKey(angle));
    if (next.angles.length === 0) {
      delete next.angles;
    }
  } else {
    delete next.angles;
  }

  if (Array.isArray(next.titles) && next.titles.length > 0) {
    next.titles = next.titles.filter((item) => normalizeTopicSelectionKey(item));
    if (next.titles.length === 0) {
      delete next.titles;
    }
  } else {
    delete next.titles;
  }

  if (Array.isArray(next.outline) && next.outline.length > 0) {
    next.outline = next.outline.filter((item) => normalizeTopicSelectionKey(item));
    if (next.outline.length === 0) {
      delete next.outline;
    }
  } else {
    delete next.outline;
  }

  const hasValues =
    next.coreTopic ||
    next.promise ||
    next.heroSentence ||
    (next.angles && next.angles.length > 0) ||
    (next.titles && next.titles.length > 0) ||
    (next.outline && next.outline.length > 0);

  return hasValues ? next : null;
}

function normalizeAnglesFromOutput(data: any) {
  if (!Array.isArray(data?.angles)) return [] as TopicSelectionAngle[];
  return data.angles
    .filter((item: unknown) => item && typeof item === "object")
    .map((angle: TopicSelectionAngle, idx: number) => ({
      key: angle?.key ?? buildTopicItemKey("angle", idx, angle?.name || angle?.hook || ""),
      name: typeof angle?.name === "string" ? angle.name : undefined,
      hook: typeof angle?.hook === "string" ? angle.hook : undefined,
      audience: typeof angle?.audience === "string" ? angle.audience : undefined,
      proofPoint: typeof angle?.proofPoint === "string" ? angle.proofPoint : undefined,
    }));
}

function normalizeStringList(
  list: unknown,
  prefix: string
): TopicSelectionItem[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item: unknown) => typeof item === "string" && item.trim().length > 0)
    .map((value: string, idx: number) => ({
      key: buildTopicItemKey(prefix, idx, value),
      value,
    }));
}

export function deriveDefaultTopicSelections(
  data: any,
  options?: { titleMode?: TitleSelectionMode }
): TopicUserSelections | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const next: TopicUserSelections = {};
  if (typeof data.coreTopic === "string" && data.coreTopic.trim()) {
    next.coreTopic = data.coreTopic.trim();
  }
  if (typeof data.promise === "string" && data.promise.trim()) {
    next.promise = data.promise.trim();
  }
  if (typeof data.heroSentence === "string" && data.heroSentence.trim()) {
    next.heroSentence = data.heroSentence.trim();
  }

  const angles = normalizeAnglesFromOutput(data);
  if (angles.length > 0) {
    next.angles = angles;
  }

  const titles = normalizeStringList(data.titles, "title");
  if (titles.length > 0) {
    const mode = options?.titleMode ?? DEFAULT_TITLE_MODE;
    next.titles = mode === "all" ? titles : [titles[0]];
  }

  const outline = normalizeStringList(data.outlineBullets, "outline");
  if (outline.length > 0) {
    next.outline = outline;
  }

  return cleanTopicSelections(next);
}

