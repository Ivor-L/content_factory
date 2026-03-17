import type { LoadedCreativeTask } from "@/lib/creativeTaskService";
import type { CreativeStageKey } from "@/lib/creativeStages";
import type { CreativeTaskMetadata, StoryAssetLite } from "@/types/creative";
import type { RetrievedKnowledgeBundle } from "@/types/creativeRuntime";

interface TaskOverview {
  id: string;
  title?: string | null;
  channel?: string | null;
  targetOutput?: string | null;
  ideaText?: string | null;
  goal?: Record<string, any> | null;
}

interface StageInputBase {
  stage: CreativeStageKey;
  taskOverview: TaskOverview;
  userMaterials: Array<Pick<StoryAssetLite, "id" | "title" | "summary" | "tags">>;
}

export type StageInputPayload = StageInputBase & Record<string, any>;

export function buildStageInputPayload(
  task: LoadedCreativeTask,
  metadata: CreativeTaskMetadata,
  stage: CreativeStageKey,
  bundle: RetrievedKnowledgeBundle,
): StageInputPayload {
  const taskOverview = buildTaskOverview(task);
  const base: StageInputBase = {
    stage,
    taskOverview,
    userMaterials: collectStories(task),
  };

  switch (stage) {
    case "diagnosis":
      return {
        ...base,
        runtimeStyleSummary: bundle.styles[0] ?? null,
        applicabilityMetadata: bundle.applicability[0] ?? null,
      };
    case "mining":
      return {
        ...base,
        previousDiagnosis: metadata.stages?.diagnosis?.aiOutput ?? null,
        runtimeWritingBlocks: (bundle.writingBlocks[0] ?? null) && {
          ...bundle.writingBlocks[0],
          transitions: bundle.writingBlocks[0].transitions.slice(0, 2),
        },
        runtimeCaseBank: bundle.cases.slice(0, 2),
      };
    case "topic":
      return {
        ...base,
        miningInsights: metadata.stages?.mining?.aiOutput ?? null,
        runtimeHooks:
          bundle.writingBlocks.flatMap((item) => item.reusableHooks).slice(0, 4),
        runtimeCases: bundle.cases.slice(0, 3),
      };
    case "framework":
      return {
        ...base,
        topicSelection: metadata.stages?.topic?.aiOutput ?? null,
        runtimeTransitions: bundle.writingBlocks.flatMap((item) => item.transitions).slice(0, 4),
        runtimeCases: bundle.cases.slice(0, 3),
        runtimeStyleSummary: bundle.styles[0] ?? null,
      };
    case "draft":
      return {
        ...base,
        framework: metadata.stages?.framework?.aiOutput ?? null,
        runtimeStyleSummary: bundle.styles[0] ?? null,
        runtimeHooks: bundle.writingBlocks.flatMap((item) => item.reusableHooks).slice(0, 2),
        runtimeTransitions: bundle.writingBlocks.flatMap((item) => item.transitions).slice(0, 2),
        runtimeClosing: bundle.writingBlocks.flatMap((item) => item.closings).slice(0, 1),
        runtimeCases: bundle.cases.slice(0, 2),
      };
    default:
      return base;
  }
}

function buildTaskOverview(task: LoadedCreativeTask): TaskOverview {
  return {
    id: task.id,
    title: task.title,
    channel: task.channel,
    targetOutput: task.targetOutput,
    ideaText: task.ideaText,
    goal: (task.goal as Record<string, any> | null) ?? null,
  };
}

function collectStories(task: LoadedCreativeTask) {
  return task.stories.map((link) => {
    const story = link.story;
    return {
      id: story.id,
      title: story.title,
      summary: story.summary,
      tags: story.tags ?? [],
    };
  });
}
