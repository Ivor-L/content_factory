import { creativeStageOrder, getStageConfig, type CreativeStageKey } from "@/lib/creativeStages";
import { loadTaskWithAssets, parseMetadata, flattenAssets } from "@/lib/creativeTaskService";
import { WRITING_ASSISTANT_FRAMEWORK_GUIDE } from "@/lib/skillGuides";
import { summarizeHistoryStyles } from "@/lib/historyStyleSummary";
import type {
  CreativeTaskMetadata,
  StageMetaEntry,
  TopicUserSelections,
} from "@/types/creative";

const CONTEXT_STAGE_OUTPUT_LIMIT = 3200;
const STAGE_CONTEXT_SNIPPET_LIMITS: Partial<Record<CreativeStageKey, number>> = {
  diagnosis: 420,
  mining: 720,
  topic: 720,
  framework: 1200,
  draft: 1600,
};
const DEFAULT_CONTEXT_SNIPPET_LIMIT = 520;

function stageContextSliceLimit(stage: CreativeStageKey) {
  return STAGE_CONTEXT_SNIPPET_LIMITS[stage] ?? DEFAULT_CONTEXT_SNIPPET_LIMIT;
}

function stageLabel(stage: CreativeStageKey) {
  switch (stage) {
    case "diagnosis":
      return "诊断";
    case "mining":
      return "思维挖掘";
    case "topic":
      return "选题";
    case "framework":
      return "框架";
    case "draft":
      return "内容产出";
    default:
      return stage;
  }
}

function clampText(text: string, limit: number) {
  if (!text) return "";
  if (text.length <= limit) return text;
  if (limit <= 3) return text.slice(0, limit);
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function formatAiOutputForContext(output: any): string {
  if (!output) return "";
  if (typeof output === "string") return output.trim();
  if (typeof output === "number" || typeof output === "boolean") {
    return String(output);
  }
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function summarizePreviousStages(metadata: CreativeTaskMetadata, stage: CreativeStageKey) {
  const entries: string[] = [];
  const orderIndex = creativeStageOrder.indexOf(stage);
  if (orderIndex <= 0) return entries;
  const stages: Partial<Record<CreativeStageKey, StageMetaEntry>> =
    metadata.stages ?? {};
  let remainingBudget = CONTEXT_STAGE_OUTPUT_LIMIT;
  for (let i = 0; i < orderIndex; i += 1) {
    if (remainingBudget <= 120) break;
    const key = creativeStageOrder[i];
    const record = stages[key];
    if (!record || !record.aiOutput) continue;
    const label = stageLabel(key);
    const formatted = formatAiOutputForContext(record.aiOutput);
    if (!formatted) continue;
    const allowed = Math.min(remainingBudget, stageContextSliceLimit(key));
    const snippet = clampText(formatted, allowed);
    if (!snippet) continue;
    entries.push(`${label}: ${snippet}`);
    remainingBudget -= snippet.length;
  }
  return entries;
}

function collectStageNotes(metadata: CreativeTaskMetadata, stage: CreativeStageKey) {
  const notes: string[] = [];
  const orderIndex = creativeStageOrder.indexOf(stage);
  if (orderIndex <= 0) return notes;
  const stages: Partial<Record<CreativeStageKey, StageMetaEntry>> =
    metadata.stages ?? {};
  for (let i = 0; i < orderIndex; i += 1) {
    const key = creativeStageOrder[i];
    const record = stages[key];
    if (!record?.userNotes || typeof record.userNotes !== "string") continue;
    const trimmed = record.userNotes.trim();
    if (!trimmed) continue;
    notes.push(`${stageLabel(key)}: ${trimmed}`);
  }
  return notes;
}

function collectUserManualContent(metadata: CreativeTaskMetadata) {
  const entries: string[] = [];
  const stages: Partial<Record<CreativeStageKey, StageMetaEntry>> =
    metadata.stages ?? {};
  creativeStageOrder.forEach((key) => {
    const record = stages[key];
    if (!record?.manualContent || typeof record.manualContent !== "string") return;
    const trimmed = record.manualContent.trim();
    if (!trimmed) return;
    const snippet = clampText(trimmed, Math.max(800, stageContextSliceLimit(key)));
    if (!snippet) return;
    entries.push(`${stageLabel(key)}：${snippet}`);
  });
  return entries;
}

function collectTopicSelections(metadata: CreativeTaskMetadata, stage: CreativeStageKey) {
  const topicIndex = creativeStageOrder.indexOf("topic");
  const stageIndex = creativeStageOrder.indexOf(stage);
  if (topicIndex === -1 || stageIndex <= topicIndex) return [];
  const topicMeta = metadata.stages?.topic;
  const selections = (topicMeta?.userSelections ?? null) as TopicUserSelections | null;
  if (!selections) return [];
  const summary: string[] = [];
  if (selections.coreTopic) summary.push(`核心命题：${selections.coreTopic}`);
  if (selections.heroSentence) summary.push(`灵魂句：${selections.heroSentence}`);
  if (selections.promise) summary.push(`读者收益：${selections.promise}`);
  if (Array.isArray(selections.angles)) {
    selections.angles.forEach((angle, idx) => {
      const parts = [angle?.name, angle?.hook]
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter(Boolean);
      if (parts.length > 0) {
        summary.push(`锁定角度${idx + 1}：${parts.join(" · ")}`);
      }
    });
  }
  if (Array.isArray(selections.titles)) {
    selections.titles.forEach((title, idx) => {
      if (title?.value) summary.push(`标题候选${idx + 1}：${title.value}`);
    });
  }
  if (Array.isArray(selections.outline)) {
    selections.outline.forEach((item, idx) => {
      if (item?.value) summary.push(`大纲要点${idx + 1}：${item.value}`);
    });
  }
  return summary;
}

async function main() {
  const [, , taskId, stageArg, userIdArg] = process.argv;
  if (!taskId) {
    console.error("Usage: tsx scripts/inspect-stage-context.ts <taskId> [stage] [userId]");
    process.exit(1);
  }
  const stage = (stageArg || "draft") as CreativeStageKey;
  if (!creativeStageOrder.includes(stage)) {
    console.error(`Invalid stage: ${stage}`);
    process.exit(1);
  }

  const userId = userIdArg || undefined;
  const task = await loadTaskWithAssets(taskId, userId ?? "" ).catch(() => null);
  if (!task) {
    console.error("Task not found or user mismatch");
    process.exit(1);
  }
  const metadata = parseMetadata(task.metadata);
  const lines: string[] = [];
  lines.push(`任务 ID: ${task.id}`);
  if (task.title) lines.push(`标题: ${task.title}`);
  if (task.channel) lines.push(`渠道/场景: ${task.channel}`);
  if (task.targetOutput) lines.push(`目标形态: ${task.targetOutput}`);
  if (task.ideaText) {
    lines.push("\n### 原始想法");
    lines.push(task.ideaText);
  }
  if (task.goal) {
    lines.push("\n### 任务目标");
    lines.push(JSON.stringify(task.goal, null, 2));
  }

  const manualInputs = collectUserManualContent(metadata);
  if (manualInputs.length > 0) {
    lines.push("\n### 用户手动输入（最高优先级）");
    manualInputs.forEach((entry) => lines.push(`- ${entry}`));
  }

  const stageSummaries = summarizePreviousStages(metadata, stage);
  if (stageSummaries.length > 0) {
    lines.push("\n### 已完成阶段摘要");
    stageSummaries.forEach((s) => lines.push(`- ${s}`));
  }

  const stageNotes = collectStageNotes(metadata, stage);
  if (stageNotes.length > 0) {
    lines.push("\n### 手动笔记（来自已完成阶段）");
    stageNotes.forEach((note) => lines.push(`- ${note}`));
  }

  const topicSelections = collectTopicSelections(metadata, stage);
  if (topicSelections.length > 0) {
    lines.push("\n### 用户锁定的命题 / 角度");
    topicSelections.forEach((selection) => lines.push(`- ${selection}`));
  }

  const assets = flattenAssets(task);
  const styleRules = metadata.custom?.styleRules;
  if (styleRules && Object.keys(styleRules).length > 0) {
    lines.push("\n### Style Rules (优先级最高)");
    lines.push(JSON.stringify(styleRules, null, 2));
  }

  if (task.voiceProfile?.profile) {
    lines.push("\n### 口吻画像（Voice Profile）");
    lines.push(JSON.stringify(task.voiceProfile.profile, null, 2));
  }

  const historyStyleSummary = summarizeHistoryStyles(assets.historyDocs);
  if (historyStyleSummary) {
    lines.push("\n### 历史风格摘要（跨文案共性）");
    const summarySections: Array<[string, string[]]> = [
      ["Hook 高频写法", historyStyleSummary.hookHighlights],
      ["常见开场套路", historyStyleSummary.openingFormulas],
      ["典型转折/递进", historyStyleSummary.transitionMoves],
      ["收束/价值观", historyStyleSummary.closingSignatures],
      ["常用论据/证明", historyStyleSummary.proofAngles],
    ];
    summarySections.forEach(([label, items]) => {
      if (items.length > 0) {
        lines.push(`- ${label}：${items.join(" ｜ ")}`);
      }
    });
  }

  if (assets.historyDocs.length > 0) {
    lines.push("\n### 历史稿写作库（必须模仿语气与结构）");
    for (const doc of assets.historyDocs) {
      const meta = (doc.metadata ?? {}) as Record<string, any>;
      lines.push(`- 《${doc.title}》(${doc.channel ?? "未分渠道"})：${meta.summary ?? doc.description ?? "无摘要"}`);
      if (meta.reusableBlocks) {
        const reusable = meta.reusableBlocks as Record<string, string[]>;
        const hookSamples = Array.isArray(reusable.hooks) ? reusable.hooks.slice(0, 3) : [];
        const transitionSamples = Array.isArray(reusable.transitions) ? reusable.transitions.slice(0, 3) : [];
        const closerSamples = Array.isArray(reusable.closers) ? reusable.closers.slice(0, 2) : [];
        if (hookSamples.length || transitionSamples.length || closerSamples.length) {
          lines.push("  可复用写法：");
          hookSamples.forEach((line, idx) => lines.push(`    Hook${idx + 1}: ${line}`));
          transitionSamples.forEach((line, idx) => lines.push(`    Transition${idx + 1}: ${line}`));
          closerSamples.forEach((line, idx) => lines.push(`    Closing${idx + 1}: ${line}`));
        }
      }
      const openingPatterns = Array.isArray(meta.openingPatterns) ? meta.openingPatterns.slice(0, 2) : [];
      if (openingPatterns.length) {
        lines.push("  开场套路：");
        openingPatterns.forEach((pattern: any, idx: number) => {
          const label = typeof pattern?.label === "string" && pattern.label.trim() ? pattern.label.trim() : `开场${idx + 1}`;
          const example = typeof pattern?.example === "string" && pattern.example.trim() ? pattern.example.trim() : pattern?.usage || "";
          lines.push(`    ${label}: ${example}`);
        });
      }
      const transitionPlaybook = Array.isArray(meta.transitionPlaybook) ? meta.transitionPlaybook.slice(0, 2) : [];
      if (transitionPlaybook.length) {
        lines.push("  转折方法：");
        transitionPlaybook.forEach((item: any, idx: number) => {
          const label = typeof item?.label === "string" && item.label.trim() ? item.label.trim() : `转折${idx + 1}`;
          const snippet = typeof item?.pattern === "string" && item.pattern.trim() ? item.pattern.trim() : item?.usage || "";
          lines.push(`    ${label}: ${snippet}`);
        });
      }
    }
  }

  if (assets.stories.length > 0) {
    lines.push("\n### 用户案例 / 故事（正文至少引用 1 个）");
    assets.stories.forEach((story) => {
      lines.push(`- ${story.title}: ${story.summary ?? "无摘要"}`);
    });
  }

  if (stage === "framework") {
    lines.push("\n### 写作助手 · 框架讨论指引");
    lines.push(WRITING_ASSISTANT_FRAMEWORK_GUIDE);
  }

  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
