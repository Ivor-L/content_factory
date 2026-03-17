import type { LoadedCreativeTask } from "@/lib/creativeTaskService";
import type { CreativeTaskMetadata, HistoryDocLite } from "@/types/creative";
import type { CreativeStageKey } from "@/lib/creativeStages";
import {
  type RetrievalContext,
  type RetrievedKnowledgeBundle,
  type RuntimeCaseCard,
  type RuntimeStyleSummary,
  type RuntimeWritingBlocks,
} from "@/types/creativeRuntime";
import { buildRuntimeBundleFromHistoryDoc, flattenCaseBank } from "../runtime/runtimeObjects";

interface StageRetrievalPolicy {
  styleLimit: number;
  blockLimit: number;
  caseLimit: number;
  allowTransitions: boolean;
}

const STAGE_RETRIEVAL_POLICIES: Record<CreativeStageKey, StageRetrievalPolicy> = {
  diagnosis: { styleLimit: 1, blockLimit: 0, caseLimit: 0, allowTransitions: false },
  mining: { styleLimit: 1, blockLimit: 2, caseLimit: 2, allowTransitions: true },
  topic: { styleLimit: 1, blockLimit: 3, caseLimit: 3, allowTransitions: true },
  framework: { styleLimit: 2, blockLimit: 4, caseLimit: 3, allowTransitions: true },
  draft: { styleLimit: 1, blockLimit: 2, caseLimit: 2, allowTransitions: true },
};

export function buildRetrievalContext(
  task: LoadedCreativeTask,
  metadata: CreativeTaskMetadata,
  stage: CreativeStageKey,
): RetrievalContext {
  const goalTags: string[] = [];
  if (Array.isArray((task.goal as any)?.tags)) {
    goalTags.push(...((task.goal as any).tags as string[]));
  }
  const stageMeta = metadata.stages?.topic?.aiOutput;
  if (Array.isArray(stageMeta?.angles)) {
    goalTags.push(
      ...stageMeta.angles
        .map((angle: any) => angle?.name)
        .filter((name: string | null | undefined): name is string => Boolean(name)),
    );
  }
  return {
    taskId: task.id,
    stage,
    channel: task.channel,
    assetType: task.targetOutput,
    goalTags,
    voiceProfile: task.voiceProfile
      ? {
          tags: (task.voiceProfile.profile as any)?.toneDescriptors ?? [],
        }
      : null,
    userMaterialsCount: task.stories.length,
    selectedAngles: metadata.stages?.topic?.userSelections?.angles?.map((angle: any) => angle?.name),
  };
}

export function retrieveKnowledgeBundle(
  task: LoadedCreativeTask,
  metadata: CreativeTaskMetadata,
  stage: CreativeStageKey,
): RetrievedKnowledgeBundle {
  const policy = STAGE_RETRIEVAL_POLICIES[stage];
  const bundles = task.historyDocs
    .map((link) => buildRuntimeBundleFromHistoryDoc(toHistoryDocLite(link.historyDoc)))
    .filter((bundle) => Boolean(bundle.style || bundle.writingBlocks || bundle.caseBank));

  const filteredStyles: RuntimeStyleSummary[] = [];
  const filteredBlocks: RuntimeWritingBlocks[] = [];
  const filteredCases: RuntimeCaseCard[] = [];
  const applicability = bundles
    .map((bundle) => bundle.applicability)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  for (const bundle of bundles) {
    if (
      filteredStyles.length < policy.styleLimit &&
      bundle.style &&
      channelMatches(bundle.style.channel, task.channel)
    ) {
      filteredStyles.push(bundle.style);
    }
    if (bundle.writingBlocks && filteredBlocks.length < policy.blockLimit) {
      filteredBlocks.push(bundle.writingBlocks);
    }
    if (bundle.caseBank && filteredCases.length < policy.caseLimit) {
      const flattened = flattenCaseBank(bundle.caseBank);
      for (const card of flattened) {
        if (filteredCases.length >= policy.caseLimit) break;
        filteredCases.push(card);
      }
    }
  }

  if (!policy.allowTransitions) {
    filteredBlocks.forEach((block) => {
      block.transitions = [];
    });
  } else if (stage === "draft") {
    filteredBlocks.forEach((block) => {
      block.transitions = block.transitions.slice(0, 2);
      block.reusableHooks = block.reusableHooks.slice(0, 2);
      block.closings = block.closings.slice(0, 1);
    });
  }

  return {
    styles: filteredStyles,
    writingBlocks: filteredBlocks,
    cases: filteredCases,
    applicability,
  };
}

function channelMatches(docChannel: string | null, taskChannel: string | null | undefined) {
  if (!taskChannel) return true;
  if (!docChannel) return false;
  return docChannel === taskChannel;
}

type LoadedHistoryDoc = LoadedCreativeTask["historyDocs"][number]["historyDoc"];

function jsonRecord(value: unknown): Record<string, any> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, any>) };
  }
  return null;
}

function toHistoryDocLite(doc: LoadedHistoryDoc): HistoryDocLite {
  return {
    id: doc.id,
    title: doc.title,
    channel: doc.channel,
    description: doc.description,
    metadata: jsonRecord(doc.metadata),
    latestDerivative: doc.latestDerivative
      ? {
          id: doc.latestDerivative.id,
          version: doc.latestDerivative.version,
          styleSummary: jsonRecord(doc.latestDerivative.styleSummary),
          writingBlocks: jsonRecord(doc.latestDerivative.writingBlocks),
          caseBank: jsonRecord(doc.latestDerivative.caseBank),
          applicability: jsonRecord(doc.latestDerivative.applicability),
          stylePath: doc.latestDerivative.stylePath,
          blocksPath: doc.latestDerivative.blocksPath,
          casesPath: doc.latestDerivative.casesPath,
          applicabilityPath: doc.latestDerivative.applicabilityPath,
        }
      : null,
  };
}
